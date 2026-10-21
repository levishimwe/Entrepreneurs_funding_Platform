// Competition results: shared serialisation and rules.
const RESULT_TYPES = ['hackathon', 'competition'];
const OUTCOME_LABEL = { won: 'Won', participated: 'Participated', not_placed: 'Not placed' };

function serializeResult(r, { forAdmin = false } = {}) {
  return {
    id: r.id,
    applicationId: r.applicationId,
    opportunityId: r.opportunityId,
    projectId: r.projectId,
    outcome: r.outcome,
    outcomeLabel: OUTCOME_LABEL[r.outcome],
    awardTitle: r.awardTitle,
    amount: r.amount === null || r.amount === undefined ? null : Number(r.amount),
    currency: r.currency,
    resultDate: r.resultDate,
    notes: r.notes,
    status: r.status,
    hasProof: Boolean(r.proofKey),
    decisionReason: r.decisionReason,
    decidedAt: r.decidedAt,
    createdAt: r.createdAt,
    ...(r.opportunity ? { opportunity: { id: r.opportunity.id, title: r.opportunity.title, type: r.opportunity.type } } : {}),
    ...(r.project ? { project: { id: r.project.id, title: r.project.title, projectCode: r.project.projectCode, status: r.project.status, fundingSource: r.project.fundingSource } } : {}),
    ...(forAdmin
      ? {
          graduate: r.graduate ? { id: r.graduate.id, name: r.graduate.fullName, email: r.graduate.email } : null,
          submittedBy: r.submitter ? { id: r.submitter.id, name: r.submitter.fullName } : null,
          decidedBy: r.decider ? { id: r.decider.id, name: r.decider.fullName } : null,
          proof: r.proofKey ? { name: r.proofName, mimeType: r.proofMime } : null,
        }
      : {}),
  };
}

module.exports = { RESULT_TYPES, OUTCOME_LABEL, serializeResult };
