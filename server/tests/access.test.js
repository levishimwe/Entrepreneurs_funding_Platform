// Server-side role protection: admin and staff endpoints must refuse every
// other role, regardless of what the UI shows. Routes are enumerated from the
// routers themselves, so any endpoint added later is covered automatically.
const { sequelize } = require('../src/models');
const { whenIdle } = require('../src/workers/jobs');
const { shutdown } = require('../src/services/verification/textExtraction');
const { agent, approvedGraduate, investorClient, loginAs } = require('./helpers');

afterAll(async () => {
  await whenIdle();
  await shutdown();
  await sequelize.close();
});

function routesOf(router, prefix) {
  const routes = [];
  for (const layer of router.stack) {
    if (!layer.route) continue;
    for (const method of Object.keys(layer.route.methods)) {
      routes.push({ method, path: prefix + layer.route.path.replace(/:(\w+)/g, (m, name) => (name === 'action' ? 'approve' : '1')) });
    }
  }
  return routes;
}

const ADMIN_ROUTES = routesOf(require('../src/routes/admin'), '/api/admin');
const STAFF_ROUTES = routesOf(require('../src/routes/staff'), '/api/staff');

require('./helpers').stubOcr();

const call = (client, { method, path }) => client[method === 'delete' ? 'delete' : method](path).send({});

describe('admin and staff endpoints are protected on the server', () => {
  let graduate;
  let investor;
  let staff;
  let admin;

  beforeAll(async () => {
    graduate = (await approvedGraduate()).client;
    investor = (await investorClient()).client;
    staff = await loginAs('staff1');
    admin = await loginAs('admin');
  });

  test('the route lists are not empty', () => {
    expect(ADMIN_ROUTES.length).toBeGreaterThan(15);
    expect(STAFF_ROUTES.length).toBeGreaterThan(4);
  });

  test.each(ADMIN_ROUTES.map((r) => [r.method.toUpperCase(), r.path, r]))('%s %s refuses anonymous, graduate, investor and staff', async (_m, _p, route) => {
    expect((await call(agent(), route)).status).toBe(401);
    for (const client of [graduate, investor, staff]) {
      expect((await call(client, route)).status).toBe(403);
    }
  });

  test.each(STAFF_ROUTES.map((r) => [r.method.toUpperCase(), r.path, r]))('%s %s refuses anonymous, graduate, investor and admin', async (_m, _p, route) => {
    expect((await call(agent(), route)).status).toBe(401);
    for (const client of [graduate, investor, admin]) {
      expect((await call(client, route)).status).toBe(403);
    }
  });
});
