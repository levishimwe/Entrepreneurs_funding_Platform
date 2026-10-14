const path = require('path');

const SERVER_ROOT = path.resolve(__dirname, '..', '..');
require('dotenv').config({ path: path.join(SERVER_ROOT, '.env'), quiet: true });

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const list = (value) =>
  String(value || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);

const isTest = process.env.NODE_ENV === 'test';
const isProduction = process.env.NODE_ENV === 'production';
// CLIENT_URL may list several origins (e.g. the Vercel production domain and a
// custom domain); the first one is used in email links.
const clientUrls = list(process.env.CLIENT_URL || 'http://localhost:5173').map((u) => u.replace(/\/+$/, ''));

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isTest,
  isProduction,
  port: Number(process.env.PORT || 4000),
  clientUrl: clientUrls[0],
  corsOrigins: clientUrls,
  serverRoot: SERVER_ROOT,
  // Number of proxies in front of Express. Behind Vercel's rewrite and Render's
  // load balancer this is 2, so req.ip (rate limits) is the visitor's address.
  trustProxy: Number(process.env.TRUST_PROXY || 1),

  cookie: {
    // Secure in production (HTTPS only). The API is served same-origin through
    // the Vercel rewrite, so SameSite=Lax works and blocks cross-site posts.
    secure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : isProduction,
    sameSite: process.env.COOKIE_SAMESITE || 'lax',
  },

  db: {
    host: required('DB_HOST'),
    port: Number(process.env.DB_PORT || 3306),
    // Tests run against a separate database on the same Aiven instance.
    name: isTest ? process.env.DB_NAME_TEST || 'alu_funding_test' : required('DB_NAME'),
    user: required('DB_USER'),
    password: required('DB_PASSWORD'),
    sslCaPath: path.resolve(SERVER_ROOT, process.env.DB_SSL_CA || './certs/ca.pem'),
    // Used when the CA file is absent (e.g. on Render): the PEM text itself,
    // or the PEM base64-encoded on one line.
    sslCaCert: process.env.DB_CA_CERT || '',
  },

  jwtSecret: required('JWT_SECRET'),
  sessionHours: Number(process.env.SESSION_HOURS || 12),

  alumniDomains: list(process.env.ALUMNI_EMAIL_DOMAINS || 'alueducation.com').map((d) => d.toLowerCase()),

  storage: {
    // Tests always use the local driver, whatever server/.env says.
    driver: isTest ? 'local' : process.env.STORAGE_DRIVER || 'local',
    localDir: path.resolve(SERVER_ROOT, process.env.UPLOAD_DIR || (isTest ? './uploads-test' : './uploads')),
    s3: {
      bucket: process.env.S3_BUCKET || '',
      endpoint: process.env.S3_ENDPOINT || '',
      region: process.env.S3_REGION || 'auto',
      accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
    },
  },

  ocr: {
    // Each OCR thread holds its own Tesseract engine (~150 MB). Keep 1 on small
    // instances (Render free/starter: 512 MB).
    poolSize: Math.max(1, Number(process.env.OCR_POOL_SIZE || 1)),
    // An idle OCR thread exits after this long, releasing its memory.
    idleMs: Number(process.env.OCR_IDLE_MS || 60000),
  },

  mail: {
    // smtp (Nodemailer) | resend | brevo. Tests always use the in-memory JSON transport.
    driver: isTest ? 'json' : (process.env.EMAIL_DRIVER || 'smtp').toLowerCase(),
    apiKey: isTest ? '' : process.env.EMAIL_API_KEY || '',
    host: isTest ? '' : process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    user: isTest ? '' : process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from:
      process.env.MAIL_FROM ||
      (process.env.SMTP_USER ? `"ALU Ventures" <${process.env.SMTP_USER}>` : 'ALU Ventures <no-reply@aluventures.local>'),
  },
};

module.exports = env;
