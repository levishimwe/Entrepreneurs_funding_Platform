// Registration and password rules, loaded from the server (GET /api/auth/policy)
// so the forms check exactly what the server enforces
// (server/src/services/passwordPolicy.js). The checks are in ./passwordRules.js.
import { useEffect, useState } from 'react';
import { api } from './api';

export { isAlumniEmail, passwordProblem, ruleStates } from './passwordRules';

let cached = null;
const loadPolicy = () => {
  cached ||= api.get('/auth/policy').catch((err) => {
    cached = null;
    throw err;
  });
  return cached;
};

// The policy, or null while loading (or if the server cannot be reached: the
// server still checks on submit).
export function usePolicy() {
  const [policy, setPolicy] = useState(null);
  useEffect(() => {
    let live = true;
    loadPolicy()
      .then((p) => live && setPolicy(p))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return policy;
}
