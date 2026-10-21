// Archive, unarchive and permanent delete for administrator-managed records.
//
// Archive hides a record from active lists and keeps everything; unarchive
// restores the status it had before. Delete is permanent and only allowed for
// records that were rejected, opportunities that have ended, and outbox
// emails. Anything approved or funded, or linked to introductions,
// investments or applications, can never be deleted. Every plan lists exactly
// what a delete would remove (counts), so the confirmation can say so. Audit
// entries carry the actor, ids and counts only, never names or emails.
const { Op } = require('sequelize');
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
} = require('../models');
const storage = require('./storage');
const audit = require('./audit');
const { HttpError, badRequest } = require('../middleware/errors');

const ACCOUNT_ROLES = ['graduate', 'investor'];
const wasRejected = (record) => record.status === 'rejected' || (record.status === 'archived' && record.statusBeforeArchive === 'rejected');

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

// ---- Delete plans ------------------------------------------------------------

/** What deleting a graduate or investor account would remove, or why it cannot. */
async function accountDeletePlan(user) {
  const blockers = [];
  if (!ACCOUNT_ROLES.includes(user.role)) blockers.push('Only graduate and investor accounts can be deleted.');
  if (!wasRejected(user)) blockers.push('Only rejected accounts can be deleted. Archive this account instead.');

  const projects = await Project.findAll({ where: { ownerId: user.id }, attributes: ['id', 'status', 'statusBeforeArchive'] });
  const projectIds = projects.map((p) => p.id);
  const kept = projects.filter((p) => !wasRejected(p));
  if (kept.length) blockers.push(`It owns ${kept.length} project(s) that were not rejected.`);
  const [asInvestor, onProjects, applications] = await Promise.all([
    Introduction.count({ where: { investorId: user.id } }),
    projectIds.length ? Introduction.count({ where: { projectId: { [Op.in]: projectIds } } }) : 0,
    Application.count({ where: { [Op.or]: [{ applicantId: user.id }, ...(projectIds.length ? [{ projectId: { [Op.in]: projectIds } }] : [])] } }),
  ]);
  if (asInvestor + onProjects) blockers.push('It has introductions or investments on record.');
  if (applications) blockers.push('It has opportunity applications on record.');

  const documents = await Document.findAll({
    where: { [Op.or]: [{ uploaderId: user.id }, ...(projectIds.length ? [{ projectId: { [Op.in]: projectIds } }] : [])] },
    attributes: ['id', 'storageKey'],
  });
  const documentIds = documents.map((d) => d.id);
  const [reviews, emails, tokens, threads] = await Promise.all([
    Review.count({ where: reviewTargets(user.id, projectIds, documentIds) }),
    Notification.count({ where: { recipientId: user.id } }),
    AuthToken.count({ where: { userId: user.id } }),
    SupportThread.findAll({ where: { userId: user.id }, attributes: ['id'] }),
  ]);
  const threadIds = threads.map((t) => t.id);
  const attachments = threadIds.length
    ? await SupportMessage.findAll({ where: { threadId: { [Op.in]: threadIds }, attachmentKey: { [Op.ne]: null } }, attributes: ['attachmentKey'] })
    : [];
  const attachmentKeys = attachments.map((m) => m.attachmentKey);
  return {
    allowed: blockers.length === 0,
    blockers,
    removes: {
      account: 1,
      projects: projects.length,
      documents: documents.length,
      files: documents.length + (user.photoKey ? 1 : 0) + attachmentKeys.length,
      reviews,
      emails,
      codes: tokens,
      requests: threadIds.length,
    },
    _ids: { projectIds, documentIds, threadIds, keys: [...documents.map((d) => d.storageKey), ...(user.photoKey ? [user.photoKey] : []), ...attachmentKeys] },
  };
}

function reviewTargets(userId, projectIds, documentIds) {
  return {
    [Op.or]: [
      ...(userId ? [{ subjectUserId: userId }] : []),
      ...(projectIds.length ? [{ projectId: { [Op.in]: projectIds } }] : []),
      ...(documentIds.length ? [{ documentId: { [Op.in]: documentIds } }] : []),
    ],
  };
}

async function projectDeletePlan(project) {
  const blockers = [];
  if (!wasRejected(project)) blockers.push('Only rejected projects can be deleted. Archive this project instead.');
  const [introductions, investments, applications] = await Promise.all([
    Introduction.count({ where: { projectId: project.id } }),
    Introduction.count({ where: { projectId: project.id, investmentRecordedAt: { [Op.ne]: null } } }),
    Application.count({ where: { projectId: project.id } }),
  ]);
  if (investments) blockers.push('It has recorded investments.');
  else if (introductions) blockers.push('It has investor introductions on record.');
  if (applications) blockers.push('It has opportunity applications on record.');
  const documents = await Document.findAll({ where: { projectId: project.id }, attributes: ['id', 'storageKey'] });
  const documentIds = documents.map((d) => d.id);
  const reviews = await Review.count({ where: reviewTargets(null, [project.id], documentIds) });
  return {
    allowed: blockers.length === 0,
    blockers,
    removes: { project: 1, documents: documents.length, files: documents.length, reviews },
    _ids: { documentIds, keys: documents.map((d) => d.storageKey) },
  };
}

const hasEnded = (o) => new Date(o.deadline) <= new Date() || o.status === 'closed' || (o.status === 'archived' && o.statusBeforeArchive === 'closed');

async function opportunityDeletePlan(opportunity) {
  const blockers = [];
  if (!hasEnded(opportunity)) blockers.push('Only opportunities that have ended (closed or past the deadline) can be deleted.');
  const applications = await Application.findAll({ where: { opportunityId: opportunity.id }, attributes: ['id'] });
  const applicationIds = applications.map((a) => a.id);
  const emails = applicationIds.length ? await Notification.count({ where: { applicationId: { [Op.in]: applicationIds } } }) : 0;
  return { allowed: blockers.length === 0, blockers, removes: { opportunity: 1, applications: applications.length, emails }, _ids: { applicationIds } };
}

// ---- Deletes -----------------------------------------------------------------

const blocked = (plan) => new HttpError(409, `Cannot delete: ${plan.blockers.join(' ')}`, { blockers: plan.blockers });
const publicPlan = ({ _ids, ...plan }) => plan;

// Files go after the transaction commits; a missing file never blocks a delete.
const removeFiles = (keys) => Promise.all(keys.map((k) => storage.remove(k).catch(() => {})));

async function deleteAccount(user, actorId) {
  const plan = await accountDeletePlan(user);
  if (!plan.allowed) throw blocked(plan);
  const { projectIds, documentIds, threadIds, keys } = plan._ids;
  await sequelize.transaction(async (transaction) => {
    const t = { transaction };
    if (threadIds.length) {
      await SupportMessage.destroy({ where: { threadId: { [Op.in]: threadIds } }, ...t });
      await SupportThread.destroy({ where: { id: { [Op.in]: threadIds } }, ...t });
    }
    await Review.destroy({ where: reviewTargets(user.id, projectIds, documentIds), ...t });
    await Notification.destroy({ where: { recipientId: user.id }, ...t });
    await AuthToken.destroy({ where: { userId: user.id }, ...t });
    // Their own past actions stay in the audit log, without the link to them.
    await AuditLog.update({ actorId: null }, { where: { actorId: user.id }, ...t });
    if (documentIds.length) await Document.destroy({ where: { id: { [Op.in]: documentIds } }, ...t });
    if (projectIds.length) await Project.destroy({ where: { id: { [Op.in]: projectIds } }, ...t });
    await GraduateProfile.destroy({ where: { userId: user.id }, ...t });
    await InvestorProfile.destroy({ where: { userId: user.id }, ...t });
    await User.destroy({ where: { id: user.id }, ...t });
    await audit.record(
      { actorId, action: 'account.deleted', entityType: 'user', entityId: user.id, metadata: { role: user.role, projectIds, documentIds, ...plan.removes } },
      t
    );
  });
  await removeFiles(keys);
  return publicPlan(plan);
}

async function deleteProject(project, actorId) {
  const plan = await projectDeletePlan(project);
  if (!plan.allowed) throw blocked(plan);
  const { documentIds, keys } = plan._ids;
  await sequelize.transaction(async (transaction) => {
    const t = { transaction };
    await Review.destroy({ where: reviewTargets(null, [project.id], documentIds), ...t });
    if (documentIds.length) await Document.destroy({ where: { id: { [Op.in]: documentIds } }, ...t });
    await Project.destroy({ where: { id: project.id }, ...t });
    await audit.record({ actorId, action: 'project.deleted', entityType: 'project', entityId: project.id, metadata: { documentIds, ...plan.removes } }, t);
  });
  await removeFiles(keys);
  return publicPlan(plan);
}

async function deleteOpportunity(opportunity, actorId) {
  const plan = await opportunityDeletePlan(opportunity);
  if (!plan.allowed) throw blocked(plan);
  const { applicationIds } = plan._ids;
  await sequelize.transaction(async (transaction) => {
    const t = { transaction };
    if (applicationIds.length) {
      await Notification.destroy({ where: { applicationId: { [Op.in]: applicationIds } }, ...t });
      await Application.destroy({ where: { id: { [Op.in]: applicationIds } }, ...t });
    }
    await Opportunity.destroy({ where: { id: opportunity.id }, ...t });
    await audit.record({ actorId, action: 'opportunity.deleted', entityType: 'opportunity', entityId: opportunity.id, metadata: { applicationIds, ...plan.removes } }, t);
  });
  return publicPlan(plan);
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
  accountDeletePlan: async (u) => publicPlan(await accountDeletePlan(u)),
  projectDeletePlan: async (p) => publicPlan(await projectDeletePlan(p)),
  opportunityDeletePlan: async (o) => publicPlan(await opportunityDeletePlan(o)),
  deleteAccount,
  deleteProject,
  deleteOpportunity,
  deleteNotifications,
  countNotifications,
};
