// Migrations bring both a fresh database and an old one (the live schema before
// the archive release) up to date, safely and repeatably, and a failure stops
// the boot with a clear message. Uses its own throwaway *_test database.
const env = require('../src/config/env');
const { createSequelize } = require('../src/config/database');
const { createMigrator, prepareDatabase, missingColumns, REQUIRED_COLUMNS } = require('../src/db/migrations');

const DB = 'alu_funding_migrations_test';
const OLD_SCHEMA = '20261007-003-project-country.js'; // the live schema before 004
const quiet = { log: { log: () => {} } }; // console-like, silent

let admin; // connection used to create and drop the throwaway database
let db;

async function freshDatabase() {
  if (db) await db.close();
  await admin.query(`DROP DATABASE IF EXISTS \`${DB}\``);
  await admin.query(`CREATE DATABASE \`${DB}\``);
  db = createSequelize(DB);
}

const columns = async (table) =>
  (await db.query('SELECT COLUMN_NAME c, COLUMN_TYPE t, IS_NULLABLE n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?', { replacements: [DB, table] }))[0];

beforeAll(async () => {
  expect(DB.endsWith('_test')).toBe(true);
  admin = createSequelize(env.db.name); // the regular test database
});

afterAll(async () => {
  if (db) await db.close();
  await admin.query(`DROP DATABASE IF EXISTS \`${DB}\``);
  await admin.close();
});

test('a fresh database is migrated to the current schema', async () => {
  await freshDatabase();
  const { applied } = await prepareDatabase(db, { migrator: createMigrator(db, { logger: null }), ...quiet });
  expect(applied).toContain('20261019-004-archive.js');
  expect(await missingColumns(db)).toEqual([]);
  expect(await createMigrator(db, { logger: null }).pending()).toEqual([]);
  const status = (await columns('users')).find((c) => c.c === 'status');
  expect(status.t).toContain("'archived'");
});

test('an old schema with live rows is upgraded without losing or changing data, and again is a no-op', async () => {
  await freshDatabase();
  await createMigrator(db, { logger: null }).up({ to: OLD_SCHEMA });
  expect(await missingColumns(db)).toEqual(expect.arrayContaining(['notifications.archived_at', 'users.status_before_archive', 'opportunities.status_before_archive']));

  // Rows as they exist in production before the upgrade.
  await db.query(
    "INSERT INTO users (email, password_hash, full_name, role, status, created_at, updated_at) VALUES ('old@example.com', 'x', 'Old User', 'graduate', 'active', NOW(), NOW())"
  );
  const [[{ id: userId }]] = await db.query("SELECT id FROM users WHERE email = 'old@example.com'");
  await db.query(
    "INSERT INTO notifications (event_key, to_email, subject, body_text, status, created_at, updated_at) VALUES ('old-email', 'old@example.com', 'Hello', 'Body', 'pending', NOW(), NOW())"
  );
  await db.query(
    `INSERT INTO opportunities (created_by, title, type, description, criteria, deadline, status, created_at, updated_at) VALUES (${userId}, 'Old challenge', 'hackathon', 'Text', '{}', NOW(), 'published', NOW(), NOW())`
  );

  await prepareDatabase(db, { migrator: createMigrator(db, { logger: null }), ...quiet });
  expect(await missingColumns(db)).toEqual([]);
  const [[user]] = await db.query("SELECT status, status_before_archive FROM users WHERE email = 'old@example.com'");
  const [[email]] = await db.query("SELECT status, archived_at FROM notifications WHERE event_key = 'old-email'");
  const [[opp]] = await db.query("SELECT status, status_before_archive FROM opportunities WHERE title = 'Old challenge'");
  // Existing rows keep their values; NULL archive fields mean "active".
  expect(user).toEqual({ status: 'active', status_before_archive: null });
  expect(email).toEqual({ status: 'pending', archived_at: null });
  expect(opp).toEqual({ status: 'published', status_before_archive: null });

  // Booting again changes nothing and does not fail.
  const again = await prepareDatabase(db, { migrator: createMigrator(db, { logger: null }), ...quiet });
  expect(again.applied).toEqual([]);
});

test('a half-applied migration (column added, migration not recorded) is completed safely', async () => {
  await freshDatabase();
  await createMigrator(db, { logger: null }).up({ to: OLD_SCHEMA });
  // MySQL DDL is not transactional: simulate a run that stopped after one step.
  await db.query('ALTER TABLE notifications ADD COLUMN archived_at DATETIME NULL');
  await prepareDatabase(db, { migrator: createMigrator(db, { logger: null }), ...quiet });
  expect(await missingColumns(db)).toEqual([]);
});

test('a failed migration stops the boot with a clear message', async () => {
  const failing = {
    pending: async () => [{ name: '20991231-999-broken.js' }],
    up: async () => {
      throw Object.assign(new Error('Migration 20991231-999-broken.js (up) failed'), { cause: Object.assign(new Error("Unknown column 'x' in 'field list'"), { parent: { code: 'ER_BAD_FIELD_ERROR' } }) });
    },
    executed: async () => [],
  };
  await expect(prepareDatabase(db, { migrator: failing, ...quiet })).rejects.toThrow("Database migration failed (ER_BAD_FIELD_ERROR): Unknown column 'x' in 'field list'");
});

test('a schema that is still behind after migrating stops the boot and names the missing columns', async () => {
  await freshDatabase();
  await createMigrator(db, { logger: null }).up({ to: OLD_SCHEMA });
  const noop = { pending: async () => [], up: async () => [], executed: async () => [] };
  await expect(prepareDatabase(db, { migrator: noop, ...quiet })).rejects.toThrow(/missing .*notifications\.archived_at/);
  expect(REQUIRED_COLUMNS.length).toBeGreaterThan(0);
});
