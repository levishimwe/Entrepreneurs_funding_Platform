import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { relativeTime } from '../kit';
import { BarList, ChartCard, ChartEmpty, Donut, KpiCard, LineChart, PERIOD_SUBTITLE, PERIOD_VERSUS, PeriodSelect, bucketLabels } from '../charts';

// "How it is going" for the graduate and investor Activity pages: a period
// selector, KPI cards and charts from the member's own activity summary
// (counts only). Colours come from --chart-1..4 in index.css.
const STAGE_TONES = { pending: 'c4', accepted: 'c2', declined: 'c3', meeting: 'c1-soft', investment: 'c1' };
const DECISION_TONES = { awaiting: 'c4', selected: 'c1', not_selected: 'c3' };
const CARD = 'rounded-xl';

function useSummary(url) {
  const [params, setParams] = useSearchParams();
  const period = ['week', 'month', 'year'].includes(params.get('period')) ? params.get('period') : 'month';
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    setError('');
    api
      .get(`${url}?period=${period}`)
      .then((d) => live && setData(d))
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [url, period]);
  const setPeriod = (p) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('period', p);
        return next;
      },
      { replace: true }
    );
  return { period, setPeriod, data, error };
}

function Frame({ label, period, setPeriod, data, error, children }) {
  return (
    <section aria-label={label} className="@container space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="!m-0 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">{label}</h2>
        <PeriodSelect value={period} onChange={setPeriod} />
      </div>
      {error ? (
        <p className="rounded-xl border border-line bg-surface px-5 py-4 text-[14px] text-muted">Your summary could not be loaded right now. {error}</p>
      ) : !data ? (
        <p className="rounded-xl border border-line bg-surface px-5 py-4 text-[14px] text-muted">Loading your summary…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 @xl:grid-cols-3">
            {data.kpis.map(({ key, ...k }) => (
              <KpiCard key={key} {...k} versus={PERIOD_VERSUS[data.period.key]} className={CARD} />
            ))}
          </div>
          {children(data)}
        </>
      )}
    </section>
  );
}

function ProgressCard({ steps }) {
  const pct = steps.total ? Math.round((steps.done / steps.total) * 100) : 0;
  const next = steps.steps.find((s) => !s.done);
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-[13px]">
        <span className="font-semibold tabular-nums">
          {steps.done} of {steps.total} done
        </span>
        <span className="adm-muted tabular-nums">{pct}%</span>
      </div>
      <div
        className="h-2.5 overflow-hidden rounded-full bg-[var(--adm-zebra)]"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={steps.total}
        aria-valuenow={steps.done}
        aria-label="Next steps done"
      >
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'var(--chart-1)' }} />
      </div>
      <p className="adm-muted mt-3 text-[13px]">{next ? `Next: ${next.label}` : 'All steps are done.'}</p>
    </div>
  );
}

export function GraduateSummary() {
  const s = useSummary('/graduate/activity-summary');
  return (
    <Frame label="How it is going" {...s}>
      {(data) => {
        const c = data.charts;
        const { short, long } = bucketLabels(data.period);
        return (
          <>
            <div className="grid grid-cols-1 gap-4 @2xl:grid-cols-3">
              <ChartCard title="Your activity" label="Your activity chart" subtitle={PERIOD_SUBTITLE[data.period.key]} className={`${CARD} @2xl:col-span-2`}>
                <LineChart title="Your activity" labels={short} longLabels={long} series={c.activity.map((x, i) => ({ ...x, tone: i ? 'c2' : 'c1' }))} />
              </ChartCard>
              <ChartCard
                title="Introductions by status"
                subtitle="All your projects"
                className={CARD}
                action={
                  <Link className="text-[12px] font-semibold text-accent hover:underline" to="/app/introductions">
                    Introductions
                  </Link>
                }
              >
                <Donut
                  title="Introductions by status"
                  data={c.introductionsByStatus.map((d) => ({ ...d, tone: STAGE_TONES[d.key] }))}
                  centerLabel="Introductions"
                  empty="No introductions yet"
                />
              </ChartCard>
            </div>
            <div className="grid grid-cols-1 gap-4 @xl:grid-cols-2">
              <ChartCard
                title="Applications by decision"
                subtitle="Competitions and opportunities"
                className={CARD}
                action={
                  <Link className="text-[12px] font-semibold text-accent hover:underline" to="/app/opportunities">
                    Opportunities
                  </Link>
                }
              >
                <Donut
                  title="Applications by decision"
                  data={c.applicationsByDecision.map((d) => ({ ...d, tone: DECISION_TONES[d.key] }))}
                  centerLabel="Applications"
                  empty="No applications yet"
                />
              </ChartCard>
              <ChartCard title="Next steps" subtitle="Your progress" className={CARD}>
                {c.nextSteps.total ? <ProgressCard steps={c.nextSteps} /> : <ChartEmpty height={120}>No steps yet</ChartEmpty>}
              </ChartCard>
            </div>
          </>
        );
      }}
    </Frame>
  );
}

export function InvestorSummary() {
  const s = useSummary('/investor/activity-summary');
  return (
    <Frame label="How it is going" {...s}>
      {(data) => {
        const c = data.charts;
        const { short, long } = bucketLabels(data.period);
        return (
          <>
            <div className="grid grid-cols-1 gap-4 @2xl:grid-cols-3">
              <ChartCard title="My activity" subtitle={PERIOD_SUBTITLE[data.period.key]} className={`${CARD} @2xl:col-span-2`}>
                <LineChart title="My activity" labels={short} longLabels={long} series={c.activity.map((x, i) => ({ ...x, tone: i ? 'c2' : 'c1' }))} />
              </ChartCard>
              <ChartCard
                title="My introductions by status"
                subtitle="All your requests"
                className={CARD}
                action={
                  <Link className="text-[12px] font-semibold text-accent hover:underline" to="/app/introductions">
                    Introductions
                  </Link>
                }
              >
                <Donut
                  title="My introductions by status"
                  data={c.introductionsByStatus.map((d) => ({ ...d, tone: STAGE_TONES[d.key] }))}
                  centerLabel="Requests"
                  empty="No introduction requests yet"
                />
              </ChartCard>
            </div>
            <div className="grid grid-cols-1 gap-4 @xl:grid-cols-2">
              <ChartCard title="Ventures seeking investment by sector" subtitle="All ventures on ALU Ventures" className={CARD}>
                <BarList title="Ventures seeking investment by sector" data={c.seekingBySector} tone="c1" empty="No ventures are seeking investment right now" />
              </ChartCard>
              <ChartCard
                title="Recently listed"
                subtitle="Newest ventures"
                className={CARD}
                action={
                  <Link className="text-[12px] font-semibold text-accent hover:underline" to="/app/discover">
                    See all
                  </Link>
                }
              >
                {data.recentlyListed.length === 0 ? (
                  <ChartEmpty height={120}>No ventures listed yet</ChartEmpty>
                ) : (
                  <ul className="m-0 list-none p-0">
                    {data.recentlyListed.map((p) => (
                      <li key={p.id} className="border-b border-line last:border-0">
                        <Link to={`/app/discover/${p.id}`} className="block py-2.5 hover:text-accent">
                          <span className="block truncate text-[14px] font-semibold">{p.title}</span>
                          <span className="block text-[12px] text-muted">
                            {p.sector} · listed {relativeTime(p.listedAt)}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </ChartCard>
            </div>
          </>
        );
      }}
    </Frame>
  );
}
