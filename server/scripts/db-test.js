// Verifies the Aiven MySQL connection over verified TLS.
const { sequelize } = require('../src/config/database');
const env = require('../src/config/env');

(async () => {
  try {
    await sequelize.authenticate();
    const [[row]] = await sequelize.query('SELECT VERSION() AS version, DATABASE() AS db');
    const [[ssl]] = await sequelize.query("SHOW SESSION STATUS LIKE 'Ssl_cipher'");
    console.log(`Connected to ${env.db.host}:${env.db.port}`);
    console.log(`  MySQL ${row.version}, database "${row.db}"`);
    console.log(`  TLS cipher in use: ${ssl.Value || '(none!)'}`);
    process.exitCode = ssl.Value ? 0 : 1;
  } catch (err) {
    console.error('Database connection failed:', err.message);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
})();
