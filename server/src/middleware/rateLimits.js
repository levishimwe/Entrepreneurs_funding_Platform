// Rate limits for login, verification, reset, project-code lookup and upload
// routes (NFR02). Disabled under test so suites can exercise flows repeatedly.
const { rateLimit } = require('express-rate-limit');
const env = require('../config/env');

const make = (windowMinutes, limit, message) =>
  rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: () => env.isTest,
    message: { error: message },
  });

module.exports = {
  loginLimiter: make(15, 10, 'Too many sign-in attempts. Please wait 15 minutes and try again.'),
  codeLimiter: make(15, 10, 'Too many code requests. Please wait a few minutes and try again.'),
  uploadLimiter: make(15, 30, 'Too many uploads. Please wait a few minutes and try again.'),
  lookupLimiter: make(5, 30, 'Too many lookups. Please wait a few minutes and try again.'),
};
