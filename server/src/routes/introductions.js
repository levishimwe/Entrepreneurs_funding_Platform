// The graduate's side of introductions (FR07): accept or decline requests on
// their own projects, and confirm follow-up meetings and investments.
const express = require('express');
const { sequelize, Introduction, Project, User, InvestorProfile } = require('../models');
const { requireRole } = require('../middleware/auth');
const { badRequest, notFound } = require('../middleware/errors');
const { forGraduate, introductionEmails, declinedEmail } = require('../services/introductions');
const audit = require('../services/audit');

const router = express.Router();
router.use(requireRole('graduate'));

const INCLUDE = [
  { model: Project, as: 'project', attributes: ['id', 'title', 'projectCode', 'status', 'ownerId'] },
  { model: User, as: 'investor', attributes: ['id', 'fullName', 'email', 'phone'], include: [{ model: InvestorProfile, as: 'investorProfile' }] },
];

async function loadOwn(req) {
  const introduction = await Introduction.findByPk(req.params.id, { include: INCLUDE });
  if (!introduction || introduction.project.ownerId !== req.user.id) throw notFound('Introduction not found.');
  return introduction;
}

router.get('/', async (req, res) => {
  const projects = await Project.findAll({ where: { ownerId: req.user.id }, attributes: ['id'] });
  const rows = projects.length
    ? await Introduction.findAll({ where: { projectId: projects.map((p) => p.id) }, include: INCLUDE, order: [['createdAt', 'DESC']] })
    : [];
  res.json({ introductions: rows.map(forGraduate) });
});

router.post('/:id/accept', async (req, res) => {
  const introduction = await loadOwn(req);
  if (introduction.status !== 'requested') throw badRequest(`This introduction was already ${introduction.status}.`);
  await sequelize.transaction(async (transaction) => {
    await introduction.update({ status: 'accepted', acceptedAt: new Date() }, { transaction });
    await audit.record(
      { actorId: req.user.id, action: 'introduction.accepted', entityType: 'project', entityId: introduction.projectId, metadata: { introductionId: introduction.id } },
      { transaction }
    );
  });
  // Contact details are exchanged only now, by one email to each party.
  await introductionEmails({ introduction, project: introduction.project, graduate: req.user, investor: introduction.investor });
  res.json({ introduction: forGraduate(introduction) });
});

router.post('/:id/decline', async (req, res) => {
  const introduction = await loadOwn(req);
  if (introduction.status !== 'requested') throw badRequest(`This introduction was already ${introduction.status}.`);
  await introduction.update({ status: 'declined', declinedAt: new Date() });
  await audit.record({ actorId: req.user.id, action: 'introduction.declined', entityType: 'project', entityId: introduction.projectId, metadata: { introductionId: introduction.id } });
  await declinedEmail({ introduction, project: introduction.project, investor: introduction.investor });
  res.json({ introduction: forGraduate(introduction) });
});

router.post('/:id/:confirmation', async (req, res) => {
  const field = { 'confirm-meeting': 'graduateConfirmed', 'confirm-investment': 'investmentGraduateConfirmed' }[req.params.confirmation];
  if (!field) throw notFound('Unknown action.');
  const introduction = await loadOwn(req);
  if (introduction.status !== 'accepted') throw badRequest('Only accepted introductions can be confirmed.');
  if (field === 'investmentGraduateConfirmed' && !introduction.graduateConfirmed) {
    throw badRequest('Confirm the follow-up meeting before confirming an investment.');
  }
  await introduction.update({ [field]: true });
  await audit.record({
    actorId: req.user.id,
    action: field === 'graduateConfirmed' ? 'introduction.meeting_confirmed' : 'introduction.investment_confirmed',
    entityType: 'project',
    entityId: introduction.projectId,
    metadata: { introductionId: introduction.id, by: 'graduate' },
  });
  res.json({ introduction: forGraduate(introduction) });
});

module.exports = router;
