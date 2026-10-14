// Records administrative and staff decisions with actor, timestamp and reason
// (FR10). A REVIEWS row targets exactly one user, project or document (the DB
// CHECK constraint enforces this); the audit log gets a matching entry.
const { Review } = require('../models');
const audit = require('./audit');
const { confirmedInvestorCount } = require('./funding');

async function recordDecision({ reviewerId, decision, reason = null, target, action, metadata = null }, transaction) {
  const targetKey = { user: 'subjectUserId', project: 'projectId', document: 'documentId' }[target.type];
  if (!targetKey) throw new Error(`Unknown review target ${target.type}`);
  await Review.create({ reviewerId, decision, reason, [targetKey]: target.id }, { transaction });
  await audit.record(
    { actorId: reviewerId, action, entityType: target.type, entityId: target.id, reason, metadata },
    { transaction }
  );
}

module.exports = { recordDecision, confirmedInvestorCount };
