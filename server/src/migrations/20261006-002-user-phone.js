// Optional phone number on accounts. FR02 allows the registration OTP to be
// delivered "by email or SMS" and FR12 sends reset codes to an "approved phone
// number"; the profile photo key (users.photo_key) already exists.
const { DataTypes } = require('sequelize');

module.exports = {
  async up({ context: qi }) {
    await qi.addColumn('users', 'phone', { type: DataTypes.STRING(20), allowNull: true, after: 'full_name' });
  },
  async down({ context: qi }) {
    await qi.removeColumn('users', 'phone');
  },
};
