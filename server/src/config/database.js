const fs = require('fs');
const { Sequelize } = require('sequelize');
const env = require('./env');

// Aiven requires TLS. We verify the server certificate against Aiven's CA;
// verification is never disabled. The CA comes from server/certs/ca.pem in
// development, or from DB_CA_CERT where there is no file (e.g. on Render).
function loadCa({ path = env.db.sslCaPath, inline = env.db.sslCaCert } = {}) {
  if (path && fs.existsSync(path)) return fs.readFileSync(path, 'utf8');
  if (inline) {
    // Accept the PEM as pasted (real newlines or literal "\n"), or base64 of it.
    let pem = inline.trim().replace(/\\n/g, '\n');
    if (!pem.includes('-----BEGIN')) pem = Buffer.from(pem, 'base64').toString('utf8');
    if (!pem.includes('-----BEGIN CERTIFICATE-----')) {
      throw new Error('DB_CA_CERT is not a PEM certificate (paste Aiven’s CA certificate, or its base64).');
    }
    return pem;
  }
  throw new Error(`No database CA certificate: ${path} does not exist and DB_CA_CERT is not set.`);
}

function sslOptions() {
  return { ca: loadCa(), rejectUnauthorized: true };
}

function createSequelize(databaseName = env.db.name) {
  return new Sequelize(databaseName, env.db.user, env.db.password, {
    host: env.db.host,
    port: env.db.port,
    dialect: 'mysql',
    // A TLS handshake to a remote Aiven host can exceed mysql2's 10 s default on
    // a slow link or a cold-starting instance.
    dialectOptions: { ssl: sslOptions(), connectTimeout: Number(process.env.DB_CONNECT_TIMEOUT_MS || 20000) },
    timezone: '+00:00',
    logging: process.env.DB_LOG === '1' ? console.log : false,
    pool: { max: 10, min: 0, idle: 10000, acquire: 30000 },
    define: { underscored: true, timestamps: true },
  });
}

const sequelize = createSequelize();

module.exports = { sequelize, createSequelize, sslOptions, loadCa };
