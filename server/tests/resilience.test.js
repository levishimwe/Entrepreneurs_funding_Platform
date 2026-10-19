// A failing database query must give a clean message, never crash the request,
// never sign the user out, and never log SQL, values or secrets.
const { DatabaseError } = require('sequelize');
const { sequelize, User } = require('../src/models');
const { agent, loginAs, stubOcr } = require('./helpers');
const { TEST_ACCOUNTS } = require('./setupEnv');

stubOcr();
afterAll(() => sequelize.close());

// What mysql2 + Sequelize raise when the code is ahead of the schema.
function schemaError() {
  const parent = Object.assign(new Error("Unknown column 'archived_at' in 'field list'"), {
    code: 'ER_BAD_FIELD_ERROR',
    sql: "SELECT `id`, `email`, `password_hash` FROM `users` WHERE `email` = 'secret-person@example.com'",
  });
  return new DatabaseError(parent);
}

function captureLogs() {
  const lines = [];
  const spies = ['log', 'warn', 'error'].map((m) => jest.spyOn(console, m).mockImplementation((...a) => lines.push(a.map(String).join(' '))));
  return { lines, restore: () => spies.forEach((s) => s.mockRestore()) };
}

afterEach(() => jest.restoreAllMocks());

test('sign-in during a database error: a clean 503, and the log has no SQL or personal data', async () => {
  const logs = captureLogs();
  jest.spyOn(User, 'findOne').mockRejectedValue(schemaError());
  const res = await agent().post('/api/auth/login').send({ email: TEST_ACCOUNTS.admin.email, password: TEST_ACCOUNTS.admin.password });
  logs.restore();
  expect(res.status).toBe(503);
  expect(res.body.error).toBe('Sign-in is temporarily unavailable. Please try again in a minute.');
  const logged = logs.lines.join('\n');
  expect(logged).toMatch(/\[auth\] sign-in lookup failed: SequelizeDatabaseError ER_BAD_FIELD_ERROR: Unknown column 'archived_at'/);
  expect(logged).not.toMatch(/SELECT|password_hash|secret-person|TestAdmin/);
});

test('a signed-in request during a database error gets 503 and keeps its session', async () => {
  const admin = await loginAs('admin');
  const logs = captureLogs();
  jest.spyOn(User, 'findByPk').mockRejectedValueOnce(schemaError());
  const res = await admin.get('/api/auth/me');
  logs.restore();
  expect(res.status).toBe(503);
  expect(res.headers['set-cookie'] || []).not.toEqual(expect.arrayContaining([expect.stringMatching(/^alu_session=;/)]));
  // Once the database is back, the same session works.
  expect((await admin.get('/api/auth/me')).status).toBe(200);
});

test('any other route hitting a database error returns a clean 503 without the SQL in the log', async () => {
  const admin = await loginAs('admin');
  const logs = captureLogs();
  const { Notification } = require('../src/models');
  jest.spyOn(Notification, 'findAll').mockRejectedValueOnce(schemaError());
  const res = await admin.get('/api/admin/notifications');
  logs.restore();
  expect(res.status).toBe(503);
  expect(res.body.error).toMatch(/temporarily unavailable/);
  const logged = logs.lines.join('\n');
  expect(logged).toMatch(/\[db\] GET \/api\/admin\/notifications: .*ER_BAD_FIELD_ERROR.*run migrations/);
  expect(logged).not.toMatch(/SELECT|password_hash|secret-person/);
});
