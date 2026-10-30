// The one password rule for every NEW password (registration, reset and
// change). Existing passwords are never re-checked, so nobody is locked out.
//
// The client does not keep its own copy: it loads `clientPolicy()` from
// GET /api/auth/policy and runs the same checks (client/src/lib/passwordPolicy.js
// is a plain interpreter of this data), so the two can never disagree.

const MIN_LENGTH = 8;
const MAX_LENGTH = 128;

const MESSAGE =
  'Password must be at least 8 characters and include an uppercase letter, a lowercase letter, a number and a special character.';
const PERSONAL_MESSAGE = 'Password must not contain your name or the name part of your email address.';
const COMMON_MESSAGE = 'That password is too common. Choose something harder to guess.';

// Shown as the live checklist; `pattern` is tested against the whole password.
const RULES = [
  { key: 'length', label: `${MIN_LENGTH}+ characters`, pattern: `^[\\s\\S]{${MIN_LENGTH},}$` },
  { key: 'upper', label: 'Uppercase letter', pattern: '[A-Z]' },
  { key: 'lower', label: 'Lowercase letter', pattern: '[a-z]' },
  { key: 'digit', label: 'Number', pattern: '[0-9]' },
  { key: 'special', label: 'Special character', pattern: '[^A-Za-z0-9\\s]' },
];

// Compared after lower-casing, reading @ and $ as a and s, and removing
// everything but letters and digits, so "P@ssw0rd!" and "Password1!" both match.
const COMMON = [
  'password', 'password1', 'password12', 'password123', 'password1234', 'passw0rd', 'p4ssw0rd', 'pa55word',
  '12345678', '123456789', '1234567890', '11111111', '00000000', '87654321', '12341234', '11223344',
  'qwerty', 'qwerty12', 'qwerty123', 'qwertyuiop', 'qwerty1234', 'azerty123', 'asdfghjkl', 'zxcvbnm1',
  'iloveyou', 'iloveyou1', 'letmein', 'letmein1', 'welcome', 'welcome1', 'welcome123', 'admin123', 'administrator',
  'abc12345', 'abcd1234', 'abcdefgh', 'aa123456', 'monkey123', 'dragon123', 'football1', 'baseball1', 'sunshine1',
  'princess1', 'superman1', 'trustno1', 'master123', 'changeme', 'changeme1', 'secret123', 'default1',
  'alu12345', 'alu123456', 'aluventures', 'aluventures1', 'africanleadership', 'kigali123', 'rwanda123',
];
const PERSONAL_MIN = 3;

// @ and $ read as letters ("P@ssw0rd" → "passw0rd"), then only letters and digits remain.
const squash = (v) => String(v || '').toLowerCase().replace(/@/g, 'a').replace(/\$/g, 's').replace(/[^a-z0-9]/g, '');
const words = (v) =>
  String(v || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= PERSONAL_MIN);

/**
 * Checks a new password. Returns null when it is acceptable, otherwise the
 * message to show. `email` and `fullName` are optional context.
 */
function checkPassword(password, { email, fullName } = {}) {
  const value = String(password || '');
  if (value.length > MAX_LENGTH) return `Password must be at most ${MAX_LENGTH} characters.`;
  if (!RULES.every((r) => new RegExp(r.pattern).test(value))) return MESSAGE;
  const lower = value.toLowerCase();
  const personal = [...words(String(email || '').split('@')[0]), ...words(fullName)];
  if (personal.some((w) => lower.includes(w))) return PERSONAL_MESSAGE;
  const plain = squash(value);
  if (COMMON.some((c) => plain === c || plain === c.replace(/[0-9]+$/, '') || plain.replace(/[0-9]+$/, '') === c)) return COMMON_MESSAGE;
  return null;
}

// Everything the client needs to run the same checks.
function clientPolicy() {
  return { minLength: MIN_LENGTH, maxLength: MAX_LENGTH, rules: RULES, common: COMMON, personalMin: PERSONAL_MIN, messages: { rules: MESSAGE, personal: PERSONAL_MESSAGE, common: COMMON_MESSAGE } };
}

module.exports = { checkPassword, clientPolicy, MESSAGE, PERSONAL_MESSAGE, COMMON_MESSAGE, MIN_LENGTH, MAX_LENGTH };
