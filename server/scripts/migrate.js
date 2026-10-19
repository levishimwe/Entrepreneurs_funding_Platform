// Versioned migrations (NFR05). Usage: node scripts/migrate.js [up|down|status]
// The server also applies pending migrations itself at start-up (src/server.js).
const { createMigrator, prepareDatabase, missingColumns } = require('../src/db/migrations');

module.exports = { createMigrator };

if (require.main === module) {
  const { sequelize } = require('../src/config/database');
  const direction = process.argv[2] || 'up';
  (async () => {
    console.log(`Database: ${sequelize.config.database}`);
    if (direction === 'down') {
      await createMigrator(sequelize).down();
    } else if (direction === 'status') {
      const migrator = createMigrator(sequelize, { logger: null });
      console.log(`Applied: ${(await migrator.executed()).map((m) => m.name).join(', ') || '(none)'}`);
      console.log(`Pending: ${(await migrator.pending()).map((m) => m.name).join(', ') || '(none)'}`);
      const missing = await missingColumns(sequelize);
      console.log(`Required columns: ${missing.length ? `MISSING ${missing.join(', ')}` : 'all present'}`);
      return;
    } else {
      await prepareDatabase(sequelize);
    }
    const executed = await createMigrator(sequelize, { logger: null }).executed();
    console.log(`Applied migrations: ${executed.map((m) => m.name).join(', ') || '(none)'}`);
  })()
    .catch((err) => {
      // Message only: never the full error object (it can carry SQL and values).
      console.error(`Migration failed: ${err.message}`);
      process.exitCode = 1;
    })
    .finally(() => sequelize.close());
}
