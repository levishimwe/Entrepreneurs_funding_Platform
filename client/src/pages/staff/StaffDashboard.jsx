import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { formatDate } from '../../components/ui';
import { AdminPage, Loading, Messages, Pill } from '../../components/admin';
import { BarList, ChartCard, ChartEmpty, Donut, KpiCard, LineChart, PERIOD_SUBTITLE, PERIOD_VERSUS, PeriodSelect, bucketLabels } from '../../components/charts';

const LINKS = {
  openOpportunities: '/app/staff/opportunities',
  awaiting: '/app/staff/selection',
  results: '/app/staff/results',
};
const DECISION_TONES = { awaiting: 'amber', selected: 'green', not_selected: 'grey' };

function ClosingSoon({ items }) {
  if (!items.length) return <ChartEmpty>No open opportunities with a deadline ahead</ChartEmpty>;
  return (
    <ul className="m-0 list-none p-0">
      {items.map((o) => (
        <li key={o.id} className="border-b border-[var(--adm-border)] last:border-0">
          <Link to={`/app/staff/${o.id}`} className="flex items-center gap-3 py-2.5 hover:text-[var(--adm-accent)]">
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{o.title}</span>
              <span className="adm-muted block text-[12px]">
                Closes {formatDate(o.deadline, true)}
                {o.linkOnly ? '' : ` · ${o.applicants} ${o.applicants === 1 ? 'applicant' : 'applicants'}`}
              </span>
            </span>
            {o.linkOnly && <Pill tone="neutral">Link only</Pill>}
          </Link>
        </li>
      ))}
    </ul>
  );
}

// Staff home: applications and opportunities in aggregate (GET /api/staff/dashboard).
// No graduate documents, investor data or funding here.
export default function StaffDashboard() {
  const [params, setParams] = useSearchParams();
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
      .get(`/staff/dashboard?period=${period}`)
      .then((d) => live && setData(d))
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [period]);

  if (error) return <AdminPage title="Dashboard"><Messages error={error} /></AdminPage>;
  if (!data) return <AdminPage title="Dashboard"><Loading /></AdminPage>;

  const c = data.charts;
  const { short, long } = bucketLabels(data.period);

  return (
    <AdminPage title="Dashboard" meta={data.period.key !== period ? 'Updating…' : 'Counts refresh every minute'}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--adm-border)] pb-3">
        <p className="adm-muted m-0">Opportunities and applications across ALU Ventures.</p>
        <PeriodSelect value={period} onChange={(p) => setParams({ period: p }, { replace: true })} />
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        {data.kpis.map(({ key, ...k }) => (
          <KpiCard key={key} {...k} versus={PERIOD_VERSUS[data.period.key]} to={LINKS[key]} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <ChartCard title="Applications received" subtitle={PERIOD_SUBTITLE[data.period.key]} className="xl:col-span-2">
          <LineChart title="Applications received" labels={short} longLabels={long} series={c.applicationsReceived.map((s) => ({ ...s, tone: 'blue' }))} />
        </ChartCard>
        <ChartCard title="Applications by decision" subtitle="All applications" action={<Link className="adm-a text-[12px]" to="/app/staff/selection">Applications</Link>}>
          <Donut
            title="Applications by decision"
            data={c.applicationsByDecision.map((d) => ({ ...d, tone: DECISION_TONES[d.key] }))}
            centerLabel="Applications"
            empty="No applications yet"
          />
        </ChartCard>
        <ChartCard title="Applicants per opportunity" subtitle="Top 8" className="xl:col-span-2">
          <BarList title="Applicants per opportunity" data={c.applicantsPerOpportunity} empty="No applications yet" />
        </ChartCard>
        <ChartCard title="Closing soon" subtitle="Next 5 deadlines" action={<Link className="adm-a text-[12px]" to="/app/staff/opportunities">Opportunities</Link>}>
          <ClosingSoon items={data.closingSoon} />
        </ChartCard>
      </div>
    </AdminPage>
  );
}
