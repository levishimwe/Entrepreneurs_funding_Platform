// Home page: investors the administrator chose to show, and testimonies from
// graduates and investors that appear only after administrator approval.
//
// Additive and idempotent: one boolean column (off by default, so no investor
// becomes public without an administrator ticking it) and one new table.
const { DataTypes } = require('sequelize');
const { addColumnIfMissing, removeColumnIfPresent, addIndexIfMissing, createTableIfMissing, dropTableIfPresent } = require('../db/schemaHelpers');

const fk = (table, allowNull = false) => ({
  type: DataTypes.BIGINT.UNSIGNED,
  allowNull,
  references: { model: table, key: 'id' },
  onUpdate: 'CASCADE',
  onDelete: allowNull ? 'SET NULL' : 'RESTRICT',
});

module.exports = {
  async up({ context: qi }) {
    await addColumnIfMissing(qi, 'investor_profiles', 'show_on_home', { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false });

    await createTableIfMissing(qi, 'testimonials', {
      id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
      user_id: fk('users'),
      author_role: { type: DataTypes.ENUM('graduate', 'investor'), allowNull: false },
      body: { type: DataTypes.TEXT, allowNull: false },
      status: { type: DataTypes.ENUM('pending', 'approved', 'rejected'), allowNull: false, defaultValue: 'pending' },
      decided_by: fk('users', true),
      decided_at: { type: DataTypes.DATE, allowNull: true },
      decision_reason: { type: DataTypes.TEXT, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    });
    await addIndexIfMissing(qi, 'testimonials', 'status');
  },

  async down({ context: qi }) {
    await dropTableIfPresent(qi, 'testimonials');
    await removeColumnIfPresent(qi, 'investor_profiles', 'show_on_home');
  },
};
