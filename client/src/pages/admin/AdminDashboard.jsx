import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { AdminPage, Loading, Messages, StatTile } from '../../components/admin';
import { BarList, ChartCard, Donut, KpiCard, LineChart, PERIOD_SUBTITLE, PERIOD_VERSUS, PeriodSelect, Tabs, bucketLabels } from '../../components/charts';

// Where each total leads (the filtered list behind it).
const LINKS = {
  graduates: '/app/admin/graduates?status=approved',
  investors: '/app/admin/investors?status=approved',
  opportunities: '/app/admin/opportunities',
  openOpportunities: '/app/admin/opportunities',
  submitted: '/app/admin/projects?status=pending_review',
  approved: '/app/admin/projects?status=approved',
  seeking: '/app/admin/projects?status=approved',
  similarity: '/app/admin/projects?status=similarity_flagged',
  funded: '/app/admin/projects?status=funded',
  fundedByCompetition: '/app/admin/results?status=approved',
  oneInvestor: '/app/admin/projects?status=approved',
  limit: '/app/admin/projects?status=investor_limit_reached',
  introductions: '/app/admin/introductions?status=all',
  rdbRate: '/app/admin/projects?status=pending_review',
};

const TABS = [
  ['overview', 'Overview'],
  ['projects', 'Projects'],
  ['people', 'People'],
  ['funding', 'Funding'],
];
// The original totals, each on the tab it belongs to.
const COUNTERS = {
  overview: ['opportunities'],
  projects: ['seeking', 'similarity', 'rdbRate'],
  people: ['graduates', 'investors'],
  funding: ['funded', 'fundedByCompetition', 'oneInvestor', 'limit', 'introductions'],
};
const TONES = {
  projectsByStatus: { submitted: 'amber', approved: 'blue', funded: 'green', limit: 'green-light', rejected: 'grey', archived: 'grey-light' },
  fundingSource: { investor: 'blue', competition: 'green' },
  degreeChecks: { likely_valid: 'green', suspicious: 'amber', not_checked: 'grey' },
  introductionsByStatus: { requested: 'amber', accepted: 'green', declined: 'grey' },
};
const toned = (data, tones) => data.map((d) => ({ ...d, tone: tones[d.key] }));

function NeedsAttention({ queues }) {
  const q = queues;
  const attention = [
    ['Graduates to review', q.pendingGraduates, '/app/admin/graduates?status=pending'],
    ['Investors to review', q.pendingInvestors, '/app/admin/investors?status=pending'],
    ['Projects to review', q.pendingProjects, '/app/admin/projects?status=pending_review'],
    ['Similarity flags', q.similarityFlagged, '/app/admin/projects?status=similarity_flagged'],
    ['Competition results to approve', q.pendingResults, '/app/admin/results?status=pending'],
    ['Open requests', q.openRequests, '/app/admin/requests?status=open'],
  ].filter(([, n]) => n > 0);
  return (
    <section className="adm-card mb-6" aria-label="Needs attention">
      <h2 className="!m-0 border-b border-[var(--adm-border)] px-4 py-3">Needs attention</h2>
      {attention.length === 0 ? (
        <p className="adm-muted px-4 py-3">Nothing is waiting for review.</p>
      ) : (
        <ul>
          {attention.map(([label, n, to]) => (
            <li key={label} className="border-b border-[var(--adm-border)] last:border-0">
              <Link to={to} className="flex items-center justify-between px-4 py-3 hover:bg-[var(--adm-accent-soft)]">
                <span className="adm-a">{label}</span>
                <span className="adm-pill adm-pill-warning">{n}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ReviewQueue({ queues }) {
  const rows = [
    ['Graduates to review', queues.pendingGraduates, '/app/admin/graduates?status=pending'],
    ['Investors to review', queues.pendingInvestors, '/app/admin/investors?status=pending'],
    ['Projects to review', queues.pendingProjects, '/app/admin/projects?status=pending_review'],
    ['Open requests', queues.openRequests, '/app/admin/requests?status=open'],
    ['Results to approve', queues.pendingResults, '/app/admin/results?status=pending'],
  ];
  return (
    <ul className="m-0 list-none p-0">
      {rows.map(([label, n, to]) => (
        <li key={label} className="border-b border-[var(--adm-border)] last:border-0">
          <Link to={to} className="flex items-center justify-between gap-3 py-2.5 hover:text-[var(--adm-accent)]">
            <span>{label}</span>
            <span className={`adm-pill ${n ? 'adm-pill-warning' : 'adm-pill-neutral'} tabular-nums`}>{n}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Counters({ cards, keys }) {
  const shown = keys.map((k) => cards.find((c) => c.key === k)).filter(Boolean);
  return (
    <section aria-label="More totals">
      <h2 className="adm-muted !mb-2 !mt-2 text-[11px] font-semibold uppercase tracking-[0.06em]">More totals</h2>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        {shown.map((c) => (
          <StatTile key={c.key} label={c.hint ? `${c.label} · ${c.hint}` : c.label} value={c.value} to={LINKS[c.key]} />
        ))}
      </div>
    </section>
  );
}

const ALL_TIME = 'All projects today';

// FR11: what needs attention, the headline numbers for the period, and charts
// built from aggregated counts (GET /api/admin/dashboard?period=…).
export default function AdminDashboard() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some(([k]) => k === params.get('tab')) ? params.get('tab') : 'overview';
  const period = ['week', 'month', 'year'].includes(params.get('period')) ? params.get('period') : 'month';
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    document.title = 'Dashboard · ALU Ventures';
  }, []);
  useEffect(() => {
    let live = true;
    setError('');
    api
      .get(`/admin/dashboard?period=${period}`)
      .then((d) => live && setData(d))
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [period]);

  const update = (next) => setParams({ tab, period, ...next }, { replace: true });

  if (error) return <AdminPage title="Dashboard"><Messages error={error} /></AdminPage>;
  if (!data) return <AdminPage title="Dashboard"><Loading /></AdminPage>;

  const c = data.charts;
  const { short, long } = bucketLabels(data.period);
  const range = PERIOD_SUBTITLE[data.period.key];
  const stale = data.period.key !== period;

  return (
    <AdminPage title="Dashboard" meta={stale ? 'Updating…' : 'Counts refresh every minute'}>
      <NeedsAttention queues={data.queues} />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--adm-border)] pb-3">
        <Tabs label="Dashboard sections" tabs={TABS} value={tab} onChange={(t) => update({ tab: t })} />
        <PeriodSelect value={period} onChange={(p) => update({ period: p })} />
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        {data.kpis.map(({ key, ...k }) => (
          <KpiCard key={key} {...k} versus={PERIOD_VERSUS[data.period.key]} to={LINKS[key]} />
        ))}
      </div>

      {tab === 'overview' && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <ChartCard title="Activity" subtitle={range} className="xl:col-span-2">
            <LineChart
              title="Activity"
              labels={short}
              longLabels={long}
              series={c.activity.map((s, i) => ({ ...s, tone: i ? 'green' : 'blue' }))}
            />
          </ChartCard>
          <ChartCard title="Projects by status" subtitle={ALL_TIME} action={<Link className="adm-a text-[12px]" to="/app/admin/projects">Projects</Link>}>
            <Donut title="Projects by status" data={toned(c.projectsByStatus, TONES.projectsByStatus)} centerLabel="Projects" empty="No projects yet" />
          </ChartCard>
          <ChartCard title="Funding source" subtitle="Fully funded projects" action={<Link className="adm-a text-[12px]" to="/app/admin/introductions">Funding</Link>}>
            <Donut title="Funding source" data={toned(c.fundingSource, TONES.fundingSource)} centerLabel="Funded" empty="No funded projects yet" />
          </ChartCard>
          <ChartCard title="Projects by sector" subtitle="Excluding archived">
            <BarList title="Projects by sector" data={c.projectsBySector} empty="No projects yet" />
          </ChartCard>
          <ChartCard title="Review queue" subtitle="Waiting now">
            <ReviewQueue queues={data.queues} />
          </ChartCard>
          <div className="xl:col-span-3">
            <Counters cards={data.cards} keys={COUNTERS.overview} />
          </div>
        </div>
      )}

      {tab === 'projects' && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <ChartCard title="Projects by status" subtitle={ALL_TIME}>
            <BarList title="Projects by status" data={c.projectStatusDetail} empty="No projects yet" />
          </ChartCard>
          <ChartCard title="Projects by sector" subtitle="Excluding archived">
            <BarList title="Projects by sector" data={c.projectsBySector} empty="No projects yet" />
          </ChartCard>
          <ChartCard title="Projects by stage" subtitle="Excluding archived">
            <BarList title="Projects by stage" data={c.projectsByStage} tone="green" empty="No projects yet" />
          </ChartCard>
          <ChartCard title="Submitted projects" subtitle={range} className="xl:col-span-2">
            <LineChart title="Submitted projects" labels={short} longLabels={long} series={[{ ...c.activity[1], tone: 'blue' }]} />
          </ChartCard>
          <KpiCard
            label="Average days to a decision"
            value={data.decisionDays.current ?? '—'}
            hint={
              data.decisionDays.decisions
                ? `${data.decisionDays.decisions} decided, submission to approval or rejection${
                    data.decisionDays.previous !== null ? ` · ${data.decisionDays.previous} days in the ${PERIOD_VERSUS[data.period.key]}` : ''
                  }`
                : 'No decisions in this period'
            }
          />
          <div className="xl:col-span-3">
            <Counters cards={data.cards} keys={COUNTERS.projects} />
          </div>
        </div>
      )}

      {tab === 'people' && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <ChartCard title="Registrations by role" subtitle={range} className="xl:col-span-2">
            <LineChart
              title="Registrations by role"
              labels={short}
              longLabels={long}
              series={c.registrationsByRole.map((s, i) => ({ ...s, tone: i ? 'green' : 'blue' }))}
            />
          </ChartCard>
          <ChartCard title="Degree certificate checks" subtitle="Automated document check outcome">
            <Donut title="Degree certificate checks" data={toned(c.degreeChecks, TONES.degreeChecks)} centerLabel="Certificates" empty="No certificates uploaded yet" />
          </ChartCard>
          <div className="xl:col-span-3">
            <Counters cards={data.cards} keys={COUNTERS.people} />
          </div>
        </div>
      )}

      {tab === 'funding' && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <ChartCard title="Funded projects over time" subtitle={range} className="xl:col-span-2">
            <LineChart title="Funded projects over time" labels={short} longLabels={long} series={c.fundedOverTime.map((s) => ({ ...s, tone: 'green' }))} />
          </ChartCard>
          <ChartCard title="Funding source" subtitle="Fully funded projects">
            <Donut title="Funding source" data={toned(c.fundingSource, TONES.fundingSource)} centerLabel="Funded" empty="No funded projects yet" />
          </ChartCard>
          <ChartCard title="Introductions requested" subtitle={range} className="xl:col-span-2">
            <LineChart title="Introductions requested" labels={short} longLabels={long} series={c.introductionsOverTime.map((s) => ({ ...s, tone: 'blue' }))} />
          </ChartCard>
          <ChartCard title="Introductions by status" subtitle="All introductions" action={<Link className="adm-a text-[12px]" to="/app/admin/introductions">Introductions</Link>}>
            <Donut title="Introductions by status" data={toned(c.introductionsByStatus, TONES.introductionsByStatus)} centerLabel="Introductions" empty="No introductions yet" />
          </ChartCard>
          <div className="xl:col-span-3">
            <Counters cards={data.cards} keys={COUNTERS.funding} />
          </div>
        </div>
      )}
    </AdminPage>
  );
}
