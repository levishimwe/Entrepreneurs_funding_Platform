// Bulk messages (sent-messages log), seeking-investor posts, investor funding
// calls, staff announcements and the opportunity "Number of places".
//
// Additive and idempotent: four new tables and new NULLABLE columns without
// defaults, so no existing row gets a new value (NULL means "as before": a
// plain post, no batch, no capacity limit). Every step checks the schema first
// and can safely run again after a half-applied run.
const { DataTypes } = require('sequelize');
const { addColumnIfMissing, removeColumnIfPresent, addIndexIfMissing, createTableIfMissing, dropTableIfPresent } = require('../db/schemaHelpers');

const fk = (table, allowNull = false) => ({
  type: DataTypes.BIGINT.UNSIGNED,
  allowNull,
  references: { model: table, key: 'id' },
  onUpdate: 'CASCADE',
  onDelete: allowNull ? 'SET NULL' : 'CASCADE',
});
const timestamps = () => ({
  created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
});

module.exports = {
  async up({ context: qi }) {
    // Phase 1: one row per bulk send; its status is computed from its notifications.
    await createTableIfMissing(qi, 'bulk_messages', {
      id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
      sender_id: fk('users', true),
      subject: { type: DataTypes.STRING(200), allowNull: false },
      body: { type: DataTypes.TEXT, allowNull: false },
      audience: { type: DataTypes.ENUM('graduates', 'investors', 'selected'), allowNull: false },
      recipient_count: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
      ...timestamps(),
    });
    await addColumnIfMissing(qi, 'notifications', 'batch_id', fk('bulk_messages', true));
    await addIndexIfMissing(qi, 'notifications', 'batch_id');

    // Phase 2a: NULL kind = a plain update (every existing post).
    await addColumnIfMissing(qi, 'graduate_posts', 'kind', { type: DataTypes.ENUM('update', 'seeking_investor'), allowNull: true });
    await addColumnIfMissing(qi, 'graduate_posts', 'project_id', fk('projects', true));
    await addIndexIfMissing(qi, 'graduate_posts', 'project_id');

    // Phase 2b: investor funding calls reviewed by staff.
    await createTableIfMissing(qi, 'funding_calls', {
      id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
      investor_id: fk('users'),
      sector: { type: DataTypes.STRING(80), allowNull: false },
      amount: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
      currency: { type: DataTypes.STRING(3), allowNull: false },
      deadline: { type: DataTypes.DATEONLY, allowNull: true },
      message: { type: DataTypes.TEXT, allowNull: false },
      status: { type: DataTypes.ENUM('pending', 'accepted', 'rejected'), allowNull: false, defaultValue: 'pending' },
      decided_by: fk('users', true),
      decided_at: { type: DataTypes.DATE, allowNull: true },
      decision_reason: { type: DataTypes.TEXT, allowNull: true },
      opportunity_id: fk('opportunities', true),
      ...timestamps(),
    });
    await addIndexIfMissing(qi, 'funding_calls', 'investor_id');
    await addIndexIfMissing(qi, 'funding_calls', 'status');

    // Phase 2c: announcements; removal is a soft status.
    await createTableIfMissing(qi, 'announcements', {
      id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
      author_id: fk('users', true),
      title: { type: DataTypes.STRING(200), allowNull: false },
      body: { type: DataTypes.TEXT, allowNull: false },
      visibility: { type: DataTypes.ENUM('public', 'private'), allowNull: false },
      status: { type: DataTypes.ENUM('published', 'unpublished', 'removed'), allowNull: false, defaultValue: 'published' },
      message_id: fk('bulk_messages', true),
      published_at: { type: DataTypes.DATE, allowNull: true },
      ...timestamps(),
    });
    await addIndexIfMissing(qi, 'announcements', 'visibility');

    // Phase 3: NULL = no limit (every existing opportunity).
    await addColumnIfMissing(qi, 'opportunities', 'capacity', { type: DataTypes.INTEGER.UNSIGNED, allowNull: true });
  },

  async down({ context: qi }) {
    await removeColumnIfPresent(qi, 'opportunities', 'capacity');
    await dropTableIfPresent(qi, 'announcements');
    await dropTableIfPresent(qi, 'funding_calls');
    await removeColumnIfPresent(qi, 'graduate_posts', 'project_id');
    await removeColumnIfPresent(qi, 'graduate_posts', 'kind');
    await removeColumnIfPresent(qi, 'notifications', 'batch_id');
    await dropTableIfPresent(qi, 'bulk_messages');
  },
};
