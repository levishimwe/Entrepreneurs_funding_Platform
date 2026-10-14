// JWT session in a secure HttpOnly cookie (NFR02) with server-side role checks.
// The token carries the user's token_version; bumping it (password change)
// invalidates every existing session.
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { User, GraduateProfile, InvestorProfile } = require('../models');
const { HttpError, forbidden } = require('./errors');

const COOKIE = 'alu_session';

function setSessionCookie(res, user) {
  const token = jwt.sign({ sub: String(user.id), tv: user.tokenVersion }, env.jwtSecret, {
    expiresIn: `${env.sessionHours}h`,
  });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    secure: env.cookie.secure,
    sameSite: env.cookie.sameSite,
    maxAge: env.sessionHours * 3600 * 1000,
    path: '/',
  });
}

function clearSessionCookie(res) {
  res.clearCookie(COOKIE, { path: '/', httpOnly: true, secure: env.cookie.secure, sameSite: env.cookie.sameSite });
}

// Attaches req.user when a valid session cookie is present.
async function loadUser(req, res, next) {
  const token = req.cookies?.[COOKIE];
  if (!token) return next();
  try {
    const payload = jwt.verify(token, env.jwtSecret);
    const user = await User.findByPk(payload.sub, {
      include: [
        { model: GraduateProfile, as: 'graduateProfile' },
        { model: InvestorProfile, as: 'investorProfile' },
      ],
    });
    if (user && user.tokenVersion === payload.tv && !['suspended', 'rejected'].includes(user.status)) {
      req.user = user;
    } else {
      clearSessionCookie(res);
    }
  } catch {
    clearSessionCookie(res);
  }
  return next();
}

function requireAuth(req, res, next) {
  if (!req.user) return next(new HttpError(401, 'Please sign in to continue.'));
  return next();
}

const requireRole =
  (...roles) =>
  (req, res, next) => {
    if (!req.user) return next(new HttpError(401, 'Please sign in to continue.'));
    if (!roles.includes(req.user.role)) return next(forbidden());
    if (req.user.status !== 'active' && ['admin', 'staff'].includes(req.user.role)) return next(forbidden());
    return next();
  };

const isApprovedGraduate = (user) =>
  user?.role === 'graduate' && user.status === 'active' && user.graduateProfile?.verificationStatus === 'approved';

const isApprovedInvestor = (user) => user?.role === 'investor' && user.status === 'active';

// Graduates may only submit projects after an administrator approves their account (FR02, FR04).
function requireApprovedGraduate(req, res, next) {
  if (!req.user) return next(new HttpError(401, 'Please sign in to continue.'));
  if (req.user.role !== 'graduate') return next(forbidden());
  if (!isApprovedGraduate(req.user)) {
    return next(forbidden('Your graduate account is still pending administrator review.'));
  }
  return next();
}

function requireApprovedInvestor(req, res, next) {
  if (!req.user) return next(new HttpError(401, 'Please sign in to continue.'));
  if (req.user.role !== 'investor') return next(forbidden());
  if (!isApprovedInvestor(req.user)) {
    return next(forbidden('Your investor account is still pending administrator review.'));
  }
  return next();
}

module.exports = {
  COOKIE,
  setSessionCookie,
  clearSessionCookie,
  loadUser,
  requireAuth,
  requireRole,
  requireApprovedGraduate,
  requireApprovedInvestor,
  isApprovedGraduate,
  isApprovedInvestor,
};
