// The administrator dashboard totals required by FR11, computed live.
const { Op, fn, col } = require('sequelize');
const { User, GraduateProfile, Project, Opportunity, Introduction, Document } = require('../models');

async function projectsWithOneConfirmedInvestor() {
  const rows = await Introduction.findAll({
    attributes: ['projectId', [fn('COUNT', fn('DISTINCT', col('investor_id'))), 'investors']],
    where: { investmentRecordedAt: { [Op.ne]: null } },
    include: [{ model: Project, as: 'project', attributes: [], where: { status: 'approved' } }],
    group: ['projectId'],
    raw: true,
  });
  return rows.filter((r) => Number(r.investors) === 1).length;
}

async function getDashboardStats() {
  const count = (model, where) => model.count({ where });
  const [
    registeredGraduates,
    approvedGraduates,
    pendingGraduates,
    investors,
    approvedInvestors,
    opportunities,
    openOpportunities,
    submittedProjects,
    approvedProjects,
    activeSeeking,
    similarityFlagged,
    fullyFunded,
    oneInvestor,
    investorLimit,
    introductions,
    acceptedIntroductions,
    rdbProcessed,
    rdbLikelyValid,
    pendingProjects,
  ] = await Promise.all([
    count(User, { role: 'graduate', status: { [Op.ne]: 'pending_email' } }),
    count(GraduateProfile, { verificationStatus: 'approved' }),
    count(User, { role: 'graduate', status: 'pending_review' }),
    count(User, { role: 'investor', status: { [Op.ne]: 'pending_email' } }),
    count(User, { role: 'investor', status: 'active' }),
    count(Opportunity, { status: { [Op.ne]: 'archived' } }),
    count(Opportunity, { status: 'published', deadline: { [Op.gt]: new Date() } }),
    count(Project, { submittedAt: { [Op.ne]: null } }),
    count(Project, { status: { [Op.in]: ['approved', 'funded', 'investor_limit_reached'] } }),
    count(Project, { status: 'approved' }),
    count(Project, { status: 'similarity_flagged' }),
    count(Project, { status: 'funded' }),
    projectsWithOneConfirmedInvestor(),
    count(Project, { status: 'investor_limit_reached' }),
    count(Introduction),
    count(Introduction, { status: 'accepted' }),
    count(Document, { kind: 'rdb_certificate', status: { [Op.in]: ['processed', 'failed'] } }),
    count(Document, { kind: 'rdb_certificate', flag: 'likely_valid' }),
    count(Project, { status: 'pending_review' }),
  ]);

  const rdbRate = rdbProcessed ? Math.round((rdbLikelyValid / rdbProcessed) * 100) : null;
  return {
    cards: [
      { key: 'graduates', label: 'Registered graduates', value: registeredGraduates, hint: `${approvedGraduates} approved · ${pendingGraduates} pending` },
      { key: 'investors', label: 'Investors & sponsors', value: investors, hint: `${approvedInvestors} approved` },
      { key: 'opportunities', label: 'Hackathons & opportunities', value: opportunities, hint: `${openOpportunities} open now` },
      { key: 'submitted', label: 'Submitted projects', value: submittedProjects, hint: `${pendingProjects} pending review` },
      { key: 'approved', label: 'Approved projects', value: approvedProjects, tone: 'green' },
      { key: 'seeking', label: 'Active, seeking investment', value: activeSeeking, tone: 'blue' },
      { key: 'similarity', label: 'Similarity Flagged', value: similarityFlagged, tone: 'purple' },
      { key: 'funded', label: 'Fully funded', value: fullyFunded, tone: 'green' },
      { key: 'oneInvestor', label: 'One confirmed investor', value: oneInvestor },
      { key: 'limit', label: 'Two-investor limit reached', value: investorLimit },
      { key: 'introductions', label: 'Investor introductions', value: introductions, hint: `${acceptedIntroductions} accepted` },
      {
        key: 'rdbRate',
        label: 'RDB verification rate',
        value: rdbRate === null ? '—' : `${rdbRate}%`,
        hint: `${rdbLikelyValid} of ${rdbProcessed} certificates passed all automated checks`,
        tone: 'green',
      },
    ],
    queues: { pendingGraduates, pendingInvestors: await count(User, { role: 'investor', status: 'pending_review' }), pendingProjects, similarityFlagged },
  };
}

module.exports = { getDashboardStats };
