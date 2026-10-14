// Categorization and Similarity module (proposal §3.3.3): unique project codes,
// rule-based sector suggestions and fuzzy similarity against approved projects.
// Every output is an assistive signal; graduates confirm sectors and
// administrators resolve similarity flags.
const crypto = require('crypto');
const { Op } = require('sequelize');
const { Project, SectorKeyword } = require('../models');
const { getSetting } = require('./settings');
const { normalize, textSimilarity } = require('./verification/fuzzy');

// No 0/O/1/I so codes are easy to read aloud and type.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_PATTERN = /^ALU-\d{4}-[A-HJ-NP-Z2-9]{5}$/;

// FR14: ALU-2026-XXXXX from a secure random source; the database UNIQUE
// constraint is the final guard, and callers retry on a collision.
function generateProjectCode(year = new Date().getUTCFullYear()) {
  let suffix = '';
  for (let i = 0; i < 5; i += 1) suffix += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  return `ALU-${year}-${suffix}`;
}

async function createWithUniqueCode(create, attempts = 5) {
  for (let i = 0; i < attempts; i += 1) {
    const code = generateProjectCode();
    try {
      return await create(code);
    } catch (err) {
      const collided = err.name === 'SequelizeUniqueConstraintError' && err.fields && 'project_code' in err.fields;
      if (!collided || i === attempts - 1) throw err;
    }
  }
  throw new Error('Could not generate a unique project code');
}

const normalizeCode = (code) => String(code || '').trim().toUpperCase();

// FR15: compare normalised text with the administrator-maintained keyword map.
async function suggestSector(text) {
  const haystack = ` ${normalize(text)} `;
  const rows = await SectorKeyword.findAll({ order: [['sector', 'ASC']] });
  const scored = rows
    .map((row) => {
      const matched = (row.keywords || []).filter((kw) => {
        const needle = normalize(kw);
        return needle && haystack.includes(` ${needle} `);
      });
      return { sector: row.sector, matched, score: matched.length };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  if (!scored.length) return { sector: null, matched: [], alternatives: [] };
  return {
    sector: scored[0].sector,
    matched: scored[0].matched,
    alternatives: scored.slice(1, 3).map(({ sector, matched }) => ({ sector, matched })),
  };
}

const COMPARABLE_STATUSES = ['approved', 'funded', 'investor_limit_reached'];

// FR16: compare against existing approved projects only; return up to three
// highest-scoring candidates above the configurable threshold.
async function findSimilarProjects({ title, description, excludeId = null }) {
  const threshold = Number(await getSetting('similarity_threshold', 0.75));
  const where = { status: { [Op.in]: COMPARABLE_STATUSES } };
  if (excludeId) where.id = { [Op.ne]: excludeId };
  const candidates = await Project.findAll({
    where,
    attributes: ['id', 'projectCode', 'title', 'description', 'sector'],
  });

  const matches = candidates
    .map((p) => ({
      id: p.id,
      projectCode: p.projectCode,
      title: p.title,
      sector: p.sector,
      score: Math.round(textSimilarity({ title, description }, p) * 100) / 100,
    }))
    .filter((m) => m.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  return { threshold, matches, topScore: matches[0]?.score ?? null };
}

module.exports = {
  generateProjectCode,
  createWithUniqueCode,
  normalizeCode,
  CODE_PATTERN,
  suggestSector,
  findSimilarProjects,
  COMPARABLE_STATUSES,
};
