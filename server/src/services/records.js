// Archive, unarchive and permanent delete for administrator-managed records.
//
// Archive hides a record from active lists and keeps everything; unarchive
// restores the status it had before. Delete is permanent and only allowed for
// records that are archived or removed, rejected, opportunities that have
// ended, and outbox emails. Anything with history other records depend on
// (introductions, funding, results, decided applications, a funding call that
// became a competition) can never be deleted. Every plan lists exactly what a
// delete would remove (counts), so the confirmation can say so. Audit entries
// carry the actor, ids, counts and the reason only, never names or emails.
const { Op } = require('sequelize');
const { z } = require('zod');
const {
  sequelize,
  User,
  GraduateProfile,
  InvestorProfile,
  Project,
  Document,
  Review,
  Introduction,
  Opportunity,
  Application,
  Notification,
  AuditLog,
  AuthToken,
  SupportThread,
  SupportMessage,
  Testimonial,
  CompetitionResult,
  GraduatePost,
  PostReport,
  FundingCall,
  Announcement,
} = require('../models');
const storage = require('./storage');
const audit = require('./audit');
const { HttpError, badRequest } = require('../middleware/errors');

const ACCOUNT_ROLES = ['graduate', 'investor'];

// ---- Archive / unarchive -----------------------------------------------------

async function archiveAccount(user, actorId) {
  if (!ACCOUNT_ROLES.includes(user.role)) throw badRequest('Only graduate and investor accounts can be archived.');
  if (user.status === 'archived') throw badRequest('This account is already archived.');
  await sequelize.transaction(async (transaction) => {
    // Bumping the token version signs the account out everywhere.
    await user.update({ statusBeforeArchive: user.status, status: 'archived', tokenVersion: user.tokenVersion + 1 }, { transaction });
    await audit.record({ actorId, action: 'account.archived', entityType: 'user', entityId: user.id, metadata: { from: user.statusBeforeArchive } }, { transaction });
  });
}

async function unarchiveAccount(user, actorId) {
  if (user.status !== 'archived') throw badRequest('This account is not archived.');
  if (isReleasedEmail(user.email)) {
    throw badRequest('This account cannot be unarchived: its email address was registered again as a new account. The old record stays archived with its history.');
  }
  const to = user.statusBeforeArchive || 'pending_review';
  await sequelize.transaction(async (transaction) => {
    await user.update({ status: to, statusBeforeArchive: null }, { transaction });
    await audit.record({ actorId, action: 'account.unarchived', entityType: 'user', entityId: user.id, metadata: { to } }, { transaction });
  });
  return to;
}

async function archiveOpportunity(opportunity, actorId, reason) {
  if (opportunity.status === 'archived') throw badRequest('This opportunity is already archived.');
  await opportunity.update({ statusBeforeArchive: opportunity.status, status: 'archived' });
  await audit.record({ actorId, action: 'opportunity.archived', entityType: 'opportunity', entityId: opportunity.id, reason, metadata: { from: opportunity.statusBeforeArchive } });
}

async function unarchiveOpportunity(opportunity, actorId) {
  if (opportunity.status !== 'archived') throw badRequest('This opportunity is not archived.');
  // A published opportunity whose deadline passed while archived comes back closed.
  let to = opportunity.statusBeforeArchive || 'closed';
  if (to === 'published' && new Date(opportunity.deadline) <= new Date()) to = 'closed';
  await opportunity.update({ status: to, statusBeforeArchive: null });
  await audit.record({ actorId, action: 'opportunity.unarchived', entityType: 'opportunity', entityId: opportunity.id, metadata: { to } });
  return to;
}

async function setNotificationsArchived(ids, archived, actorId) {
  const [count] = await Notification.update({ archivedAt: archived ? new Date() : null }, { where: { id: { [Op.in]: ids }, archivedAt: archived ? null : { [Op.ne]: null } } });
  if (count) await audit.record({ actorId, action: archived ? 'notification.archived' : 'notification.unarchived', entityType: 'notification', metadata: { ids, count } });
  return count;
}

// ---- Re-registration of an archived account's email -------------------------

// A non-deliverable address (.invalid is reserved and never resolves).
const RELEASED_DOMAIN = '@archived.invalid';
const isReleasedEmail = (email) => String(email || '').toLowerCase().endsWith(RELEASED_DOMAIN);
const releasedAddress = (id) => `archived+${id}+${Date.now()}${RELEASED_DOMAIN}`;

/**
 * Inside the registration transaction: if the address belongs to an archived
 * account, rename that account's email to a placeholder so a new account can
 * use it. The old row keeps everything else. Any other existing account means
 * the address is taken. Returns the old account's id, or null.
 */
async function releaseArchivedEmail(address, { transaction }) {
  const existing = await User.findOne({ where: { email: address }, transaction, lock: transaction.LOCK.UPDATE });
  if (!existing) return null;
  if (existing.status !== 'archived') throw new HttpError(409, 'An account with this email already exists. Sign in or reset your password.');
  // A new token version also retires any session the old row could still hold.
  await existing.update({ email: releasedAddress(existing.id), tokenVersion: existing.tokenVersion + 1 }, { transaction });
  await AuthToken.update({ usedAt: new Date() }, { where: { userId: existing.id, usedAt: null }, transaction });
  return existing.id;
}

/** Audit entry for a released address: ids only, no names or emails. */
async function recordEmailReleased(oldUserId, newUser, { transaction }) {
  if (!oldUserId) return;
  await audit.record(
    { actorId: newUser.id, action: 'account.email_released', entityType: 'user', entityId: oldUserId, metadata: { newUserId: newUser.id, role: newUser.role } },
    { transaction }
  );
}

// ---- Delete plans ------------------------------------------------------------
//
// Permanent delete is for records that have already left the active lists:
// archived or removed, rejected (accounts, projects, testimonies, funding
// calls), or ended (opportunities). Anything other records depend on blocks
// it: introductions, recorded funding, competition results, decided
// applications, and funding calls that became a competition. Those stay
// archived. Undecided applications, documents, reviews, codes, queued emails,
// posts and reports go with the record; files are removed after the commit.

const DECIDED = ['selected', 'not_selected'];
const closedStatus = (r) => ['rejected', 'archived'].includes(r.status);
const ids = (rows) => rows.map((r) => r.id);
const inIds = (list) => ({ [Op.in]: list });
const n = (count, one, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

/** Blockers that come from a set of projects' history. */
async function projectHistoryBlockers(projectIds) {
  if (!projectIds.length) return [];
  const where = { projectId: inIds(projectIds) };
  const [introductions, investments, results, decided] = await Promise.all([
    Introduction.count({ where }),
    Introduction.count({ where: { ...where, investmentRecordedAt: { [Op.ne]: null } } }),
    CompetitionResult.count({ where }),
    Application.count({ where: { ...where, status: inIds(DECIDED) } }),
  ]);
  const blockers = [];
  if (investments) blockers.push(`It has recorded funding (${n(investments, 'investment')}).`);
  if (introductions) blockers.push(`It has investor introductions on record (${n(introductions, 'introduction')}).`);
  if (results) blockers.push(`It has competition results on record (${n(results, 'result')}).`);
  if (decided) blockers.push(`It has decided opportunity applications (${n(decided, 'application')}).`);
  return blockers;
}

/** Posts (with their reports and images) to remove. */
async function postsOf(where) {
  const posts = await GraduatePost.findAll({ where, attributes: ['id', 'imageKey'] });
  const postIds = ids(posts);
  const reports = postIds.length ? await PostReport.count({ where: { postId: inIds(postIds) } }) : 0;
  return { postIds, reports, keys: posts.map((p) => p.imageKey).filter(Boolean) };
}

/** What deleting a graduate or investor account would remove, or why it cannot. */
async function accountDeletePlan(user) {
  const blockers = [];
  if (!ACCOUNT_ROLES.includes(user.role)) blockers.push('Only graduate and investor accounts can be deleted.');
  if (!closedStatus(user)) blockers.push('Only archived or rejected accounts can be deleted. Archive this account first.');

  const projects = await Project.findAll({ where: { ownerId: user.id }, attributes: ['id', 'status', 'imageKey'] });
  const projectIds = ids(projects);
  const open = projects.filter((p) => !closedStatus(p));
  if (open.length) blockers.push(`It owns ${n(open.length, 'project')} that ${open.length === 1 ? 'is' : 'are'} not archived or rejected. Archive ${open.length === 1 ? 'it' : 'them'} first.`);
  blockers.push(...(await projectHistoryBlockers(projectIds)));
  const [asInvestor, ownResults, ownDecided, competitionCalls] = await Promise.all([
    Introduction.count({ where: { investorId: user.id } }),
    CompetitionResult.count({ where: { graduateId: user.id, ...(projectIds.length ? { projectId: { [Op.notIn]: projectIds } } : {}) } }),
    Application.count({ where: { applicantId: user.id, status: inIds(DECIDED), ...(projectIds.length ? { projectId: { [Op.notIn]: projectIds } } : {}) } }),
    FundingCall.count({ where: { investorId: user.id, opportunityId: { [Op.ne]: null } } }),
  ]);
  if (asInvestor) blockers.push(`As an investor it has introductions on record (${n(asInvestor, 'introduction')}).`);
  if (ownResults) blockers.push(`It has competition results on record (${n(ownResults, 'result')}).`);
  if (ownDecided) blockers.push(`It has decided opportunity applications (${n(ownDecided, 'application')}).`);
  if (competitionCalls) blockers.push(`${n(competitionCalls, 'funding call')} became a competition.`);

  const appWhere = { [Op.or]: [{ applicantId: user.id }, ...(projectIds.length ? [{ projectId: inIds(projectIds) }] : [])] };
  const [documents, applications, calls, threads, profile, posts] = await Promise.all([
    Document.findAll({ where: { [Op.or]: [{ uploaderId: user.id }, ...(projectIds.length ? [{ projectId: inIds(projectIds) }] : [])] }, attributes: ['id', 'storageKey'] }),
    Application.findAll({ where: { ...appWhere, status: { [Op.notIn]: DECIDED } }, attributes: ['id'] }),
    FundingCall.findAll({ where: { investorId: user.id, opportunityId: null }, attributes: ['id'] }),
    SupportThread.findAll({ where: { userId: user.id }, attributes: ['id'] }),
    GraduateProfile.findByPk(user.id, { attributes: ['userId', 'publicImageKey'] }),
    postsOf({ graduateId: user.id }),
  ]);
  const documentIds = ids(documents);
  const applicationIds = ids(applications);
  const threadIds = ids(threads);
  const [reviews, emails, tokens, testimonies, attachments] = await Promise.all([
    Review.count({ where: reviewTargets(user.id, projectIds, documentIds) }),
    Notification.count({ where: emailTargets(user.id, applicationIds) }),
    AuthToken.count({ where: { userId: user.id } }),
    Testimonial.count({ where: { userId: user.id } }),
    threadIds.length ? SupportMessage.findAll({ where: { threadId: inIds(threadIds), attachmentKey: { [Op.ne]: null } }, attributes: ['attachmentKey'] }) : [],
  ]);
  const keys = [
    ...documents.map((d) => d.storageKey),
    ...(user.photoKey ? [user.photoKey] : []),
    ...(profile?.publicImageKey ? [profile.publicImageKey] : []),
    ...attachments.map((m) => m.attachmentKey),
    ...projects.map((p) => p.imageKey).filter(Boolean),
    ...posts.keys,
  ];
  return {
    allowed: blockers.length === 0,
    blockers,
    removes: {
      account: 1,
      projects: projects.length,
      documents: documents.length,
      files: keys.length,
      reviews,
      applications: applicationIds.length,
      fundingCalls: calls.length,
      posts: posts.postIds.length,
      reports: posts.reports,
      emails,
      codes: tokens,
      requests: threadIds.length,
      testimonies,
    },
    _ids: { projectIds, documentIds, applicationIds, threadIds, callIds: ids(calls), postIds: posts.postIds, keys },
  };
}

function reviewTargets(userId, projectIds, documentIds) {
  return {
    [Op.or]: [
      ...(userId ? [{ subjectUserId: userId }] : []),
      ...(projectIds.length ? [{ projectId: inIds(projectIds) }] : []),
      ...(documentIds.length ? [{ documentId: inIds(documentIds) }] : []),
    ],
  };
}

function emailTargets(userId, applicationIds) {
  return { [Op.or]: [...(userId ? [{ recipientId: userId }] : []), ...(applicationIds.length ? [{ applicationId: inIds(applicationIds) }] : [{ id: -1 }])] };
}

async function projectDeletePlan(project) {
  const blockers = [];
  if (!closedStatus(project)) blockers.push('Only archived or rejected projects can be deleted. Archive this project first.');
  blockers.push(...(await projectHistoryBlockers([project.id])));
  const [documents, applications, posts] = await Promise.all([
    Document.findAll({ where: { projectId: project.id }, attributes: ['id', 'storageKey'] }),
    Application.findAll({ where: { projectId: project.id, status: { [Op.notIn]: DECIDED } }, attributes: ['id'] }),
    // "Seeking an investor" posts about this project go with it.
    postsOf({ projectId: project.id }),
  ]);
  const documentIds = ids(documents);
  const applicationIds = ids(applications);
  const [reviews, emails] = await Promise.all([
    Review.count({ where: reviewTargets(null, [project.id], documentIds) }),
    applicationIds.length ? Notification.count({ where: { applicationId: inIds(applicationIds) } }) : 0,
  ]);
  const keys = [...documents.map((d) => d.storageKey), ...(project.imageKey ? [project.imageKey] : []), ...posts.keys];
  return {
    allowed: blockers.length === 0,
    blockers,
    removes: { project: 1, documents: documents.length, files: keys.length, reviews, applications: applicationIds.length, posts: posts.postIds.length, reports: posts.reports, emails },
    _ids: { documentIds, applicationIds, postIds: posts.postIds, keys },
  };
}

const hasEnded = (o) => new Date(o.deadline) <= new Date() || o.status === 'closed' || (o.status === 'archived' && o.statusBeforeArchive === 'closed');

async function opportunityDeletePlan(opportunity) {
  const blockers = [];
  if (opportunity.status !== 'archived' && !hasEnded(opportunity)) blockers.push('Only archived opportunities, or ones that have ended (closed or past the deadline), can be deleted.');
  const [decided, results, applications] = await Promise.all([
    Application.count({ where: { opportunityId: opportunity.id, status: inIds(DECIDED) } }),
    CompetitionResult.count({ where: { opportunityId: opportunity.id } }),
    Application.findAll({ where: { opportunityId: opportunity.id, status: { [Op.notIn]: DECIDED } }, attributes: ['id'] }),
  ]);
  if (decided) blockers.push(`It has decided applications (${n(decided, 'application')}).`);
  if (results) blockers.push(`It has competition results on record (${n(results, 'result')}).`);
  const applicationIds = ids(applications);
  const emails = applicationIds.length ? await Notification.count({ where: { applicationId: inIds(applicationIds) } }) : 0;
  return { allowed: blockers.length === 0, blockers, removes: { opportunity: 1, applications: applicationIds.length, emails }, _ids: { applicationIds } };
}

async function postDeletePlan(post) {
  const blockers = post.removedAt ? [] : ['Only removed posts can be deleted. Remove this post first.'];
  const reports = await PostReport.count({ where: { postId: post.id } });
  const keys = post.imageKey ? [post.imageKey] : [];
  return { allowed: !blockers.length, blockers, removes: { post: 1, reports, files: keys.length }, _ids: { keys } };
}

// Emails of a private announcement that are still queued; sent ones stay in
// the Sent messages log.
const queuedOf = (announcement) => (announcement.messageId ? { batchId: announcement.messageId, status: 'pending' } : null);

async function announcementDeletePlan(announcement) {
  const blockers = announcement.status === 'removed' ? [] : ['Only removed announcements can be deleted. Remove this announcement first.'];
  const queued = queuedOf(announcement);
  const emails = queued ? await Notification.count({ where: queued }) : 0;
  return { allowed: !blockers.length, blockers, removes: { announcement: 1, emails }, _ids: {} };
}

async function testimonialDeletePlan(testimonial) {
  const blockers = testimonial.status === 'rejected' ? [] : ['Only rejected testimonies can be deleted.'];
  return { allowed: !blockers.length, blockers, removes: { testimony: 1 }, _ids: {} };
}

const callEmails = (call) => ({ eventKey: { [Op.like]: `funding-call-%:${call.id}` }, status: 'pending' });

async function fundingCallDeletePlan(call) {
  const blockers = [];
  if (call.status !== 'rejected') blockers.push('Only rejected funding calls can be deleted.');
  if (call.opportunityId) blockers.push('This funding call became a competition.');
  const emails = await Notification.count({ where: callEmails(call) });
  return { allowed: !blockers.length, blockers, removes: { fundingCall: 1, emails }, _ids: {} };
}

// ---- Deletes -----------------------------------------------------------------

const blocked = (plan) => new HttpError(409, `Cannot delete: ${plan.blockers.join(' ')}`, { blockers: plan.blockers });
const publicPlan = ({ _ids, ...plan }) => plan;

/** The confirmation every permanent delete needs: the word DELETE and a reason. */
const confirmation = z.object({
  confirm: z.literal('DELETE', { message: 'Type DELETE to confirm.' }),
  reason: z.string().trim().min(5, 'Give a reason (at least 5 characters).').max(1000),
});
const parseConfirmation = (body) => confirmation.parse(body || {});

// Files go after the transaction commits; a file that is already gone, or a
// storage error, is logged and never undoes or fails the delete.
const removeFiles = (keys) =>
  Promise.all(
    keys.map((k) =>
      Promise.resolve()
        .then(() => storage.remove(k))
        .catch((err) => console.warn(`[records] could not remove stored file ${k}: ${err.message}`))
    )
  );

/** Runs a plan's delete in one transaction, writes the audit entry, then removes files. */
async function runDelete(plan, work, entry, actorId, reason) {
  if (!plan.allowed) throw blocked(plan);
  await sequelize.transaction(async (transaction) => {
    await work({ transaction });
    await audit.record({ actorId, reason, ...entry, metadata: { ...entry.metadata, ...plan.removes } }, { transaction });
  });
  await removeFiles(plan._ids.keys || []);
  return publicPlan(plan);
}

async function deleteAccount(user, actorId, reason) {
  const plan = await accountDeletePlan(user);
  const { projectIds, documentIds, applicationIds, threadIds, callIds, postIds } = plan._ids || {};
  return runDelete(
    plan,
    async (t) => {
      if (threadIds.length) {
        await SupportMessage.destroy({ where: { threadId: inIds(threadIds) }, ...t });
        await SupportThread.destroy({ where: { id: inIds(threadIds) }, ...t });
      }
      await Testimonial.destroy({ where: { userId: user.id }, ...t });
      await Review.destroy({ where: reviewTargets(user.id, projectIds, documentIds), ...t });
      await Notification.destroy({ where: emailTargets(user.id, applicationIds), ...t });
      if (applicationIds.length) await Application.destroy({ where: { id: inIds(applicationIds) }, ...t });
      await AuthToken.destroy({ where: { userId: user.id }, ...t });
      // Their own past actions stay in the audit log, without the link to them.
      await AuditLog.update({ actorId: null }, { where: { actorId: user.id }, ...t });
      await PostReport.destroy({ where: { [Op.or]: [{ reporterId: user.id }, ...(postIds.length ? [{ postId: inIds(postIds) }] : [])] }, ...t });
      if (postIds.length) await GraduatePost.destroy({ where: { id: inIds(postIds) }, ...t });
      if (callIds.length) await FundingCall.destroy({ where: { id: inIds(callIds) }, ...t });
      if (documentIds.length) await Document.destroy({ where: { id: inIds(documentIds) }, ...t });
      if (projectIds.length) await Project.destroy({ where: { id: inIds(projectIds) }, ...t });
      await GraduateProfile.destroy({ where: { userId: user.id }, ...t });
      await InvestorProfile.destroy({ where: { userId: user.id }, ...t });
      await User.destroy({ where: { id: user.id }, ...t });
    },
    { action: 'account.deleted', entityType: 'user', entityId: user.id, metadata: { role: user.role, projectIds, documentIds } },
    actorId,
    reason
  );
}

async function deleteProject(project, actorId, reason) {
  const plan = await projectDeletePlan(project);
  const { documentIds, applicationIds, postIds } = plan._ids || {};
  return runDelete(
    plan,
    async (t) => {
      await Review.destroy({ where: reviewTargets(null, [project.id], documentIds), ...t });
      if (applicationIds.length) {
        await Notification.destroy({ where: { applicationId: inIds(applicationIds) }, ...t });
        await Application.destroy({ where: { id: inIds(applicationIds) }, ...t });
      }
      if (postIds.length) {
        await PostReport.destroy({ where: { postId: inIds(postIds) }, ...t });
        await GraduatePost.destroy({ where: { id: inIds(postIds) }, ...t });
      }
      if (documentIds.length) await Document.destroy({ where: { id: inIds(documentIds) }, ...t });
      await Project.destroy({ where: { id: project.id }, ...t });
    },
    { action: 'project.deleted', entityType: 'project', entityId: project.id, metadata: { documentIds } },
    actorId,
    reason
  );
}

async function deleteOpportunity(opportunity, actorId, reason) {
  const plan = await opportunityDeletePlan(opportunity);
  const { applicationIds } = plan._ids;
  return runDelete(
    plan,
    async (t) => {
      if (applicationIds.length) {
        await Notification.destroy({ where: { applicationId: inIds(applicationIds) }, ...t });
        await Application.destroy({ where: { id: inIds(applicationIds) }, ...t });
      }
      await Opportunity.destroy({ where: { id: opportunity.id }, ...t });
    },
    { action: 'opportunity.deleted', entityType: 'opportunity', entityId: opportunity.id, metadata: { applicationIds } },
    actorId,
    reason
  );
}

async function deletePost(post, actorId, reason) {
  const plan = await postDeletePlan(post);
  return runDelete(
    plan,
    async (t) => {
      await PostReport.destroy({ where: { postId: post.id }, ...t });
      await GraduatePost.destroy({ where: { id: post.id }, ...t });
    },
    { action: 'post.deleted', entityType: 'post', entityId: post.id, metadata: {} },
    actorId,
    reason
  );
}

async function deleteAnnouncement(announcement, actorId, reason) {
  const plan = await announcementDeletePlan(announcement);
  const queued = queuedOf(announcement);
  return runDelete(
    plan,
    async (t) => {
      if (queued) await Notification.destroy({ where: queued, ...t });
      await Announcement.destroy({ where: { id: announcement.id }, ...t });
    },
    { action: 'announcement.deleted', entityType: 'announcement', entityId: announcement.id, metadata: { visibility: announcement.visibility } },
    actorId,
    reason
  );
}

async function deleteTestimonial(testimonial, actorId, reason) {
  const plan = await testimonialDeletePlan(testimonial);
  return runDelete(plan, (t) => Testimonial.destroy({ where: { id: testimonial.id }, ...t }), { action: 'testimonial.deleted', entityType: 'testimonial', entityId: testimonial.id, metadata: {} }, actorId, reason);
}

async function deleteFundingCall(call, actorId, reason) {
  const plan = await fundingCallDeletePlan(call);
  return runDelete(
    plan,
    async (t) => {
      await Notification.destroy({ where: callEmails(call), ...t });
      await FundingCall.destroy({ where: { id: call.id }, ...t });
    },
    { action: 'funding_call.deleted', entityType: 'funding_call', entityId: call.id, metadata: {} },
    actorId,
    reason
  );
}

// Outbox: by ids, or by status and/or age. Returns the number removed.
function notificationWhere({ ids, status, olderThanDays, archived }) {
  const where = {};
  if (ids) where.id = { [Op.in]: ids };
  if (status && status !== 'all') where.status = status;
  if (olderThanDays) where.createdAt = { [Op.lt]: new Date(Date.now() - olderThanDays * 86400000) };
  if (archived === true) where.archivedAt = { [Op.ne]: null };
  if (archived === false) where.archivedAt = null;
  return where;
}

async function deleteNotifications(filter, actorId) {
  const where = notificationWhere(filter);
  const ids = (await Notification.findAll({ where, attributes: ['id'] })).map((n) => n.id);
  if (!ids.length) return 0;
  await sequelize.transaction(async (transaction) => {
    await Notification.destroy({ where: { id: { [Op.in]: ids } }, transaction });
    await audit.record(
      { actorId, action: 'notification.deleted', entityType: 'notification', metadata: { ids, count: ids.length, status: filter.status || null, olderThanDays: filter.olderThanDays || null } },
      { transaction }
    );
  });
  return ids.length;
}

const countNotifications = (filter) => Notification.count({ where: notificationWhere(filter) });

module.exports = {
  archiveAccount,
  unarchiveAccount,
  archiveOpportunity,
  unarchiveOpportunity,
  setNotificationsArchived,
  releaseArchivedEmail,
  recordEmailReleased,
  isReleasedEmail,
  accountDeletePlan: async (u) => publicPlan(await accountDeletePlan(u)),
  projectDeletePlan: async (p) => publicPlan(await projectDeletePlan(p)),
  opportunityDeletePlan: async (o) => publicPlan(await opportunityDeletePlan(o)),
  postDeletePlan: async (p) => publicPlan(await postDeletePlan(p)),
  announcementDeletePlan: async (a) => publicPlan(await announcementDeletePlan(a)),
  testimonialDeletePlan: async (t) => publicPlan(await testimonialDeletePlan(t)),
  fundingCallDeletePlan: async (c) => publicPlan(await fundingCallDeletePlan(c)),
  parseConfirmation,
  deleteAccount,
  deleteProject,
  deleteOpportunity,
  deletePost,
  deleteAnnouncement,
  deleteTestimonial,
  deleteFundingCall,
  deleteNotifications,
  countNotifications,
};
