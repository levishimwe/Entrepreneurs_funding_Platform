// Bulk email for staff and administrators (Send message, private
// announcements). A thin layer on the notifications outbox: one queued row per
// recipient with event key bulk:<batch id>:<user id>, so a retry never queues
// or sends a second copy. Rows respect the provider's daily limit (see
// processOutbox in services/mailer.js): what does not fit today waits for the
// next day instead of failing. Nothing here sends inside the request.
const { Op } = require('sequelize');
const { z } = require('zod');
const env = require('../config/env');
const { sequelize, User, GraduateProfile, InvestorProfile, Notification, BulkMessage } = require('../models');
const { wrapHtml, escapeHtml, sentToday, startOfNextDay, processOutbox } = require('./mailer');
const audit = require('./audit');

const AUDIENCES = ['graduates', 'investors', 'selected'];
const AUDIENCE_LABEL = { graduates: 'All graduates', investors: 'All investors and sponsors', selected: 'Selected people' };
const validEmail = (e) => z.email().safeParse(e).success;

// Who may receive: approved, active graduates and investors with a valid email.
// Suspended, archived, pending and rejected accounts never do.
const RECIPIENT_WHERE = {
  graduate: {
    where: { role: 'graduate', status: 'active' },
    include: [{ model: GraduateProfile, as: 'graduateProfile', required: true, where: { verificationStatus: 'approved' }, attributes: ['cohortYear', 'program'] }],
  },
  investor: { where: { role: 'investor', status: 'active' }, include: [{ model: InvestorProfile, as: 'investorProfile', required: false, attributes: ['organisation', 'investorType'] }] },
};

async function eligible(role, extraWhere = {}) {
  const spec = RECIPIENT_WHERE[role];
  const rows = await User.findAll({ where: { ...spec.where, ...extraWhere }, include: spec.include, attributes: ['id', 'fullName', 'email', 'role'], order: [['id', 'ASC']] });
  return rows.filter((u) => validEmail(u.email));
}

/** The recipients for an audience; for 'selected', only ids that are allowed. */
async function resolveAudience(audience, userIds = []) {
  if (audience === 'graduates') return eligible('graduate');
  if (audience === 'investors') return eligible('investor');
  const ids = [...new Set(userIds.map(Number).filter(Boolean))];
  if (!ids.length) return [];
  const [g, i] = await Promise.all([eligible('graduate', { id: ids }), eligible('investor', { id: ids })]);
  return [...g, ...i].sort((a, b) => a.id - b.id);
}

/** People staff can tick for 'selected': search by name or organisation. */
async function searchPeople(q = '', role = '') {
  const term = q.trim();
  const like = term ? { [Op.like]: `%${term.replace(/[%_\\]/g, (c) => `\\${c}`)}%` } : null;
  const roles = role === 'graduate' || role === 'investor' ? [role] : ['graduate', 'investor'];
  const lists = await Promise.all(roles.map((r) => eligible(r, like ? { fullName: like } : {})));
  return lists
    .flat()
    .slice(0, 50)
    .map((u) => ({
      id: u.id,
      name: u.fullName,
      role: u.role,
      detail: u.role === 'graduate' ? [u.graduateProfile?.program, u.graduateProfile?.cohortYear].filter(Boolean).join(' · ') : u.investorProfile?.organisation || null,
    }));
}

// Simple formatting: blank line = new paragraph, "- " lines = a list,
// **bold**. Everything is escaped first.
function formatBody(body) {
  const inline = (s) => escapeHtml(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  return String(body)
    .replace(/\r\n/g, '\n')
    .trim()
    .split(/\n\s*\n/)
    .map((block) => {
      const lines = block.split('\n');
      if (lines.every((l) => /^\s*-\s+/.test(l))) {
        return `<ul style="margin:0 0 12px;padding-left:20px">${lines.map((l) => `<li>${inline(l.replace(/^\s*-\s+/, ''))}</li>`).join('')}</ul>`;
      }
      return `<p style="margin:0 0 12px">${lines.map(inline).join('<br>')}</p>`;
    })
    .join('');
}
const plainBody = (body) => String(body).replace(/\r\n/g, '\n').replace(/\*\*(.+?)\*\*/g, '$1').trim();

/** Today's allowance: limit, sent, already reserved by queued bulk rows, and what is left. */
async function quota(now = new Date()) {
  const [sent, reserved] = await Promise.all([
    sentToday(now),
    Notification.count({ where: { status: 'pending', archivedAt: null, batchId: { [Op.ne]: null }, nextAttemptAt: { [Op.lt]: startOfNextDay(now) } } }),
  ]);
  const limit = env.mail.dailyLimit;
  return { limit, sentToday: sent, queuedToday: reserved, remainingToday: Math.max(0, limit - sent - reserved) };
}

/** How many would go today and how many would wait, for the confirm step. */
async function plan(count) {
  const q = await quota();
  const today = Math.min(count, q.remainingToday);
  return { ...q, recipients: count, sendToday: today, later: count - today };
}

/**
 * Creates the batch, queues one email per recipient and returns at once.
 * `announcementId` is set for private announcements.
 */
async function createBatch({ senderId, subject, body, audience, userIds = [], kind = 'message' }) {
  const recipients = await resolveAudience(audience, userIds);
  if (!recipients.length) return { batch: null, recipients: 0 };
  const { remainingToday } = await quota();
  const now = new Date();
  const tomorrow = startOfNextDay(now);
  const html = formatBody(body);
  const text = plainBody(body);

  const batch = await sequelize.transaction(async (transaction) => {
    const created = await BulkMessage.create({ senderId, subject, body, audience, recipientCount: recipients.length }, { transaction });
    await queueRows(created, recipients, { html, text, remainingToday, now, tomorrow, transaction });
    await audit.record(
      { actorId: senderId, action: kind === 'announcement' ? 'announcement.emailed' : 'message.sent', entityType: 'bulk_message', entityId: created.id, metadata: { audience, recipientCount: recipients.length } },
      { transaction }
    );
    return created;
  });
  // Fire-and-forget: sending never blocks the request.
  if (!env.isTest) processOutbox().catch(() => {});
  return { batch, recipients: recipients.length };
}

// INSERT IGNORE on the unique event key: queuing the same batch again adds nothing.
async function queueRows(batch, recipients, { html, text, remainingToday, now = new Date(), tomorrow = startOfNextDay(now), transaction } = {}) {
  const rows = recipients.map((u, i) => ({
    eventKey: `bulk:${batch.id}:${u.id}`,
    batchId: batch.id,
    recipientId: u.id,
    toEmail: u.email,
    subject: batch.subject,
    bodyText: `Hello ${u.fullName},\n\n${text}\n\nYou received this because you have an account on ALU Ventures.`,
    bodyHtml: wrapHtml(
      batch.subject,
      `<p style="margin:0 0 12px">Hello ${escapeHtml(u.fullName)},</p>${html}<p style="margin:16px 0 0;font-size:12px;color:#59636e">You received this because you have an account on ALU Ventures.</p>`
    ),
    status: 'pending',
    nextAttemptAt: i < remainingToday ? now : tomorrow,
  }));
  await Notification.bulkCreate(rows, { ignoreDuplicates: true, transaction });
}

// Queued / Sending / Sent / Partly failed, from the batch's own emails.
function statusOf({ pending, sent, failed }) {
  if (pending > 0) return sent + failed > 0 ? 'sending' : 'queued';
  return failed > 0 ? 'partly_failed' : 'sent';
}
const STATUS_LABEL = { queued: 'Queued', sending: 'Sending', sent: 'Sent', partly_failed: 'Partly failed' };

async function tallies(batchIds) {
  if (!batchIds.length) return {};
  const rows = await Notification.findAll({
    where: { batchId: batchIds },
    attributes: ['batchId', 'status', [sequelize.fn('COUNT', sequelize.col('id')), 'n']],
    group: ['batchId', 'status'],
    raw: true,
  });
  const out = {};
  for (const id of batchIds) out[id] = { pending: 0, sent: 0, failed: 0 };
  rows.forEach((r) => (out[r.batchId][r.status] = Number(r.n)));
  return out;
}

function serializeBatch(b, tally) {
  const t = tally || { pending: 0, sent: 0, failed: 0 };
  const status = statusOf(t);
  return {
    id: b.id,
    subject: b.subject,
    body: b.body,
    audience: b.audience,
    audienceLabel: AUDIENCE_LABEL[b.audience],
    recipientCount: b.recipientCount,
    counts: t,
    status,
    statusLabel: STATUS_LABEL[status],
    sender: b.sender ? { name: b.sender.fullName, role: b.sender.role } : null,
    createdAt: b.createdAt,
  };
}

/** Failed recipients of one batch, for the log (name and the provider's error). */
async function failures(batchId) {
  const rows = await Notification.findAll({
    where: { batchId, status: 'failed' },
    include: [{ model: User, as: 'recipient', attributes: ['fullName'] }],
    order: [['id', 'ASC']],
  });
  return rows.map((n) => ({ id: n.id, name: n.recipient?.fullName || null, error: n.lastError, attempts: n.attempts }));
}

/** Failed emails of a batch go back to the queue (same rows: no copies). */
async function retryFailed(batchId) {
  const [count] = await Notification.update({ status: 'pending', attempts: 0, nextAttemptAt: new Date(), lastError: null }, { where: { batchId, status: 'failed' } });
  if (count && !env.isTest) processOutbox().catch(() => {});
  return count;
}

module.exports = { AUDIENCES, AUDIENCE_LABEL, resolveAudience, searchPeople, formatBody, quota, plan, createBatch, queueRows, tallies, serializeBatch, failures, retryFailed, statusOf };
