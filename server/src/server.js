const app = require('./app');
const env = require('./config/env');
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
