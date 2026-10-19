// Start-up order: apply pending migrations and check the schema, seed the
// admin/staff accounts, then listen and start the background worker. If any
// step fails the process exits with one clear log line, so the host marks the
// deploy as failed instead of serving requests against a mismatched schema.
const env = require('./config/env');
const { sequelize } = require('./config/database');
const { prepareDatabase } = require('./db/migrations');

async function boot() {
  if (env.boot.migrate) await prepareDatabase(sequelize);
  if (env.boot.seed) {
    const { seed } = require('../scripts/seed');
    await seed({ quiet: true });
    console.log('[boot] Admin and staff accounts are in sync with the environment.');
  }

  const app = require('./app');
  const { startWorkers } = require('./workers/jobs');
  app.listen(env.port, async () => {
    console.log(`ALU Ventures API listening on http://localhost:${env.port} (database "${env.db.name}")`);
    if (env.isTest) {
      // A test-mode server uses the throwaway test database and accounts; real
      // accounts from server/.env cannot sign in to it.
      console.warn('WARNING: NODE_ENV=test — using the TEST database. Real accounts will not work here.');
    }
    try {
      await startWorkers();
    } catch (err) {
      console.error('[worker] failed to start:', err.message);
    }
  });
}

boot().catch((err) => {
  // err.message only: no credentials, SQL or row data.
  console.error(`[boot] FATAL: ${err.message}. The server will not start until this is fixed.`);
  process.exit(1);
});
