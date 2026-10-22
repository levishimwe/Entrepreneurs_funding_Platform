// Opportunity stages: an optional event end date, and when (and by whom) staff
// marked the opportunity Completed. Results are recorded only after that.
//
// Additive and idempotent: three nullable columns, so existing opportunities
// keep their current behaviour (none is Completed until staff say so).
const { DataTypes } = require('sequelize');
const { addColumnIfMissing, removeColumnIfPresent } = require('../db/schemaHelpers');

module.exports = {
  async up({ context: qi }) {
    await addColumnIfMissing(qi, 'opportunities', 'ends_at', { type: DataTypes.DATE, allowNull: true });
    await addColumnIfMissing(qi, 'opportunities', 'completed_at', { type: DataTypes.DATE, allowNull: true });
    await addColumnIfMissing(qi, 'opportunities', 'completed_by', {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });
  },

  async down({ context: qi }) {
    await removeColumnIfPresent(qi, 'opportunities', 'completed_by');
    await removeColumnIfPresent(qi, 'opportunities', 'completed_at');
    await removeColumnIfPresent(qi, 'opportunities', 'ends_at');
  },
};
