// Investment outcomes and the two-investor limit (FR07, FR13).
//
// An introduction is not funding. Each party confirms an investment on an
// accepted introduction; the administrator then records the outcome. Only a
// recorded outcome counts. When recorded outcomes come from two distinct
// investors, the project leaves active discovery as "Investor Limit Reached".
const { Op } = require('sequelize');
const { sequelize, Introduction, Project } = require('../models');
const audit = require('./audit');

const INVESTOR_LIMIT = 2;

const recordedWhere = (projectId) => ({ projectId, investmentRecordedAt: { [Op.ne]: null } });

// Distinct investors with a recorded (confirmed) investment outcome.
function confirmedInvestorCount(projectId, transaction) {
  return Introduction.count({ where: recordedWhere(projectId), distinct: true, col: 'investor_id', transaction });
}

/**
 * Records a confirmed investment outcome. Runs in one transaction with the
 * project row locked, so two concurrent recordings cannot both see "one
 * investor" and skip the limit.
 */
async function recordInvestment({ introductionId, adminId }) {
  return sequelize.transaction(async (transaction) => {
    const introduction = await Introduction.findByPk(introductionId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!introduction) return { error: 'not_found' };
    const project = await Project.findByPk(introduction.projectId, { transaction, lock: transaction.LOCK.UPDATE });
    if (introduction.status !== 'accepted') return { error: 'The introduction has not been accepted by the graduate.' };
    if (!introduction.investmentInvestorConfirmed || !introduction.investmentGraduateConfirmed) {
      return { error: 'Both the graduate and the investor must confirm the investment before it is recorded.' };
    }
    if (introduction.investmentRecordedAt) return { error: 'This investment has already been recorded.' };
    if (!['approved', 'investor_limit_reached', 'funded'].includes(project.status)) {
      return { error: `Investments cannot be recorded while the project is ${project.status.replace(/_/g, ' ')}.` };
    }

    await introduction.update({ investmentRecordedAt: new Date(), investmentRecordedBy: adminId }, { transaction });
    const investors = await confirmedInvestorCount(project.id, transaction);
    await audit.record(
      {
        actorId: adminId,
        action: 'introduction.investment_recorded',
        entityType: 'project',
        entityId: project.id,
        metadata: { introductionId: introduction.id, investorId: introduction.investorId, confirmedInvestors: investors },
      },
      { transaction }
    );

    let statusChanged = false;
    if (investors >= INVESTOR_LIMIT && project.status === 'approved') {
      await project.update({ status: 'investor_limit_reached', closedAt: new Date() }, { transaction });
      await audit.record(
        {
          actorId: adminId,
          action: 'project.investor_limit_reached',
          entityType: 'project',
          entityId: project.id,
          reason: `Confirmed investment recorded from ${investors} distinct investors`,
        },
        { transaction }
      );
      statusChanged = true;
    }
    return { introduction, project, investors, statusChanged };
  });
}

module.exports = { INVESTOR_LIMIT, confirmedInvestorCount, recordInvestment };
