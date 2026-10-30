// Runs the password and alumni-email rules the server sends from
// GET /api/auth/policy (server/src/services/passwordPolicy.js). No rules live
// here, only the evaluation, so client and server cannot disagree; a server
// test (tests/passwordPolicy.test.js) runs this file against the server's own
// checkPassword() to prove it. No imports, so that test can load it directly.

// Each checklist rule with whether `value` meets it.
export const ruleStates = (policy, value) => (policy?.password.rules || []).map((r) => ({ ...r, met: new RegExp(r.pattern).test(value || '') }));

const squash = (v) => String(v || '').toLowerCase().replace(/@/g, 'a').replace(/\$/g, 's').replace(/[^a-z0-9]/g, '');
const words = (v, min) =>
  String(v || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= min);

// Same order and messages as the server's checkPassword(); null when acceptable.
export function passwordProblem(policy, value, { email, fullName } = {}) {
  if (!policy) return null;
  const p = policy.password;
  const v = String(value || '');
  if (v.length > p.maxLength) return `Password must be at most ${p.maxLength} characters.`;
  if (!ruleStates(policy, v).every((r) => r.met)) return p.messages.rules;
  const lower = v.toLowerCase();
  const personal = [...words(String(email || '').split('@')[0], p.personalMin), ...words(fullName, p.personalMin)];
  if (personal.some((w) => lower.includes(w))) return p.messages.personal;
  const plain = squash(v);
  if (p.common.some((c) => plain === c || plain === c.replace(/[0-9]+$/, '') || plain.replace(/[0-9]+$/, '') === c)) return p.messages.common;
  return null;
}

// Exactly the configured domain after the last "@", like the server.
export function isAlumniEmail(policy, email) {
  if (!policy) return true;
  const v = String(email || '').trim().toLowerCase();
  const at = v.lastIndexOf('@');
  return at > 0 && v.slice(at + 1) === policy.alumniEmailDomain;
}
