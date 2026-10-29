const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const env = require('./config/env');
const { sequelize } = require('./config/database');
const { notFoundHandler, errorHandler } = require('./middleware/errors');
const { loadUser } = require('./middleware/auth');

const app = express();

// In production the browser talks to Vercel, which proxies /api to Render's
// load balancer: TRUST_PROXY=2 makes req.ip the visitor (rate limits).
app.set('trust proxy', env.trustProxy);
app.use(helmet());
// Same-origin through the Vercel rewrite needs no CORS; this allow-list only
// matters if a client calls the API host directly.
app.use(cors({ origin: env.corsOrigins, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

// CSRF defence for the cookie-based session: state-changing requests must carry
// a custom header, which a cross-site form post cannot set (plus SameSite=Lax).
app.use('/api', (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get('X-Requested-With') !== 'fetch') {
    return res.status(403).json({ error: 'Missing request header.' });
  }
  return next();
});

// Authenticated API responses must never be cached (NFR04).
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

app.get('/api/health', async (req, res) => {
  let database = 'up';
  try {
    await sequelize.authenticate();
  } catch {
    database = 'down';
  }
  // No secrets or hostnames: only which drivers are active.
  res.status(database === 'up' ? 200 : 503).json({
    status: database === 'up' ? 'ok' : 'degraded',
    database,
    storage: env.storage.driver,
    email: env.mail.driver,
    uptimeSeconds: Math.round(process.uptime()),
  });
});

app.use('/api', loadUser);
app.use('/api/auth', require('./routes/auth'));
app.use('/api/public', require('./routes/public'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/documents', require('./routes/documents'));
app.use('/api/account', require('./routes/account'));
app.use('/api/opportunities', require('./routes/opportunities'));
app.use('/api/investor', require('./routes/investor'));
app.use('/api/introductions', require('./routes/introductions'));
app.use('/api/support', require('./routes/support'));
app.use('/api/testimonials', require('./routes/testimonials'));
app.use('/api/graduate', require('./routes/graduate'));
app.use('/api/graduates', require('./routes/graduates'));
app.use('/api/posts', require('./routes/posts'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/staff', require('./routes/staff'));

app.use('/api', notFoundHandler);
app.use(errorHandler);

module.exports = app;
