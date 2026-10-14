// Graduate side of opportunities (FR08): browse open opportunities and apply
// with an approved project. The server enforces every eligibility rule and
// one application per project per opportunity.
const express = require('express');
const { Op } = require('sequelize');
const { z } = require('zod');
const { sequelize, Opportunity, Application, Project } = require('../models');
const { requireRole, requireApprovedGraduate } = require('../middleware/auth');
const { HttpError, conflict, notFound } = require('../middleware/errors');
const { checkEligibility, serializeOpportunity } = require('../services/opportunities');
const audit = require('../services/audit');

const router = express.Router();

const serializeApplication = (a) => ({
  id: a.id,
  status: a.status,
  motivation: a.motivation,
  decisionNote: ['selected', 'not_selected', 'shortlisted'].includes(a.status) ? a.decisionNote : null,
  submittedAt: a.submittedAt,
  decidedAt: a.decidedAt,
  opportunity: a.opportunity ? { id: a.opportunity.id, title: a.opportunity.title, type: a.opportunity.type, deadline: a.opportunity.deadline } : undefined,
  project: a.project ? { id: a.project.id, title: a.project.title, projectCode: a.project.projectCode } : undefined,
});

router.get('/', requireRole('graduate'), async (req, res) => {
  const [opportunities, projects, applications] = await Promise.all([
    Opportunity.findAll({ where: { status: 'published', deadline: { [Op.gt]: new Date() } }, order: [['deadline', 'ASC']] }),
    Project.findAll({ where: { ownerId: req.user.id } }),
    Application.findAll({ where: { applicantId: req.user.id } }),
  ]);
  res.json({
    opportunities: opportunities.map((o) =>
      serializeOpportunity(o, {
        // Per project: can it apply, and if not, why (shown before applying).
        projects: projects.map((p) => {
          const existing = applications.find((a) => a.opportunityId === o.id && a.projectId === p.id);
          return {
            id: p.id,
            title: p.title,
            projectCode: p.projectCode,
            applied: existing ? existing.status : null,
            issues: existing ? [] : checkEligibility(o, p, req.user),
          };
        }),
      })
    ),
  });
});

router.get('/applications', requireRole('graduate'), async (req, res) => {
  const rows = await Application.findAll({
    where: { applicantId: req.user.id },
    include: [
      { model: Opportunity, as: 'opportunity' },
      { model: Project, as: 'project' },
    ],
    order: [['submittedAt', 'DESC']],
  });
  res.json({ applications: rows.map(serializeApplication) });
});

router.post('/:id/apply', requireApprovedGraduate, async (req, res) => {
  const data = z
    .object({
      projectId: z.coerce.number().int().positive({ message: 'Choose a project.' }),
      motivation: z.string().trim().min(20, 'Tell the ALU team why this project fits (20+ characters).').max(3000),
    })
    .parse(req.body || {});
  const opportunity = await Opportunity.findByPk(req.params.id);
  if (!opportunity || opportunity.status === 'pending_review' || opportunity.status === 'archived') throw notFound('Opportunity not found.');
  const project = await Project.findOne({ where: { id: data.projectId, ownerId: req.user.id } });
  if (!project) throw notFound('Project not found.');

  const issues = checkEligibility(opportunity, project, req.user);
  if (issues.length) {
    throw new HttpError(400, 'This project is not eligible for this opportunity.', { code: 'NOT_ELIGIBLE', issues });
  }
  const existing = await Application.findOne({ where: { projectId: project.id, opportunityId: opportunity.id } });
  if (existing) throw conflict('This project has already applied to this opportunity.');

  const application = await sequelize.transaction(async (transaction) => {
    const created = await Application.create(
      { projectId: project.id, opportunityId: opportunity.id, applicantId: req.user.id, motivation: data.motivation, submittedAt: new Date() },
      { transaction }
    );
    await audit.record(
      { actorId: req.user.id, action: 'application.submitted', entityType: 'application', entityId: created.id, metadata: { opportunityId: opportunity.id, projectId: project.id } },
      { transaction }
    );
    return created;
  });
  res.status(201).json({ application: serializeApplication(application) });
});

module.exports = router;
