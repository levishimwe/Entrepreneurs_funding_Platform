// Who may see a graduate's public profile, image and posts, and the shapes
// sent to them. A profile never carries an email, phone, document or project
// code.
const { badRequest } = require('../middleware/errors');
const { isApprovedGraduate, isApprovedInvestor } = require('../middleware/auth');

const LIVE = ['approved', 'funded', 'investor_limit_reached'];
const POST_MAX = 600;
const POSTS_PER_DAY = 10;
const EDIT_MINUTES = 15;

const consented = (u) => Boolean(u?.graduateProfile?.publicProfileConsent);

/** The graduate opted in, and their account is approved and active. */
const isShownGraduate = (u) => u?.role === 'graduate' && isApprovedGraduate(u) && consented(u);

/**
 * Approved investors and sponsors, active administrators and staff see a
 * consenting graduate; the graduate always sees their own profile.
 */
function canViewGraduate(viewer, graduate) {
  if (!viewer || !graduate) return false;
  if (viewer.id === graduate.id) return true;
  if (!isShownGraduate(graduate)) return false;
  return isApprovedInvestor(viewer) || (['admin', 'staff'].includes(viewer.role) && viewer.status === 'active');
}

const imageUrlOf = (u) => (consented(u) && u.graduateProfile?.publicImageKey ? `/api/graduates/${u.id}/image` : null);

function graduateSummary(u) {
  return { id: u.id, name: u.fullName, imageUrl: imageUrlOf(u) };
}

function serializePost(p, { graduate } = {}) {
  return {
    id: p.id,
    body: p.body,
    imageUrl: p.imageKey ? `/api/posts/${p.id}/image` : null,
    createdAt: p.createdAt,
    editedAt: p.editedAt || null,
    ...(graduate ? { graduate: graduateSummary(graduate) } : {}),
  };
}

// Contact details and project codes stay off posts: introductions are how
// investors reach a founder, and the code is the founder's to share.
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9-]+(\.[A-Z0-9-]+)*\.[A-Z]{2,}/i;
const CODE = /ALU-\d{4}-[A-Z0-9]{5}/i;
const PHONE_CANDIDATE = /\+?\d[\d\s().-]{6,}\d/g;
const hasPhone = (text) => (text.match(PHONE_CANDIDATE) || []).some((s) => s.replace(/\D/g, '').length >= 9);

/** Trims and checks a post body; throws a 400 that says what to change. */
function checkPostBody(raw) {
  const body = String(raw ?? '').replace(/\r\n/g, '\n').trim();
  const fail = (message) => badRequest(message, { fields: { body: message } });
  if (!body) throw fail('Write something to post.');
  if (body.length > POST_MAX) throw fail(`Posts can be up to ${POST_MAX} characters.`);
  if (EMAIL.test(body)) throw fail('Remove the email address. Investors reach you through introductions, which you accept first.');
  if (hasPhone(body)) throw fail('Remove the phone number. Investors reach you through introductions, which you accept first.');
  if (CODE.test(body)) throw fail('Remove the project code. Your code is yours to share privately; link to your venture instead.');
  return body;
}

module.exports = { LIVE, POST_MAX, POSTS_PER_DAY, EDIT_MINUTES, canViewGraduate, isShownGraduate, imageUrlOf, graduateSummary, serializePost, checkPostBody };
