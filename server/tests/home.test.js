const { sequelize, User, InvestorProfile, Testimonial, AuditLog } = require('../src/models');
const { whenIdle } = require('../src/workers/jobs');
const { shutdown } = require('../src/services/verification/textExtraction');
const records = require('../src/services/records');
const { agent, approvedGraduate, investorClient, loginAs, unique } = require('./helpers');

require('./helpers').stubOcr();

afterAll(async () => {
  await whenIdle();
  await shutdown();
  await sequelize.close();
});

const publicTestimonials = async () => (await agent().get('/api/public/testimonials')).body.testimonials;
const publicInvestors = async () => (await agent().get('/api/public/investors')).body.investors;

describe('home page: testimonies', () => {
  test('a testimony is public only after administrator approval; edits go back to review', async () => {
    const { client, user } = await approvedGraduate('Diane Ingabire');
    const admin = await loginAs('admin');
    const text = `ALU Ventures helped me present my venture clearly to investors ${unique()}.`;

    expect((await client.put('/api/testimonials/mine').send({ body: 'Too short' })).status).toBe(400);
    const sent = await client.put('/api/testimonials/mine').send({ body: text });
    expect(sent.status).toBe(200);
    expect(sent.body.testimonial.status).toBe('pending');
    expect((await publicTestimonials()).some((t) => t.body === text)).toBe(false);

    const id = sent.body.testimonial.id;
    const queue = await admin.get('/api/admin/testimonials?status=pending');
    expect(queue.body.testimonials.find((t) => t.id === id)).toMatchObject({ role: 'Graduate', author: { name: 'Diane Ingabire' } });

    expect((await admin.post(`/api/admin/testimonials/${id}/approve`).send({})).status).toBe(200);
    const shown = (await publicTestimonials()).find((t) => t.id === id);
    expect(shown).toEqual({ id, body: text, name: 'Diane Ingabire', role: 'Graduate founder', detail: 'Class of 2024' });
    expect(await AuditLog.findOne({ where: { action: 'testimonial.approved', entityId: id } })).not.toBeNull();

    // Editing sends it back for approval and removes it from the home page.
    const edited = await client.put('/api/testimonials/mine').send({ body: `${text} Updated.` });
    expect(edited.body.testimonial).toMatchObject({ id, status: 'pending' });
    expect((await publicTestimonials()).some((t) => t.id === id)).toBe(false);

    expect((await admin.post(`/api/admin/testimonials/${id}/reject`).send({})).status).toBe(400);
    expect((await admin.post(`/api/admin/testimonials/${id}/reject`).send({ reason: 'Please remove the other founder’s name.' })).status).toBe(200);
    expect((await client.get('/api/testimonials/mine')).body.testimonial).toMatchObject({ status: 'rejected', decisionReason: 'Please remove the other founder’s name.' });
    expect(await Testimonial.count({ where: { userId: user.id } })).toBe(1);
  });

  test('only approved members submit; only admins moderate', async () => {
    const pending = await investorClient({ approved: false });
    expect((await pending.client.put('/api/testimonials/mine').send({ body: 'This platform made introductions simple and safe.' })).status).toBe(403);
    const staff = await loginAs('staff1');
    expect((await staff.put('/api/testimonials/mine').send({ body: 'This platform made introductions simple and safe.' })).status).toBe(403);
    expect((await staff.get('/api/admin/testimonials')).status).toBe(403);
    const { client } = await approvedGraduate();
    expect((await client.get('/api/admin/testimonials')).status).toBe(403);
  });

  test('deleting a rejected account removes its testimony', async () => {
    const { client, user } = await approvedGraduate();
    await client.put('/api/testimonials/mine').send({ body: 'A clear and fair review process for graduate ventures.' });
    await User.update({ status: 'rejected' }, { where: { id: user.id } });
    const plan = await records.accountDeletePlan(await User.findByPk(user.id));
    expect(plan.removes.testimonies).toBe(1);
    await records.deleteAccount(await User.findByPk(user.id), null);
    expect(await Testimonial.count({ where: { userId: user.id } })).toBe(0);
  });
});

describe('home page: investors', () => {
  test('investors appear only after the administrator ticks Show on home page, with public-safe fields', async () => {
    const { user, email } = await investorClient();
    const admin = await loginAs('admin');
    expect((await publicInvestors()).some((i) => i.id === user.id)).toBe(false);

    const staff = await loginAs('staff1');
    expect((await staff.patch(`/api/admin/investors/${user.id}/home`).send({ showOnHome: true })).status).toBe(403);
    expect((await admin.patch(`/api/admin/investors/${user.id}/home`).send({ showOnHome: true })).status).toBe(200);
    expect(await AuditLog.findOne({ where: { action: 'investor.home_visibility', entityId: user.id } })).not.toBeNull();

    const shown = (await publicInvestors()).find((i) => i.id === user.id);
    expect(Object.keys(shown).sort()).toEqual(['bio', 'id', 'name', 'organisation', 'sectors', 'type']);
    expect(shown).toMatchObject({ name: 'Grace Mutoni', organisation: 'Kigali Angels', type: 'Investor', sectors: ['Agriculture'] });
    expect(JSON.stringify(shown)).not.toContain(email);

    const list = await admin.get('/api/admin/investors?status=approved');
    expect(list.body.investors.find((i) => i.id === user.id).showOnHome).toBe(true);

    // A suspended investor disappears; unapproved investors cannot be ticked.
    await User.update({ status: 'suspended' }, { where: { id: user.id } });
    expect((await publicInvestors()).some((i) => i.id === user.id)).toBe(false);
    const pending = await investorClient({ approved: false });
    expect((await admin.patch(`/api/admin/investors/${pending.user.id}/home`).send({ showOnHome: true })).status).toBe(400);
    expect((await InvestorProfile.findByPk(pending.user.id)).showOnHome).toBe(false);
  });
});

describe('home page: banner stats', () => {
  test('returns four live counts and nothing else', async () => {
    const before = (await agent().get('/api/public/banner-stats')).body;
    expect(Object.keys(before).sort()).toEqual(['approvedProjects', 'introductions', 'investors', 'verifiedGraduates']);
    Object.values(before).forEach((n) => expect(Number.isInteger(n) && n >= 0).toBe(true));

    // An approved graduate and an approved investor each add one.
    await approvedGraduate();
    await investorClient();
    const after = (await agent().get('/api/public/banner-stats')).body;
    expect(after.verifiedGraduates).toBe(before.verifiedGraduates + 1);
    expect(after.investors).toBe(before.investors + 1);
    // A pending investor does not count.
    await investorClient({ approved: false });
    expect((await agent().get('/api/public/banner-stats')).body.investors).toBe(after.investors);
  });
});
