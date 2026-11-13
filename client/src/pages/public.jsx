import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { BadgeCheck, Building2, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, ExternalLink, Info, Lightbulb, Search, Trophy } from 'lucide-react';
import { api, qs } from '../lib/api';
import { SECTORS, STAGES } from '../lib/constants';
import { formatDate } from '../components/ui';
import { AdminPage, Loading, Messages } from '../components/admin';
import { useAuth } from '../context/AuthContext';
import { useGated } from '../components/site/SiteChrome';

// Public pages. No project code is ever shown here: a venture is reached by
// its id, and the Verify page only confirms a code the visitor already has.

function PublicPage({ children }) {
  return <div className="mx-auto max-w-6xl px-4 py-8">{children}</div>;
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
              className="input !h-11 font-mono uppercase md:!h-8"
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
        className="shrink-0 rounded-full object-cover ring-2 ring-[var(--s-card)]"
      />
    );
  }
  return (
    <span
      style={style}
      className="flex shrink-0 items-center justify-center rounded-full bg-s-fill text-[14px] font-semibold text-s-soft ring-2 ring-[var(--s-card)]"
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
      className="relative overflow-hidden px-4 pb-12 pt-16 text-s-ink sm:px-8 lg:px-16 lg:pt-[72px]"
      style={{ background: 'radial-gradient(60% 90% at 50% 0%, rgba(37,99,235,0.2), rgba(37,99,235,0) 70%), var(--s-bg)' }}
    >
      <div className={`mx-auto max-w-[1312px] ${align === 'center' ? 'text-center' : ''}`}>
        <div className={`flex flex-col gap-8 ${aside ? 'lg:flex-row lg:items-end lg:justify-between' : ''}`}>
          <div className={align === 'center' ? 'mx-auto max-w-[1000px]' : 'max-w-[720px]'}>
            <p className="land-rise text-[12px] font-semibold uppercase tracking-[1.6px] text-s-accent">{eyebrow}</p>
            <h1
              className="land-rise mt-4 text-[34px] font-medium leading-[1.08] tracking-[-1px] sm:text-[44px] lg:text-[52px] lg:tracking-[-1.6px]"
              style={{ '--d': '80ms' }}
            >
              {title}
            </h1>
            <p
              className={`land-rise mt-5 text-[16px] leading-[1.6] text-s-soft sm:text-[17px] ${align === 'center' ? 'mx-auto max-w-[640px]' : 'max-w-[680px]'}`}
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
        className="h-11 w-full cursor-pointer appearance-none rounded-md border lg:h-9 border-s-line-2 bg-s-card pl-3 pr-8 text-[13px] font-medium text-s-ink outline-none transition-colors hover:border-s-line-3 focus:border-[#2563eb] focus:ring-[3px] focus:ring-[#2563eb]/15"
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 h-4 w-4 text-s-muted" aria-hidden="true" />
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
        className={`${btn} border-s-line bg-s-card text-s-muted hover:bg-s-subtle`}
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
          className={`${btn} ${n === page ? 'border-[#2563eb] bg-[#2563eb] text-white' : 'border-s-line bg-s-card text-s-ink hover:bg-s-subtle'}`}
        >
          {n}
        </button>
      ))}
      <button
        type="button"
        className={`${btn} border-s-line bg-s-card text-s-muted hover:bg-s-subtle`}
        disabled={page >= pages}
        onClick={() => onPage(page + 1)}
        aria-label="Next page"
      >
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </button>
    </nav>
  );
}

// Funding status of a public venture, as a short badge. Public ventures are
// approved records; the label follows the project's status.
const FUNDING = {
  approved: ['Seeking investment', 'bg-[#e7f6ec] text-[#15803d] dark:bg-[#13301f] dark:text-[#4ade80]'],
  funded: ['Fully funded', 'bg-[#e8efff] text-[#1d4ed8] dark:bg-[#1b2b4a] dark:text-[#93c5fd]'],
  investor_limit_reached: ['Investor limit reached', 'bg-[#fdf1e3] text-[#b45309] dark:bg-[#352512] dark:text-[#fbbf24]'],
};
function FundingBadge({ status, className = '' }) {
  const [label, tone] = FUNDING[status] || FUNDING.approved;
  return <span className={`inline-flex h-6 items-center whitespace-nowrap rounded-full px-2.5 text-[12px] font-semibold ${tone} ${className}`}>{label}</span>;
}

// Small neutral chip; the sector chip carries its colour in a dot only, so
// the text stays readable in both themes.
function Chip({ children, dot }) {
  return (
    <span className="inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-md bg-s-fill px-2 text-[12px] font-medium text-s-ink-2">
      {dot && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: dot }} aria-hidden="true" />}
      {children}
    </span>
  );
}

// Shown when the founder has not added a background image.
function ImagePlaceholder({ type, className = '' }) {
  const Icon = type === 'company' ? Building2 : Lightbulb;
  return (
    <div className={`flex items-center justify-center bg-gradient-to-br from-s-fill-2 to-s-fill ${className}`} aria-hidden="true">
      <Icon className="h-8 w-8 text-s-faint" strokeWidth={1.5} />
    </div>
  );
}

const CARD_BASE =
  'rounded-2xl border border-s-line bg-s-card shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-[transform,box-shadow,border-color] duration-300';
const CARD_HOVER =
  'hover:-translate-y-0.5 hover:border-s-line-3 hover:shadow-[0_16px_40px_-20px_rgba(16,24,40,0.35)] focus-within:border-s-line-3 focus-within:ring-2 focus-within:ring-[var(--s-focus)] motion-reduce:hover:translate-y-0';

function VentureCard({ p, index }) {
  return (
    <article className={`land-rise group relative flex flex-col overflow-hidden ${CARD_BASE} ${CARD_HOVER}`} style={{ '--d': `${Math.min(index, 8) * 60}ms` }}>
      <div className="relative aspect-[16/9] overflow-hidden border-b border-s-line">
        {p.imageUrl ? (
          <img
            src={p.imageUrl}
            alt={`Background image for ${p.title}`}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03] motion-reduce:group-hover:scale-100"
          />
        ) : (
          <ImagePlaceholder type={p.type} className="h-full w-full" />
        )}
        <FundingBadge status={p.status} className="absolute left-3 top-3 shadow-sm" />
      </div>
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex flex-wrap gap-1.5">
          <Chip dot={tint(p.sector)}>{p.sector}</Chip>
          {p.stage && <Chip>{p.stage}</Chip>}
          {p.country && <Chip>{p.country}</Chip>}
        </div>
        <h3 className="text-[18px] font-semibold leading-snug tracking-[-0.2px] text-s-ink">
          {/* The title link covers the whole card. */}
          <Link to={`/ventures/${p.id}`} className="after:absolute after:inset-0 focus-visible:outline-none">
            {p.title}
          </Link>
        </h3>
        <p className="line-clamp-2 text-[14px] leading-[1.55] text-s-muted">{p.summary}</p>
        {p.founder?.name && (
          <p className="flex min-w-0 items-center gap-2 text-[12px] text-s-muted">
            <FounderAvatar founder={p.founder} size={24} />
            <span className="truncate">
              {p.founder.name} · Verified ALU graduate{p.founder.cohortYear ? `, ${p.founder.cohortYear}` : ''}
            </span>
          </p>
        )}
        <span className="mt-auto inline-flex h-11 items-center justify-center gap-1 rounded-lg border border-s-line-2 text-[14px] font-semibold text-s-ink transition-colors group-hover:border-[#2563eb] group-hover:bg-[#2563eb] group-hover:text-white">
          View venture
          <ChevronRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden="true" />
        </span>
      </div>
    </article>
  );
}

function VentureTable({ rows }) {
  return (
    <div className="land-rise overflow-x-auto rounded-2xl border border-s-line bg-s-card">
      <table className="w-full min-w-[720px] text-left text-[13px]">
        <thead className="border-b border-s-line bg-s-subtle text-[12px] font-semibold text-s-muted">
          <tr>
            <th className="px-4 py-3">Venture</th>
            <th className="px-4 py-3">Sector</th>
            <th className="px-4 py-3">Stage</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">
              <span className="sr-only">Open</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id} className="border-b border-s-line last:border-0 hover:bg-s-subtle">
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <FounderAvatar founder={p.founder} size={36} />
                  <div className="min-w-0">
                    <p className="font-semibold text-s-ink">{p.title}</p>
                    <p className="line-clamp-1 text-[12px] text-s-muted">{p.summary}</p>
                  </div>
                </div>
              </td>
              <td className="px-4 py-3">
                <Chip dot={tint(p.sector)}>{p.sector}</Chip>
              </td>
              <td className="px-4 py-3 text-s-ink-2">{p.stage}</td>
              <td className="px-4 py-3">
                <FundingBadge status={p.status} />
              </td>
              <td className="px-4 py-3 text-right">
                <Link to={`/ventures/${p.id}`} className="inline-flex min-h-11 items-center gap-0.5 whitespace-nowrap font-semibold text-s-link hover:underline">
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

function Bone({ className = '' }) {
  return <div className={`animate-pulse rounded bg-s-fill-2 motion-reduce:animate-none ${className}`} />;
}

function CardSkeleton() {
  return (
    <div className={`overflow-hidden ${CARD_BASE}`}>
      <Bone className="aspect-[16/9] !rounded-none" />
      <div className="space-y-3 p-5">
        <div className="flex gap-1.5">
          <Bone className="h-6 w-20" />
          <Bone className="h-6 w-14" />
        </div>
        <Bone className="h-5 w-2/3" />
        <Bone className="h-3 w-full" />
        <Bone className="h-3 w-4/5" />
        <Bone className="mt-2 h-11 w-full !rounded-lg" />
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
    <div className="overflow-hidden rounded-xl border border-s-line bg-s-card">
      <div className="flex items-center justify-between border-b border-s-line px-5 py-4">
        <h2 className="text-[15px] font-semibold text-s-ink">Refine results</h2>
        <button type="button" onClick={reset} disabled={!active} className="text-[13px] font-medium text-s-muted hover:text-s-ink disabled:opacity-40">
          Reset
        </button>
      </div>
      <div role="radiogroup" aria-labelledby="f-type" className="border-b border-s-line px-5 py-5">
        <p id="f-type" className="mb-3 text-[13px] font-semibold text-s-ink">
          Venture type
        </p>
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-s-fill p-1">
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
                  on ? 'bg-s-card font-semibold text-s-ink shadow-sm' : 'text-s-muted hover:text-s-ink'
                }`}
              >
                <input type="radio" name="type" className="sr-only" checked={on} onChange={() => update({ type: value })} />
                {label}
                <span className="text-[11px] font-normal text-s-muted">{n}</span>
              </label>
            );
          })}
        </div>
        <p className="mt-3 text-[12px] leading-[1.5] text-s-muted">Companies are registered with RDB. Ideas are not yet registered.</p>
      </div>
      <div role="radiogroup" aria-labelledby="f-stage" className="border-b border-s-line px-5 py-5">
        <p id="f-stage" className="mb-2 text-[13px] font-semibold text-s-ink">
          Stage
        </p>
        <div className="space-y-0.5">
          {[['', 'All stages', stageTotal], ...STAGES.map((s) => [s, s, facets.stage[s] || 0])].map(([value, label, n]) => {
            const on = filters.stage === value;
            return (
              <label
                key={label}
                className={`flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-[14px] transition-colors focus-within:outline-2 focus-within:outline-[#2563eb] ${
                  on ? 'bg-s-accent-soft font-semibold text-s-accent' : n ? 'text-s-ink hover:bg-s-subtle' : 'text-s-faint hover:bg-s-subtle'
                }`}
              >
                <input type="radio" name="stage" checked={on} onChange={() => update({ stage: value })} className="h-4 w-4 accent-[#2563eb]" />
                <span className="flex-1">{label}</span>
                <span className="text-[12px] tabular-nums text-s-muted">{n}</span>
              </label>
            );
          })}
        </div>
      </div>
      <p className="border-b border-s-line px-5 py-4 text-[12px] leading-[1.5] text-s-muted">Filter by sector from the search bar above.</p>
      <div className="bg-s-subtle px-5 py-5">
        <p className="text-[14px] font-semibold text-s-ink">Have a project code?</p>
        <p className="mt-1 text-[12px] leading-[1.5] text-s-muted">Founders share their code with people they choose. Confirm a record on the Verify page.</p>
        <Link to="/verify" className="mt-3 inline-flex items-center gap-0.5 text-[13px] font-semibold text-s-link hover:underline">
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
          className="land-rise mx-auto mt-10 flex max-w-[820px] flex-col gap-2 rounded-xl bg-s-card p-2 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.6)] sm:flex-row sm:items-center"
          style={{ '--d': '240ms' }}
          onSubmit={(e) => {
            e.preventDefault();
            update({ q: search.trim(), sector: sectorDraft });
          }}
        >
          <label className="relative flex flex-1 items-center">
            <span className="sr-only">Search ventures</span>
            <Search className="pointer-events-none absolute left-3 h-5 w-5 text-s-faint" aria-hidden="true" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search ventures, sectors or countries"
              className="h-11 w-full rounded-md bg-transparent pl-11 pr-3 text-[15px] text-s-ink outline-none placeholder:text-s-faint focus:ring-[3px] focus:ring-[#2563eb]/15"
            />
          </label>
          <span className="hidden h-8 w-px bg-s-fill-2 sm:block" aria-hidden="true" />
          <label className="relative flex items-center">
            <span className="sr-only">Sector</span>
            <select
              value={sectorDraft}
              onChange={(e) => setSectorDraft(e.target.value)}
              className="h-11 w-full cursor-pointer appearance-none rounded-md bg-transparent pl-3 pr-9 text-[14px] font-medium text-s-ink outline-none focus:ring-[3px] focus:ring-[#2563eb]/15 sm:w-[190px]"
            >
              <option value="">All sectors</option>
              {SECTORS.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 h-4 w-4 text-s-muted" aria-hidden="true" />
          </label>
          <button type="submit" className="h-11 rounded-md bg-[#2563eb] px-6 text-[14px] font-semibold text-white transition-colors hover:bg-[#1d4ed8]">
            Search
          </button>
        </form>
        {popular.length > 0 && (
          <div className="land-rise mt-5 flex flex-wrap items-center justify-center gap-2" style={{ '--d': '320ms' }}>
            <span className="text-[13px] text-s-muted">Popular:</span>
            {popular.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={filters.sector === s}
                onClick={() => update({ sector: filters.sector === s ? '' : s })}
                className={`inline-flex min-h-11 items-center rounded-full border px-3 py-1.5 text-[13px] transition-colors lg:min-h-0 ${
                  filters.sector === s
                    ? 'border-[#60a5fa] bg-[#3b82f633] text-s-ink'
                    : 'border-s-line-2 bg-s-fill text-s-soft hover:bg-s-fill-2 hover:text-s-ink'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </Hero>

      <section className="flex-1 bg-s-canvas px-4 py-10 sm:px-8 lg:px-16">
        <div className="mx-auto flex max-w-[1312px] flex-col gap-8 lg:flex-row">
          <div className="lg:w-[272px] lg:shrink-0">
            <button
              type="button"
              className="flex h-11 w-full items-center justify-between rounded-lg border border-s-line bg-s-card px-4 text-[14px] font-semibold text-s-ink lg:hidden"
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
                <h2 className="text-[17px] font-semibold text-s-ink">{data ? plural(data.total, 'verified venture') : 'Loading ventures…'}</h2>
                {data && data.total > 0 && (
                  <p className="text-[13px] text-s-muted">
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
                <div className="hidden rounded-md bg-s-fill p-0.5 md:flex" role="group" aria-label="Layout">
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
                      className={`h-11 rounded px-3 text-[13px] font-semibold transition-colors lg:h-8 ${view === v ? 'bg-s-card text-s-ink shadow-sm' : 'text-s-muted hover:text-s-ink'}`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {error && <p className="rounded-lg border border-[#f5c2c2] dark:border-[#7f1d1d] bg-[#fdeaea] dark:bg-[#3a1717] px-4 py-3 text-[13px] text-[#991b1b] dark:text-[#fca5a5]">{error}</p>}
            {!data && !error && (
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3" aria-hidden="true">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <CardSkeleton key={i} />
                ))}
              </div>
            )}
            {data && data.projects.length === 0 && (
              <div className="rounded-2xl border border-dashed border-s-line-3 bg-s-card px-6 py-14 text-center">
                <Search className="mx-auto mb-3 h-6 w-6 text-s-faint" aria-hidden="true" />
                <p className="text-[15px] font-semibold text-s-ink">No ventures match these filters.</p>
                <p className="mt-1 text-[13px] text-s-muted">Try another search or clear the filters.</p>
                {active > 0 && (
                  <button type="button" onClick={reset} className="mt-4 text-[13px] font-semibold text-s-link hover:underline">
                    Clear filters
                  </button>
                )}
              </div>
            )}
            {data &&
              data.projects.length > 0 &&
              (view === 'table' ? (
                <>
                  <div className="hidden md:block">
                    <VentureTable rows={data.projects} />
                  </div>
                  <div className="grid gap-5 sm:grid-cols-2 md:hidden">
                    {data.projects.map((p, i) => (
                      <VentureCard key={p.id} p={p} index={i} />
                    ))}
                  </div>
                </>
              ) : (
                <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                  {data.projects.map((p, i) => (
                    <VentureCard key={p.id} p={p} index={i} />
                  ))}
                </div>
              ))}

            {data && data.total > 0 && (
              <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
                <p className="text-[13px] text-s-muted">
                  Page {data.page} of {pages}
                </p>
                <Pagination page={data.page} pages={pages} onPage={(n) => update({ page: n > 1 ? String(n) : '' })} />
              </div>
            )}

            {!user && (
              <div
                className="mt-10 flex flex-col gap-5 rounded-2xl border border-s-line px-6 py-7 text-s-ink sm:flex-row sm:items-center sm:justify-between sm:px-8"
                style={{ background: 'radial-gradient(70% 120% at 100% 0%, rgba(37,99,235,0.35), rgba(37,99,235,0) 70%), var(--s-raised)' }}
              >
                <div>
                  <h2 className="text-[19px] font-semibold">Want to meet a founder?</h2>
                  <p className="mt-1 max-w-[560px] text-[14px] leading-[1.55] text-s-soft">
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
  hackathon: 'bg-[#fdf1e3] dark:bg-[#352512] text-[#b45309] dark:text-[#fbbf24]',
  grant: 'bg-[#e7f6ec] dark:bg-[#13301f] text-[#15803d] dark:text-[#4ade80]',
  competition: 'bg-[#f3e8ff] dark:bg-[#2e1a47] text-[#7e22ce] dark:text-[#d8b4fe]',
  other: 'bg-s-fill text-s-soft',
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

// Open or closed, with the time left when it closes within a week.
function OpenBadge({ deadline, now }) {
  if (new Date(deadline) <= now) {
    return <span className="inline-flex h-6 items-center rounded-full bg-s-fill-2 px-2.5 text-[12px] font-semibold text-s-muted">Closed</span>;
  }
  const left = timeLeft(deadline, now);
  return (
    <span
      className={`inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[12px] font-semibold ${
        left.urgent
          ? 'bg-[#fdf1e3] text-[#b45309] dark:bg-[#352512] dark:text-[#fbbf24]'
          : 'bg-[#e7f6ec] text-[#15803d] dark:bg-[#13301f] dark:text-[#4ade80]'
      }`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {left.urgent ? left.label : 'Open'}
    </span>
  );
}

function TypeChip({ type }) {
  return <span className={`inline-flex h-6 items-center rounded-md px-2 text-[12px] font-semibold ${TYPE_PILL[type] || TYPE_PILL.other}`}>{TYPE_LABEL[type] || type}</span>;
}

// A link-only opportunity is applied for on the organiser's own site.
function ExternalApply({ o, className = '' }) {
  return (
    <a
      href={o.externalUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex h-11 items-center justify-center gap-1.5 rounded-lg bg-[#2563eb] px-4 text-[14px] font-semibold text-white transition-colors hover:bg-[#1d4ed8] ${className}`}
    >
      Open link
      <ExternalLink className="h-4 w-4" aria-hidden="true" />
      <span className="sr-only"> (official site, opens in a new tab)</span>
    </a>
  );
}

function OpportunityCard({ o, now, index }) {
  return (
    <article className={`land-rise group relative flex flex-col gap-4 p-5 sm:p-6 ${CARD_BASE} ${CARD_HOVER}`} style={{ '--d': `${Math.min(index, 6) * 70}ms` }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TypeChip type={o.type} />
        <OpenBadge deadline={o.deadline} now={now} />
      </div>
      <div>
        <h3 className="text-[18px] font-semibold leading-snug tracking-[-0.2px] text-s-ink">
          <Link to={`/opportunities/${o.id}`} className="after:absolute after:inset-0 focus-visible:outline-none">
            {o.title}
          </Link>
        </h3>
        <p className="mt-1 text-[13px] text-s-muted">by {o.organiser || 'ALU Ventures'}</p>
      </div>
      <p className="line-clamp-2 text-[14px] leading-[1.6] text-s-soft">{o.description}</p>
      <dl className="grid grid-cols-2 gap-3 rounded-xl bg-s-subtle p-3 text-[13px]">
        <div className="min-w-0">
          <dt className="flex items-center gap-1.5 text-s-muted">
            <CalendarDays className="h-3.5 w-3.5 text-s-faint" aria-hidden="true" />
            Deadline
          </dt>
          <dd className="mt-0.5 font-semibold text-s-ink">{formatDate(o.deadline)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="flex items-center gap-1.5 text-s-muted">
            <Trophy className="h-3.5 w-3.5 text-s-faint" aria-hidden="true" />
            Prize
          </dt>
          <dd className="mt-0.5 truncate font-semibold text-s-ink">{o.prize || 'To be announced'}</dd>
        </div>
      </dl>
      <div className="relative z-[1] mt-auto flex flex-wrap gap-2">
        {o.linkOnly ? (
          <>
            <ExternalApply o={o} className="flex-1" />
            <Link
              to={`/opportunities/${o.id}`}
              className="inline-flex h-11 flex-1 items-center justify-center rounded-lg border border-s-line-2 px-4 text-[14px] font-semibold text-s-ink transition-colors hover:bg-s-fill"
            >
              Details
            </Link>
          </>
        ) : (
          <span className="pointer-events-none inline-flex h-11 w-full items-center justify-center gap-1 rounded-lg border border-s-line-2 text-[14px] font-semibold text-s-ink transition-colors group-hover:border-[#2563eb] group-hover:bg-[#2563eb] group-hover:text-white">
            View and apply
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </span>
        )}
      </div>
    </article>
  );
}

function OpportunitySkeleton() {
  return (
    <div className={`space-y-4 p-6 ${CARD_BASE}`}>
      <div className="flex justify-between">
        <Bone className="h-6 w-20" />
        <Bone className="h-6 w-16 !rounded-full" />
      </div>
      <Bone className="h-5 w-3/4" />
      <Bone className="h-3 w-full" />
      <Bone className="h-14 w-full !rounded-xl" />
      <Bone className="h-11 w-full !rounded-lg" />
    </div>
  );
}

export function PublicOpportunities() {
  const { user } = useAuth();
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
            <dl className="land-rise flex w-fit overflow-hidden rounded-xl border border-s-line bg-s-fill" style={{ '--d': '240ms' }}>
              <div className="flex flex-col-reverse px-6 py-4">
                <dt className="text-[13px] text-s-soft">Open now</dt>
                <dd className="flex items-center gap-2 text-[28px] font-medium">
                  <span className="h-2 w-2 rounded-full bg-[#4ade80]" aria-hidden="true" />
                  {open.length}
                </dd>
              </div>
              <div className="flex flex-col-reverse border-l border-s-line px-6 py-4">
                <dt className="text-[13px] text-s-soft">Next deadline</dt>
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
                className={`flex min-h-11 shrink-0 items-center gap-2 border-b-2 pb-3.5 text-[15px] transition-colors ${
                  on ? 'border-[#60a5fa] font-semibold text-s-ink' : 'border-transparent text-s-soft hover:text-s-ink'
                }`}
              >
                {l}
                <span className={`rounded-full px-1.5 text-[11px] ${on ? 'bg-[#2563eb] text-white' : 'bg-s-fill-2 text-s-soft'}`}>{counts[v] ?? 0}</span>
              </button>
            );
          })}
        </div>
      </Hero>

      <section className="flex-1 bg-s-canvas px-4 py-10 sm:px-8 lg:px-16">
        <div className="mx-auto flex max-w-[1312px] flex-col gap-8 lg:flex-row lg:items-start">
          <div className="min-w-0 flex-1">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-[15px] font-semibold text-s-ink" aria-live="polite">
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
            {error && <p className="rounded-lg border border-[#f5c2c2] dark:border-[#7f1d1d] bg-[#fdeaea] dark:bg-[#3a1717] px-4 py-3 text-[13px] text-[#991b1b] dark:text-[#fca5a5]">{error}</p>}
            {!rows && !error && (
              <div className="grid gap-4 md:grid-cols-2" aria-hidden="true">
                {[0, 1, 2, 3].map((i) => (
                  <OpportunitySkeleton key={i} />
                ))}
              </div>
            )}
            {rows && shown.length === 0 && (
              <div className="rounded-2xl border border-dashed border-s-line-3 bg-s-card px-6 py-14 text-center">
                <CalendarDays className="mx-auto mb-3 h-6 w-6 text-s-faint" aria-hidden="true" />
                <p className="text-[15px] font-semibold text-s-ink">
                  {type ? `No open ${TABS.find(([v]) => v === type)[1].toLowerCase()} right now.` : 'No open opportunities right now.'}
                </p>
                <p className="mt-1 text-[13px] text-s-muted">New opportunities are published by ALU staff.</p>
              </div>
            )}
            {shown.length > 0 && (
              <>
                <div className="grid gap-4 md:grid-cols-2">
                  {shown.map((o, i) => (
                    <OpportunityCard key={o.id} o={o} now={now} index={i} />
                  ))}
                </div>
                <p className="mt-5 text-[13px] text-s-muted">You&apos;ve seen all open opportunities. New ones are published by ALU staff.</p>
              </>
            )}
          </div>

          <aside className="flex flex-col gap-4 lg:sticky lg:top-[96px] lg:w-[360px] lg:shrink-0">
            <div className="rounded-xl border border-s-line bg-s-card p-6">
              <h2 className="text-[16px] font-semibold text-s-ink">How applying works</h2>
              <ol className="mt-5 space-y-5">
                {[
                  ['Create a graduate account', 'Confirm your alumni email with a one-time code; an administrator then approves you.'],
                  ['Get a venture approved', 'An administrator reviews your project and documents.'],
                  ['Apply before the deadline', 'Eligibility is checked when you apply.'],
                ].map(([t, b], i) => (
                  <li key={t} className="flex gap-3.5">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-s-accent-soft text-[12px] font-semibold text-s-accent">
                      {i + 1}
                    </span>
                    <span>
                      <span className="block text-[14px] font-semibold text-s-ink">{t}</span>
                      <span className="mt-0.5 block text-[13px] leading-[1.5] text-s-muted">{b}</span>
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
                  <p className="mt-3 text-center text-[13px] text-s-muted">
                    Already registered?{' '}
                    <Link to="/signin?next=%2Fapp%2Fgo%2Fopportunities" className="font-semibold text-s-link hover:underline">
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
            <div className="rounded-xl border border-s-line bg-s-card p-6">
              <h2 className="text-[15px] font-semibold text-s-ink">Running a hackathon or grant?</h2>
              <p className="mt-1 text-[13px] leading-[1.55] text-s-muted">
                ALU staff publish opportunities from the staff workspace. Contact the team to list yours.
              </p>
              <Link to="/app/contact" className="mt-1 inline-flex min-h-11 items-center gap-0.5 text-[13px] font-semibold text-s-link hover:underline">
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

const founderLine = (f) => `${f.name} · Verified ALU graduate${f.cohortYear ? `, Class of ${f.cohortYear}` : ''}`;

// The facts a visitor may see, as label/value rows. `code` only on Verify,
// echoing the code the visitor typed.
function KeyFacts({ project: p, code }) {
  const rows = [
    ...(code ? [['Project code', <span key="c" className="font-mono">{code}</span>]] : []),
    ['Funding sought', p.fundingSought || 'Not stated'],
    ['Type', p.type === 'company' ? 'Registered company' : 'Idea stage'],
    ...(p.companyName ? [['Company', p.companyName]] : []),
    ...(p.founder ? [['Founder', founderLine(p.founder)]] : []),
    ['Approved', formatDate(p.approvedAt)],
  ];
  return (
    <dl className="divide-y divide-s-line">
      {rows.map(([k, v]) => (
        <div key={k} className="flex flex-col gap-0.5 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
          <dt className="shrink-0 text-[13px] text-s-muted">{k}</dt>
          <dd className="min-w-0 text-[14px] font-semibold text-s-ink [overflow-wrap:anywhere] sm:text-right">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

// Title, badges and chips; used on the venture page and the Verify result.
function VentureHeader({ project: p, as: H = 'h1' }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-s-accent-soft px-2.5 text-[12px] font-semibold text-s-accent">
          <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
          Verified record
        </span>
        <FundingBadge status={p.status} />
      </div>
      <H className="text-[30px] font-semibold leading-[1.15] tracking-[-0.6px] text-s-ink [overflow-wrap:anywhere] sm:text-[38px] sm:tracking-[-1px]">{p.title}</H>
      {p.summary && <p className="max-w-[68ch] text-[16px] leading-[1.6] text-s-soft sm:text-[17px]">{p.summary}</p>}
      <div className="flex flex-wrap gap-1.5">
        <Chip dot={tint(p.sector)}>{p.sector}</Chip>
        {p.stage && <Chip>{p.stage}</Chip>}
        {p.country && <Chip>{p.country}</Chip>}
      </div>
    </div>
  );
}

function QuietNote({ children }) {
  return (
    <p className="flex gap-2 text-[12px] leading-[1.6] text-s-muted">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-s-faint" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

// Used by Verify: the record for a code, without the description.
function ProjectRecord({ project: p, code, disclaimer }) {
  return (
    <div className={`${CARD_BASE} flex flex-col gap-6 p-5 sm:p-6`}>
      {p.imageUrl && <img src={p.imageUrl} alt={`Background image for ${p.title}`} className="aspect-[16/5] w-full rounded-xl object-cover" />}
      <VentureHeader project={p} as="h2" />
      <KeyFacts project={p} code={code} />
      {disclaimer && <QuietNote>{disclaimer}</QuietNote>}
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-8" aria-hidden="true">
      <div className="space-y-4">
        <Bone className="h-6 w-48 !rounded-full" />
        <Bone className="h-10 w-3/4" />
        <Bone className="h-4 w-full max-w-[640px]" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Bone className="h-64 !rounded-2xl" />
        <Bone className="h-64 !rounded-2xl" />
      </div>
    </div>
  );
}

function Breadcrumb({ to, label, current }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-6 flex min-w-0 items-center gap-1.5 text-[13px] text-s-muted">
      <Link to={to} className="inline-flex min-h-11 items-center gap-1 font-medium text-s-link hover:underline">
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        {label}
      </Link>
      {current && (
        <>
          <span aria-hidden="true">/</span>
          <span className="truncate" aria-current="page">
            {current}
          </span>
        </>
      )}
    </nav>
  );
}

function NotListed({ title, children, back, backLabel }) {
  return (
    <div className="rounded-2xl border border-dashed border-s-line-3 bg-s-card px-6 py-14 text-center">
      <p className="text-[16px] font-semibold text-s-ink">{title}</p>
      <p className="mx-auto mt-1 max-w-[460px] text-[14px] text-s-muted">{children}</p>
      <Link to={back} className="mt-5 inline-flex h-11 items-center rounded-lg border border-s-line-2 px-4 text-[14px] font-semibold text-s-ink hover:bg-s-fill">
        {backLabel}
      </Link>
    </div>
  );
}

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
  const p = result?.project;

  return (
    <section className="flex-1 bg-s-canvas px-4 pb-16 pt-6 sm:px-8 lg:px-16">
      <div className="mx-auto max-w-[1200px]">
        <Breadcrumb to="/ventures" label="Browse ventures" current={p?.title} />
        {error && (
          <NotListed title="This venture is not available" back="/ventures" backLabel="Browse ventures">
            {error}
          </NotListed>
        )}
        {!p && !error && <DetailSkeleton />}
        {p && (
          <article className="flex flex-col gap-8">
            {p.imageUrl && (
              <img
                src={p.imageUrl}
                alt={`Background image for ${p.title}`}
                className="aspect-[16/7] w-full rounded-2xl border border-s-line object-cover sm:aspect-[16/5]"
              />
            )}
            <VentureHeader project={p} />
            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-8">
              <section className={`${CARD_BASE} p-5 sm:p-7`} aria-labelledby="about-venture">
                <h2 id="about-venture" className="text-[17px] font-semibold text-s-ink">
                  About the venture
                </h2>
                <p className="mt-3 max-w-[68ch] whitespace-pre-line text-[15px] leading-[1.75] text-s-ink-2">{p.description || p.summary}</p>
              </section>
              <aside className="flex flex-col gap-4 lg:sticky lg:top-[96px]" aria-labelledby="key-facts">
                <div className={`${CARD_BASE} p-5 sm:p-6`}>
                  <h2 id="key-facts" className="mb-4 text-[17px] font-semibold text-s-ink">
                    Key facts
                  </h2>
                  <KeyFacts project={p} />
                  {!user && (
                    <div className="mt-6 border-t border-s-line pt-5">
                      <Link
                        to="/register?role=investor"
                        className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-[#2563eb] px-4 text-[14px] font-semibold text-white transition-colors hover:bg-[#1d4ed8]"
                      >
                        Request investor access
                      </Link>
                      <p className="mt-2 text-center text-[13px] text-s-muted">Investors and sponsors can then ask the founder for an introduction.</p>
                    </div>
                  )}
                </div>
              </aside>
            </div>
            {result.disclaimer && <QuietNote>{result.disclaimer}</QuietNote>}
          </article>
        )}
      </div>
    </section>
  );
}

// ---- One opportunity (by id) ------------------------------------------------------------------
// Read from the same public list as the Opportunities page (open ones only);
// one that has closed or was withdrawn shows a short note instead.
export function PublicOpportunity() {
  const { id } = useParams();
  const { user } = useAuth();
  const gated = useGated();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let live = true;
    api
      .get('/public/opportunities')
      .then((d) => live && setRows(d.opportunities))
      .catch((e) => live && setError(e.message));
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, []);

  const o = rows?.find((r) => String(r.id) === String(id));
  useEffect(() => {
    document.title = `${o ? o.title : 'Opportunity'} · ALU Ventures`;
  }, [o]);

  const closed = o && new Date(o.deadline) <= now;
  const canApply = !user || user.role === 'graduate';
  const applyTo = user ? '/app/opportunities' : gated('/app/go/opportunities');

  return (
    <section className="flex-1 bg-s-canvas px-4 pb-16 pt-6 sm:px-8 lg:px-16">
      <div className="mx-auto max-w-[1200px]">
        <Breadcrumb to="/opportunities" label="Opportunities" current={o?.title} />
        {error && (
          <NotListed title="Opportunities could not be loaded" back="/opportunities" backLabel="Back to opportunities">
            {error}
          </NotListed>
        )}
        {!rows && !error && <DetailSkeleton />}
        {rows && !o && (
          <NotListed title="This opportunity is not open" back="/opportunities" backLabel="See open opportunities">
            It may have closed or been withdrawn. Open opportunities are listed on the Opportunities page.
          </NotListed>
        )}
        {o && (
          <article className="flex flex-col gap-8">
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <TypeChip type={o.type} />
                <OpenBadge deadline={o.deadline} now={now} />
              </div>
              <h1 className="text-[30px] font-semibold leading-[1.15] tracking-[-0.6px] text-s-ink [overflow-wrap:anywhere] sm:text-[38px] sm:tracking-[-1px]">{o.title}</h1>
              <p className="text-[15px] text-s-muted">by {o.organiser || 'ALU Ventures'}</p>
            </div>
            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-8">
              <div className="flex flex-col gap-6">
                <section className={`${CARD_BASE} p-5 sm:p-7`} aria-labelledby="opp-about">
                  <h2 id="opp-about" className="text-[17px] font-semibold text-s-ink">
                    About this opportunity
                  </h2>
                  <p className="mt-3 max-w-[68ch] whitespace-pre-line text-[15px] leading-[1.75] text-s-ink-2">{o.description}</p>
                </section>
                <section className={`${CARD_BASE} grid gap-6 p-5 sm:grid-cols-2 sm:p-7`}>
                  <div>
                    <h2 className="text-[15px] font-semibold text-s-ink">Who can apply</h2>
                    <p className="mt-2 text-[14px] leading-[1.65] text-s-soft">{criteriaText(o.criteria || {})}</p>
                    {o.criteria?.notes && <p className="mt-2 whitespace-pre-line text-[14px] leading-[1.65] text-s-soft">{o.criteria.notes}</p>}
                  </div>
                  <div>
                    <h2 className="text-[15px] font-semibold text-s-ink">How to apply</h2>
                    <p className="mt-2 whitespace-pre-line text-[14px] leading-[1.65] text-s-soft">
                      {o.linkOnly
                        ? o.applicationInstructions || 'Applications are made on the organiser’s official site.'
                        : o.applicationInstructions || 'Apply from your graduate workspace with an approved venture before the deadline.'}
                    </p>
                  </div>
                </section>
              </div>
              <aside className="lg:sticky lg:top-[96px]">
                <div className={`${CARD_BASE} p-5 sm:p-6`}>
                  <dl className="divide-y divide-s-line">
                    {[
                      ['Deadline', formatDate(o.deadline, true)],
                      ['Time left', closed ? 'Closed' : timeLeft(o.deadline, now).short],
                      ['Prize', o.prize || 'To be announced'],
                      ['Type', TYPE_LABEL[o.type] || o.type],
                      ['Organiser', o.organiser || 'ALU Ventures'],
                    ].map(([k, v]) => (
                      <div key={k} className="flex items-baseline justify-between gap-4 py-3 first:pt-0 last:pb-0">
                        <dt className="shrink-0 text-[13px] text-s-muted">{k}</dt>
                        <dd className="min-w-0 text-right text-[14px] font-semibold text-s-ink [overflow-wrap:anywhere]">{v}</dd>
                      </div>
                    ))}
                  </dl>
                  <div className="mt-6 border-t border-s-line pt-5">
                    {closed ? (
                      <p className="text-center text-[13px] text-s-muted">Applications for this opportunity have closed.</p>
                    ) : o.linkOnly ? (
                      <ExternalApply o={o} className="w-full" />
                    ) : canApply ? (
                      <Link
                        to={applyTo}
                        className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-[#2563eb] px-4 text-[14px] font-semibold text-white transition-colors hover:bg-[#1d4ed8]"
                      >
                        {user ? 'Apply from your workspace' : 'Create an account to apply'}
                      </Link>
                    ) : (
                      <p className="text-center text-[13px] text-s-muted">Applications come from ALU graduate accounts with an approved venture.</p>
                    )}
                  </div>
                </div>
              </aside>
            </div>
          </article>
        )}
      </div>
    </section>
  );
}
