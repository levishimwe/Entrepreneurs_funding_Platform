// Primary operating country of a project ("Primary Operating Jurisdiction" on
// the submission form). Used for investor discovery filters. Existing rows
// default to Rwanda, where the pilot runs.
const { DataTypes } = require('sequelize');

module.exports = {
  async up({ context: qi }) {
    await qi.addColumn('projects', 'country', {
      type: DataTypes.STRING(60),
      allowNull: false,
      defaultValue: 'Rwanda',
      after: 'stage',
    });
    await qi.addIndex('projects', ['country']);
  },
  async down({ context: qi }) {
    await qi.removeIndex('projects', ['country']);
    await qi.removeColumn('projects', 'country');
  },
};
