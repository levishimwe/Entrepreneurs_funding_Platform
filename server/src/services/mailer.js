// Email delivery through a persistent outbox with retry status (FR10).
// Every message is stored in `notifications` under a unique event key, so the
// same logical notice is never queued twice; a worker sends pending rows.
const nodemailer = require('nodemailer');
const { Op } = require('sequelize');
const env = require('../config/env');
const { Notification } = require('../models');

const { HTTP_PROVIDERS } = require('./emailProviders');

const MAX_ATTEMPTS = 5;
let senderPromise = null;

// Wraps a Nodemailer transport in the same shape as the HTTPS providers.
function nodemailerSender(transport, name) {
  return {
    name,
    async send(message) {
      const info = await transport.sendMail({ from: env.mail.from, ...message });
      return { previewUrl: nodemailer.getTestMessageUrl(info) || null };
    },
  };
}

// EMAIL_DRIVER picks the sender: resend or brevo (HTTPS API, for hosts that
// block SMTP), or smtp (Nodemailer). Nodemailer is also the fallback when an
// HTTPS provider is chosen without EMAIL_API_KEY.
async function createSender() {
  if (env.isTest) return nodemailerSender(nodemailer.createTransport({ jsonTransport: true }), 'json');
  const provider = HTTP_PROVIDERS[env.mail.driver];
  if (provider && env.mail.apiKey) return provider({ apiKey: env.mail.apiKey, from: env.mail.from });
  if (provider) console.warn(`[mail] EMAIL_DRIVER=${env.mail.driver} but EMAIL_API_KEY is not set — falling back to SMTP.`);
  else if (env.mail.driver !== 'smtp') console.warn(`[mail] Unknown EMAIL_DRIVER "${env.mail.driver}" — using SMTP.`);

  if (env.mail.host && env.mail.user) {
    return nodemailerSender(
      nodemailer.createTransport({
        host: env.mail.host,
        port: env.mail.port,
        secure: env.mail.secure,
        auth: { user: env.mail.user, pass: env.mail.pass },
        // Fail fast where SMTP ports are blocked instead of hanging.
        connectionTimeout: 15000,
      }),
      'smtp'
    );
  }
  if (env.isProduction) {
    throw new Error('No email provider configured: set EMAIL_DRIVER and EMAIL_API_KEY, or SMTP_HOST/SMTP_USER/SMTP_PASS.');
  }
  // Development without credentials: a free Ethereal test inbox. Nothing is
  // delivered; each message gets a preview URL instead.
  const account = await nodemailer.createTestAccount();
  console.log(`[mail] No email provider configured — using Ethereal test inbox ${account.user}`);
  return nodemailerSender(
    nodemailer.createTransport({
      host: account.smtp.host,
      port: account.smtp.port,
      secure: account.smtp.secure,
      auth: { user: account.user, pass: account.pass },
    }),
    'ethereal'
  );
}

function getSender() {
  if (!senderPromise) {
    senderPromise = createSender().catch((err) => {
      senderPromise = null;
      throw err;
    });
  }
  return senderPromise;
}

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Plain, accessible HTML wrapper so every email looks consistent.
function renderHtml(subject, paragraphs, cta) {
  const body = paragraphs.map((p) => `<p style="margin:0 0 12px">${escapeHtml(p)}</p>`).join('');
  const button = cta
    ? `<p style="margin:20px 0"><a href="${escapeHtml(cta.url)}" style="background:#1f883d;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;font-weight:600">${escapeHtml(cta.label)}</a></p>`
    : '';
  return `<!doctype html><html><body style="font-family:Segoe UI,Arial,sans-serif;color:#1f2328;background:#f6f8fa;padding:24px">
<div style="max-width:560px;margin:auto;background:#fff;border:1px solid #d0d7de;border-radius:8px;padding:24px">
<div style="font-weight:700;color:#002b5c;margin-bottom:16px">ALU Ventures</div>
<h1 style="font-size:18px;margin:0 0 16px">${escapeHtml(subject)}</h1>${body}${button}
<p style="margin-top:24px;font-size:12px;color:#59636e">ALU Graduate Entrepreneurship &amp; Funding Platform. This is an automated message.</p>
</div></body></html>`;
}

/**
 * Queue an email once per event key and try to send it straight away.
 * `paragraphs` is an array of plain-text paragraphs; `cta` an optional {label, url}.
 */
async function enqueueEmail({
  eventKey,
  to,
  recipientId = null,
  subject,
  paragraphs,
  cta = null,
  introductionId = null,
  applicationId = null,
  sendNow = true,
}) {
  const bodyText = [...paragraphs, ...(cta ? [`${cta.label}: ${cta.url}`] : [])].join('\n\n');
  const [notification, created] = await Notification.findOrCreate({
    where: { eventKey },
    defaults: {
      recipientId,
      introductionId,
      applicationId,
      toEmail: to,
      subject,
      bodyText,
      bodyHtml: renderHtml(subject, paragraphs, cta),
      status: 'pending',
      nextAttemptAt: new Date(),
    },
  });
  if (created && sendNow) {
    // Fire-and-forget: a slow SMTP server must not block the HTTP response.
    deliver(notification).catch(() => {});
  }
  return notification;
}

async function deliver(notification) {
  try {
    const sender = await getSender();
    const { previewUrl } = await sender.send({
      to: notification.toEmail,
      subject: notification.subject,
      text: notification.bodyText,
      html: notification.bodyHtml,
    });
    if (previewUrl) console.log(`[mail] "${notification.subject}" → ${notification.toEmail}: ${previewUrl}`);
    await notification.update({
      status: 'sent',
      sentAt: new Date(),
      attempts: notification.attempts + 1,
      previewUrl,
      lastError: null,
      nextAttemptAt: null,
    });
  } catch (err) {
    const attempts = notification.attempts + 1;
    const failed = attempts >= MAX_ATTEMPTS;
    console.error(`[mail] send failed (${attempts}/${MAX_ATTEMPTS}) for ${notification.eventKey}: ${err.message}`);
    await notification.update({
      attempts,
      status: failed ? 'failed' : 'pending',
      lastError: err.message.slice(0, 2000),
      // Exponential backoff: 1, 2, 4, 8 minutes.
      nextAttemptAt: failed ? null : new Date(Date.now() + 60000 * 2 ** (attempts - 1)),
    });
  }
}

// Called periodically by the worker; sends everything that is due.
async function processOutbox() {
  const due = await Notification.findAll({
    // Archived emails are never sent.
    where: { status: 'pending', archivedAt: null, nextAttemptAt: { [Op.lte]: new Date() } },
    order: [['id', 'ASC']],
    limit: 20,
  });
  for (const notification of due) await deliver(notification);
  return due.length;
}

// Administrative follow-up for failed deliveries.
async function retryNotification(notification) {
  await notification.update({ status: 'pending', attempts: 0, nextAttemptAt: new Date() });
  await deliver(notification);
  return notification.reload();
}

module.exports = { enqueueEmail, processOutbox, retryNotification, renderHtml };
