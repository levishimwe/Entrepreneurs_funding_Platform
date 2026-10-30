// Schema migrations (NFR05) and the start-up check that the database matches
// the code. Applied migrations are recorded by Umzug in the `sequelize_meta`
// table (Sequelize's default "SequelizeMeta", renamed by `underscored: true`),
// so each runs once; the migrations themselves are also idempotent, so a
// half-applied migration (MySQL DDL is not transactional) can be re-run.
const path = require('path');
const { Umzug, SequelizeStorage } = require('umzug');

const SERVER_ROOT = path.resolve(__dirname, '..', '..');

function createMigrator(sequelize, { logger } = {}) {
  return new Umzug({
    migrations: {
      glob: ['src/migrations/*.js', { cwd: SERVER_ROOT }],
      // Explicit CommonJS loading; Umzug otherwise falls back to import() when
      // require.main is unset (node -e, Jest).
      resolve: ({ name, path: filepath, context }) => {
        const migration = require(filepath);
        return { name, up: () => migration.up({ context }), down: () => migration.down({ context }) };
      },
    },
    context: sequelize.getQueryInterface(),
    storage: new SequelizeStorage({ sequelize }),
    logger: logger === undefined ? (process.env.NODE_ENV === 'test' ? undefined : console) : logger,
  });
}

// Columns the running code depends on, newest first. If one is missing after
// migrating, the server must not start.
const REQUIRED_COLUMNS = [
  ['projects', 'image_key'],
  ['post_reports', 'post_id'],
  ['graduate_posts', 'removed_at'],
  ['opportunities', 'link_only'],
  ['opportunities', 'external_url'],
  ['graduate_profiles', 'public_profile_consent'],
  ['graduate_profiles', 'public_image_key'],
  ['testimonials', 'status'],
  ['investor_profiles', 'show_on_home'],
  ['opportunities', 'completed_at'],
  ['opportunities', 'ends_at'],
  ['competition_results', 'status'],
  ['support_messages', 'thread_id'],
  ['support_threads', 'requested_name'],
  ['projects', 'show_on_home'],
  ['projects', 'funding_source'],
  ['notifications', 'archived_at'],
  ['opportunities', 'status_before_archive'],
  ['users', 'status_before_archive'],
  ['projects', 'country'],
  ['users', 'phone'],
];

async function missingColumns(sequelize) {
  const [rows] = await sequelize.query(
    'SELECT TABLE_NAME AS t, COLUMN_NAME AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()'
  );
  const present = new Set(rows.map((r) => `${r.t}.${r.c}`));
  return REQUIRED_COLUMNS.map(([t, c]) => `${t}.${c}`).filter((col) => !present.has(col));
}

/**
 * Brings the database up to date and checks it. Throws (with a message safe to
 * log: no credentials, no data) if a migration fails or the schema still does
 * not match.
 */
async function prepareDatabase(sequelize, { migrator = createMigrator(sequelize, { logger: null }), log = console } = {}) {
  let pending;
  try {
    pending = (await migrator.pending()).map((m) => m.name);
    if (pending.length) log.log(`[boot] Applying ${pending.length} migration(s): ${pending.join(', ')}`);
    await migrator.up();
  } catch (err) {
    const code = err?.cause?.parent?.code || err?.parent?.code || err?.code;
    const detail = err?.cause?.message || err?.message || String(err);
    throw new Error(`Database migration failed${code ? ` (${code})` : ''}: ${detail}`);
  }
  const still = (await migrator.pending()).map((m) => m.name);
  if (still.length) throw new Error(`Database migration incomplete: still pending ${still.join(', ')}`);
  const missing = await missingColumns(sequelize);
  if (missing.length) throw new Error(`Database schema does not match the code: missing ${missing.join(', ')}`);
  const applied = (await migrator.executed()).length;
  log.log(`[boot] Database schema up to date (${applied} migrations${pending.length ? `, ${pending.length} applied now` : ''}).`);
  return { applied: pending };
}

module.exports = { createMigrator, prepareDatabase, missingColumns, REQUIRED_COLUMNS };
