// Contact requests (two-way threads), success stories on the home page, and
// competition results with administrator approval.
//
// Additive and idempotent: new tables are created only if missing, new
// project columns are nullable or default to "off", so existing rows keep
// working and nothing becomes public without an administrator ticking it.
const { DataTypes } = require('sequelize');
const { addColumnIfMissing, removeColumnIfPresent, addIndexIfMissing, createTableIfMissing, dropTableIfPresent } = require('../db/schemaHelpers');

const fk = (table, allowNull = false) => ({
  type: DataTypes.BIGINT.UNSIGNED,
  allowNull,
  references: { model: table, key: 'id' },
  onUpdate: 'CASCADE',
  onDelete: 'RESTRICT',
});
const timestamps = () => ({
  created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
});

const CATEGORIES = ['profile', 'project', 'account', 'opportunity', 'introduction', 'other'];

module.exports = {
  CATEGORIES,

  async up({ context: qi }) {
    // 1. Contact / request help
    await createTableIfMissing(qi, 'support_threads', {
      id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
      user_id: fk('users'),
      category: { type: DataTypes.ENUM(...CATEGORIES), allowNull: false },
      subject: { type: DataTypes.STRING(200), allowNull: false },
      status: { type: DataTypes.ENUM('open', 'in_progress', 'resolved'), allowNull: false, defaultValue: 'open' },
      started_by: { type: DataTypes.ENUM('user', 'admin'), allowNull: false, defaultValue: 'user' },
      // Profile name change: the name the user asked for, and when it was applied.
      requested_name: { type: DataTypes.STRING(150), allowNull: true },
      name_applied_at: { type: DataTypes.DATE, allowNull: true },
      last_message_at: { type: DataTypes.DATE, allowNull: true },
      archived_at: { type: DataTypes.DATE, allowNull: true },
      ...timestamps(),
    });
    await addIndexIfMissing(qi, 'support_threads', 'status');
    await createTableIfMissing(qi, 'support_messages', {
      id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
      thread_id: fk('support_threads'),
      author_id: fk('users'),
      author_role: { type: DataTypes.ENUM('user', 'admin'), allowNull: false },
      body: { type: DataTypes.TEXT, allowNull: false },
      // Optional screenshot, private storage.
      attachment_key: { type: DataTypes.STRING(255), allowNull: true },
      attachment_mime: { type: DataTypes.STRING(60), allowNull: true },
      attachment_name: { type: DataTypes.STRING(255), allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    });

    // 2. Funding details and home-page consent on projects
    await addColumnIfMissing(qi, 'projects', 'funding_source', { type: DataTypes.ENUM('investor', 'competition'), allowNull: true, after: 'closed_at' });
    await addColumnIfMissing(qi, 'projects', 'funding_name', { type: DataTypes.STRING(200), allowNull: true, after: 'funding_source' });
    await addColumnIfMissing(qi, 'projects', 'funding_amount', { type: DataTypes.DECIMAL(14, 2), allowNull: true, after: 'funding_name' });
    await addColumnIfMissing(qi, 'projects', 'funding_currency', { type: DataTypes.STRING(3), allowNull: true, after: 'funding_amount' });
    await addColumnIfMissing(qi, 'projects', 'show_on_home', { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, after: 'funding_currency' });
    await addColumnIfMissing(qi, 'projects', 'show_amount', { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, after: 'show_on_home' });

    // 3. Competition results, approved by the administrator
    await createTableIfMissing(qi, 'competition_results', {
      id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
      application_id: fk('applications'),
      opportunity_id: fk('opportunities'),
      project_id: fk('projects'),
      graduate_id: fk('users'),
      submitted_by: fk('users'),
      outcome: { type: DataTypes.ENUM('won', 'participated', 'not_placed'), allowNull: false },
      award_title: { type: DataTypes.STRING(200), allowNull: true },
      amount: { type: DataTypes.DECIMAL(14, 2), allowNull: true },
      currency: { type: DataTypes.STRING(3), allowNull: true },
      result_date: { type: DataTypes.DATEONLY, allowNull: true },
      notes: { type: DataTypes.TEXT, allowNull: true },
      proof_key: { type: DataTypes.STRING(255), allowNull: true },
      proof_mime: { type: DataTypes.STRING(60), allowNull: true },
      proof_name: { type: DataTypes.STRING(255), allowNull: true },
      status: { type: DataTypes.ENUM('pending', 'approved', 'rejected'), allowNull: false, defaultValue: 'pending' },
      decided_by: fk('users', true),
      decided_at: { type: DataTypes.DATE, allowNull: true },
      decision_reason: { type: DataTypes.TEXT, allowNull: true },
      ...timestamps(),
    });
    await addIndexIfMissing(qi, 'competition_results', 'status');
  },

  async down({ context: qi }) {
    await dropTableIfPresent(qi, 'competition_results');
    for (const column of ['show_amount', 'show_on_home', 'funding_currency', 'funding_amount', 'funding_name', 'funding_source']) {
      await removeColumnIfPresent(qi, 'projects', column);
    }
    await dropTableIfPresent(qi, 'support_messages');
    await dropTableIfPresent(qi, 'support_threads');
  },
};
