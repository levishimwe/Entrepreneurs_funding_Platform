import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ChevronDown, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { api, qs } from '../lib/api';
import { SECTORS, STAGES } from '../lib/constants';
import { formatDate } from '../components/ui';
import { AdminPage, KeyValue, Loading, Messages, Pill, StatusPill } from '../components/admin';
import { useAuth } from '../context/AuthContext';
import { useGated } from '../components/site/SiteChrome';

// Public pages. No project code is ever shown here: a venture is reached by
// its id, and the Verify page only confirms a code the visitor already has.

function PublicPage({ children }) {
  return <div className="mx-auto max-w-6xl px-4 py-8">{children}</div>;
}

function ProjectRecord({ project: p, code, disclaimer }) {
  return (
    <>
      <KeyValue
        rows={[
          [
            'Status',
            <span key="s" className="inline-flex gap-2">
              <Pill tone="success">Approved record</Pill>
              {p.status !== 'approved' && <StatusPill status={p.status} />}
            </span>,
          ],
          // Only on Verify, echoing the code the visitor typed.
          ...(code
            ? [
                [
                  'Code',
                  <span key="c" className="adm-mono">
                    {code}
                  </span>,
                ],
              ]
            : []),
          ['Summary', p.summary],
          ['Sector', p.sector],
          ['Stage', p.stage],
          ...(p.country ? [['Country', p.country]] : []),
          ['Type', p.type === 'company' ? 'Registered company' : 'Idea stage'],
          ...(p.companyName ? [['Company', p.companyName]] : []),
          ...(p.fundingSought ? [['Funding sought', p.fundingSought]] : []),
          ...(p.founder ? [['Founder', `${p.founder.name} · Verified ALU graduate${p.founder.cohortYear ? `, Class of ${p.founder.cohortYear}` : ''}`]] : []),
          ['Approved', formatDate(p.approvedAt)],
        ]}
      />
      {p.description && (
        <>
          <h2>About the venture</h2>
          <p className="adm-card whitespace-pre-line p-4">{p.description}</p>
        </>
      )}
      {disclaimer && <p className="adm-hint mt-3">{disclaimer}</p>}
    </>
  );
}

// FR14: exact project-code lookup. The page never lists codes; the visitor
// brings one.
export function VerifyProject() {
  const [params, setParams] = useSearchParams();
  const [code, setCode] = useState(params.get('code') || '');
  const [checked, setChecked] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const lookup = async (value) => {
    const c = value.trim();
    if (!c) return;
    setBusy(true);
    setError('');
    setResult(null);
    try {
      setResult(await api.get(`/public/verify/${encodeURIComponent(c)}`));
      setChecked(c.toUpperCase());
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    document.title = 'Verify a project · ALU Ventures';
    if (params.get('code')) lookup(params.get('code'));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const run = (value) => {
    setCode(value);
    setParams(value ? { code: value.trim() } : {});
    lookup(value);
  };
  const p = result?.project;
  const copyLink = async () => {
    await navigator.clipboard?.writeText(`${window.location.origin}/verify?code=${checked}`).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <PublicPage>
      <AdminPage title="Verify a project">
        <form
          className="adm-card mb-4 flex max-w-2xl flex-col gap-2 p-4 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            run(code);
          }}
        >
          <label className="flex-1">
            <span className="sr-only">Project code</span>
            <input
              className="input font-mono uppercase"
              placeholder="ALU-2026-XXXXX"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoComplete="off"
            />
          </label>
          <button type="submit" className="adm-primary" disabled={busy}>
            {busy ? 'Checking…' : 'Verify'}
          </button>
        </form>
        <p className="adm-hint">Founders share their project code with people they choose. Enter the code you were given to confirm the record.</p>
        <Messages error={error} />
        {busy && <Loading />}
        {p && (
          <>
            <div className="mb-2 mt-6 flex flex-wrap items-center justify-between gap-2">
              <h2 className="!m-0">{p.title}</h2>
              <span className="flex gap-4">
                <button type="button" className="adm-act" onClick={copyLink}>
                  {copied ? 'Link copied' : 'Copy link'}
                </button>
                <Link to={`/ventures/${p.id}`} className="adm-act">
                  Full profile
                </Link>
              </span>
            </div>
            <ProjectRecord project={{ ...p, description: null }} code={checked} disclaimer={result.disclaimer} />
          </>
        )}
        <p className="adm-hint mt-6">Only administrator-approved records whose founders consented to publication are returned. Documents are never public.</p>
      </AdminPage>
    </PublicPage>
  );
}

// ---- Shared bits for the public site pages ---------------------------------------------------

const initialsOf = (name = '') =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('') || 'AG';

// Founder photo when the founder has one and the venture is public; initials otherwise.
function FounderAvatar({ founder, size = 48 }) {
  const [failed, setFailed] = useState(false);
  const style = { width: size, height: size };
  if (founder?.photoUrl && !failed) {
    return (
      <img
        src={founder.photoUrl}
        alt=""
        style={style}
        loading="lazy"
        onError={() => setFailed(true)}
        className="shrink-0 rounded-full object-cover ring-2 ring-white"
      />
    );
  }
  return (
    <span
      style={style}
      className="flex shrink-0 items-center justify-center rounded-full bg-[#eef1f5] text-[14px] font-semibold text-[#475467] ring-2 ring-white"
      aria-hidden="true"
    >
      {initialsOf(founder?.name)}
    </span>
  );
}

const SECTOR_TINT = {
  Agriculture: '#16a34a',
  Technology: '#0284c7',
  Fintech: '#2563eb',
  Healthcare: '#e11d48',
  Education: '#7c3aed',
  Energy: '#d97706',
  Logistics: '#0891b2',
  'Retail & E-commerce': '#ea580c',
  'Climate & Environment': '#0d9488',
  'Creative & Media': '#db2777',
};
const tint = (sector) => SECTOR_TINT[sector] || '#64748b';

function Hero({ eyebrow, title, lede, align = 'center', aside, children }) {
  return (
    <section
      className="relative overflow-hidden px-4 pb-12 pt-16 text-white sm:px-8 lg:px-16 lg:pt-[72px]"
      style={{ background: 'radial-gradient(60% 90% at 50% 0%, rgba(37,99,235,0.2), rgba(37,99,235,0) 70%), #070d18' }}
    >
      <div className={`mx-auto max-w-[1312px] ${align === 'center' ? 'text-center' : ''}`}>
        <div className={`flex flex-col gap-8 ${aside ? 'lg:flex-row lg:items-end lg:justify-between' : ''}`}>
          <div className={align === 'center' ? 'mx-auto max-w-[1000px]' : 'max-w-[720px]'}>
            <p className="land-rise text-[12px] font-semibold uppercase tracking-[1.6px] text-[#60a5fa]">{eyebrow}</p>
            <h1
              className="land-rise mt-4 text-[34px] font-medium leading-[1.08] tracking-[-1px] sm:text-[44px] lg:text-[52px] lg:tracking-[-1.6px]"
              style={{ '--d': '80ms' }}
            >
              {title}
            </h1>
            <p
              className={`land-rise mt-5 text-[16px] leading-[1.6] text-white/70 sm:text-[17px] ${align === 'center' ? 'mx-auto max-w-[640px]' : 'max-w-[680px]'}`}
              style={{ '--d': '160ms' }}
            >
              {lede}
            </p>
          </div>
          {aside}
        </div>
        {children}
      </div>
    </section>
  );
}

function Select({ label, value, onChange, children, className = '' }) {
  return (
    <label className={`relative inline-flex items-center ${className}`}>
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full cursor-pointer appearance-none rounded-md border border-[#d9dfe7] bg-white pl-3 pr-8 text-[13px] font-medium text-[#111827] outline-none transition-colors hover:border-[#c3ccd8] focus:border-[#2563eb] focus:ring-[3px] focus:ring-[#2563eb]/15"
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 h-4 w-4 text-[#5b6676]" aria-hidden="true" />
    </label>
  );
}

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// ---- Browse ventures (FR06) ------------------------------------------------------------------

const SORT_LABEL = { newest: 'Newest', oldest: 'Oldest', title: 'Name A–Z' };
const SORT_PHRASE = { newest: 'newest first', oldest: 'oldest first', title: 'by name' };

function Pagination({ page, pages, onPage }) {
  if (pages <= 1) return null;
  const nums = [];
  for (let n = Math.max(1, page - 2); n <= Math.min(pages, page + 2); n += 1) nums.push(n);
  const btn =
    'flex h-9 min-w-9 items-center justify-center rounded-md border px-2 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40';
  return (
    <nav aria-label="Pages" className="flex items-center gap-1.5">
      <button
        type="button"
        className={`${btn} border-[#e3e8ef] bg-white text-[#5b6676] hover:bg-[#f9fafb]`}
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
        aria-label="Previous page"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      </button>
      {nums.map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onPage(n)}
          aria-current={n === page ? 'page' : undefined}
          className={`${btn} ${n === page ? 'border-[#2563eb] bg-[#2563eb] text-white' : 'border-[#e3e8ef] bg-white text-[#111827] hover:bg-[#f9fafb]'}`}
        >
          {n}
        </button>
      ))}
      <button
        type="button"
        className={`${btn} border-[#e3e8ef] bg-white text-[#5b6676] hover:bg-[#f9fafb]`}
        disabled={page >= pages}
        onClick={() => onPage(page + 1)}
        aria-label="Next page"
      >
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </button>
    </nav>
  );
}

function VentureCard({ p, index }) {
  const c = tint(p.sector);
  return (
    <article
      className="land-rise group relative flex flex-col overflow-hidden rounded-xl border border-[#e3e8ef] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-1 hover:border-[#c3ccd8] hover:shadow-[0_16px_40px_-18px_rgba(16,24,40,0.25)]"
      style={{ '--d': `${Math.min(index, 8) * 60}ms` }}
    >
      <div
        className="relative flex h-[112px] items-start justify-between p-4"
        style={{ background: `linear-gradient(135deg, ${c}2e 0%, ${c}12 55%, #ffffff 100%)` }}
      >
        <FounderAvatar founder={p.founder} />
        <span className="rounded-full bg-white/90 px-2.5 py-0.5 text-[12px] font-semibold text-[#2563eb] shadow-sm">Verified</span>
      </div>
      <div className="flex flex-1 flex-col gap-2.5 p-5">
        {p.founder?.name && (
          <p className="truncate text-[12px] text-[#5b6676]">
            {p.founder.name} · Verified ALU graduate{p.founder.cohortYear ? `, ${p.founder.cohortYear}` : ''}
          </p>
        )}
        <h3 className="text-[18px] font-semibold leading-snug text-[#111827]">
          <Link to={`/ventures/${p.id}`} className="after:absolute after:inset-0 focus-visible:outline-none">
            {p.title}
          </Link>
        </h3>
        <p className="line-clamp-2 text-[14px] leading-[1.55] text-[#5b6676]">{p.summary}</p>
        <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
          <span className="rounded-md px-2 py-0.5 text-[12px] font-semibold" style={{ color: c, background: `${c}14` }}>
            {p.sector}
          </span>
          {p.stage && <span className="rounded-md bg-[#eef1f5] px-2 py-0.5 text-[12px] font-medium text-[#344054]">{p.stage}</span>}
          {p.country && <span className="rounded-md bg-[#eef1f5] px-2 py-0.5 text-[12px] font-medium text-[#344054]">{p.country}</span>}
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-[#eef1f5] px-5 py-3.5 text-[13px]">
        <span className="text-[#5b6676]">{p.type === 'company' ? 'Registered company' : 'Idea'}</span>
        <span className="inline-flex items-center gap-0.5 font-semibold text-[#2563eb]">
          View venture
          <ChevronRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden="true" />
        </span>
      </div>
    </article>
  );
}

function VentureTable({ rows }) {
  return (
    <div className="land-rise overflow-x-auto rounded-xl border border-[#e3e8ef] bg-white">
      <table className="w-full min-w-[720px] text-left text-[13px]">
        <thead className="border-b border-[#e3e8ef] bg-[#f9fafb] text-[12px] font-semibold text-[#5b6676]">
          <tr>
            <th className="px-4 py-3">Venture</th>
            <th className="px-4 py-3">Sector</th>
            <th className="px-4 py-3">Stage</th>
            <th className="px-4 py-3">Type</th>
            <th className="px-4 py-3">
              <span className="sr-only">Open</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id} className="border-b border-[#eef1f5] last:border-0 hover:bg-[#f9fafb]">
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <FounderAvatar founder={p.founder} size={36} />
                  <div className="min-w-0">
                    <p className="font-semibold text-[#111827]">{p.title}</p>
                    <p className="line-clamp-1 text-[12px] text-[#5b6676]">{p.summary}</p>
                  </div>
                </div>
              </td>
              <td className="px-4 py-3 font-medium" style={{ color: tint(p.sector) }}>
                {p.sector}
              </td>
              <td className="px-4 py-3 text-[#344054]">{p.stage}</td>
              <td className="px-4 py-3 text-[#344054]">{p.type === 'company' ? 'Registered company' : 'Idea'}</td>
              <td className="px-4 py-3 text-right">
                <Link to={`/ventures/${p.id}`} className="inline-flex items-center gap-0.5 whitespace-nowrap font-semibold text-[#2563eb] hover:underline">
                  View venture
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-[#e3e8ef] bg-white">
      <div className="h-[112px] animate-pulse bg-[#eef1f5]" />
      <div className="space-y-3 p-5">
        <div className="h-3 w-1/3 animate-pulse rounded bg-[#eef1f5]" />
        <div className="h-4 w-2/3 animate-pulse rounded bg-[#eef1f5]" />
        <div className="h-3 w-full animate-pulse rounded bg-[#eef1f5]" />
      </div>
    </div>
  );
}

export function Ventures() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filters = {
    q: params.get('q') || '',
    sector: params.get('sector') || '',
    type: params.get('type') || '',
    stage: params.get('stage') || '',
    sort: SORT_LABEL[params.get('sort')] ? params.get('sort') : 'newest',
  };
  const view = params.get('view') === 'table' ? 'table' : 'cards';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const [search, setSearch] = useState(filters.q);
  const [sectorDraft, setSectorDraft] = useState(filters.sector);

  useEffect(() => {
    document.title = 'Browse ventures · ALU Ventures';
  }, []);

  useEffect(() => {
    setSearch(filters.q);
    setSectorDraft(filters.sector);
    setError('');
    let live = true;
    api
      .get(
        `/public/projects${qs({ q: filters.q, sector: filters.sector, type: filters.type, stage: filters.stage, sort: filters.sort === 'newest' ? '' : filters.sort, page: page > 1 ? page : '' })}`,
      )
      .then((d) => live && setData(d))
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [params]); // eslint-disable-line react-hooks/exhaustive-deps

  // Every filter change returns to page 1; view and other filters are kept.
  const update = (changes) => {
    const next = { ...filters, view: view === 'table' ? 'table' : '', page: '', ...changes };
    if (next.sort === 'newest') next.sort = '';
    setParams(Object.fromEntries(Object.entries(next).filter(([, v]) => v)));
  };
  const reset = () => setParams(view === 'table' ? { view: 'table' } : {});

  const facets = data?.facets || { type: {}, stage: {}, sector: {} };
  const typeTotal = Object.values(facets.type).reduce((a, b) => a + b, 0);
  const stageTotal = Object.values(facets.stage).reduce((a, b) => a + b, 0);
  const popular = Object.entries(facets.sector)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([s]) => s);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const from = data && data.total ? (data.page - 1) * data.pageSize + 1 : 0;
  const to = data ? Math.min(data.page * data.pageSize, data.total) : 0;
  const active = [filters.type, filters.stage, filters.sector, filters.q].filter(Boolean).length;

  const filterPanel = (
    <div className="overflow-hidden rounded-xl border border-[#e3e8ef] bg-white">
      <div className="flex items-center justify-between border-b border-[#eef1f5] px-5 py-4">
        <h2 className="text-[15px] font-semibold text-[#111827]">Refine results</h2>
        <button type="button" onClick={reset} disabled={!active} className="text-[13px] font-medium text-[#5b6676] hover:text-[#111827] disabled:opacity-40">
          Reset
        </button>
      </div>
      <div role="radiogroup" aria-labelledby="f-type" className="border-b border-[#eef1f5] px-5 py-5">
        <p id="f-type" className="mb-3 text-[13px] font-semibold text-[#111827]">
          Venture type
        </p>
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-[#eef1f5] p-1">
          {[
            ['', 'All', typeTotal],
            ['company', 'Companies', facets.type.company || 0],
            ['idea', 'Ideas', facets.type.idea || 0],
          ].map(([value, label, n]) => {
            const on = filters.type === value;
            return (
              <label
                key={label}
                className={`flex cursor-pointer flex-col items-center rounded-md py-1.5 text-[13px] transition-colors focus-within:outline-2 focus-within:outline-[#2563eb] ${
                  on ? 'bg-white font-semibold text-[#111827] shadow-sm' : 'text-[#5b6676] hover:text-[#111827]'
                }`}
              >
                <input type="radio" name="type" className="sr-only" checked={on} onChange={() => update({ type: value })} />
                {label}
                <span className="text-[11px] font-normal text-[#5b6676]">{n}</span>
              </label>
            );
          })}
        </div>
        <p className="mt-3 text-[12px] leading-[1.5] text-[#5b6676]">Companies are registered with RDB. Ideas are not yet registered.</p>
      </div>
      <div role="radiogroup" aria-labelledby="f-stage" className="border-b border-[#eef1f5] px-5 py-5">
        <p id="f-stage" className="mb-2 text-[13px] font-semibold text-[#111827]">
          Stage
        </p>
        <div className="space-y-0.5">
          {[['', 'All stages', stageTotal], ...STAGES.map((s) => [s, s, facets.stage[s] || 0])].map(([value, label, n]) => {
            const on = filters.stage === value;
            return (
              <label
                key={label}
                className={`flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-[14px] transition-colors focus-within:outline-2 focus-within:outline-[#2563eb] ${
                  on ? 'bg-[#e8efff] font-semibold text-[#1d4ed8]' : n ? 'text-[#111827] hover:bg-[#f9fafb]' : 'text-[#98a2b3] hover:bg-[#f9fafb]'
                }`}
              >
                <input type="radio" name="stage" checked={on} onChange={() => update({ stage: value })} className="h-4 w-4 accent-[#2563eb]" />
                <span className="flex-1">{label}</span>
                <span className="text-[12px] tabular-nums text-[#5b6676]">{n}</span>
              </label>
            );
          })}
        </div>
      </div>
      <p className="border-b border-[#eef1f5] px-5 py-4 text-[12px] leading-[1.5] text-[#5b6676]">Filter by sector from the search bar above.</p>
      <div className="bg-[#f9fafb] px-5 py-5">
        <p className="text-[14px] font-semibold text-[#111827]">Have a project code?</p>
        <p className="mt-1 text-[12px] leading-[1.5] text-[#5b6676]">Founders share their code with people they choose. Confirm a record on the Verify page.</p>
        <Link to="/verify" className="mt-3 inline-flex items-center gap-0.5 text-[13px] font-semibold text-[#2563eb] hover:underline">
          Verify a project
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );

  return (
    <>
      <Hero
        eyebrow="Verified ventures"
        title="Discover ventures built by ALU graduates"
        lede="Every venture here was reviewed by an administrator. Request an introduction and the founder decides whether to connect."
      >
        <form
          role="search"
          className="land-rise mx-auto mt-10 flex max-w-[820px] flex-col gap-2 rounded-xl bg-white p-2 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.6)] sm:flex-row sm:items-center"
          style={{ '--d': '240ms' }}
          onSubmit={(e) => {
            e.preventDefault();
            update({ q: search.trim(), sector: sectorDraft });
          }}
        >
          <label className="relative flex flex-1 items-center">
            <span className="sr-only">Search ventures</span>
            <Search className="pointer-events-none absolute left-3 h-5 w-5 text-[#8a94a3]" aria-hidden="true" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search ventures, sectors or countries"
              className="h-11 w-full rounded-md bg-transparent pl-11 pr-3 text-[15px] text-[#111827] outline-none placeholder:text-[#8a94a3] focus:ring-[3px] focus:ring-[#2563eb]/15"
            />
          </label>
          <span className="hidden h-8 w-px bg-[#e3e8ef] sm:block" aria-hidden="true" />
          <label className="relative flex items-center">
            <span className="sr-only">Sector</span>
            <select
              value={sectorDraft}
              onChange={(e) => setSectorDraft(e.target.value)}
              className="h-11 w-full cursor-pointer appearance-none rounded-md bg-transparent pl-3 pr-9 text-[14px] font-medium text-[#111827] outline-none focus:ring-[3px] focus:ring-[#2563eb]/15 sm:w-[190px]"
            >
              <option value="">All sectors</option>
              {SECTORS.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 h-4 w-4 text-[#5b6676]" aria-hidden="true" />
          </label>
          <button type="submit" className="h-11 rounded-md bg-[#2563eb] px-6 text-[14px] font-semibold text-white transition-colors hover:bg-[#1d4ed8]">
            Search
          </button>
        </form>
        {popular.length > 0 && (
          <div className="land-rise mt-5 flex flex-wrap items-center justify-center gap-2" style={{ '--d': '320ms' }}>
            <span className="text-[13px] text-white/50">Popular:</span>
            {popular.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={filters.sector === s}
                onClick={() => update({ sector: filters.sector === s ? '' : s })}
                className={`rounded-full border px-3 py-1.5 text-[13px] transition-colors ${
                  filters.sector === s
                    ? 'border-[#60a5fa] bg-[#3b82f633] text-white'
                    : 'border-white/[0.12] bg-white/[0.05] text-white/80 hover:bg-white/[0.1] hover:text-white'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </Hero>

      <section className="flex-1 bg-[#f4f6f9] px-4 py-10 sm:px-8 lg:px-16">
        <div className="mx-auto flex max-w-[1312px] flex-col gap-8 lg:flex-row">
          <div className="lg:w-[272px] lg:shrink-0">
            <button
              type="button"
              className="flex h-10 w-full items-center justify-between rounded-lg border border-[#e3e8ef] bg-white px-4 text-[14px] font-semibold text-[#111827] lg:hidden"
              aria-expanded={filtersOpen}
              aria-controls="venture-filters"
              onClick={() => setFiltersOpen((o) => !o)}
            >
              Filters{active ? ` (${active})` : ''}
              <ChevronDown className={`h-4 w-4 transition-transform ${filtersOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
            </button>
            <div id="venture-filters" className={`${filtersOpen ? 'mt-3 block' : 'hidden'} lg:sticky lg:top-[96px] lg:mt-0 lg:block`}>
              {filterPanel}
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
              <div aria-live="polite">
                <h2 className="text-[17px] font-semibold text-[#111827]">{data ? plural(data.total, 'verified venture') : 'Loading ventures…'}</h2>
                {data && data.total > 0 && (
                  <p className="text-[13px] text-[#5b6676]">
                    Showing {from}–{to}, {SORT_PHRASE[filters.sort]}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Select label="Sort ventures" value={filters.sort} onChange={(v) => update({ sort: v })}>
                  {Object.entries(SORT_LABEL).map(([v, l]) => (
                    <option key={v} value={v}>
                      Sort: {l}
                    </option>
                  ))}
                </Select>
                <div className="flex rounded-md bg-[#eef1f5] p-0.5" role="group" aria-label="Layout">
                  {[
                    ['cards', 'Cards'],
                    ['table', 'Table'],
                  ].map(([v, l]) => (
                    <button
                      key={v}
                      type="button"
                      aria-pressed={view === v}
                      onClick={() => {
                        const next = Object.fromEntries(params.entries());
                        if (v === 'table') next.view = 'table';
                        else delete next.view;
                        setParams(next);
                      }}
                      className={`h-8 rounded px-3 text-[13px] font-semibold transition-colors ${view === v ? 'bg-white text-[#111827] shadow-sm' : 'text-[#5b6676] hover:text-[#111827]'}`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {error && <p className="rounded-lg border border-[#f5c2c2] bg-[#fdeaea] px-4 py-3 text-[13px] text-[#991b1b]">{error}</p>}
            {!data && !error && (
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3" aria-hidden="true">
                {[0, 1, 2].map((i) => (
                  <CardSkeleton key={i} />
                ))}
              </div>
            )}
            {data && data.projects.length === 0 && (
              <div className="rounded-xl border border-dashed border-[#c3ccd8] bg-white px-6 py-14 text-center">
                <p className="text-[15px] font-semibold text-[#111827]">No ventures match these filters.</p>
                <p className="mt-1 text-[13px] text-[#5b6676]">Try another search or clear the filters.</p>
                {active > 0 && (
                  <button type="button" onClick={reset} className="mt-4 text-[13px] font-semibold text-[#2563eb] hover:underline">
                    Clear filters
                  </button>
                )}
              </div>
            )}
            {data &&
              data.projects.length > 0 &&
              (view === 'table' ? (
                <VentureTable rows={data.projects} />
              ) : (
                <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                  {data.projects.map((p, i) => (
                    <VentureCard key={p.id} p={p} index={i} />
                  ))}
                </div>
              ))}

            {data && data.total > 0 && (
              <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
                <p className="text-[13px] text-[#5b6676]">
                  Page {data.page} of {pages}
                </p>
                <Pagination page={data.page} pages={pages} onPage={(n) => update({ page: n > 1 ? String(n) : '' })} />
              </div>
            )}

            {!user && (
              <div
                className="mt-10 flex flex-col gap-5 rounded-2xl px-6 py-7 text-white sm:flex-row sm:items-center sm:justify-between sm:px-8"
                style={{ background: 'radial-gradient(70% 120% at 100% 0%, rgba(37,99,235,0.35), rgba(37,99,235,0) 70%), #0b1424' }}
              >
                <div>
                  <h2 className="text-[19px] font-semibold">Want to meet a founder?</h2>
                  <p className="mt-1 max-w-[560px] text-[14px] leading-[1.55] text-white/75">
                    Approved investors and sponsors can request introductions. Founders decide whether to share contact details.
                  </p>
                </div>
                <Link
                  to="/register?role=investor"
                  className="inline-flex h-11 shrink-0 items-center justify-center rounded-full bg-[#2563eb] px-6 text-[14px] font-semibold text-white transition-colors hover:bg-[#1d4ed8]"
                >
                  Request investor access
                </Link>
              </div>
            )}
          </div>
        </div>
      </section>
    </>
  );
}

// ---- Opportunities ----------------------------------------------------------------------------

const TYPE_LABEL = { grant: 'Grant', hackathon: 'Hackathon', competition: 'Competition', other: 'Other' };
const TYPE_PILL = {
  hackathon: 'bg-[#fdf1e3] text-[#b45309]',
  grant: 'bg-[#e7f6ec] text-[#15803d]',
  competition: 'bg-[#f3e8ff] text-[#7e22ce]',
  other: 'bg-[#eef1f5] text-[#475467]',
};
const TABS = [
  ['', 'All'],
  ['grant', 'Grants'],
  ['hackathon', 'Hackathons'],
  ['competition', 'Competitions'],
  ['other', 'Other'],
];
const OPP_SORTS = { soonest: 'Closing soonest', latest: 'Closing latest', title: 'Name A–Z' };

// The published criteria are structured (sectors, project types, stages,
// cohorts, notes); same wording as the graduate workspace.
function criteriaText(c = {}) {
  const parts = ['Verified ALU graduates with an approved venture'];
  if (c.sectors?.length) parts.push(`Sectors: ${c.sectors.join(', ')}`);
  if (c.projectTypes?.length === 1) parts.push(c.projectTypes[0] === 'company' ? 'Registered companies only' : 'Idea-stage projects only');
  if (c.stages?.length) parts.push(`Stages: ${c.stages.join(', ')}`);
  if (c.minCohortYear || c.maxCohortYear) parts.push(`Cohorts ${c.minCohortYear || '…'}–${c.maxCohortYear || '…'}`);
  return parts.join(' · ');
}

const DAY = 864e5;
function timeLeft(deadline, now) {
  const ms = new Date(deadline) - now;
  const hours = Math.floor(ms / 36e5);
  const days = Math.floor(ms / DAY);
  if (hours < 1) return { label: 'Closes within the hour', short: 'Under 1 hour', urgent: true };
  if (days < 1) return { label: `Closes in ${plural(hours, 'hour')}`, short: plural(hours, 'hour'), urgent: true };
  if (days <= 7) return { label: `Closes in ${plural(days, 'day')}`, short: plural(days, 'day'), urgent: true };
  return { label: `${days} days left`, short: `${days} days`, urgent: false };
}

function OpportunityCard({ o, now, index, user, gated }) {
  const [open, setOpen] = useState(false);
  const left = timeLeft(o.deadline, now);
  const canApply = !user || user.role === 'graduate';
  const applyTo = user ? '/app/opportunities' : gated('/app/go/opportunities');
  return (
    <article
      className={`land-rise rounded-xl border bg-white p-6 transition-[border-color,box-shadow] duration-300 hover:shadow-[0_12px_32px_-18px_rgba(16,24,40,0.3)] ${
        left.urgent ? 'border-[#f5c99a] shadow-[0_0_0_3px_rgba(245,158,11,0.08)]' : 'border-[#e3e8ef]'
      }`}
      style={{ '--d': `${Math.min(index, 6) * 70}ms` }}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[19px] font-semibold text-[#111827]">{o.title}</h3>
            <span className={`rounded-md px-2 py-0.5 text-[12px] font-semibold ${TYPE_PILL[o.type] || TYPE_PILL.other}`}>{TYPE_LABEL[o.type] || o.type}</span>
          </div>
          <p className="mt-1 text-[13px] text-[#5b6676]">by {o.organiser || 'ALU Ventures'}</p>
        </div>
        <span
          className={`w-fit shrink-0 rounded-full px-2.5 py-1 text-[12px] font-semibold ${left.urgent ? 'bg-[#fdf1e3] text-[#b45309]' : 'bg-[#eef1f5] text-[#475467]'}`}
        >
          {left.label}
        </span>
      </div>
      <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className={`text-[14px] leading-[1.6] text-[#344054] ${open ? '' : 'line-clamp-2'}`}>{o.description}</p>
          <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1.5 text-[13px]">
            <div className="flex gap-1.5">
              <dt className="text-[#5b6676]">Prize:</dt>
              <dd className="font-semibold text-[#111827]">{o.prize || 'To be announced'}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="text-[#5b6676]">Closes:</dt>
              <dd className="font-semibold text-[#111827]">{formatDate(o.deadline, true)}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="text-[#5b6676]">{o.linkOnly ? 'Apply:' : 'Eligibility:'}</dt>
              <dd className="font-semibold text-[#111827]">{o.linkOnly ? 'On the official site' : 'Approved venture'}</dd>
            </div>
          </dl>
        </div>
        {o.linkOnly ? (
          // No internal form: the organiser runs applications on their own site.
          <a
            href={o.externalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-10 shrink-0 items-center justify-center rounded-md bg-[#2563eb] px-4 text-[14px] font-semibold text-white transition-colors hover:bg-[#1d4ed8]"
          >
            Apply on the official site
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        ) : (
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className={`inline-flex h-10 shrink-0 items-center justify-center gap-1 rounded-md px-4 text-[14px] font-semibold transition-colors ${
              left.urgent ? 'bg-[#2563eb] text-white hover:bg-[#1d4ed8]' : 'border border-[#d9dfe7] bg-white text-[#111827] hover:bg-[#f9fafb]'
            }`}
          >
            {open ? 'Hide details' : 'View and apply'}
            <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>
        )}
      </div>
      {open && (
        <div className="land-rise mt-5 grid gap-5 border-t border-[#eef1f5] pt-5 text-[14px] leading-[1.6] text-[#344054] sm:grid-cols-2">
          <div>
            <h4 className="text-[13px] font-semibold text-[#111827]">Who can apply</h4>
            <p className="mt-1">{criteriaText(o.criteria || {})}</p>
            {o.criteria?.notes && <p className="mt-1 whitespace-pre-line">{o.criteria.notes}</p>}
          </div>
          <div>
            <h4 className="text-[13px] font-semibold text-[#111827]">How to apply</h4>
            <p className="mt-1 whitespace-pre-line">
              {o.applicationInstructions || 'Apply from your graduate workspace with an approved venture before the deadline.'}
            </p>
          </div>
          <div className="sm:col-span-2">
            {canApply ? (
              <Link
                to={applyTo}
                className="inline-flex h-10 items-center rounded-md bg-[#2563eb] px-4 text-[14px] font-semibold text-white transition-colors hover:bg-[#1d4ed8]"
              >
                {user ? 'Apply from your workspace' : 'Create an account to apply'}
              </Link>
            ) : (
              <p className="text-[13px] text-[#5b6676]">Applications come from ALU graduate accounts with an approved venture.</p>
            )}
          </div>
        </div>
      )}
    </article>
  );
}

export function PublicOpportunities() {
  const { user } = useAuth();
  const gated = useGated();
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const type = TABS.some(([v]) => v === params.get('type')) ? params.get('type') : '';
  const sort = OPP_SORTS[params.get('sort')] ? params.get('sort') : 'soonest';

  useEffect(() => {
    document.title = 'Opportunities · ALU Ventures';
    api
      .get('/public/opportunities')
      .then((d) => setRows(d.opportunities))
      .catch((e) => setError(e.message));
    // Keeps the countdowns current while the page stays open.
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  const set = (changes) => {
    const next = { type, sort, ...changes };
    if (next.sort === 'soonest') next.sort = '';
    setParams(Object.fromEntries(Object.entries(next).filter(([, v]) => v)));
  };

  const open = useMemo(() => (rows || []).filter((o) => new Date(o.deadline) > now), [rows, now]);
  const counts = useMemo(() => Object.fromEntries(TABS.map(([v]) => [v, v ? open.filter((o) => o.type === v).length : open.length])), [open]);
  const shown = useMemo(() => {
    const list = open.filter((o) => !type || o.type === type);
    const by = {
      soonest: (a, b) => new Date(a.deadline) - new Date(b.deadline),
      latest: (a, b) => new Date(b.deadline) - new Date(a.deadline),
      title: (a, b) => a.title.localeCompare(b.title),
    };
    return [...list].sort(by[sort]);
  }, [open, type, sort]);
  const next = open.length ? timeLeft(open.reduce((a, b) => (new Date(a.deadline) < new Date(b.deadline) ? a : b)).deadline, now) : null;

  return (
    <>
      <Hero
        align="left"
        eyebrow="Opportunities"
        title="Hackathons, grants and competitions for ALU founders"
        lede="Apply with an approved venture before the deadline. Eligibility is checked when you apply, and results are confirmed by an administrator."
        aside={
          rows && (
            <dl className="land-rise flex w-fit overflow-hidden rounded-xl border border-white/[0.1] bg-white/[0.04]" style={{ '--d': '240ms' }}>
              <div className="flex flex-col-reverse px-6 py-4">
                <dt className="text-[13px] text-white/60">Open now</dt>
                <dd className="flex items-center gap-2 text-[28px] font-medium">
                  <span className="h-2 w-2 rounded-full bg-[#4ade80]" aria-hidden="true" />
                  {open.length}
                </dd>
              </div>
              <div className="flex flex-col-reverse border-l border-white/[0.1] px-6 py-4">
                <dt className="text-[13px] text-white/60">Next deadline</dt>
                <dd className="flex items-center gap-2 text-[28px] font-medium">
                  <span className="h-2 w-2 rounded-full bg-[#f59e0b]" aria-hidden="true" />
                  {next ? next.short : '—'}
                </dd>
              </div>
            </dl>
          )
        }
      >
        <div role="tablist" aria-label="Opportunity type" className="land-rise -mb-12 mt-10 flex gap-6 overflow-x-auto" style={{ '--d': '300ms' }}>
          {TABS.map(([v, l]) => {
            const on = type === v;
            return (
              <button
                key={l}
                role="tab"
                type="button"
                aria-selected={on}
                onClick={() => set({ type: v })}
                className={`flex shrink-0 items-center gap-2 border-b-2 pb-3.5 text-[15px] transition-colors ${
                  on ? 'border-[#60a5fa] font-semibold text-white' : 'border-transparent text-white/60 hover:text-white'
                }`}
              >
                {l}
                <span className={`rounded-full px-1.5 text-[11px] ${on ? 'bg-[#2563eb] text-white' : 'bg-white/[0.1] text-white/70'}`}>{counts[v] ?? 0}</span>
              </button>
            );
          })}
        </div>
      </Hero>

      <section className="flex-1 bg-[#f4f6f9] px-4 py-10 sm:px-8 lg:px-16">
        <div className="mx-auto flex max-w-[1312px] flex-col gap-8 lg:flex-row lg:items-start">
          <div className="min-w-0 flex-1">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-[15px] font-semibold text-[#111827]" aria-live="polite">
                {rows ? plural(shown.length, 'open opportunity', 'open opportunities') : 'Loading opportunities…'}
              </h2>
              <Select label="Sort opportunities" value={sort} onChange={(v) => set({ sort: v })}>
                {Object.entries(OPP_SORTS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            </div>
            {error && <p className="rounded-lg border border-[#f5c2c2] bg-[#fdeaea] px-4 py-3 text-[13px] text-[#991b1b]">{error}</p>}
            {!rows && !error && (
              <div className="space-y-4" aria-hidden="true">
                {[0, 1].map((i) => (
                  <div key={i} className="h-[150px] animate-pulse rounded-xl border border-[#e3e8ef] bg-white" />
                ))}
              </div>
            )}
            {rows && shown.length === 0 && (
              <div className="rounded-xl border border-dashed border-[#c3ccd8] bg-white px-6 py-14 text-center">
                <p className="text-[15px] font-semibold text-[#111827]">
                  {type ? `No open ${TABS.find(([v]) => v === type)[1].toLowerCase()} right now.` : 'No open opportunities right now.'}
                </p>
                <p className="mt-1 text-[13px] text-[#5b6676]">New opportunities are published by ALU staff.</p>
              </div>
            )}
            {shown.length > 0 && (
              <>
                <div className="space-y-4">
                  {shown.map((o, i) => (
                    <OpportunityCard key={o.id} o={o} now={now} index={i} user={user} gated={gated} />
                  ))}
                </div>
                <p className="mt-5 text-[13px] text-[#5b6676]">You&apos;ve seen all open opportunities. New ones are published by ALU staff.</p>
              </>
            )}
          </div>

          <aside className="flex flex-col gap-4 lg:sticky lg:top-[96px] lg:w-[360px] lg:shrink-0">
            <div className="rounded-xl border border-[#e3e8ef] bg-white p-6">
              <h2 className="text-[16px] font-semibold text-[#111827]">How applying works</h2>
              <ol className="mt-5 space-y-5">
                {[
                  ['Create a graduate account', 'Verified with your alumni email and degree certificate.'],
                  ['Get a venture approved', 'An administrator reviews your project and documents.'],
                  ['Apply before the deadline', 'Eligibility is checked when you apply.'],
                ].map(([t, b], i) => (
                  <li key={t} className="flex gap-3.5">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#e8efff] text-[12px] font-semibold text-[#1d4ed8]">
                      {i + 1}
                    </span>
                    <span>
                      <span className="block text-[14px] font-semibold text-[#111827]">{t}</span>
                      <span className="mt-0.5 block text-[13px] leading-[1.5] text-[#5b6676]">{b}</span>
                    </span>
                  </li>
                ))}
              </ol>
              {!user && (
                <>
                  <Link
                    to="/register"
                    className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-md bg-[#2563eb] text-[14px] font-semibold text-white transition-colors hover:bg-[#1d4ed8]"
                  >
                    Create a graduate account
                  </Link>
                  <p className="mt-3 text-center text-[13px] text-[#5b6676]">
                    Already registered?{' '}
                    <Link to="/signin?next=%2Fapp%2Fgo%2Fopportunities" className="font-semibold text-[#2563eb] hover:underline">
                      Sign in
                    </Link>
                  </p>
                </>
              )}
              {user?.role === 'graduate' && (
                <Link
                  to="/app/opportunities"
                  className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-md bg-[#2563eb] text-[14px] font-semibold text-white transition-colors hover:bg-[#1d4ed8]"
                >
                  Go to your opportunities
                </Link>
              )}
            </div>
            <div className="rounded-xl border border-[#e3e8ef] bg-white p-6">
              <h2 className="text-[15px] font-semibold text-[#111827]">Running a hackathon or grant?</h2>
              <p className="mt-1 text-[13px] leading-[1.55] text-[#5b6676]">
                ALU staff publish opportunities from the staff workspace. Contact the team to list yours.
              </p>
              <Link to="/app/contact" className="mt-3 inline-flex items-center gap-0.5 text-[13px] font-semibold text-[#2563eb] hover:underline">
                Contact the team
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}

// ---- One public venture (by id) ---------------------------------------------------------------

export function PublicProject() {
  const { id } = useParams();
  const { user } = useAuth();
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    setResult(null);
    setError('');
    api
      .get(`/public/projects/${encodeURIComponent(id)}`)
      .then((r) => {
        setResult(r);
        document.title = `${r.project.title} · ALU Ventures`;
      })
      .catch((e) => setError(e.message));
  }, [id]);
  return (
    <PublicPage>
      <AdminPage title={result?.project.title || 'Venture'}>
        <p className="adm-hint">
          <Link to="/ventures" className="adm-a">
            Browse ventures
          </Link>
          {result && ` / ${result.project.title}`}
        </p>
        <Messages error={error} />
        {!result && !error && <Loading />}
        {result && <ProjectRecord project={result.project} disclaimer={result.disclaimer} />}
        {result && !user && (
          <p className="adm-hint mt-3">
            Investor or sponsor?{' '}
            <Link to="/register?role=investor" className="adm-a">
              Request investor access
            </Link>{' '}
            to ask the founder for an introduction.
          </p>
        )}
      </AdminPage>
    </PublicPage>
  );
}
