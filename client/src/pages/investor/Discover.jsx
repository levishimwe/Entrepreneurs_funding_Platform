import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BadgeCheck, FileSearch, LayoutGrid, Mail, MapPin, Rows3, Search, ShieldCheck, Users, X } from 'lucide-react';
import { api, qs } from '../../lib/api';
import { Alert, Field, PageLoader, Pill } from '../../components/ui';
import { InitialsBox } from '../../components/kit';
import ReasonDialog from '../../components/ReasonDialog';

const INTRO_LABEL = { requested: 'Intro requested', accepted: 'Introduced', declined: 'Declined' };
const STAGE_TONE = { Idea: 'slate', 'Prototype / MVP': 'blue', 'Early revenue': 'green', Growth: 'green', Scaling: 'purple' };

function FacetGroup({ label, value, options, onChange }) {
  return (
    <div className="flex flex-wrap items-center overflow-hidden rounded-md ring-1 ring-line">
      <button type="button" onClick={() => onChange('')} className={`px-2.5 py-1 text-xs ${!value ? 'bg-accent font-medium text-white' : 'bg-surface text-muted hover:text-ink'}`}>
        {label}: All
      </button>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(value === o.value ? '' : o.value)}
          className={`border-l border-line px-2.5 py-1 text-xs ${value === o.value ? 'bg-accent-soft font-medium text-accent' : 'bg-surface text-muted hover:text-ink'}`}
        >
          {o.label || o.value} <span className="tabular-nums opacity-70">{o.count}</span>
        </button>
      ))}
    </div>
  );
}

function Badges({ p }) {
  return (
    <>
      <span className="rounded bg-subtle px-1.5 py-0.5 text-[11px] text-muted ring-1 ring-line">{p.sector}</span>
      <span className="inline-flex items-center gap-0.5 text-xs text-muted">
        <MapPin className="h-3 w-3" aria-hidden="true" /> {p.country}
      </span>
      <Pill tone={STAGE_TONE[p.stage] || 'slate'}>{p.stage}</Pill>
      {p.rdbRegistered ? (
        <Pill tone="blue">
          <ShieldCheck className="h-3 w-3" aria-hidden="true" /> RDB registered
        </Pill>
      ) : (
        <Pill tone="slate">
          <BadgeCheck className="h-3 w-3" aria-hidden="true" /> ALU verified idea
        </Pill>
      )}
      {p.confirmedInvestors === 1 && (
        <Pill tone="amber">
          <Users className="h-3 w-3" aria-hidden="true" /> 1 Investor
        </Pill>
      )}
    </>
  );
}

const founderLine = (f) => (f ? `${f.name} · ALU${f.cohortYear ? ` '${String(f.cohortYear).slice(-2)}` : ''}${f.program ? ` ${f.program}` : ''}` : '');

function InterestButton({ p, onExpress, full }) {
  if (p.myIntroduction) {
    return (
      <Link to="/app/introductions" className={`btn-secondary ${full ? 'w-full' : ''}`}>
        <Mail className="h-4 w-4" aria-hidden="true" /> {INTRO_LABEL[p.myIntroduction]}
      </Link>
    );
  }
  return (
    <button type="button" className={`btn-primary ${full ? 'w-full' : ''}`} onClick={() => onExpress(p)}>
      <Mail className="h-4 w-4" aria-hidden="true" /> Express Interest / Request Intro
    </button>
  );
}

// Browse Approved Projects (Figma "Investor Venture Discovery Portal").
// Only "Approved and Seeking Investment" projects are returned by the API.
export default function Discover() {
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [view, setView] = useState(() => {
    try {
      return localStorage.getItem('discover-view') || 'table';
    } catch {
      return 'table';
    }
  });
  const [search, setSearch] = useState(params.get('q') || '');
  const [expressing, setExpressing] = useState(null);
  const f = useMemo(
    () => ({
      q: params.get('q') || '',
      sector: params.get('sector') || '',
      stage: params.get('stage') || '',
      country: params.get('country') || '',
      type: params.get('type') || '',
      sort: params.get('sort') || 'recent',
      page: Number(params.get('page') || 1),
      pageSize: Number(params.get('pageSize') || 10),
    }),
    [params]
  );
  const update = (changes) => {
    const next = { ...f, page: 1, ...changes };
    setParams(Object.fromEntries(Object.entries(next).filter(([k, v]) => v && !(k === 'sort' && v === 'recent') && !(k === 'page' && v === 1) && !(k === 'pageSize' && v === 10))));
  };

  const load = useCallback(() => {
    api
      .get(`/investor/projects${qs(f)}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [f]);
  useEffect(() => {
    document.title = 'Browse approved projects · ALU Ventures';
    load();
  }, [load]);
  useEffect(() => {
    const t = setTimeout(() => search !== f.q && update({ q: search.trim() }), 400);
    return () => clearTimeout(t);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    try {
      localStorage.setItem('discover-view', view);
    } catch {
      /* per-browser convenience only */
    }
  }, [view]);

  if (error) {
    return error.includes('pending') ? (
      <Alert type="warning" title="Your investor account is awaiting approval">
        An administrator reviews every investor and sponsor before they can browse ventures and request introductions. You will be emailed when it is approved.
      </Alert>
    ) : (
      <Alert type="error">{error}</Alert>
    );
  }
  if (!data) return <PageLoader />;

  const { projects, total, page, pageSize, facets, stats } = data;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total ? (page - 1) * pageSize + 1 : 0;
  const filtered = f.q || f.sector || f.stage || f.country || f.type;

  return (
    <>
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-accent">
            Investor discovery <span className="text-muted">·</span> <span className="normal-case text-green-700 dark:text-green-400">● Live approved records</span>
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Browse Approved Projects</h1>
          <p className="mt-1 max-w-xl text-sm text-muted">Explore administrator-approved ALU graduate projects and ventures that are open to introductions.</p>
        </div>
        <dl className="grid grid-cols-3 divide-x divide-line rounded-md bg-surface text-xs ring-1 ring-line">
          {[
            ['Approved projects', stats.approvedProjects],
            ['Active sectors', stats.activeSectors],
            ['Introductions made', stats.introductionsMade],
          ].map(([k, v]) => (
            <div key={k} className="px-3 py-2">
              <dt className="text-muted">{k}</dt>
              <dd className="text-lg font-semibold tabular-nums text-ink">{v}</dd>
            </div>
          ))}
        </dl>
      </div>

      {notice && <Alert type="success" className="mb-4">{notice}</Alert>}

      <div className="mb-3 flex flex-col gap-2 lg:flex-row">
        <label className="relative flex-1">
          <span className="sr-only">Search projects</span>
          <Search className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-muted" aria-hidden="true" />
          <input className="input pl-8" placeholder="Search projects by keyword, sector or country (e.g. 'Rwanda agriculture')…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <div className="flex gap-2">
          <label className="flex items-center gap-1.5 text-xs text-muted">
            Sort:
            <select className="input w-auto py-1" value={f.sort} onChange={(e) => update({ sort: e.target.value })}>
              <option value="recent">Most recently approved</option>
              <option value="oldest">Oldest approved</option>
              <option value="title">Title A–Z</option>
            </select>
          </label>
          <div className="flex overflow-hidden rounded-md ring-1 ring-line" role="group" aria-label="View">
            {[
              ['table', 'Table', Rows3],
              ['cards', 'Cards', LayoutGrid],
            ].map(([key, label, Icon]) => (
              <button key={key} type="button" aria-pressed={view === key} onClick={() => setView(key)} className={`flex items-center gap-1 px-2.5 text-xs ${view === key ? 'bg-accent-soft font-medium text-accent' : 'bg-surface text-muted'}`}>
                <Icon className="h-3.5 w-3.5" aria-hidden="true" /> {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">Facets:</span>
        <FacetGroup label="Sector" value={f.sector} options={facets.sectors} onChange={(v) => update({ sector: v })} />
        <FacetGroup label="Stage" value={f.stage} options={facets.stages} onChange={(v) => update({ stage: v })} />
        <FacetGroup label="Country" value={f.country} options={facets.countries} onChange={(v) => update({ country: v })} />
        <FacetGroup
          label="Tier"
          value={f.type}
          options={facets.types.map((t) => ({ ...t, label: t.value === 'company' ? 'RDB registered' : 'ALU verified idea' }))}
          onChange={(v) => update({ type: v })}
        />
        {filtered && (
          <button
            type="button"
            className="inline-flex items-center gap-1 text-xs text-muted hover:text-ink"
            onClick={() => {
              setSearch('');
              setParams({});
            }}
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" /> Reset
          </button>
        )}
      </div>

      <section className="card overflow-hidden">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-subtle px-4 py-2.5 text-xs">
          <span>
            <span className="font-semibold text-ink">
              {total} Approved Project{total === 1 ? '' : 's'} in View
            </span>{' '}
            <span className="text-muted">· Open to introductions</span>
          </span>
          <span className="text-muted">
            Displaying {from}–{Math.min(page * pageSize, total)} of {total} records
          </span>
        </header>

        {projects.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-12 text-center">
            <FileSearch className="h-8 w-8 text-muted" aria-hidden="true" />
            <p className="mt-2 font-medium">{filtered ? 'No approved projects match these filters' : 'No approved projects yet'}</p>
            <p className="text-sm text-muted">{filtered ? 'Try another sector, stage or country, or reset the filters.' : 'Projects appear here once an administrator approves them.'}</p>
          </div>
        ) : view === 'table' ? (
          <ul className="divide-y divide-line">
            {projects.map((p) => (
              <li key={p.projectCode} className="flex flex-col gap-3 p-4 md:flex-row md:items-start">
                <InitialsBox name={p.title} className="h-10 w-10 text-sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link to={`/app/discover/${p.projectCode}`} className="font-semibold hover:text-accent hover:underline">
                      {p.title}
                    </Link>
                    <Badges p={p} />
                  </div>
                  <p className="mt-0.5 text-xs text-muted">{founderLine(p.founder)}</p>
                  <p className="mt-1.5 line-clamp-2 text-sm">{p.summary}</p>
                  <p className="mt-1.5 font-mono text-[11px] text-muted">
                    {p.projectCode}
                    {p.fundingSought ? ` · Seeking ${p.fundingSought}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col gap-2 md:w-60">
                  <InterestButton p={p} onExpress={setExpressing} full />
                  <Link to={`/app/discover/${p.projectCode}`} className="btn-secondary w-full">
                    <FileSearch className="h-4 w-4" aria-hidden="true" /> View Diligence Overview
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3">
            {projects.map((p) => (
              <article key={p.projectCode} className="flex flex-col rounded-md bg-surface p-4 ring-1 ring-line">
                <div className="flex items-start gap-3">
                  <InitialsBox name={p.title} className="h-10 w-10 text-sm" />
                  <div className="min-w-0">
                    <Link to={`/app/discover/${p.projectCode}`} className="font-semibold hover:text-accent hover:underline">
                      {p.title}
                    </Link>
                    <p className="text-xs text-muted">{founderLine(p.founder)}</p>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Badges p={p} />
                </div>
                <p className="mt-2 line-clamp-3 flex-1 text-sm">{p.summary}</p>
                <div className="mt-3 space-y-2">
                  <InterestButton p={p} onExpress={setExpressing} full />
                  <Link to={`/app/discover/${p.projectCode}`} className="btn-secondary w-full">
                    View Diligence Overview
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-subtle px-4 py-2 text-xs text-muted">
          <label className="flex items-center gap-1.5">
            Rows per page:
            <select className="input w-auto py-0.5 text-xs" value={pageSize} onChange={(e) => update({ pageSize: Number(e.target.value) })}>
              {[5, 10, 25].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
          <div className="flex items-center gap-2">
            <button type="button" className="btn-secondary px-2 py-0.5 text-xs" disabled={page <= 1} onClick={() => update({ page: page - 1 })}>
              Previous
            </button>
            <span>
              Page {page} of {pages}
            </span>
            <button type="button" className="btn-secondary px-2 py-0.5 text-xs" disabled={page >= pages} onClick={() => update({ page: page + 1 })}>
              Next
            </button>
          </div>
        </footer>
      </section>

      <ExpressInterestDialog
        project={expressing}
        onClose={() => setExpressing(null)}
        onDone={(res, p) => {
          setNotice(res.duplicate ? `You already requested an introduction to ${p.title}.` : `Introduction requested for ${p.title}. The founder will accept or decline before contact details are shared.`);
          load();
        }}
      />
    </>
  );
}

// FR07: an introduction request with an optional note to the founder.
export function ExpressInterestDialog({ project, onClose, onDone }) {
  return (
    <ReasonDialog
      open={Boolean(project)}
      title={`Request an introduction to ${project?.title}`}
      description="The founder is emailed your request and accepts or declines it. Contact details are shared with both of you only if they accept. An introduction is not an investment commitment."
      reason="optional"
      reasonLabel="Message to the founder"
      reasonHelp="For example your focus, ticket size or the kind of support you offer."
      confirmLabel="Send request"
      onClose={onClose}
      onConfirm={async (message) => {
        const res = await api.post(`/investor/projects/${project.projectCode}/interest`, { message });
        onDone(res, project);
      }}
    >
      <Field label="Project" htmlFor="interest-project">
        <input id="interest-project" className="input bg-subtle" readOnly value={`${project?.title || ''} · ${project?.projectCode || ''}`} />
      </Field>
    </ReasonDialog>
  );
}
