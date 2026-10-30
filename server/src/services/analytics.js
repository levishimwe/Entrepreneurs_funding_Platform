// Dashboard charts for the administrator and staff consoles. Aggregates only:
// counts grouped in SQL, never names of people, emails, phones, documents or
// project codes. Each response is cached in memory for 60 seconds so a busy
// console does not hammer the remote database.
const { QueryTypes } = require('sequelize');
const { z } = require('zod');
const { sequelize } = require('../models');
const { getDashboardStats } = require('./dashboard');

const PERIODS = ['week', 'month', 'year'];
const periodSchema = z.object({ period: z.enum(PERIODS, { message: 'Period must be week, month or year.' }).default('month') });

const DAY = 864e5;
const CACHE_MS = 60 * 1000;
const cache = new Map();

async function cached(key, build) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  const value = await build();
  cache.set(key, { at: Date.now(), value });
  return value;
}
const clearAnalyticsCache = () => cache.clear();

// Week and month are daily buckets ending today (UTC); year is 12 monthly
// buckets ending this month. The previous period is the same span before it.
function periodWindow(period, now = new Date()) {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  if (period === 'year') {
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));
    const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    const prevFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 23, 1));
    const keys = Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + i, 1)).toISOString().slice(0, 7));
    return { period, unit: 'month', format: '%Y-%m', from, to, prevFrom, keys };
  }
  const days = period === 'week' ? 7 : 30;
  const from = new Date(today - (days - 1) * DAY);
  const to = new Date(today + DAY);
  const prevFrom = new Date(from.getTime() - days * DAY);
  const keys = Array.from({ length: days }, (_, i) => new Date(from.getTime() + i * DAY).toISOString().slice(0, 10));
  return { period, unit: 'day', format: '%Y-%m-%d', from, to, prevFrom, keys };
}

const rows = (sql, replacements) => sequelize.query(sql, { type: QueryTypes.SELECT, replacements });
const num = (v) => Number(v) || 0;

// Counts per bucket for one timestamp column; `where` is a fixed SQL fragment.
async function series(w, table, column, where = '1=1', replacements = {}) {
  const found = await rows(
    `SELECT DATE_FORMAT(${column}, :format) AS k, COUNT(*) AS n FROM ${table}
     WHERE ${column} >= :from AND ${column} < :to AND ${where} GROUP BY k`,
    { format: w.format, from: w.from, to: w.to, ...replacements }
  );
  const byKey = Object.fromEntries(found.map((r) => [r.k, num(r.n)]));
  return w.keys.map((k) => byKey[k] || 0);
}

// The count in this period and in the one before, in one query.
async function compare(w, table, column, where = '1=1', replacements = {}) {
  const [r] = await rows(
    `SELECT COALESCE(SUM(${column} >= :from), 0) AS cur, COALESCE(SUM(${column} < :from), 0) AS prev FROM ${table}
     WHERE ${column} >= :prevFrom AND ${column} < :to AND ${where}`,
    { from: w.from, prevFrom: w.prevFrom, to: w.to, ...replacements }
  );
  return { current: num(r.cur), previous: num(r.prev) };
}

// Percentage change, or null when there is nothing to compare with.
const change = ({ current, previous }) => (previous > 0 ? Math.round(((current - previous) / previous) * 100) : null);

async function grouped(sql, replacements) {
  return (await rows(sql, replacements)).map((r) => ({ key: r.k ?? null, value: num(r.n) }));
}

const PERIOD_WORD = { week: 'this week', month: 'in the last 30 days', year: 'in the last 12 months' };
const kpi = (key, label, value, cmp, hintWord, period) => ({
  key,
  label,
  value,
  hint: cmp ? `${cmp.current} ${hintWord} ${PERIOD_WORD[period]}` : null,
  change: cmp ? change(cmp) : null,
});

const MEMBER = "status NOT IN ('pending_email','archived')";
const STATUS_GROUPS = [
  ['submitted', 'Submitted', ['pending_review', 'revision_required', 'similarity_flagged']],
  ['approved', 'Approved & seeking investment', ['approved']],
  // Fully funded means the Fully Funded status only; projects at the
  // two-investor limit have their own slice.
  ['funded', 'Fully funded', ['funded']],
  ['limit', 'Two investors confirmed', ['investor_limit_reached']],
  ['rejected', 'Rejected', ['rejected']],
  ['archived', 'Archived', ['archived']],
];
const STATUS_LABEL = {
  pending_review: 'Pending review',
  revision_required: 'Revision required',
  similarity_flagged: 'Similarity flagged',
  approved: 'Approved & seeking',
  funded: 'Fully funded',
  investor_limit_reached: 'Two investors confirmed',
  rejected: 'Rejected',
  archived: 'Archived',
};

// Bars: the largest groups, with the rest folded into "Other".
function topBars(list, limit = 8) {
  const sorted = list.filter((r) => r.value > 0).sort((a, b) => b.value - a.value);
  const top = sorted.slice(0, limit).map((r) => ({ label: r.key || 'Not set', value: r.value }));
  const rest = sorted.slice(limit).reduce((s, r) => s + r.value, 0);
  return rest ? [...top, { label: 'Other', value: rest }] : top;
}

async function buildAdmin(period) {
  const w = periodWindow(period);
  const [
    stats,
    graduates,
    investors,
    submitted,
    approved,
    funded,
    openOpps,
    regGraduates,
    regInvestors,
    submittedSeries,
    fundedSeries,
    byStatus,
    bySource,
    bySector,
    byStage,
    verificationChecks,
    intros,
    introsSeries,
    decision,
  ] = await Promise.all([
    getDashboardStats(),
    compare(w, 'users', 'created_at', `role = 'graduate' AND ${MEMBER}`),
    compare(w, 'users', 'created_at', `role = 'investor' AND ${MEMBER}`),
    compare(w, 'projects', 'submitted_at'),
    compare(w, 'projects', 'approved_at', "status IN ('approved','funded','investor_limit_reached')"),
    compare(w, 'projects', 'closed_at', "status = 'funded'"),
    rows("SELECT COUNT(*) AS n FROM opportunities WHERE status = 'published' AND deadline > :now", { now: new Date() }),
    series(w, 'users', 'created_at', `role = 'graduate' AND ${MEMBER}`),
    series(w, 'users', 'created_at', `role = 'investor' AND ${MEMBER}`),
    series(w, 'projects', 'submitted_at'),
    series(w, 'projects', 'closed_at', "status = 'funded'"),
    grouped('SELECT status AS k, COUNT(*) AS n FROM projects GROUP BY status'),
    // Fully funded projects marked before the source was recorded count as investor.
    grouped(
      "SELECT COALESCE(funding_source, 'investor') AS k, COUNT(*) AS n FROM projects WHERE status = 'funded' GROUP BY k"
    ),
    grouped("SELECT sector AS k, COUNT(*) AS n FROM projects WHERE status <> 'archived' GROUP BY sector"),
    grouped("SELECT stage AS k, COUNT(*) AS n FROM projects WHERE status <> 'archived' GROUP BY stage"),
    grouped(
      "SELECT CASE WHEN flag = 'likely_valid' THEN 'likely_valid' WHEN flag = 'suspicious' THEN 'suspicious' ELSE 'not_checked' END AS k, COUNT(*) AS n FROM documents WHERE kind IN ('rdb_certificate', 'rra_certificate') GROUP BY k"
    ),
    grouped('SELECT status AS k, COUNT(*) AS n FROM introductions GROUP BY status'),
    series(w, 'introductions', 'created_at'),
    // Days from submission to the first approve or reject decision, for
    // decisions made in this period and in the previous one.
    rows(
      `SELECT AVG(CASE WHEN d.first_at >= :from THEN TIMESTAMPDIFF(HOUR, p.submitted_at, d.first_at) END) AS cur,
              AVG(CASE WHEN d.first_at < :from THEN TIMESTAMPDIFF(HOUR, p.submitted_at, d.first_at) END) AS prev,
              SUM(d.first_at >= :from) AS n
       FROM projects p
       JOIN (SELECT project_id, MIN(created_at) AS first_at FROM reviews
             WHERE decision IN ('approve','reject') AND project_id IS NOT NULL GROUP BY project_id) d ON d.project_id = p.id
       WHERE p.submitted_at IS NOT NULL AND d.first_at >= :prevFrom AND d.first_at < :to`,
      { from: w.from, prevFrom: w.prevFrom, to: w.to }
    ),
  ]);

  const total = (key) => stats.cards.find((c) => c.key === key).value;
  const status = Object.fromEntries(byStatus.map((r) => [r.key, r.value]));
  const sum = (keys) => keys.reduce((s, k) => s + (status[k] || 0), 0);
  const days = (hours) => (hours === null || hours === undefined ? null : Math.round((Number(hours) / 24) * 10) / 10);
  const [d] = decision;

  return {
    period: { key: period, unit: w.unit, from: w.from, to: w.to, buckets: w.keys },
    // The original totals and review queues stay part of the response.
    cards: stats.cards,
    queues: stats.queues,
    kpis: [
      kpi('graduates', 'Registered graduates', total('graduates'), graduates, 'new', period),
      kpi('investors', 'Investors and sponsors', total('investors'), investors, 'new', period),
      kpi('submitted', 'Submitted projects', total('submitted'), submitted, 'submitted', period),
      kpi('approved', 'Approved projects', total('approved'), approved, 'approved', period),
      kpi('funded', 'Fully funded', sum(['funded']), funded, 'funded', period),
      { key: 'openOpportunities', label: 'Open opportunities', value: num(openOpps[0].n), hint: 'Published, before the deadline', change: null },
    ],
    charts: {
      activity: [
        { key: 'registrations', label: 'New registrations', values: regGraduates.map((n, i) => n + regInvestors[i]) },
        { key: 'submitted', label: 'Submitted projects', values: submittedSeries },
      ],
      registrationsByRole: [
        { key: 'graduate', label: 'Graduates', values: regGraduates },
        { key: 'investor', label: 'Investors and sponsors', values: regInvestors },
      ],
      fundedOverTime: [{ key: 'funded', label: 'Projects fully funded', values: fundedSeries }],
      introductionsOverTime: [{ key: 'introductions', label: 'Introductions requested', values: introsSeries }],
      projectsByStatus: STATUS_GROUPS.map(([key, label, keys]) => ({ key, label, value: sum(keys) })),
      projectStatusDetail: Object.keys(STATUS_LABEL).map((k) => ({ label: STATUS_LABEL[k], value: status[k] || 0 })),
      fundingSource: [
        { key: 'investor', label: 'Investor', value: bySource.find((r) => r.key === 'investor')?.value || 0 },
        { key: 'competition', label: 'Competition', value: bySource.find((r) => r.key === 'competition')?.value || 0 },
      ],
      projectsBySector: topBars(bySector),
      projectsByStage: topBars(byStage),
      verificationChecks: [
        { key: 'likely_valid', label: 'Likely valid', value: verificationChecks.find((r) => r.key === 'likely_valid')?.value || 0 },
        { key: 'suspicious', label: 'Suspicious', value: verificationChecks.find((r) => r.key === 'suspicious')?.value || 0 },
        { key: 'not_checked', label: 'Not checked', value: verificationChecks.find((r) => r.key === 'not_checked')?.value || 0 },
      ],
      introductionsByStatus: ['requested', 'accepted', 'declined'].map((k) => ({
        key: k,
        label: { requested: 'Requested', accepted: 'Accepted', declined: 'Declined' }[k],
        value: intros.find((r) => r.key === k)?.value || 0,
      })),
    },
    decisionDays: { current: days(d.cur), previous: days(d.prev), decisions: num(d.n) },
  };
}

async function buildStaff(period) {
  const w = periodWindow(period);
  const now = new Date();
  const [received, receivedSeries, selected, notSelected, results, [open], [totalResults], decisions, perOpportunity, closing] = await Promise.all([
    compare(w, 'applications', 'submitted_at'),
    series(w, 'applications', 'submitted_at'),
    compare(w, 'applications', 'decided_at', "status = 'selected'"),
    compare(w, 'applications', 'decided_at', "status = 'not_selected'"),
    compare(w, 'competition_results', 'decided_at', "status = 'approved'"),
    rows("SELECT COUNT(*) AS n FROM opportunities WHERE status = 'published' AND deadline > :now", { now }),
    rows("SELECT COUNT(*) AS n FROM competition_results WHERE status = 'approved'"),
    grouped(
      "SELECT CASE WHEN status IN ('submitted','shortlisted') THEN 'awaiting' ELSE status END AS k, COUNT(*) AS n FROM applications GROUP BY k"
    ),
    rows(
      `SELECT o.title AS label, COUNT(a.id) AS n FROM applications a JOIN opportunities o ON o.id = a.opportunity_id
       WHERE o.status <> 'archived' GROUP BY o.id, o.title ORDER BY n DESC, o.id DESC LIMIT 8`
    ),
    rows(
      `SELECT o.id, o.title, o.deadline, o.link_only AS linkOnly, o.type,
              (SELECT COUNT(*) FROM applications a WHERE a.opportunity_id = o.id) AS applicants
       FROM opportunities o WHERE o.status = 'published' AND o.deadline > :now ORDER BY o.deadline ASC LIMIT 5`,
      { now }
    ),
  ]);
  const decided = (k) => decisions.find((r) => r.key === k)?.value || 0;
  const all = decided('awaiting') + decided('selected') + decided('not_selected');

  return {
    period: { key: period, unit: w.unit, from: w.from, to: w.to, buckets: w.keys },
    kpis: [
      { key: 'openOpportunities', label: 'Open opportunities', value: num(open.n), hint: 'Published, before the deadline', change: null },
      { key: 'awaiting', label: 'Awaiting a decision', value: decided('awaiting'), hint: 'Submitted or shortlisted', change: null },
      kpi('applicants', 'Total applicants', all, received, 'received', period),
      kpi('selected', 'Selected', decided('selected'), selected, 'selected', period),
      kpi('notSelected', 'Not selected', decided('not_selected'), notSelected, 'not selected', period),
      kpi('results', 'Results published', num(totalResults.n), results, 'published', period),
    ],
    charts: {
      applicationsReceived: [{ key: 'applications', label: 'Applications received', values: receivedSeries }],
      applicationsByDecision: [
        { key: 'awaiting', label: 'Awaiting', value: decided('awaiting') },
        { key: 'selected', label: 'Selected', value: decided('selected') },
        { key: 'not_selected', label: 'Not selected', value: decided('not_selected') },
      ],
      applicantsPerOpportunity: perOpportunity.map((r) => ({ label: r.label, value: num(r.n) })),
    },
    closingSoon: closing.map((o) => ({
      id: Number(o.id),
      title: o.title,
      type: o.type,
      deadline: new Date(o.deadline).toISOString(),
      linkOnly: Boolean(Number(o.linkOnly)),
      applicants: num(o.applicants),
    })),
  };
}

const adminDashboard = (period) => cached(`admin:${period}`, () => buildAdmin(period));
const staffDashboard = (period) => cached(`staff:${period}`, () => buildStaff(period));

module.exports = { adminDashboard, staffDashboard, periodSchema, periodWindow, clearAnalyticsCache, PERIODS, cached, series, compare, change, grouped, rows, num, topBars };
