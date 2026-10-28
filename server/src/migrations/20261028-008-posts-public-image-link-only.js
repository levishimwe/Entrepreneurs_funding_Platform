// Graduate public image and consent, graduate posts with reports, and
// link-only opportunities.
//
// Additive and idempotent: new nullable or defaulted columns (consent and
// link-only default to false, so nothing becomes visible or changes behaviour
// until someone opts in) and two new tables.
const { DataTypes } = require('sequelize');
const { addColumnIfMissing, removeColumnIfPresent, addIndexIfMissing, createTableIfMissing, dropTableIfPresent } = require('../db/schemaHelpers');

const fk = (table, allowNull = false) => ({
  type: DataTypes.BIGINT.UNSIGNED,
  allowNull,
  references: { model: table, key: 'id' },
  onUpdate: 'CASCADE',
  onDelete: allowNull ? 'SET NULL' : 'CASCADE',
});

module.exports = {
  async up({ context: qi }) {
    // A separate image for investors and sponsors, shown only with consent.
    await addColumnIfMissing(qi, 'graduate_profiles', 'public_image_key', { type: DataTypes.STRING(255), allowNull: true });
    await addColumnIfMissing(qi, 'graduate_profiles', 'public_profile_consent', { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false });

    await addColumnIfMissing(qi, 'opportunities', 'link_only', { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false });
    await addColumnIfMissing(qi, 'opportunities', 'external_url', { type: DataTypes.STRING(500), allowNull: true });

    await createTableIfMissing(qi, 'graduate_posts', {
      id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
      graduate_id: fk('users'),
      body: { type: DataTypes.TEXT, allowNull: false },
      image_key: { type: DataTypes.STRING(255), allowNull: true },
      edited_at: { type: DataTypes.DATE, allowNull: true },
      removed_at: { type: DataTypes.DATE, allowNull: true },
      removed_by: fk('users', true),
      removed_reason: { type: DataTypes.TEXT, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    });
    await addIndexIfMissing(qi, 'graduate_posts', 'graduate_id');
    await addIndexIfMissing(qi, 'graduate_posts', 'created_at');

    await createTableIfMissing(qi, 'post_reports', {
      id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
      post_id: fk('graduate_posts'),
      reporter_id: fk('users'),
      reason: { type: DataTypes.TEXT, allowNull: true },
      resolved_at: { type: DataTypes.DATE, allowNull: true },
      resolved_by: fk('users', true),
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    });
    await addIndexIfMissing(qi, 'post_reports', 'post_id');
  },

  async down({ context: qi }) {
    await dropTableIfPresent(qi, 'post_reports');
    await dropTableIfPresent(qi, 'graduate_posts');
    await removeColumnIfPresent(qi, 'opportunities', 'external_url');
    await removeColumnIfPresent(qi, 'opportunities', 'link_only');
    await removeColumnIfPresent(qi, 'graduate_profiles', 'public_profile_consent');
    await removeColumnIfPresent(qi, 'graduate_profiles', 'public_image_key');
  },
};
