// Activity summaries for the graduate and investor Activity pages. Counts only,
// scoped to the signed-in user's own rows plus public-safe platform totals:
// never who viewed a project, never another member's records, and never names
// of people, emails, phones, documents or project codes. Cached per user for 60
// seconds.
const { cached, change, compare, grouped, num, periodWindow, rows, series, topBars } = require('./analytics');
const { nextStepsFor } = require('./nextSteps');

// Audit actions that never appear in a member's own activity.
const HIDDEN_ACTIONS = ['auth.login', 'auth.password_reset_requested', 'document.viewed', 'project.viewed_by_investor'];
const VIEW_ACTION = 'project.viewed_by_investor';
const PERIOD_WORD = { week: 'this week', month: 'in the last 30 days', year: 'in the last 12 months' };

const kpi = (key, label, value, cmp, word, period, hint) => ({
  key,
  label,
  value,
  hint: hint ?? (cmp ? `${cmp.current} ${word} ${PERIOD_WORD[period]}` : null),
  change: cmp ? change(cmp) : null,
});

// Where an introduction stands, furthest step first.
const STAGE_SQL = `CASE
  WHEN investment_recorded_at IS NOT NULL THEN 'investment'
  WHEN status = 'accepted' AND investor_confirmed = 1 AND graduate_confirmed = 1 THEN 'meeting'
  WHEN status = 'accepted' THEN 'accepted'
  WHEN status = 'declined' THEN 'declined'
  ELSE 'pending' END`;
const STAGES = [
  ['pending', 'Pending'],
  ['accepted', 'Accepted'],
  ['declined', 'Declined'],
  ['meeting', 'Meeting confirmed'],
  ['investment', 'Investment confirmed'],
];
const byStage = (found) => STAGES.map(([key, label]) => ({ key, label, value: found.find((r) => r.key === key)?.value || 0 }));
const PROJECT_STATUS = {
  pending_review: 'Pending review',
  revision_required: 'Revision requested',
  similarity_flagged: 'Similarity check',
  approved: 'Seeking investment',
  funded: 'Fully funded',
  investor_limit_reached: 'Two investors confirmed',
  rejected: 'Not approved',
  archived: 'Archived',
};
const ids = (list) => (list.length ? list : [0]);
const periodOut = (w, period) => ({ key: period, unit: w.unit, from: w.from, to: w.to, buckets: w.keys });

async function buildGraduate(user, period) {
  const w = periodWindow(period);
  const uid = user.id;
  const [projects, applications, posts, steps] = await Promise.all([
    rows('SELECT id, status, updated_at FROM projects WHERE owner_id = :uid ORDER BY updated_at DESC, id DESC', { uid }),
    rows('SELECT id FROM applications WHERE applicant_id = :uid', { uid }),
    rows('SELECT id FROM graduate_posts WHERE graduate_id = :uid', { uid }),
    nextStepsFor(user),
  ]);
  const pids = ids(projects.map((p) => p.id));
  const own = { uid, pids, aids: ids(applications.map((a) => a.id)), postIds: ids(posts.map((p) => p.id)), hidden: HIDDEN_ACTIONS };
  // The same scope as the account activity feed.
  const mine = `(actor_id = :uid OR (entity_type = 'user' AND entity_id = :uid) OR (entity_type = 'project' AND entity_id IN (:pids))
    OR (entity_type = 'application' AND entity_id IN (:aids)) OR (entity_type = 'post' AND entity_id IN (:postIds))) AND action NOT IN (:hidden)`;
  const views = `action = '${VIEW_ACTION}' AND entity_type = 'project' AND entity_id IN (:pids)`;

  const [received, accepted, applied, viewed, [introTotals], [appTotal], [viewTotal], events, viewSeries, stages, decisions] = await Promise.all([
    compare(w, 'introductions', 'created_at', 'project_id IN (:pids)', { pids }),
    compare(w, 'introductions', 'accepted_at', "project_id IN (:pids) AND status = 'accepted'", { pids }),
    compare(w, 'applications', 'submitted_at', 'applicant_id = :uid', { uid }),
    compare(w, 'audit_logs', 'created_at', views, { pids }),
    rows("SELECT COUNT(*) AS n, COALESCE(SUM(status = 'accepted'), 0) AS accepted FROM introductions WHERE project_id IN (:pids)", { pids }),
    rows('SELECT COUNT(*) AS n FROM applications WHERE applicant_id = :uid', { uid }),
    rows(`SELECT COUNT(*) AS n FROM audit_logs WHERE ${views}`, { pids }),
    series(w, 'audit_logs', 'created_at', mine, own),
    series(w, 'audit_logs', 'created_at', views, { pids }),
    grouped(`SELECT ${STAGE_SQL} AS k, COUNT(*) AS n FROM introductions WHERE project_id IN (:pids) GROUP BY k`, { pids }),
    grouped(
      "SELECT CASE WHEN status IN ('submitted','shortlisted') THEN 'awaiting' ELSE status END AS k, COUNT(*) AS n FROM applications WHERE applicant_id = :uid GROUP BY k",
      { uid }
    ),
  ]);
  const latest = projects.find((p) => p.status !== 'archived') || projects[0];
  const decided = (k) => decisions.find((r) => r.key === k)?.value || 0;

  return {
    period: periodOut(w, period),
    kpis: [
      {
        key: 'projectStatus',
        label: 'Project status',
        value: latest ? PROJECT_STATUS[latest.status] || latest.status : 'No project yet',
        hint: projects.length > 1 ? `Latest of ${projects.length} projects` : latest ? 'Your project' : 'Submit a project to start',
        change: null,
      },
      kpi('introductions', 'Introductions received', num(introTotals.n), received, 'received', period),
      kpi('accepted', 'Introductions accepted', num(introTotals.accepted), accepted, 'accepted', period),
      kpi('applications', 'Competition applications', num(appTotal.n), applied, 'submitted', period),
      { key: 'nextSteps', label: 'Next steps done', value: `${steps.done}/${steps.total}`, hint: steps.current ? 'Keep going' : 'All steps are done', change: null },
      // A count only: who viewed a project is never shown to its founder.
      kpi('views', 'Project views', num(viewTotal.n), viewed, 'views', period),
    ],
    charts: {
      activity: [
        { key: 'events', label: 'Your activity', values: events },
        { key: 'views', label: 'Project views', values: viewSeries },
      ],
      introductionsByStatus: byStage(stages),
      applicationsByDecision: [
        { key: 'awaiting', label: 'Awaiting', value: decided('awaiting') },
        { key: 'selected', label: 'Selected', value: decided('selected') },
        { key: 'not_selected', label: 'Not selected', value: decided('not_selected') },
      ],
      nextSteps: { done: steps.done, total: steps.total, steps: steps.steps.filter((s) => !s.notApplicable).map((s) => ({ label: s.label, done: s.done })) },
    },
  };
}

async function buildInvestor(user, period) {
  const w = periodWindow(period);
  const uid = user.id;
  const mine = 'investor_id = :uid';
  const [listed, requested, accepted, invested, [listedTotal], [totals], [sectors], sent, acceptedSeries, stages, bySector, recent] = await Promise.all([
    compare(w, 'projects', 'approved_at', "status = 'approved'"),
    compare(w, 'introductions', 'created_at', mine, { uid }),
    compare(w, 'introductions', 'accepted_at', `${mine} AND status = 'accepted'`, { uid }),
    compare(w, 'introductions', 'investment_recorded_at', mine, { uid }),
    rows("SELECT COUNT(*) AS n FROM projects WHERE status = 'approved'"),
    rows(
      `SELECT COUNT(*) AS n, COALESCE(SUM(status = 'accepted'), 0) AS accepted,
              COALESCE(SUM(status = 'accepted' AND investor_confirmed = 1 AND graduate_confirmed = 1), 0) AS meetings,
              COALESCE(SUM(investment_recorded_at IS NOT NULL), 0) AS investments
       FROM introductions WHERE ${mine}`,
      { uid }
    ),
    rows("SELECT COUNT(DISTINCT sector) AS n FROM projects WHERE status = 'approved'"),
    series(w, 'introductions', 'created_at', mine, { uid }),
    series(w, 'introductions', 'accepted_at', `${mine} AND status = 'accepted'`, { uid }),
    grouped(`SELECT ${STAGE_SQL} AS k, COUNT(*) AS n FROM introductions WHERE ${mine} GROUP BY k`, { uid }),
    grouped("SELECT sector AS k, COUNT(*) AS n FROM projects WHERE status = 'approved' GROUP BY sector"),
    rows("SELECT id, title, sector, stage, approved_at FROM projects WHERE status = 'approved' ORDER BY approved_at DESC, id DESC LIMIT 5"),
  ]);

  return {
    period: periodOut(w, period),
    kpis: [
      kpi('seeking', 'Ventures seeking investment', num(listedTotal.n), listed, 'listed', period),
      kpi('requests', 'My introduction requests', num(totals.n), requested, 'sent', period),
      kpi('accepted', 'Accepted', num(totals.accepted), accepted, 'accepted', period),
      { key: 'meetings', label: 'Meetings confirmed', value: num(totals.meetings), hint: 'Confirmed by both sides', change: null },
      kpi('investments', 'Investments recorded', num(totals.investments), invested, 'recorded', period),
      { key: 'sectors', label: 'Sectors available', value: num(sectors.n), hint: 'Among ventures seeking investment', change: null },
    ],
    charts: {
      activity: [
        { key: 'sent', label: 'Requests sent', values: sent },
        { key: 'accepted', label: 'Accepted', values: acceptedSeries },
      ],
      introductionsByStatus: byStage(stages),
      seekingBySector: topBars(bySector),
    },
    // Ventures are reached by id; codes and founder details are never sent.
    recentlyListed: recent.map((p) => ({ id: Number(p.id), title: p.title, sector: p.sector, stage: p.stage, listedAt: new Date(p.approved_at).toISOString() })),
  };
}

const graduateSummary = (user, period) => cached(`graduate:${user.id}:${period}`, () => buildGraduate(user, period));
const investorSummary = (user, period) => cached(`investor:${user.id}:${period}`, () => buildInvestor(user, period));

module.exports = { graduateSummary, investorSummary, HIDDEN_ACTIONS };
