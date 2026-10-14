// In-process background worker (proposal §3.3.3: modules of one deployable
// backend). Runs document verification in the background, at most
// CONCURRENCY (OCR_POOL_SIZE) documents at a time (the OCR itself runs in worker threads, see
// services/verification/ocrPool.js), and periodically flushes the email outbox.
const { Document, User, Project } = require('../models');
const storage = require('../services/storage');
const { verifyDocument } = require('../services/verification/documentVerifier');
const { getSetting } = require('../services/settings');
const { processOutbox } = require('../services/mailer');
const audit = require('../services/audit');

const VERIFIABLE = new Set(['degree_certificate', 'rdb_certificate']);
// Matches the OCR thread pool, so a verification never waits on a busy thread.
const CONCURRENCY = require('../config/env').ocr.poolSize;
const queue = [];
let active = 0;
const idleWaiters = [];

// `rerun` marks an administrator-requested re-run of the checks in the audit log.
async function verify(documentId, { rerun = false } = {}) {
  const document = await Document.findByPk(documentId, {
    include: [
      { model: User, as: 'uploader' },
      { model: Project, as: 'project' },
    ],
  });
  if (!document || !VERIFIABLE.has(document.kind)) return;

  try {
    const buffer = await storage.get(document.storageKey);
    const result = await verifyDocument(document.kind, buffer, document.mimeType, {
      expectedName: document.uploader.fullName,
      companyNumber: document.project?.companyNumber || undefined,
      nameThreshold: Number(await getSetting('ocr_name_match_threshold', 0.8)),
    });
    await document.update({ extractionJson: result, flag: result.flag, status: 'processed' });
    await audit.record({
      action: 'document.verification_flagged',
      entityType: 'document',
      entityId: document.id,
      reason: `${rerun ? 'Automated pre-check re-run' : 'Automated pre-check'}: ${result.flag === 'likely_valid' ? 'Likely Valid' : 'Suspicious'}`,
      metadata: { kind: document.kind, failedChecks: result.checks.filter((c) => !c.passed).map((c) => c.id) },
    });
  } catch (err) {
    console.error(`[worker] verification failed for document ${document.id}:`, err.message);
    // An unreadable document still needs human review; flag it as suspicious.
    await document.update({
      status: 'failed',
      flag: 'suspicious',
      extractionJson: {
        kind: document.kind,
        error: err.message,
        checks: [{ id: 'text', label: 'Document could be processed', passed: false, detail: err.message }],
        flag: 'suspicious',
        processedAt: new Date().toISOString(),
      },
    });
  }
}

function drain() {
  while (active < CONCURRENCY && queue.length) {
    const { id, options } = queue.shift();
    active += 1;
    verify(id, options)
      .catch((err) => console.error('[worker] unexpected error:', err))
      .finally(() => {
        active -= 1;
        drain();
      });
  }
  if (!active && !queue.length) while (idleWaiters.length) idleWaiters.shift()();
}

function enqueueDocumentVerification(documentId, options = {}) {
  queue.push({ id: documentId, options });
  setImmediate(drain);
}

// Resolves when the verification queue is empty (used by tests and the demo seed).
function whenIdle() {
  if (!active && !queue.length) return Promise.resolve();
  return new Promise((resolve) => idleWaiters.push(resolve));
}

let outboxTimer = null;
async function startWorkers() {
  // Resume documents left mid-verification by a restart.
  const pending = await Document.findAll({ where: { status: 'processing' }, attributes: ['id'] });
  pending.forEach((d) => enqueueDocumentVerification(d.id));

  outboxTimer = setInterval(() => {
    processOutbox().catch((err) => console.error('[worker] outbox error:', err.message));
  }, 20000);
  outboxTimer.unref();
}

function stopWorkers() {
  if (outboxTimer) clearInterval(outboxTimer);
}

module.exports = { enqueueDocumentVerification, verifyDocumentNow: verify, VERIFIABLE, whenIdle, startWorkers, stopWorkers };
