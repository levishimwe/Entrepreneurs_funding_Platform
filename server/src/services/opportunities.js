// Opportunity validation, serialisation and the server-side eligibility check
// (FR08): approved graduate, approved project and the published criteria.
const { z } = require('zod');

const optionalList = z.array(z.string().trim().min(1).max(80)).max(20).default([]);

const opportunitySchema = z
  .object({
    title: z.string().trim().min(5, 'Use at least 5 characters.').max(200),
    type: z.enum(['hackathon', 'grant', 'competition', 'other'], { message: 'Choose a type.' }),
    organiser: z.string().trim().max(150).optional().or(z.literal('')).transform((v) => v || null),
    description: z.string().trim().min(30, 'Describe the opportunity (30+ characters).').max(6000),
    applicationInstructions: z.string().trim().max(4000).optional().or(z.literal('')).transform((v) => v || null),
    prize: z.string().trim().max(150).optional().or(z.literal('')).transform((v) => v || null),
    deadline: z.coerce.date({ message: 'Choose a valid deadline.' }),
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
    if (d.deadline <= new Date()) ctx.addIssue({ code: 'custom', path: ['deadline'], message: 'The deadline must be in the future.' });
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
    deadline: o.deadline,
    status: o.status,
    publishedAt: o.publishedAt,
    createdAt: o.createdAt,
    createdBy: o.creator ? { id: o.creator.id, name: o.creator.fullName, role: o.creator.role } : undefined,
    ...extra,
  };
}

module.exports = { opportunitySchema, checkEligibility, serializeOpportunity, APPROVED_PROJECT_STATUSES };
