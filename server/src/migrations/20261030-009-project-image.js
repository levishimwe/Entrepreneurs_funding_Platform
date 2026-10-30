// Optional project background image (a storage key). Additive and idempotent:
// a new nullable column, so existing projects simply have no image.
const { DataTypes } = require('sequelize');
const { addColumnIfMissing, removeColumnIfPresent } = require('../db/schemaHelpers');

module.exports = {
  async up({ context: qi }) {
    await addColumnIfMissing(qi, 'projects', 'image_key', { type: DataTypes.STRING(255), allowNull: true });
  },

  async down({ context: qi }) {
    await removeColumnIfPresent(qi, 'projects', 'image_key');
  },
};
