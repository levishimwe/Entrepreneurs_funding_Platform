// Fuzzy string matching shared by document verification (name comparison) and
// project similarity detection. Tolerates small differences in spelling,
// spacing, accents, word order and OCR noise instead of requiring exact matches.
const { distance } = require('fastest-levenshtein');

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'the', 'of', 'for', 'to', 'in', 'on', 'with', 'by', 'at', 'from', 'our', 'we', 'is', 'are',
  'that', 'this', 'it', 'as', 'be', 'or', 'their', 'its', 'into', 'using', 'which', 'who', 'will', 'can',
]);

function normalize(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const tokens = (text) => normalize(text).split(' ').filter(Boolean);

// Levenshtein ratio in [0, 1].
function ratio(a, b) {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  return 1 - distance(a, b) / Math.max(a.length, b.length);
}

const tokenSortRatio = (a, b) => ratio(tokens(a).sort().join(' '), tokens(b).sort().join(' '));

/**
 * Similarity between two person or company names in [0, 1]. Takes the best of
 * a whole-string comparison with sorted tokens, and a per-token comparison
 * that lets a registered name with an extra middle name still match.
 */
function nameSimilarity(a, b) {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.length || !tb.length) return 0;
  const sorted = tokenSortRatio(a, b);

  const [shorter, longer] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  if (shorter.length < 2) return sorted;
  const coverage = shorter.reduce((sum, t) => sum + Math.max(...longer.map((u) => ratio(t, u))), 0) / shorter.length;
  // Slight penalty so a partial (subset) match never outranks a full match.
  return Math.max(sorted, coverage * 0.95);
}

/**
 * Searches free text (e.g. OCR output) for the window of words that best
 * matches `name`. Used when a document has no recognisable label to anchor on.
 */
function findNameInText(text, name) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const size = tokens(name).length;
  let best = { match: null, score: 0 };
  if (!size) return best;
  for (let len = Math.max(1, size - 1); len <= size + 1; len += 1) {
    for (let i = 0; i + len <= words.length; i += 1) {
      const candidate = words.slice(i, i + len).join(' ');
      const score = nameSimilarity(candidate, name);
      if (score > best.score) best = { match: candidate.replace(/[^\p{L}\p{N}' .-]/gu, '').trim(), score };
    }
  }
  return best;
}

/**
 * Looks for any of `variants` in free text, case-insensitively and tolerating
 * OCR errors: word windows are compared with spaces removed, so a misread
 * letter or a dropped space ("DEVELOPMENTBOARD") still matches, while a
 * different word ("Republic of Kenya") does not. Short acronyms ("RDB") must
 * appear as a whole word, because a fuzzy three-letter match means nothing.
 * @returns {{ found: boolean, variant: string|null, match: string|null, score: number }}
 */
function findPhrase(text, variants, threshold = 0.88) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const normWords = words.map((w) => normalize(w).replace(/ /g, ''));
  const flat = ` ${normalize(text)} `;
  let best = { found: false, variant: null, match: null, score: 0 };
  for (const variant of variants) {
    const target = tokens(variant);
    const joined = target.join('');
    if (!joined) continue;
    if (joined.length <= 4) {
      const i = normWords.indexOf(joined);
      if (i >= 0) return { found: true, variant, match: words[i], score: 1 };
      continue;
    }
    if (flat.includes(` ${target.join(' ')} `)) return { found: true, variant, match: variant, score: 1 };
    for (let len = Math.max(1, target.length - 1); len <= target.length + 1; len += 1) {
      for (let i = 0; i + len <= words.length; i += 1) {
        const candidate = normWords.slice(i, i + len).join('');
        if (Math.abs(candidate.length - joined.length) > joined.length * 0.25) continue;
        const score = ratio(candidate, joined);
        if (score > best.score) best = { found: false, variant, match: words.slice(i, i + len).join(' '), score };
      }
    }
  }
  best.found = best.score >= threshold;
  best.score = Math.round(best.score * 100) / 100;
  return best;
}

// Character bigram Dice coefficient — robust for short strings such as titles.
function diceCoefficient(a, b) {
  const x = normalize(a).replace(/ /g, '');
  const y = normalize(b).replace(/ /g, '');
  if (x.length < 2 || y.length < 2) return x === y ? 1 : 0;
  const bigrams = new Map();
  for (let i = 0; i < x.length - 1; i += 1) {
    const g = x.slice(i, i + 2);
    bigrams.set(g, (bigrams.get(g) || 0) + 1);
  }
  let overlap = 0;
  for (let i = 0; i < y.length - 1; i += 1) {
    const g = y.slice(i, i + 2);
    const count = bigrams.get(g) || 0;
    if (count > 0) {
      bigrams.set(g, count - 1);
      overlap += 1;
    }
  }
  return (2 * overlap) / (x.length + y.length - 2);
}

// Cosine similarity of content-word frequency vectors — suited to descriptions.
function cosineSimilarity(a, b) {
  const vector = (text) => {
    const v = new Map();
    for (const t of tokens(text)) {
      if (STOP_WORDS.has(t) || t.length < 3) continue;
      v.set(t, (v.get(t) || 0) + 1);
    }
    return v;
  };
  const va = vector(a);
  const vb = vector(b);
  let dot = 0;
  for (const [t, n] of va) dot += n * (vb.get(t) || 0);
  const norm = (v) => Math.sqrt([...v.values()].reduce((s, n) => s + n * n, 0));
  const denominator = norm(va) * norm(vb);
  return denominator ? dot / denominator : 0;
}

/**
 * Project similarity in [0, 1] from normalised title and description.
 * Titles are short and distinctive, descriptions carry most of the content.
 */
function textSimilarity(a, b) {
  const title = Math.max(diceCoefficient(a.title, b.title), tokenSortRatio(a.title, b.title));
  const description = cosineSimilarity(a.description, b.description);
  return 0.4 * title + 0.6 * description;
}

module.exports = {
  normalize,
  tokens,
  ratio,
  tokenSortRatio,
  nameSimilarity,
  findNameInText,
  findPhrase,
  diceCoefficient,
  cosineSimilarity,
  textSimilarity,
};
