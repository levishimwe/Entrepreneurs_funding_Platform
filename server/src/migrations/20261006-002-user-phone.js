// Optional phone number on accounts. FR02 allows the registration OTP to be
// delivered "by email or SMS" and FR12 sends reset codes to an "approved phone
// number"; the profile photo key (users.photo_key) already exists.
const { DataTypes } = require('sequelize');
const { addColumnIfMissing, removeColumnIfPresent } = require('../db/schemaHelpers');

module.exports = {
  async up({ context: qi }) {
    await addColumnIfMissing(qi, 'users', 'phone', { type: DataTypes.STRING(20), allowNull: true, after: 'full_name' });
  },
  async down({ context: qi }) {
    await removeColumnIfPresent(qi, 'users', 'phone');
  },
};
