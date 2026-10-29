// Graduate-only summaries. Every route is behind requireRole('graduate') and
// reads only the signed-in graduate's own rows.
const express = require('express');
const { requireRole } = require('../middleware/auth');
const { periodSchema } = require('../services/analytics');
const { graduateSummary } = require('../services/memberSummary');

const router = express.Router();
router.use(requireRole('graduate'));

// Activity page: counts for the graduate's own projects, introductions and
// applications over a period. Project views are a count only; cached 60 seconds.
router.get('/activity-summary', async (req, res) => {
  const { period } = periodSchema.parse(req.query);
  res.json(await graduateSummary(req.user, period));
});

module.exports = router;
