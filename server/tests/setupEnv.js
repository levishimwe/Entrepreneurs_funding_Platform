// Throwaway staff credentials for the isolated test database only. The real
// accounts come from server/.env and are never used by the test suite.
const TEST_ACCOUNTS = {
  admin: { email: 'test-admin@aluventures.test', password: 'TestAdmin-2026' },
  staff1: { email: 'test-staff1@aluventures.test', password: 'TestStaff1-2026' },
  staff2: { email: 'test-staff2@aluventures.test', password: 'TestStaff2-2026' },
};

process.env.NODE_ENV = 'test';
// Two OCR threads so the pool's concurrency cap is exercised (production default: 1).
process.env.OCR_POOL_SIZE = '2';
process.env.ADMIN_EMAIL = TEST_ACCOUNTS.admin.email;
process.env.ADMIN_PASSWORD = TEST_ACCOUNTS.admin.password;
process.env.STAFF1_EMAIL = TEST_ACCOUNTS.staff1.email;
process.env.STAFF1_PASSWORD = TEST_ACCOUNTS.staff1.password;
process.env.STAFF2_EMAIL = TEST_ACCOUNTS.staff2.email;
process.env.STAFF2_PASSWORD = TEST_ACCOUNTS.staff2.password;

module.exports = { TEST_ACCOUNTS };
