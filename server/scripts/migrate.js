// Versioned migrations (NFR05). Usage: node scripts/migrate.js [up|down]
const path = require('path');
const { Umzug, SequelizeStorage } = require('umzug');

function createMigrator(sequelize) {
  return new Umzug({
    migrations: {
      glob: ['src/migrations/*.js', { cwd: path.resolve(__dirname, '..') }],
      // Explicit CommonJS loading; Umzug otherwise falls back to import() when
      // require.main is unset (node -e, Jest).
      resolve: ({ name, path: filepath, context }) => {
        const migration = require(filepath);
        return {
          name,
          up: () => migration.up({ context }),
          down: () => migration.down({ context }),
        };
      },
    },
    context: sequelize.getQueryInterface(),
    storage: new SequelizeStorage({ sequelize }),
    logger: process.env.NODE_ENV === 'test' ? undefined : console,
  });
}

module.exports = { createMigrator };

if (require.main === module) {
  const { sequelize } = require('../src/config/database');
  const direction = process.argv[2] || 'up';
  (async () => {
    const migrator = createMigrator(sequelize);
    if (direction === 'down') await migrator.down();
    else await migrator.up();
    const executed = await migrator.executed();
    console.log(`Applied migrations: ${executed.map((m) => m.name).join(', ') || '(none)'}`);
  })()
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => sequelize.close());
}
