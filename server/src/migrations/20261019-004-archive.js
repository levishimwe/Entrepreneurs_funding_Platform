// Archive and unarchive for accounts, opportunities and outbox emails.
// - users: an "archived" status, with the status to restore on unarchive.
// - opportunities: the status to restore on unarchive ("archived" already exists).
// - notifications: archived_at, so archiving an email does not lose its delivery status.
const { DataTypes } = require('sequelize');

const USER_STATUSES = ['pending_email', 'pending_review', 'active', 'rejected', 'suspended'];

module.exports = {
  USER_STATUSES,

  async up({ context: qi }) {
    await qi.changeColumn('users', 'status', {
      type: DataTypes.ENUM(...USER_STATUSES, 'archived'),
      allowNull: false,
      defaultValue: 'pending_email',
    });
    await qi.addColumn('users', 'status_before_archive', { type: DataTypes.ENUM(...USER_STATUSES), allowNull: true, after: 'status' });
    await qi.addColumn('opportunities', 'status_before_archive', {
      type: DataTypes.ENUM('pending_review', 'published', 'closed'),
      allowNull: true,
      after: 'status',
    });
    await qi.addColumn('notifications', 'archived_at', { type: DataTypes.DATE, allowNull: true, after: 'read_at' });
    await qi.addIndex('notifications', ['archived_at']);
  },

  async down({ context: qi }) {
    await qi.removeIndex('notifications', ['archived_at']);
    await qi.removeColumn('notifications', 'archived_at');
    await qi.removeColumn('opportunities', 'status_before_archive');
    // Archived accounts return to their previous status before the value is removed.
    await qi.sequelize.query("UPDATE users SET status = COALESCE(status_before_archive, 'pending_review') WHERE status = 'archived'");
    await qi.removeColumn('users', 'status_before_archive');
    await qi.changeColumn('users', 'status', { type: DataTypes.ENUM(...USER_STATUSES), allowNull: false, defaultValue: 'pending_email' });
  },
};
