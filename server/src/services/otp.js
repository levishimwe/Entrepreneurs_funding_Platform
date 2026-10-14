// One-time codes for email verification and password reset (FR02, FR12, NFR02):
// hashed at rest, expire after ten minutes, at most five attempts, single use.
const crypto = require('crypto');
const { Op } = require('sequelize');
const env = require('../config/env');
const { AuthToken } = require('../models');
const { badRequest } = require('../middleware/errors');

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

const hashCode = (userId, purpose, code) =>
  crypto.createHmac('sha256', env.jwtSecret).update(`${userId}:${purpose}:${code}`).digest('hex');

async function issueCode(userId, purpose, options = {}) {
  // Only the newest code is valid; earlier unused codes are retired.
  await AuthToken.update(
    { usedAt: new Date() },
    { where: { userId, purpose, usedAt: null }, transaction: options.transaction }
  );
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  await AuthToken.create(
    { userId, purpose, codeHash: hashCode(userId, purpose, code), expiresAt: new Date(Date.now() + CODE_TTL_MS) },
    { transaction: options.transaction }
  );
  return code;
}

const INVALID = 'That code is invalid or has expired. Request a new code and try again.';

async function verifyCode(userId, purpose, code) {
  const token = await AuthToken.findOne({
    where: { userId, purpose, usedAt: null, expiresAt: { [Op.gt]: new Date() } },
    order: [['id', 'DESC']],
  });
  if (!token || token.attempts >= MAX_ATTEMPTS) throw badRequest(INVALID);

  const expected = Buffer.from(token.codeHash, 'hex');
  const actual = Buffer.from(hashCode(userId, purpose, String(code).trim()), 'hex');
  if (!crypto.timingSafeEqual(expected, actual)) {
    await token.increment('attempts');
    const remaining = MAX_ATTEMPTS - token.attempts - 1;
    throw badRequest(remaining > 0 ? `Incorrect code. ${remaining} attempt(s) left.` : INVALID);
  }
  await token.update({ usedAt: new Date() });
  return true;
}

module.exports = { issueCode, verifyCode, CODE_TTL_MS, MAX_ATTEMPTS };
