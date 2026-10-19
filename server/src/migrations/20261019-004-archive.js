// Archive and unarchive for accounts, opportunities and outbox emails.
// - users: an "archived" status, with the status to restore on unarchive.
// - opportunities: the status to restore on unarchive ("archived" already exists).
// - notifications: archived_at, so archiving an email does not lose its delivery status.
//
// Safe on a live database: additive only (a new ENUM value and nullable
// columns), every step checks the schema first so a re-run after a partial
// failure is harmless, and existing rows need no backfill: NULL means "active,
// never archived".
const { DataTypes } = require('sequelize');
const { addColumnIfMissing, removeColumnIfPresent, addIndexIfMissing, removeIndexIfPresent, enumValues } = require('../db/schemaHelpers');

const USER_STATUSES = ['pending_email', 'pending_review', 'active', 'rejected', 'suspended'];

module.exports = {
  USER_STATUSES,

  async up({ context: qi }) {
    // Appending a value to the end of an ENUM keeps every existing row as it is.
    if (!(await enumValues(qi, 'users', 'status')).includes('archived')) {
      await qi.changeColumn('users', 'status', {
        type: DataTypes.ENUM(...USER_STATUSES, 'archived'),
        allowNull: false,
        defaultValue: 'pending_email',
      });
    }
    await addColumnIfMissing(qi, 'users', 'status_before_archive', { type: DataTypes.ENUM(...USER_STATUSES), allowNull: true, after: 'status' });
    await addColumnIfMissing(qi, 'opportunities', 'status_before_archive', {
      type: DataTypes.ENUM('pending_review', 'published', 'closed'),
      allowNull: true,
      after: 'status',
    });
    await addColumnIfMissing(qi, 'notifications', 'archived_at', { type: DataTypes.DATE, allowNull: true, after: 'read_at' });
    await addIndexIfMissing(qi, 'notifications', 'archived_at');
  },

  async down({ context: qi }) {
    await removeIndexIfPresent(qi, 'notifications', 'archived_at');
    await removeColumnIfPresent(qi, 'notifications', 'archived_at');
    await removeColumnIfPresent(qi, 'opportunities', 'status_before_archive');
    if ((await enumValues(qi, 'users', 'status')).includes('archived')) {
      // Archived accounts return to their previous status before the value is removed.
      await qi.sequelize.query("UPDATE users SET status = COALESCE(status_before_archive, 'pending_review') WHERE status = 'archived'");
    }
    await removeColumnIfPresent(qi, 'users', 'status_before_archive');
    await qi.changeColumn('users', 'status', { type: DataTypes.ENUM(...USER_STATUSES), allowNull: false, defaultValue: 'pending_email' });
  },
};
