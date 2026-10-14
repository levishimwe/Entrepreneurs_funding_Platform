const { AuditLog } = require('../models');

// Timestamped action log with actor and reason (FR10).
async function record({ actorId = null, action, entityType, entityId = null, reason = null, metadata = null }, options = {}) {
  return AuditLog.create({ actorId, action, entityType, entityId, reason, metadata }, options);
}

module.exports = { record };
