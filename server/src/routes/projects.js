// Graduate project workflow: submission, revision, clarification and evidence
// (FR04, FR05, FR14, FR15, FR16). Only administrator-approved graduates may
// submit; the system never approves a project by itself.
const express = require('express');
const { z } = require('zod');
const env = require('../config/env');
const { sequelize, Project, Document, SectorKeyword } = require('../models');
const { badRequest, conflict, notFound, HttpError } = require('../middleware/errors');
const { requireApprovedGraduate, requireRole } = require('../middleware/auth');
const { upload, validateDocument } = require('../middleware/upload');
const { uploadLimiter } = require('../middleware/rateLimits');
const storage = require('../services/storage');
const audit = require('../services/audit');
const { enqueueEmail } = require('../services/mailer');
const { createWithUniqueCode, suggestSector, findSimilarProjects } = require('../services/categorization');
const { ownerProject } = require('../services/projectView');
const { enqueueDocumentVerification } = require('../workers/jobs');

const router = express.Router();

const EDITABLE = new Set(['pending_review', 'revision_required', 'approved']);
const bool = z.preprocess((v) => v === true || v === 'true' || v === 'on' || v === '1', z.boolean());
const optionalText = (max) => z.string().trim().max(max).optional().or(z.literal('')).transform((v) => v || null);

const projectSchema = z
  .object({
    title: z.string().trim().min(5, 'Use at least 5 characters.').max(200),
    type: z.enum(['idea', 'company'], { message: 'Choose idea stage or registered company.' }),
    sector: z.string().trim().min(2, 'Confirm a sector.').max(80),
    stage: z.string().trim().min(2, 'Choose a stage.').max(60),
    country: z.string().trim().min(2, 'Choose the primary operating country.').max(60).default('Rwanda'),
    summary: z.string().trim().min(20, 'Write a one or two sentence summary (20+ characters).').max(500),
    description: z.string().trim().min(80, 'Describe the venture in at least 80 characters.').max(6000),
    fundingSought: optionalText(120),
    companyName: optionalText(200),
    companyNumber: optionalText(60),
    relationshipToCompany: optionalText(120),
    ideaDeclaration: bool.default(false),
    publicationConsent: bool.default(false),
    similarityAcknowledged: bool.default(false),
  })
  .superRefine((d, ctx) => {
    if (d.type === 'company') {
      if (!d.companyName) ctx.addIssue({ code: 'custom', path: ['companyName'], message: 'Enter the registered company name.' });
      if (!d.companyNumber) ctx.addIssue({ code: 'custom', path: ['companyNumber'], message: 'Enter the RDB company code.' });
      if (!d.relationshipToCompany)
        ctx.addIssue({ code: 'custom', path: ['relationshipToCompany'], message: 'State your relationship to the company.' });
    } else if (!d.ideaDeclaration) {
      ctx.addIssue({
        code: 'custom',
        path: ['ideaDeclaration'],
        message: 'Confirm the idea-stage declaration (no registered company yet).',
      });
    }
  });

const uploadFields = upload.fields([
  { name: 'rdbCertificate', maxCount: 1 },
  { name: 'revenueDocuments', maxCount: 3 },
]);

// Sectors come from the administrator-maintained map.
async function assertKnownSector(sector) {
  if (!(await SectorKeyword.count({ where: { sector } }))) {
    throw new HttpError(400, 'Please correct the highlighted fields.', { fields: { sector: 'Choose a sector from the list.' } });
  }
}

async function loadOwnedProject(req) {
  const project = await Project.findOne({
    where: { id: req.params.id, ownerId: req.user.id },
    include: [{ model: Document, as: 'documents' }],
    order: [[{ model: Document, as: 'documents' }, 'id', 'ASC']],
  });
  if (!project) throw notFound('Project not found.');
  return project;
}

// Stores files first (outside the DB transaction) and returns document rows to create.
async function storeFiles(entries) {
  const stored = [];
  try {
    for (const { file, kind, label } of entries) {
      const doc = await validateDocument(file, label);
      const storageKey = await storage.put(doc.buffer, { prefix: `projects/${kind}`, mimeType: doc.mimeType });
      stored.push({ kind, storageKey, originalName: doc.originalName, mimeType: doc.mimeType, sizeBytes: doc.size });
    }
  } catch (err) {
    await Promise.all(stored.map((s) => storage.remove(s.storageKey).catch(() => {})));
    throw err;
  }
  return stored;
}

function clarificationEmail(project, user) {
  return enqueueEmail({
    eventKey: `clarification-request:${project.id}:${user.id}:${project.clarificationRequestedAt.getTime()}`,
    to: user.email,
    recipientId: user.id,
    subject: `Clarification needed for ${project.title} (${project.projectCode})`,
    paragraphs: [
      `Hello ${user.fullName},`,
      `Your project "${project.title}" is similar to one or more projects already approved on ALU Ventures. This is a routine review signal, not an accusation of copying.`,
      'Please explain what makes your venture distinct — for example your market, model, team or stage. An administrator will review your clarification before the project can be approved.',
    ],
    cta: { label: 'Submit clarification', url: `${env.clientUrl}/app/projects/${project.id}` },
  });
}

// --- Assistive checks used while filling in the form ---
router.post('/suggest-sector', requireRole('graduate'), async (req, res) => {
  const { title = '', summary = '', description = '' } = req.body || {};
  res.json(await suggestSector(`${title} ${summary} ${description}`));
});

router.post('/similarity-check', requireRole('graduate'), async (req, res) => {
  const data = z
    .object({ title: z.string().max(200).default(''), description: z.string().max(6000).default(''), projectId: z.coerce.number().optional() })
    .parse(req.body || {});
  const result = await findSimilarProjects({ ...data, excludeId: data.projectId || null });
  res.json({
    threshold: result.threshold,
    matches: result.matches.map(({ projectCode, title, sector, score }) => ({ projectCode, title, sector, score })),
  });
});

// --- Submission (FR04) ---
router.post('/', requireApprovedGraduate, uploadLimiter, uploadFields, async (req, res) => {
  const data = projectSchema.parse(req.body);
  await assertKnownSector(data.sector);
  const rdbFile = req.files?.rdbCertificate?.[0];
  if (data.type === 'company' && !rdbFile) {
    return res.status(400).json({
      error: 'Please correct the highlighted fields.',
      fields: { rdbCertificate: 'Upload the RDB registration certificate for your company.' },
    });
  }
  if (data.type === 'company') {
    const taken = await Project.count({ where: { companyNumber: data.companyNumber } });
    if (taken) throw conflict('A project with this RDB company code already exists on the platform.');
  }

  const suggestion = await suggestSector(`${data.title} ${data.summary} ${data.description}`);
  const similarity = await findSimilarProjects({ title: data.title, description: data.description });
  if (similarity.matches.length && !data.similarityAcknowledged) {
    // The graduate must see and respond to the warning before final submission.
    return res.status(409).json({
      error: 'Your project looks similar to existing approved projects. Review the matches before submitting.',
      code: 'SIMILARITY_WARNING',
      matches: similarity.matches.map(({ projectCode, title, sector, score }) => ({ projectCode, title, sector, score })),
    });
  }

  const files = [];
  if (data.type === 'company') files.push({ file: rdbFile, kind: 'rdb_certificate', label: 'The RDB certificate' });
  for (const file of req.files?.revenueDocuments || []) {
    files.push({ file, kind: 'revenue_document', label: `Revenue document "${file.originalname}"` });
  }
  const stored = await storeFiles(files);

  const flagged = similarity.matches.length > 0;
  const now = new Date();
  let project;
  try {
    project = await sequelize.transaction(async (transaction) => {
      const created = await createWithUniqueCode((projectCode) =>
        Project.create(
          {
            ownerId: req.user.id,
            projectCode,
            title: data.title,
            type: data.type,
            sector: data.sector,
            suggestedSector: suggestion.sector,
            stage: data.stage,
          country: data.country,
            country: data.country,
            summary: data.summary,
            description: data.description,
            fundingSought: data.fundingSought,
            companyName: data.type === 'company' ? data.companyName : null,
            companyNumber: data.type === 'company' ? data.companyNumber : null,
            relationshipToCompany: data.type === 'company' ? data.relationshipToCompany : null,
            ideaDeclaration: data.type === 'idea',
            publicationConsent: data.publicationConsent,
            status: flagged ? 'similarity_flagged' : 'pending_review',
            similarityStatus: flagged ? 'flagged' : 'none',
            similarityScore: similarity.topScore,
            similarityMatches: flagged ? similarity.matches : null,
            clarificationRequestedAt: flagged ? now : null,
            submittedAt: now,
          },
          { transaction }
        )
      );
      for (const s of stored) {
        await Document.create({ ...s, uploaderId: req.user.id, projectId: created.id }, { transaction });
      }
      const base = { actorId: req.user.id, entityType: 'project', entityId: created.id };
      await audit.record({ ...base, action: 'project.submitted', metadata: { projectCode: created.projectCode, type: data.type } }, { transaction });
      await audit.record(
        {
          ...base,
          action: 'project.sector_confirmed',
          metadata: { suggested: suggestion.sector, confirmed: data.sector, overridden: suggestion.sector !== data.sector, matched: suggestion.matched },
        },
        { transaction }
      );
      if (flagged) {
        await audit.record(
          { ...base, action: 'project.similarity_flagged', reason: `Top similarity ${similarity.topScore} ≥ threshold ${similarity.threshold}`, metadata: { matches: similarity.matches } },
          { transaction }
        );
      }
      return created;
    });
  } catch (err) {
    await Promise.all(stored.map((s) => storage.remove(s.storageKey).catch(() => {})));
    throw err;
  }

  const full = await loadOwnedProject({ params: { id: project.id }, user: req.user });
  full.documents.filter((d) => d.kind === 'rdb_certificate').forEach((d) => enqueueDocumentVerification(d.id));

  await enqueueEmail({
    eventKey: `project-submitted:${project.id}:${req.user.id}`,
    to: req.user.email,
    recipientId: req.user.id,
    subject: `Project received: ${project.title}`,
    paragraphs: [
      `Hello ${req.user.fullName},`,
      `We have received "${project.title}". Its project verification code is ${project.projectCode} — the code stays the same through any revisions.`,
      'An administrator will review your submission and evidence. You can follow its status in your dashboard.',
    ],
    cta: { label: 'View project', url: `${env.clientUrl}/app/projects/${project.id}` },
  });
  if (flagged) await clarificationEmail(full, req.user);

  res.status(201).json({ project: ownerProject(full) });
});

// --- Graduate's own projects ---
router.get('/mine', requireRole('graduate'), async (req, res) => {
  const projects = await Project.findAll({
    where: { ownerId: req.user.id },
    include: [{ model: Document, as: 'documents' }],
    order: [['createdAt', 'DESC']],
  });
  res.json({ projects: projects.map(ownerProject) });
});

router.get('/:id', requireRole('graduate'), async (req, res) => {
  const project = ownerProject(await loadOwnedProject(req));
  // For the clarification comparison: the matched project's summary is shown
  // only when it is an approved, publication-consented record.
  if (project.similarityMatches.length) {
    const matched = await Project.findAll({
      where: { projectCode: project.similarityMatches.map((m) => m.projectCode), publicationConsent: true },
      attributes: ['projectCode', 'summary', 'status'],
    });
    const byCode = Object.fromEntries(matched.filter((m) => m.status !== 'archived').map((m) => [m.projectCode, m.summary]));
    project.similarityMatches = project.similarityMatches.map((m) => ({ ...m, summary: byCode[m.projectCode] || null }));
  }
  res.json({ project });
});

// --- Revision (FR04: material changes trigger renewed review) ---
router.patch('/:id', requireApprovedGraduate, uploadLimiter, uploadFields, async (req, res) => {
  const project = await loadOwnedProject(req);
  if (!EDITABLE.has(project.status)) {
    throw badRequest(
      project.status === 'similarity_flagged'
        ? 'Submit a clarification for the similarity flag instead of editing.'
        : 'This project can no longer be edited.'
    );
  }
  const data = projectSchema.parse(req.body);
  await assertKnownSector(data.sector);
  if (data.type === 'company') {
    const taken = await Project.count({ where: { companyNumber: data.companyNumber } });
    if (taken && data.companyNumber !== project.companyNumber) {
      throw conflict('A project with this RDB company code already exists on the platform.');
    }
  }

  const rdbFile = req.files?.rdbCertificate?.[0];
  const hasRdb = project.documents.some((d) => d.kind === 'rdb_certificate');
  if (data.type === 'company' && !rdbFile && !hasRdb) {
    return res.status(400).json({
      error: 'Please correct the highlighted fields.',
      fields: { rdbCertificate: 'Upload the RDB registration certificate for your company.' },
    });
  }

  const suggestion = await suggestSector(`${data.title} ${data.summary} ${data.description}`);
  const similarity = await findSimilarProjects({ title: data.title, description: data.description, excludeId: project.id });
  if (similarity.matches.length && !data.similarityAcknowledged) {
    return res.status(409).json({
      error: 'Your revised project looks similar to existing approved projects. Review the matches before resubmitting.',
      code: 'SIMILARITY_WARNING',
      matches: similarity.matches.map(({ projectCode, title, sector, score }) => ({ projectCode, title, sector, score })),
    });
  }

  const files = [];
  if (rdbFile && data.type === 'company') files.push({ file: rdbFile, kind: 'rdb_certificate', label: 'The RDB certificate' });
  for (const file of req.files?.revenueDocuments || []) {
    files.push({ file, kind: 'revenue_document', label: `Revenue document "${file.originalname}"` });
  }
  const stored = await storeFiles(files);
  const flagged = similarity.matches.length > 0;
  const companyChanged = data.companyNumber !== project.companyNumber || data.companyName !== project.companyName;
  const now = new Date();

  try {
    await sequelize.transaction(async (transaction) => {
      await project.update(
        {
          title: data.title,
          type: data.type,
          sector: data.sector,
          suggestedSector: suggestion.sector,
          stage: data.stage,
          country: data.country,
          summary: data.summary,
          description: data.description,
          fundingSought: data.fundingSought,
          companyName: data.type === 'company' ? data.companyName : null,
          companyNumber: data.type === 'company' ? data.companyNumber : null,
          relationshipToCompany: data.type === 'company' ? data.relationshipToCompany : null,
          ideaDeclaration: data.type === 'idea',
          publicationConsent: data.publicationConsent,
          // The code never changes; any revision goes back for review.
          status: flagged ? 'similarity_flagged' : 'pending_review',
          similarityStatus: flagged ? 'flagged' : 'none',
          similarityScore: similarity.topScore,
          similarityMatches: flagged ? similarity.matches : null,
          clarificationRequestedAt: flagged ? now : null,
          clarificationText: flagged ? null : project.clarificationText,
          clarificationSubmittedAt: flagged ? null : project.clarificationSubmittedAt,
          approvedAt: null,
          submittedAt: now,
        },
        { transaction }
      );
      for (const s of stored) {
        await Document.create({ ...s, uploaderId: req.user.id, projectId: project.id }, { transaction });
      }
      await audit.record(
        {
          actorId: req.user.id,
          action: 'project.revised',
          entityType: 'project',
          entityId: project.id,
          metadata: { newDocuments: stored.map((s) => s.kind), sectorSuggested: suggestion.sector, sectorConfirmed: data.sector },
        },
        { transaction }
      );
    });
  } catch (err) {
    await Promise.all(stored.map((s) => storage.remove(s.storageKey).catch(() => {})));
    throw err;
  }

  const full = await loadOwnedProject(req);
  // Re-run the RDB pre-check on the latest certificate when evidence or company details changed.
  const latestRdb = full.documents.filter((d) => d.kind === 'rdb_certificate').at(-1);
  if (latestRdb && data.type === 'company' && (rdbFile || companyChanged)) {
    await latestRdb.update({ status: 'processing', flag: null });
    enqueueDocumentVerification(latestRdb.id);
  }
  if (flagged) await clarificationEmail(full, req.user);
  res.json({ project: ownerProject(full) });
});

// --- Similarity clarification (FR16) ---
const clarificationUpload = upload.single('supportingDocument');
router.post('/:id/clarification', requireApprovedGraduate, uploadLimiter, clarificationUpload, async (req, res) => {
  const project = await loadOwnedProject(req);
  if (project.status !== 'similarity_flagged') throw badRequest('This project does not need a clarification.');
  const data = z
    .object({
      clarification: z.string().trim().min(40, 'Explain the distinction in at least 40 characters.').max(4000),
      declaration: bool.refine((v) => v === true, { message: 'Confirm the founder declaration before submitting.' }),
      documentKind: z.enum(['rra_certificate', 'supporting_document']).default('supporting_document'),
    })
    .parse(req.body);

  const stored = req.file
    ? await storeFiles([{ file: req.file, kind: data.documentKind, label: 'The supporting document' }])
    : [];
  await sequelize.transaction(async (transaction) => {
    await project.update(
      { clarificationText: data.clarification, clarificationSubmittedAt: new Date(), similarityStatus: 'clarified' },
      { transaction }
    );
    for (const s of stored) await Document.create({ ...s, uploaderId: req.user.id, projectId: project.id }, { transaction });
    await audit.record(
      { actorId: req.user.id, action: 'project.clarification_submitted', entityType: 'project', entityId: project.id, metadata: { documents: stored.length } },
      { transaction }
    );
  });
  res.json({ project: ownerProject(await loadOwnedProject(req)) });
});

// --- Additional evidence requested by an administrator (e.g. RRA certificate) ---
const evidenceUpload = upload.single('document');
router.post('/:id/documents', requireApprovedGraduate, uploadLimiter, evidenceUpload, async (req, res) => {
  const project = await loadOwnedProject(req);
  if (['rejected', 'archived'].includes(project.status)) throw badRequest('This project is closed.');
  const { kind } = z
    .object({ kind: z.enum(['rra_certificate', 'supporting_document', 'revenue_document']) })
    .parse(req.body);
  const stored = await storeFiles([{ file: req.file, kind, label: 'The document' }]);
  await Document.create({ ...stored[0], uploaderId: req.user.id, projectId: project.id });
  await audit.record({ actorId: req.user.id, action: 'document.uploaded', entityType: 'project', entityId: project.id, metadata: { kind } });
  res.status(201).json({ project: ownerProject(await loadOwnedProject(req)) });
});

module.exports = router;
