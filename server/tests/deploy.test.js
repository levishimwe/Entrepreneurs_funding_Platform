// Deployment configuration: database CA from the environment, the S3 storage
// driver, HTTPS email providers, cookie flags and the health check. No real
// credentials or network calls: the S3 client and fetch are fakes.
const path = require('path');
const { sequelize } = require('../src/models');
const { loadCa } = require('../src/config/database');
const { s3Driver } = require('../src/services/storage/s3');
const { resendSender, brevoSender, parseAddress } = require('../src/services/emailProviders');
const { agent, loginAs, stubOcr } = require('./helpers');

stubOcr();
afterAll(() => sequelize.close());

const FAKE_PEM = '-----BEGIN CERTIFICATE-----\nMIIBszCCAVmgAwIBAgIUFAKEFAKEFAKE\n-----END CERTIFICATE-----\n';

describe('database CA certificate', () => {
  const absent = path.join(__dirname, 'no-such-ca.pem');

  test('uses the file when it exists', () => {
    const pem = loadCa({ path: path.join(__dirname, '..', 'certs', 'ca.pem'), inline: '' });
    expect(pem).toMatch(/-----BEGIN CERTIFICATE-----/);
  });

  test('falls back to DB_CA_CERT as PEM, PEM with literal \\n, or base64', () => {
    expect(loadCa({ path: absent, inline: FAKE_PEM })).toBe(FAKE_PEM.trim());
    expect(loadCa({ path: absent, inline: FAKE_PEM.trim().replace(/\n/g, '\\n') })).toBe(FAKE_PEM.trim());
    expect(loadCa({ path: absent, inline: Buffer.from(FAKE_PEM).toString('base64') })).toBe(FAKE_PEM);
  });

  test('refuses anything that is not a certificate, and says what is missing', () => {
    expect(() => loadCa({ path: absent, inline: 'not a certificate' })).toThrow(/DB_CA_CERT is not a PEM certificate/);
    expect(() => loadCa({ path: absent, inline: '' })).toThrow(/DB_CA_CERT is not set/);
  });
});

describe('S3 storage driver', () => {
  // In-memory stand-in for S3Client: records each command by its class name.
  function fakeClient() {
    const objects = new Map();
    const calls = [];
    return {
      objects,
      calls,
      async send(command) {
        const name = command.constructor.name;
        const { Key, Body, ContentType } = command.input;
        calls.push({ name, input: command.input });
        const notFound = () => Object.assign(new Error('missing'), { name: 'NoSuchKey', $metadata: { httpStatusCode: 404 } });
        if (name === 'PutObjectCommand') return objects.set(Key, { Body: Buffer.from(Body), ContentType }) && {};
        if (name === 'GetObjectCommand') {
          if (!objects.has(Key)) throw notFound();
          const body = objects.get(Key).Body;
          return { Body: { transformToByteArray: async () => new Uint8Array(body) } };
        }
        if (name === 'HeadObjectCommand') {
          if (!objects.has(Key)) throw Object.assign(new Error('missing'), { name: 'NotFound', $metadata: { httpStatusCode: 404 } });
          return {};
        }
        if (name === 'DeleteObjectCommand') return objects.delete(Key) && {};
        throw new Error(`unexpected ${name}`);
      },
    };
  }

  test('stores privately, reads back, checks existence and deletes', async () => {
    const client = fakeClient();
    const storage = s3Driver({ bucket: 'alu-private' }, { client });
    const pdf = Buffer.from('%PDF-1.4 test');
    const key = await storage.put(pdf, { prefix: 'projects/rdb_certificate', mimeType: 'application/pdf' });
    expect(key).toMatch(/^projects\/rdb_certificate\/[0-9a-f-]{36}\.pdf$/);

    const put = client.calls.find((c) => c.name === 'PutObjectCommand').input;
    expect(put).toMatchObject({ Bucket: 'alu-private', Key: key, ContentType: 'application/pdf' });
    // No ACL is ever set, so objects inherit the bucket's private default.
    expect(put.ACL).toBeUndefined();

    expect((await storage.get(key)).equals(pdf)).toBe(true);
    expect(await storage.exists(key)).toBe(true);
    await storage.remove(key);
    expect(await storage.exists(key)).toBe(false);
  });

  test('a missing object reads as ENOENT, so file routes answer 404', async () => {
    const storage = s3Driver({ bucket: 'b' }, { client: fakeClient() });
    await expect(storage.get('degree-certificates/00000000-0000-0000-0000-000000000000.pdf')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  test('rejects keys it did not generate', async () => {
    const storage = s3Driver({ bucket: 'b' }, { client: fakeClient() });
    for (const key of ['../etc/passwd', 'a/../../b.pdf', '/abs/key.pdf', 'projects/x.pdf']) {
      await expect(storage.get(key)).rejects.toThrow('Invalid storage key');
    }
  });

  test('names the missing environment variables', () => {
    expect(() => s3Driver({ bucket: '', accessKeyId: '', secretAccessKey: '' })).toThrow(
      'STORAGE_DRIVER=s3 needs S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY.'
    );
  });
});

describe('HTTPS email providers', () => {
  const message = { to: 'founder@alustudent.com', subject: 'Your code', text: 'Code 123456', html: '<p>Code 123456</p>' };
  const fakeFetch = (status, body) => {
    const calls = [];
    const fn = async (url, init) => {
      calls.push({ url, init, body: JSON.parse(init.body) });
      return { ok: status < 300, status, text: async () => JSON.stringify(body) };
    };
    fn.calls = calls;
    return fn;
  };

  test('parses the sender address', () => {
    expect(parseAddress('"ALU Ventures" <ventures@example.org>')).toEqual({ name: 'ALU Ventures', email: 'ventures@example.org' });
    expect(parseAddress('ventures@example.org')).toEqual({ email: 'ventures@example.org' });
  });

  test('Resend: bearer key, user agent and message body', async () => {
    const fetch = fakeFetch(200, { id: 'abc' });
    await resendSender({ apiKey: 're_test', from: '"ALU Ventures" <ventures@example.org>' }, fetch).send(message);
    const [call] = fetch.calls;
    expect(call.url).toBe('https://api.resend.com/emails');
    expect(call.init.headers).toMatchObject({ Authorization: 'Bearer re_test', 'User-Agent': expect.any(String) });
    expect(call.body).toEqual({ from: 'ALU Ventures <ventures@example.org>', to: ['founder@alustudent.com'], subject: 'Your code', text: 'Code 123456', html: '<p>Code 123456</p>' });
  });

  test('Brevo: api-key header and message body', async () => {
    const fetch = fakeFetch(201, { messageId: 'x' });
    await brevoSender({ apiKey: 'xkeysib-test', from: '"ALU Ventures" <ventures@example.org>' }, fetch).send(message);
    const [call] = fetch.calls;
    expect(call.url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(call.init.headers['api-key']).toBe('xkeysib-test');
    expect(call.body).toEqual({
      sender: { name: 'ALU Ventures', email: 'ventures@example.org' },
      to: [{ email: 'founder@alustudent.com' }],
      subject: 'Your code',
      textContent: 'Code 123456',
      htmlContent: '<p>Code 123456</p>',
    });
  });

  test('a rejected send throws the provider’s reason (for the outbox), never the key', async () => {
    const fetch = fakeFetch(400, { message: 'Sender not verified' });
    const sending = brevoSender({ apiKey: 'xkeysib-secret', from: 'ventures@example.org' }, fetch).send(message);
    await expect(sending).rejects.toThrow('Brevo rejected the email (HTTP 400): Sender not verified');
    await expect(sending).rejects.not.toThrow(/xkeysib-secret/);
  });
});

describe('cookies, proxy and health', () => {
  test('production cookies are Secure and SameSite=Lax; tests run without Secure', () => {
    const saved = { NODE_ENV: process.env.NODE_ENV, COOKIE_SECURE: process.env.COOKIE_SECURE };
    process.env.NODE_ENV = 'production';
    delete process.env.COOKIE_SECURE;
    jest.isolateModules(() => {
      const prod = require('../src/config/env');
      expect(prod.cookie).toEqual({ secure: true, sameSite: 'lax' });
    });
    Object.assign(process.env, saved);
  });

  test('the session cookie is HttpOnly and SameSite=Lax', async () => {
    const res = await agent()
      .post('/api/auth/login')
      .send({ email: require('./setupEnv').TEST_ACCOUNTS.admin.email, password: require('./setupEnv').TEST_ACCOUNTS.admin.password });
    expect(res.status).toBe(200);
    const cookie = res.headers['set-cookie'].find((c) => c.startsWith('alu_session='));
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
  });

  test('state-changing requests still need the CSRF header', async () => {
    const admin = await loginAs('admin');
    expect((await admin.raw.post('/api/auth/logout')).status).toBe(403);
  });

  test('trust proxy follows TRUST_PROXY', () => {
    const app = require('../src/app');
    expect(app.get('trust proxy')).toBe(require('../src/config/env').trustProxy);
  });

  test('GET /api/health reports the database and the active drivers, nothing secret', async () => {
    const res = await agent().get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', database: 'up', storage: 'local', email: 'json', uptimeSeconds: expect.any(Number) });
  });
});
