const { sequelize, Project, Document, AuditLog, Notification } = require('../src/models');
const { whenIdle } = require('../src/workers/jobs');
const { shutdown } = require('../src/services/verification/textExtraction');
const { buildRdbPdf } = require('../scripts/make-sample-documents');
const { agent, registerGraduate, verifyEmail, approveGraduateDirectly, unique } = require('./helpers');

require('./helpers').stubOcr();

afterAll(async () => {
  await whenIdle();
  await shutdown();
  await sequelize.close();
});

const nextYear = new Date().getUTCFullYear() + 1;
const companyCode = () => String(100000000 + Math.floor(Math.random() * 899999999));

async function approvedGraduate(fullName = 'Amina Uwase') {
  const client = agent();
  const { email } = await registerGraduate(client, { fullName });
  await verifyEmail(client, email);
  await approveGraduateDirectly(email);
  return { client, email };
}

const approveProjectDirectly = (id, extra = {}) =>
  Project.update({ status: 'approved', approvedAt: new Date(), similarityStatus: 'cleared', ...extra }, { where: { id } });

function submit(client, fields, files = {}) {
  let req = client.post('/api/projects');
  for (const [k, v] of Object.entries(fields)) req = req.field(k, String(v));
  for (const [k, [buffer, name]] of Object.entries(files)) req = req.attach(k, buffer, name);
  return req;
}

const ideaFields = (overrides = {}) => ({
  title: `Idea ${unique()}`,
  type: 'idea',
  sector: 'Education',
  stage: 'Idea',
  summary: 'A short summary of a learning idea for students in Kigali.',
  description:
    'An education platform idea that pairs secondary school students with university tutors for weekly revision sessions, focused on mathematics and science literacy.',
  ideaDeclaration: 'true',
  publicationConsent: 'true',
  ...overrides,
});

describe('project submission rules (FR04)', () => {
  test('a graduate still pending review cannot submit', async () => {
    const client = agent();
    const { email } = await registerGraduate(client);
    await verifyEmail(client, email);
    const res = await submit(client, ideaFields());
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/pending administrator review/);
  });

  test('idea projects need the declaration; companies need RDB evidence', async () => {
    const { client } = await approvedGraduate();
    const idea = await submit(client, ideaFields({ ideaDeclaration: 'false' }));
    expect(idea.status).toBe(400);
    expect(idea.body.fields.ideaDeclaration).toBeDefined();

    const company = await submit(client, {
      ...ideaFields(),
      type: 'company',
      companyName: 'Test Co Ltd',
      companyNumber: companyCode(),
      relationshipToCompany: 'Founder',
    });
    expect(company.status).toBe(400);
    expect(company.body.fields.rdbCertificate).toMatch(/RDB/);
  });

  test('an unknown sector is rejected', async () => {
    const { client } = await approvedGraduate();
    const res = await submit(client, ideaFields({ sector: 'Space Mining' }));
    expect(res.status).toBe(400);
    expect(res.body.fields.sector).toBeDefined();
  });
});

describe('company submission with RDB OCR (FR05, FR14, FR15)', () => {
  test('valid certificate → code, pending review, sector suggestion stored, Likely Valid', async () => {
    const { client } = await approvedGraduate('Amina Uwase');
    const number = companyCode();
    const rdb = await buildRdbPdf({ company: 'AgriFlow Farm Supply Ltd', number, director: 'Amina Uwase', issued: '03/02/2025', expires: `03/02/${nextYear}` });

    const suggestion = await client.post('/api/projects/suggest-sector').send({
      title: 'AgriFlow Farm Supply',
      description: 'Helping smallholder farmer cooperatives store harvest and sell crop surplus.',
    });
    expect(suggestion.body.sector).toBe('Agriculture');
    expect(suggestion.body.matched).toEqual(expect.arrayContaining(['farmer', 'harvest', 'crop']));

    const res = await submit(
      client,
      {
        title: `AgriFlow Farm Supply ${unique()}`,
        type: 'company',
        sector: 'Logistics', // graduate overrides the Agriculture suggestion
        stage: 'Early revenue',
        summary: 'Cold storage and market linkage for smallholder farmer cooperatives.',
        description:
          'AgriFlow helps smallholder farmer cooperatives in the Eastern Province store harvest in solar cold rooms and sell crop surplus directly to Kigali buyers, reducing post-harvest loss.',
        companyName: 'AgriFlow Farm Supply Ltd',
        companyNumber: number,
        relationshipToCompany: 'Managing Director',
        publicationConsent: 'true',
      },
      { rdbCertificate: [rdb, 'rdb.pdf'] }
    );
    expect(res.status).toBe(201);
    const p = res.body.project;
    expect(p.projectCode).toMatch(/^ALU-2026-[A-HJ-NP-Z2-9]{5}$/);
    expect(p.status).toBe('pending_review');
    expect(p.suggestedSector).toBe('Agriculture');
    expect(p.sector).toBe('Logistics');
    expect(p.documents.map((d) => d.kind)).toContain('rdb_certificate');
    // The owner's view never exposes the OCR flag.
    expect(JSON.stringify(p)).not.toMatch(/likely_valid|suspicious/);

    await whenIdle();
    const doc = await Document.findOne({ where: { projectId: p.id, kind: 'rdb_certificate' } });
    expect(doc.flag).toBe('likely_valid');
    const project = await Project.findByPk(p.id);
    expect(project.status).toBe('pending_review'); // never auto-approved

    const sectorAudit = await AuditLog.findOne({ where: { entityId: p.id, action: 'project.sector_confirmed' } });
    expect(sectorAudit.metadata).toMatchObject({ suggested: 'Agriculture', confirmed: 'Logistics', overridden: true });
  });

  test('certificate naming another director → Suspicious, still pending review', async () => {
    const { client } = await approvedGraduate('Amina Uwase');
    const number = companyCode();
    const rdb = await buildRdbPdf({ company: 'Kivu Solar Ltd', number, director: 'Eric Nshimiyimana', issued: '10/05/2024', expires: `10/05/${nextYear}` });
    const res = await submit(
      client,
      {
        title: `Kivu Solar Kiosks ${unique()}`,
        type: 'company',
        sector: 'Energy',
        stage: 'Growth',
        summary: 'Pay-as-you-go solar kiosks for rural trading centres around Lake Kivu.',
        description:
          'Kivu Solar installs pay-as-you-go solar charging kiosks in rural trading centres, renting batteries and lamps to households without grid electricity around Lake Kivu.',
        companyName: 'Kivu Solar Ltd',
        companyNumber: number,
        relationshipToCompany: 'Authorised representative',
        publicationConsent: 'true',
        similarityAcknowledged: 'true',
      },
      { rdbCertificate: [rdb, 'rdb.pdf'] }
    );
    expect(res.status).toBe(201);
    await whenIdle();
    const doc = await Document.findOne({ where: { projectId: res.body.project.id, kind: 'rdb_certificate' } });
    expect(doc.flag).toBe('suspicious');
    expect(doc.extractionJson.extractedName).toBe('Eric Nshimiyimana');
    expect((await Project.findByPk(res.body.project.id)).status).not.toBe('approved');
  });
});

describe('Verify a Project (FR14)', () => {
  test('only approved, consented profiles are returned; everything else is neutral', async () => {
    const { client } = await approvedGraduate();
    const consented = (await submit(client, ideaFields({ similarityAcknowledged: 'true' }))).body.project;
    const privateOne = (await submit(client, ideaFields({ publicationConsent: 'false', similarityAcknowledged: 'true' }))).body.project;

    const pending = await agent().get(`/api/public/verify/${consented.projectCode}`);
    expect(pending.status).toBe(404);
    const neutral = pending.body.error;

    await approveProjectDirectly(consented.id);
    await approveProjectDirectly(privateOne.id);

    const ok = await agent().get(`/api/public/verify/${consented.projectCode.toLowerCase()}`);
    expect(ok.status).toBe(200);
    expect(ok.body.project.title).toBe(consented.title);
    expect(ok.body.project.founder.name).toBe('Amina Uwase');
    expect(ok.body.project).not.toHaveProperty('documents');
    expect(ok.body.project).not.toHaveProperty('reviewNote');
    expect(ok.body.disclaimer).toMatch(/not proof of legal registration/);

    const hidden = await agent().get(`/api/public/verify/${privateOne.projectCode}`);
    expect(hidden.status).toBe(404);
    expect(hidden.body.error).toBe(neutral);
    const garbage = await agent().get('/api/public/verify/not-a-code');
    expect(garbage.body.error).toBe(neutral);
  });
});

describe('similarity detection and clarification (FR16)', () => {
  const base = {
    title: 'SolarPay Kigali Moto Charging',
    description:
      'SolarPay builds solar battery swapping stations for electric motorcycle taxi riders in Kigali, letting moto drivers swap a charged battery in two minutes and pay per swap with mobile money.',
  };

  test('near-duplicate → warning first, then Similarity Flagged with clarification email; distinct → not flagged', async () => {
    const { client: ownerA } = await approvedGraduate('Amina Uwase');
    const a = await submit(ownerA, {
      ...ideaFields(),
      ...base,
      sector: 'Energy',
      summary: 'Battery swapping for electric moto taxis.',
      similarityAcknowledged: 'true',
    });
    expect(a.status).toBe(201);
    await approveProjectDirectly(a.body.project.id);

    const { client: ownerB, email: emailB } = await approvedGraduate('Jean Paul Habimana');
    const duplicate = {
      ...ideaFields(),
      title: 'SolarPay Kigali – Moto Charging',
      description:
        'SolarPay builds solar battery swapping stations for electric motorcycle taxi riders in Kigali, so moto drivers swap a charged battery in two minutes and pay per swap by mobile money.',
      sector: 'Energy',
      summary: 'Battery swapping stations for electric moto taxis in Kigali.',
    };
    const warning = await submit(ownerB, duplicate);
    expect(warning.status).toBe(409);
    expect(warning.body.code).toBe('SIMILARITY_WARNING');
    expect(warning.body.matches.length).toBeGreaterThanOrEqual(1);
    expect(warning.body.matches.length).toBeLessThanOrEqual(3);
    expect(warning.body.matches[0].score).toBeGreaterThanOrEqual(0.75);

    const flagged = await submit(ownerB, { ...duplicate, similarityAcknowledged: 'true' });
    expect(flagged.status).toBe(201);
    expect(flagged.body.project.status).toBe('similarity_flagged');
    expect(flagged.body.project.similarityMatches.length).toBeGreaterThanOrEqual(1);
    const mail = await Notification.findOne({ where: { toEmail: emailB, subject: { [require('sequelize').Op.like]: 'Clarification needed%' } } });
    expect(mail).not.toBeNull();

    // Editing is blocked; clarification is the way forward and keeps it out of approval.
    const edit = await ownerB.patch(`/api/projects/${flagged.body.project.id}`).field('title', 'x');
    expect(edit.status).toBe(400);
    const statement = 'Our stations serve fleet operators in Musanze, not Kigali, and we lease batteries monthly instead of per swap.';
    // The founder declaration is required.
    const undeclared = await ownerB.post(`/api/projects/${flagged.body.project.id}/clarification`).field('clarification', statement);
    expect(undeclared.status).toBe(400);
    expect(undeclared.body.fields.declaration).toBeDefined();
    const clarified = await ownerB
      .post(`/api/projects/${flagged.body.project.id}/clarification`)
      .field('clarification', statement)
      .field('declaration', 'true');
    expect(clarified.status).toBe(200);
    // The owner sees the matched project's summary for the comparison (it is approved and consented).
    const detail = await ownerB.get(`/api/projects/${flagged.body.project.id}`);
    expect(detail.body.project.similarityMatches[0].summary).toBeTruthy();
    expect(clarified.body.project.similarityStatus).toBe('clarified');
    expect(clarified.body.project.status).toBe('similarity_flagged');

    const distinct = await submit(ownerB, ideaFields({ title: `Maternal SMS reminders ${unique()}`, sector: 'Healthcare', description: 'An SMS service that reminds expectant mothers in rural districts about antenatal clinic visits and vaccination dates for newborns, run with community health workers.' }));
    expect(distinct.status).toBe(201);
    expect(distinct.body.project.status).toBe('pending_review');
  });
});

describe('revisions and private documents', () => {
  test('editing an approved project sends it back to review with the same code', async () => {
    const { client } = await approvedGraduate();
    // Unique wording per run so it never matches earlier approved test projects.
    const token = unique();
    const own = {
      sector: 'Creative & Media',
      description: `Studio ${token} records oral histories from elders in Huye and Nyanza and turns them into illustrated audio books for primary schools, archived with the district libraries.`,
    };
    const created = (await submit(client, ideaFields({ ...own, title: `Story studio ${token}` }))).body.project;
    expect(created.status).toBe('pending_review');
    await approveProjectDirectly(created.id);
    const fields = ideaFields({ ...own, title: `${created.title} v2` });
    let req = client.patch(`/api/projects/${created.id}`);
    for (const [k, v] of Object.entries(fields)) req = req.field(k, v);
    const res = await req;
    expect(res.status).toBe(200);
    expect(res.body.project.status).toBe('pending_review');
    expect(res.body.project.projectCode).toBe(created.projectCode);
  });

  test('evidence downloads are limited to the uploader', async () => {
    const { client } = await approvedGraduate();
    const number = companyCode();
    const rdb = await buildRdbPdf({ company: 'Doc Test Ltd', number, director: 'Amina Uwase', issued: '01/01/2025', expires: `01/01/${nextYear}` });
    const res = await submit(
      client,
      { ...ideaFields(), type: 'company', companyName: 'Doc Test Ltd', companyNumber: number, relationshipToCompany: 'Founder', similarityAcknowledged: 'true' },
      { rdbCertificate: [rdb, 'rdb.pdf'] }
    );
    const docId = res.body.project.documents[0].id;
    const own = await client.get(`/api/documents/${docId}/file`);
    expect(own.status).toBe(200);
    expect(own.headers['content-type']).toBe('application/pdf');
    expect(own.headers['cache-control']).toMatch(/no-store/);

    const { client: stranger } = await approvedGraduate('Someone Else');
    expect((await stranger.get(`/api/documents/${docId}/file`)).status).toBe(404);
    expect((await agent().get(`/api/documents/${docId}/file`)).status).toBe(401);
  });
});
