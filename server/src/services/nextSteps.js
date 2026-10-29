// The graduate's next steps (Activity page and activity summary).
const { Op } = require('sequelize');
const { Project, Document } = require('../models');
const { isApprovedGraduate } = require('../middleware/auth');

const LIVE = ['approved', 'funded', 'investor_limit_reached'];

async function nextStepsFor(user) {
  const [degree, projects] = await Promise.all([
    Document.count({ where: { uploaderId: user.id, kind: 'degree_certificate' } }),
    Project.findAll({
      where: { ownerId: user.id, status: { [Op.ne]: 'archived' } },
      attributes: ['id', 'type', 'status', 'updatedAt'],
      include: [{ model: Document, as: 'documents', attributes: ['kind'] }],
      order: [['updatedAt', 'DESC']],
    }),
  ]);
  const approvedAccount = isApprovedGraduate(user);
  const latest = projects[0];
  const companies = projects.filter((p) => p.type === 'company');
  const live = projects.find((p) => LIVE.includes(p.status));
  const steps = [
    {
      key: 'profile',
      label: 'Complete your profile',
      detail: 'Add a profile photo and a phone number.',
      done: Boolean(user.photoKey && user.phone),
      action: { label: 'Complete your profile', to: '/app/settings' },
    },
    {
      key: 'degree',
      label: 'Degree certificate uploaded',
      detail: approvedAccount ? 'Checked by an administrator.' : 'An administrator is reviewing it.',
      done: degree > 0,
      action: { label: 'Contact the team', to: '/app/contact' },
    },
    {
      key: 'rdb',
      label: 'RDB certificate uploaded',
      detail: companies.length ? 'Needed for a registered company.' : 'Only needed for a registered company.',
      done: companies.length > 0 && companies.every((p) => p.documents.some((d) => d.kind === 'rdb_certificate')),
      notApplicable: projects.length > 0 && companies.length === 0,
      action: companies.length ? { label: 'Add the certificate', to: `/app/projects/${companies[0].id}` } : { label: 'Submit a project', to: '/app/projects/new' },
    },
    {
      key: 'submitted',
      label: 'Project submitted',
      detail: approvedAccount ? 'Submit your venture for administrator review.' : 'You can submit once your account is approved.',
      done: projects.length > 0,
      action: approvedAccount ? { label: 'Submit a project', to: '/app/projects/new' } : null,
    },
    {
      key: 'approved',
      label: 'Project approved',
      detail: 'An administrator approves it and investors can find it.',
      done: Boolean(live),
      action: latest ? { label: 'View your project', to: `/app/projects/${latest.id}` } : null,
    },
  ];
  const counted = steps.filter((s) => !s.notApplicable);
  return { steps, done: counted.filter((s) => s.done).length, total: counted.length, current: counted.find((s) => !s.done)?.key || null };
}

module.exports = { nextStepsFor };
