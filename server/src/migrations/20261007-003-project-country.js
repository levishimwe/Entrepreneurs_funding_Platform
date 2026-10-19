// Primary operating country of a project ("Primary Operating Jurisdiction" on
// the submission form). Used for investor discovery filters. Existing rows
// default to Rwanda, where the pilot runs.
const { DataTypes } = require('sequelize');
const { addColumnIfMissing, removeColumnIfPresent, addIndexIfMissing, removeIndexIfPresent } = require('../db/schemaHelpers');

module.exports = {
  async up({ context: qi }) {
    await addColumnIfMissing(qi, 'projects', 'country', {
      type: DataTypes.STRING(60),
      allowNull: false,
      defaultValue: 'Rwanda',
      after: 'stage',
    });
    await addIndexIfMissing(qi, 'projects', 'country');
  },
  async down({ context: qi }) {
    await removeIndexIfPresent(qi, 'projects', 'country');
    await removeColumnIfPresent(qi, 'projects', 'country');
  },
};
