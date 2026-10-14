// Prepares the dedicated test database: migrate, empty the data tables so every
// run starts from the same state, then seed. Refuses to touch any database
// whose name does not end in "_test".
const fs = require('fs');

const KEEP = new Set(['sequelize_meta', 'sector_keywords', 'settings']);

module.exports = async () => {
  require('./setupEnv'); // throwaway staff credentials, set before env.js loads
  const { createSequelize } = require('../src/config/database');
  const env = require('../src/config/env');
  if (!env.db.name.endsWith('_test')) {
    throw new Error(`Refusing to reset "${env.db.name}": tests only run against a *_test database.`);
  }

  const sequelize = createSequelize(env.db.name);
  const { createMigrator } = require('../scripts/migrate');
  await createMigrator(sequelize).up();

  const [tables] = await sequelize.query('SHOW TABLES');
  await sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const row of tables) {
    const table = Object.values(row)[0];
    if (!KEEP.has(table)) await sequelize.query(`DELETE FROM \`${table}\``);
  }
  await sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
  await sequelize.close();
  fs.rmSync(env.storage.localDir, { recursive: true, force: true });

  const { seed } = require('../scripts/seed');
  await seed({ quiet: true });
  await require('../src/models').sequelize.close();
};
