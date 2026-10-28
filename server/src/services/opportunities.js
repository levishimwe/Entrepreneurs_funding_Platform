// Opportunity validation, serialisation and the server-side eligibility check
// (FR08): approved graduate, approved project and the published criteria.
const { z } = require('zod');

const optionalList = z.array(z.string().trim().min(1).max(80)).max(20).default([]);

// The organiser's official page for a link-only opportunity: https only.
function isHttpsUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && u.hostname.includes('.') && !u.username && !u.password;
  } catch {
    return false;
  }
}

const opportunitySchema = z
  .object({
    title: z.string().trim().min(5, 'Use at least 5 characters.').max(200),
    type: z.enum(['hackathon', 'grant', 'competition', 'other'], { message: 'Choose a type.' }),
    organiser: z.string().trim().max(150).optional().or(z.literal('')).transform((v) => v || null),
    // Link only: applicants apply on the organiser's site. Then only title,
    // type, organiser, deadline and the https link are required.
    linkOnly: z.boolean().optional().default(false),
    externalUrl: z.string().trim().max(500).optional().or(z.literal('')).or(z.null()).transform((v) => v || null),
    description: z.string().trim().max(6000).optional().or(z.null()).transform((v) => v || ''),
    applicationInstructions: z.string().trim().max(4000).optional().or(z.literal('')).transform((v) => v || null),
    prize: z.string().trim().max(150).optional().or(z.literal('')).transform((v) => v || null),
    deadline: z.coerce.date({ message: 'Choose a valid deadline.' }),
    // When the event itself ends (optional). Completed is possible after it.
    endsAt: z
      .union([z.literal(''), z.null(), z.coerce.date({ message: 'Choose a valid end date.' })])
      .optional()
      .transform((v) => (v === '' || v === undefined ? null : v)),
    criteria: z
      .object({
        sectors: optionalList,
        projectTypes: z.array(z.enum(['idea', 'company'])).max(2).default([]),
        stages: optionalList,
        minCohortYear: z.coerce.number().int().min(2010).max(2100).nullable().optional(),
        maxCohortYear: z.coerce.number().int().min(2010).max(2100).nullable().optional(),
        notes: z.string().trim().max(2000).optional().default(''),
      })
      .default({}),
  })
  .superRefine((d, ctx) => {
    if (d.linkOnly) {
      if (!d.organiser) ctx.addIssue({ code: 'custom', path: ['organiser'], message: 'Name the organiser.' });
      if (!d.externalUrl) ctx.addIssue({ code: 'custom', path: ['externalUrl'], message: 'Add the link to the official site.' });
      else if (!isHttpsUrl(d.externalUrl)) ctx.addIssue({ code: 'custom', path: ['externalUrl'], message: 'Use a full https:// link to the official site.' });
    } else if (d.description.length < 30) {
      ctx.addIssue({ code: 'custom', path: ['description'], message: 'Describe the opportunity (30+ characters).' });
    }
    if (d.deadline <= new Date()) ctx.addIssue({ code: 'custom', path: ['deadline'], message: 'The deadline must be in the future.' });
    if (d.endsAt && d.endsAt < d.deadline) ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'The event cannot end before applications close.' });
    const { minCohortYear: min, maxCohortYear: max } = d.criteria;
    if (min && max && min > max) {
      ctx.addIssue({ code: 'custom', path: ['criteria', 'maxCohortYear'], message: 'Latest cohort must be after the earliest cohort.' });
    }
  });

const APPROVED_PROJECT_STATUSES = ['approved', 'funded', 'investor_limit_reached'];

/**
 * Returns the list of unmet requirements (empty = eligible).
 * @param {object} opportunity Opportunity model
 * @param {object} project Project model
 * @param {object} graduate User model with graduateProfile
 */
function checkEligibility(opportunity, project, graduate) {
  const reasons = [];
  const c = opportunity.criteria || {};
  if (opportunity.linkOnly) reasons.push('Apply on the official site; this opportunity has no application form here.');
  if (opportunity.status !== 'published') reasons.push('This opportunity is not open for applications.');
  if (new Date(opportunity.deadline) <= new Date()) reasons.push('The application deadline has passed.');
  if (graduate.role !== 'graduate' || graduate.status !== 'active' || graduate.graduateProfile?.verificationStatus !== 'approved') {
    reasons.push('Only approved graduates can apply.');
  }
  if (project.ownerId !== graduate.id) reasons.push('You can only apply with your own project.');
  if (!APPROVED_PROJECT_STATUSES.includes(project.status)) reasons.push('The project must be approved by an administrator.');
  if (c.sectors?.length && !c.sectors.includes(project.sector)) reasons.push(`Open to these sectors only: ${c.sectors.join(', ')}.`);
  if (c.projectTypes?.length && !c.projectTypes.includes(project.type)) {
    reasons.push(c.projectTypes[0] === 'company' ? 'Open to registered companies only.' : 'Open to idea-stage projects only.');
  }
  if (c.stages?.length && !c.stages.includes(project.stage)) reasons.push(`Open to these stages only: ${c.stages.join(', ')}.`);
  const cohort = graduate.graduateProfile?.cohortYear;
  if (c.minCohortYear && (!cohort || cohort < c.minCohortYear)) reasons.push(`Open to graduates from ${c.minCohortYear} onwards.`);
  if (c.maxCohortYear && (!cohort || cohort > c.maxCohortYear)) reasons.push(`Open to graduates up to ${c.maxCohortYear}.`);
  return reasons;
}

// Stages: Open (taking applications) → Selection (applications closed, staff
// deciding who is admitted) → In progress (participants admitted, event
// running) → Completed (marked by staff after the event; results recorded).
const STAGE_LABEL = { open: 'Open', selection: 'Selection', in_progress: 'In progress', completed: 'Completed' };

/** Applications have closed: the administrator closed it, or the deadline passed. */
const applicationsClosed = (o, now = new Date()) => o.status === 'closed' || new Date(o.deadline) <= now;

/** Staff may mark it Completed once applications closed and the event end date (if set) has passed. */
function canComplete(o, now = new Date()) {
  if (o.completedAt || !['published', 'closed'].includes(o.status)) return false;
  return applicationsClosed(o, now) && (!o.endsAt || new Date(o.endsAt) <= now);
}

function stageOf(o, selectedCount = 0, now = new Date()) {
  if (o.completedAt) return 'completed';
  if (!['published', 'closed'].includes(o.status)) return null;
  if (!applicationsClosed(o, now)) return 'open';
  return selectedCount > 0 ? 'in_progress' : 'selection';
}

function serializeOpportunity(o, extra = {}) {
  return {
    id: o.id,
    title: o.title,
    type: o.type,
    organiser: o.organiser,
    description: o.description,
    applicationInstructions: o.applicationInstructions,
    prize: o.prize,
    criteria: o.criteria || {},
    linkOnly: Boolean(o.linkOnly),
    externalUrl: o.linkOnly ? o.externalUrl : null,
    deadline: o.deadline,
    endsAt: o.endsAt || null,
    completedAt: o.completedAt || null,
    canComplete: canComplete(o),
    status: o.status,
    statusBeforeArchive: o.statusBeforeArchive || null,
    publishedAt: o.publishedAt,
    createdAt: o.createdAt,
    createdBy: o.creator ? { id: o.creator.id, name: o.creator.fullName, role: o.creator.role } : undefined,
    ...extra,
  };
}

module.exports = { isHttpsUrl, opportunitySchema, checkEligibility, serializeOpportunity, stageOf, canComplete, STAGE_LABEL, APPROVED_PROJECT_STATUSES };
