import { useId, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

// Small hand-built SVG charts for the admin and staff dashboards (no chart
// library). At most four colours from the palette (blue, green, amber, grey),
// always with text labels and values, and a hidden table for screen readers.
const COLOR = {
  blue: 'var(--chart-blue)',
  green: 'var(--chart-green)',
  'green-light': 'var(--chart-green-light)',
  amber: 'var(--chart-amber)',
  grey: 'var(--chart-grey)',
  'grey-light': 'var(--chart-grey-light)',
};
const fmt = (n) => Number(n || 0).toLocaleString('en-US');

export function ChartEmpty({ children = 'No data in this period', height = 200 }) {
  return (
    <div className="adm-muted flex items-center justify-center text-[13px]" style={{ minHeight: height }}>
      {children}
    </div>
  );
}

export function ChartCard({ title, subtitle, action, className = '', children }) {
  return (
    <section className={`adm-card flex min-w-0 flex-col p-4 sm:p-5 ${className}`} aria-label={title}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="!m-0 text-[15px] font-semibold">{title}</h2>
          {subtitle && <p className="adm-muted m-0 text-[12px]">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </section>
  );
}

export function KpiCard({ label, value, hint, change, versus, to }) {
  const pill =
    change === null || change === undefined ? null : (
      <span className={`adm-pill ${change > 0 ? 'adm-pill-success' : change < 0 ? 'adm-pill-warning' : 'adm-pill-neutral'} mt-2 inline-flex`}>
        {change > 0 ? '+' : ''}
        {change}% vs {versus}
      </span>
    );
  const body = (
    <>
      <span className="adm-muted block text-[11px] font-semibold uppercase tracking-[0.06em]">{label}</span>
      <span className="mt-1 block text-[24px] font-semibold leading-8 tabular-nums">{typeof value === 'number' ? fmt(value) : value}</span>
      {hint && <span className="adm-muted block text-[12px]">{hint}</span>}
      {pill}
    </>
  );
  return to ? (
    <Link to={to} className="adm-card block min-w-0 p-4 hover:border-[var(--adm-accent)]">
      {body}
    </Link>
  ) : (
    <div className="adm-card min-w-0 p-4">{body}</div>
  );
}

function SrTable({ caption, head, rows }) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          {head.map((h) => (
            <th key={h} scope="col">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((c, j) => (j === 0 ? <th key={j} scope="row">{c}</th> : <td key={j}>{c}</td>))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Legend({ items }) {
  return (
    <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-[12px]">
      {items.map((s) => (
        <li key={s.label} className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: COLOR[s.tone] }} aria-hidden="true" />
          {s.label}
        </li>
      ))}
    </ul>
  );
}

// 1, 2 or 5 times a power of ten, so the axis reads in whole numbers.
function niceTicks(max) {
  const raw = Math.max(1, max / 4);
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw);
  const top = Math.max(step, Math.ceil(max / step) * step);
  return Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
}

function useWidth(fallback = 600) {
  const ref = useRef(null);
  const [width, setWidth] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    setWidth(Math.max(260, Math.round(el.getBoundingClientRect().width)));
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(260, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

// Lines over time; the first series is shaded. Hover, or focus and use the
// arrow keys, to read every value for one day or month.
export function LineChart({ title, labels, longLabels = labels, series, height = 240 }) {
  const [ref, w] = useWidth();
  const [active, setActive] = useState(null);
  const gid = `g${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const max = Math.max(0, ...series.flatMap((s) => s.values));
  const n = labels.length;

  const legend = <Legend items={series} />;
  if (max === 0)
    return (
      <div ref={ref}>
        {legend}
        <ChartEmpty height={height} />
      </div>
    );

  const ticks = niceTicks(max);
  const top = ticks.at(-1);
  const pad = { l: 36, r: 12, t: 12, b: 26 };
  const iw = w - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  const x = (i) => pad.l + (n === 1 ? iw / 2 : (i * iw) / (n - 1));
  const y = (v) => pad.t + ih - (v / top) * ih;
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 64))));
  const line = (values) => values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');

  const pick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * w;
    setActive(Math.min(n - 1, Math.max(0, Math.round(((px - pad.l) / iw) * (n - 1)))));
  };
  const keys = (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      setActive((a) => Math.min(n - 1, Math.max(0, (a ?? (e.key === 'ArrowRight' ? -1 : n)) + (e.key === 'ArrowRight' ? 1 : -1))));
    }
    if (e.key === 'Escape') setActive(null);
  };
  const tipLeft = active === null ? 0 : Math.min(Math.max(x(active), 90), w - 90);

  return (
    <div ref={ref} className="relative">
      <div className="mb-2 flex justify-end">{legend}</div>
      <svg
        width={w}
        height={height}
        viewBox={`0 0 ${w} ${height}`}
        role="img"
        aria-label={`${title}. Use the arrow keys to read each value.`}
        tabIndex={0}
        className="block touch-pan-y outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-accent)]"
        onPointerMove={pick}
        onPointerDown={pick}
        onPointerLeave={() => setActive(null)}
        onKeyDown={keys}
        onBlur={() => setActive(null)}
      >
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={COLOR[series[0].tone]} stopOpacity="0.22" />
            <stop offset="100%" stopColor={COLOR[series[0].tone]} stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} stroke="var(--adm-border)" strokeDasharray={t ? '3 4' : undefined} />
            <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--adm-muted)">
              {fmt(t)}
            </text>
          </g>
        ))}
        {labels.map((l, i) => {
          // Evenly spaced, counting back from the latest bucket so it is always labelled.
          const shown = (n - 1 - i) % every === 0;
          return shown ? (
            <text key={i} x={x(i)} y={height - 6} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'} fontSize="11" fill="var(--adm-muted)">
              {l}
            </text>
          ) : null;
        })}
        <path d={`${line(series[0].values)}L${x(n - 1)},${y(0)}L${x(0)},${y(0)}Z`} fill={`url(#${gid})`} />
        {series.map((s) => (
          <path key={s.key} d={line(s.values)} fill="none" stroke={COLOR[s.tone]} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {active !== null && (
          <g>
            <line x1={x(active)} x2={x(active)} y1={pad.t} y2={pad.t + ih} stroke="var(--adm-muted)" strokeDasharray="3 3" />
            {series.map((s) => (
              <circle key={s.key} cx={x(active)} cy={y(s.values[active])} r="4" fill="var(--adm-card)" stroke={COLOR[s.tone]} strokeWidth="2" />
            ))}
          </g>
        )}
      </svg>
      {active !== null && (
        <div
          className="pointer-events-none absolute top-8 z-10 min-w-[160px] -translate-x-1/2 overflow-hidden rounded-md border border-[var(--adm-border)] bg-[var(--adm-card)] text-[12px] shadow-lg"
          style={{ left: tipLeft }}
          role="status"
        >
          <p className="m-0 border-b border-[var(--adm-border)] bg-[var(--adm-zebra)] px-3 py-1.5 font-medium">{longLabels[active]}</p>
          <ul className="m-0 list-none space-y-1 px-3 py-2">
            {series.map((s) => (
              <li key={s.key} className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: COLOR[s.tone] }} aria-hidden="true" />
                <span>{s.label}:</span>
                <span className="ml-auto font-semibold tabular-nums">{fmt(s.values[active])}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <SrTable caption={title} head={['Period', ...series.map((s) => s.label)]} rows={labels.map((_, i) => [longLabels[i], ...series.map((s) => fmt(s.values[i]))])} />
    </div>
  );
}

// Ring with the total in the centre; the legend lists every value and share.
export function Donut({ title, data, centerLabel = 'Total', empty }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!total) return <ChartEmpty>{empty}</ChartEmpty>;
  const size = 184;
  const r = 70;
  const c = 2 * Math.PI * r;
  const parts = data.filter((d) => d.value > 0);
  const gap = parts.length > 1 ? 2 : 0;
  let offset = 0;
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${title}: ${parts.map((d) => `${d.label} ${d.value}`).join(', ')}`}>
          <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--adm-zebra)" strokeWidth="22" />
            {parts.map((d) => {
              const len = (d.value / total) * c;
              const el = (
                <circle
                  key={d.label}
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  fill="none"
                  stroke={COLOR[d.tone]}
                  strokeWidth="22"
                  strokeDasharray={`${Math.max(0, len - gap)} ${c}`}
                  strokeDashoffset={-offset}
                >
                  <title>{`${d.label}: ${fmt(d.value)} (${Math.round((d.value / total) * 100)}%)`}</title>
                </circle>
              );
              offset += len;
              return el;
            })}
          </g>
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center" aria-hidden="true">
          <span className="adm-muted text-[12px]">{centerLabel}</span>
          <span className="text-[22px] font-semibold tabular-nums">{fmt(total)}</span>
        </div>
      </div>
      <ul className="m-0 w-full list-none space-y-1.5 p-0 text-[12px]">
        {data.map((d) => (
          <li key={d.label} className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: COLOR[d.tone] }} aria-hidden="true" />
            <span className="min-w-0 truncate">{d.label}</span>
            <span className="ml-auto font-semibold tabular-nums">{fmt(d.value)}</span>
            <span className="adm-muted w-10 text-right tabular-nums">{Math.round((d.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Horizontal bars with the label and the value as text.
export function BarList({ title, data, tone = 'blue', empty }) {
  const max = Math.max(0, ...data.map((d) => d.value));
  if (!max) return <ChartEmpty>{empty}</ChartEmpty>;
  return (
    <ul className="m-0 list-none space-y-2.5 p-0 text-[12px]" aria-label={title}>
      {data.map((d) => (
        <li key={d.label}>
          <div className="mb-1 flex items-baseline gap-2">
            <span className="min-w-0 truncate" title={d.label}>
              {d.label}
            </span>
            <span className="ml-auto font-semibold tabular-nums">{fmt(d.value)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[var(--adm-zebra)]" aria-hidden="true">
            <div className="h-full rounded-full" style={{ width: d.value ? `${Math.max(2, (d.value / max) * 100)}%` : 0, background: COLOR[d.tone || tone] }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

// Labels for the period's buckets: "Oct 7" per day, "Nov" per month.
export function bucketLabels(period) {
  const month = period.unit === 'month';
  const date = (k) => new Date(`${month ? `${k}-01` : k}T00:00:00Z`);
  const short = period.buckets.map((k) =>
    date(k).toLocaleDateString('en-US', month ? { month: 'short', timeZone: 'UTC' } : { month: 'short', day: 'numeric', timeZone: 'UTC' })
  );
  const long = period.buckets.map((k) =>
    date(k).toLocaleDateString('en-GB', month ? { month: 'long', year: 'numeric', timeZone: 'UTC' } : { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
  );
  return { short, long };
}

export const PERIOD_OPTIONS = [
  ['week', 'Week'],
  ['month', 'Month'],
  ['year', 'Year'],
];
export const PERIOD_SUBTITLE = { week: 'Last 7 days', month: 'Last 30 days', year: 'Last 12 months' };
export const PERIOD_VERSUS = { week: 'previous week', month: 'previous 30 days', year: 'previous 12 months' };

export function PeriodSelect({ value, onChange }) {
  return (
    <label className="flex items-center gap-2 text-[13px]">
      <span className="adm-muted">Period</span>
      <select className="adm-input !w-auto" value={value} onChange={(e) => onChange(e.target.value)}>
        {PERIOD_OPTIONS.map(([k, l]) => (
          <option key={k} value={k}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Tabs({ tabs, value, onChange, label }) {
  return (
    <div role="tablist" aria-label={label} className="flex flex-wrap gap-1">
      {tabs.map(([k, l]) => (
        <button
          key={k}
          type="button"
          role="tab"
          aria-selected={value === k}
          className={`rounded-md px-3 py-1.5 text-[13px] ${
            value === k ? 'bg-[var(--adm-accent-soft)] font-semibold text-[var(--adm-accent)]' : 'adm-muted hover:bg-[var(--adm-zebra)] hover:text-[var(--adm-text)]'
          }`}
          onClick={() => onChange(k)}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
