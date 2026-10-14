import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowRight, BadgeCheck, Building2, CheckCircle2, GraduationCap, Info, Lightbulb, Lock, Scale, ScanLine, Search, Share2, ShieldCheck, UserCheck } from 'lucide-react';
import { api, qs } from '../lib/api';
import { SECTORS, STAGES } from '../lib/constants';
import { Alert, EmptyState, PageLoader, Pill, StatusPill, formatDate } from '../components/ui';

// Light content area inside the dark public frame, as in the Figma screens.
function LightPage({ children }) {
  return (
    <div className="min-h-[calc(100vh-8rem)] bg-canvas text-ink">
      <div className="mx-auto max-w-6xl px-4 py-10">{children}</div>
    </div>
  );
}

export function PublicProfileCard({ project, disclaimer }) {
  return (
    <article className="card overflow-hidden">
      <div className="border-b border-line bg-subtle px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone="green">
            <BadgeCheck className="h-3 w-3" aria-hidden="true" /> Approved platform record
          </Pill>
          <span className="font-mono text-xs text-muted">{project.projectCode}</span>
          {project.status !== 'approved' && <StatusPill status={project.status} />}
        </div>
        <h2 className="mt-2 text-xl font-semibold">{project.title}</h2>
        <p className="mt-1 text-sm text-muted">{project.summary}</p>
      </div>
      <div className="grid gap-6 p-5 md:grid-cols-3">
        <div className="md:col-span-2">
          <h3 className="text-sm font-semibold">About the venture</h3>
          <p className="mt-2 whitespace-pre-line text-sm leading-relaxed">{project.description}</p>
        </div>
        <dl className="space-y-2 text-sm">
          {[
            ['Sector', project.sector],
            ['Stage', project.stage],
            ['Type', project.type === 'company' ? 'Registered company' : 'Idea stage'],
            ...(project.companyName ? [['Company', project.companyName]] : []),
            ...(project.fundingSought ? [['Funding sought', project.fundingSought]] : []),
            ['Approved', formatDate(project.approvedAt)],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3">
              <dt className="text-muted">{k}</dt>
              <dd className="text-right font-medium">{v}</dd>
            </div>
          ))}
          {project.founder && (
            <div className="mt-3 flex items-center gap-2 rounded-md border border-line p-3">
              <GraduationCap className="h-5 w-5 text-accent" aria-hidden="true" />
              <div>
                <p className="font-medium">{project.founder.name}</p>
                <p className="text-xs text-muted">
                  Verified ALU graduate{project.founder.cohortYear ? ` · Class of ${project.founder.cohortYear}` : ''}
                </p>
              </div>
            </div>
          )}
        </dl>
      </div>
      {disclaimer && (
        <p className="flex gap-2 border-t border-line px-5 py-3 text-xs text-muted">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {disclaimer}
        </p>
      )}
    </article>
  );
}

// FR14: exact project-code lookup (Figma "Verify a Project").
export function VerifyProject() {
  const [params, setParams] = useSearchParams();
  const [code, setCode] = useState(params.get('code') || '');
  const [result, setResult] = useState(null);
  const [checkedAt, setCheckedAt] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [recent, setRecent] = useState([]);
  const [copied, setCopied] = useState(false);

  const lookup = async (value) => {
    const c = value.trim();
    if (!c) return;
    setBusy(true);
    setError('');
    setResult(null);
    try {
      setResult(await api.get(`/public/verify/${encodeURIComponent(c)}`));
      setCheckedAt(new Date());
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    document.title = 'Verify a Project · ALU Ventures';
    if (params.get('code')) lookup(params.get('code'));
    // Live examples: the most recently approved public projects.
    api
      .get('/public/projects')
      .then((d) => setRecent(d.projects.slice(0, 3)))
      .catch(() => setRecent([]));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const run = (value) => {
    setCode(value);
    setParams(value ? { code: value.trim() } : {});
    lookup(value);
  };
  const p = result?.project;
  const copyLink = async () => {
    await navigator.clipboard?.writeText(`${window.location.origin}/verify?code=${p.projectCode}`).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const founderInitials = (name) =>
    name
      .split(' ')
      .map((s) => s[0])
      .slice(0, 2)
      .join('');

  return (
    <LightPage>
      <div className="mx-auto max-w-5xl space-y-5">
        <div className="flex flex-col gap-2 rounded-lg border border-blue-200 bg-accent-soft/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-blue-500/30">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-accent text-white">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-semibold">ALU Ventures Project Verification</p>
              <p className="text-xs text-muted">African Leadership University · Graduate Entrepreneurship &amp; Funding Platform</p>
            </div>
          </div>
          <p className="inline-flex items-center gap-1.5 text-xs text-muted">
            <span className="h-2 w-2 rounded-full bg-green-500" aria-hidden="true" /> Returns administrator-approved, publicly consented records only
          </p>
        </div>

        <section className="card p-6">
          <p className="inline-flex items-center gap-1.5 text-xs font-medium text-accent">
            <Search className="h-3.5 w-3.5" aria-hidden="true" /> Public verification
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Verify a Project</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            Search by project code to confirm that a venture has an approved record on ALU Ventures, reviewed by an
            administrator, and see its public profile.
          </p>
          <form
            className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center"
            onSubmit={(e) => {
              e.preventDefault();
              run(code);
            }}
          >
            <label className="relative flex-1">
              <span className="sr-only">Project code</span>
              <ScanLine className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted" aria-hidden="true" />
              <input
                className="input py-2 pl-9 font-mono uppercase sm:pr-32"
                placeholder="ALU-2026-XXXXX"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoComplete="off"
              />
              <span className="pointer-events-none absolute right-2 top-2 hidden rounded bg-subtle px-1.5 py-0.5 font-mono text-[11px] text-muted ring-1 ring-line sm:block">
                ALU-YYYY-XXXXX
              </span>
            </label>
            <button type="submit" className="btn-primary px-5 py-2" disabled={busy}>
              <Search className="h-4 w-4" aria-hidden="true" /> {busy ? 'Verifying…' : 'Verify Project'}
            </button>
          </form>
          {recent.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <span className="font-medium">Recently approved:</span>
              {recent.map((r) => (
                <button
                  key={r.projectCode}
                  type="button"
                  onClick={() => run(r.projectCode)}
                  className="rounded-full bg-subtle px-2.5 py-1 font-mono text-[11px] ring-1 ring-line hover:bg-accent-soft"
                >
                  {r.projectCode} <span className="font-sans text-muted">({r.title})</span>
                </button>
              ))}
            </div>
          )}
        </section>

        {busy && <PageLoader />}
        {error && <Alert type="warning">{error}</Alert>}

        {p && (
          <section>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 font-semibold">
                <CheckCircle2 className="h-5 w-5 text-green-600" aria-hidden="true" /> Verification Result
                <span className="rounded bg-subtle px-1.5 py-0.5 text-[11px] font-medium text-muted ring-1 ring-line">Query match 1/1</span>
              </h2>
              <span className="text-xs text-muted">
                Checked: <span className="font-mono">{checkedAt?.toISOString().replace('T', ' ').slice(0, 19)} UTC</span>
              </span>
            </div>
            <div className="card overflow-hidden">
              <div className="flex flex-col gap-2 border-b border-line bg-accent-soft/50 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-semibold text-accent">{p.projectCode}</span>
                  <Pill tone="green">
                    <BadgeCheck className="h-3 w-3" aria-hidden="true" /> Approved record
                  </Pill>
                  {p.type === 'company' && <Pill tone="blue">RDB-registered company</Pill>}
                  {p.status !== 'approved' && <StatusPill status={p.status} />}
                </div>
                <div className="flex gap-2">
                  <button type="button" className="btn-secondary px-2 py-1 text-xs" onClick={copyLink}>
                    <Share2 className="h-3.5 w-3.5" aria-hidden="true" /> {copied ? 'Link copied' : 'Copy link'}
                  </button>
                  <Link to={`/ventures/${p.projectCode}`} className="btn-primary px-2 py-1 text-xs">
                    Go to Full Project Detail <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                </div>
              </div>
              <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
                <div className="min-w-0">
                  <div className="flex items-start gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent">
                      {p.type === 'company' ? <Building2 className="h-6 w-6" aria-hidden="true" /> : <Lightbulb className="h-6 w-6" aria-hidden="true" />}
                    </span>
                    <div>
                      <h3 className="flex items-center gap-1.5 text-xl font-semibold">
                        {p.title} <BadgeCheck className="h-5 w-5 text-green-600" aria-label="Approved" />
                      </h3>
                      <p className="mt-1 text-sm text-muted">{p.summary}</p>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-2 sm:grid-cols-3">
                    {[
                      ['Sector domain', p.sector],
                      ['Current stage', p.stage],
                      ['Primary location', p.country],
                    ].map(([k, v]) => (
                      <div key={k} className="rounded-md bg-subtle p-3 ring-1 ring-line">
                        <p className="text-[11px] text-muted">{k}</p>
                        <p className="text-sm font-semibold">{v}</p>
                      </div>
                    ))}
                  </div>
                  {p.founder && (
                    <div className="mt-3 rounded-md bg-subtle p-3 ring-1 ring-line">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Founder credentials</p>
                      <div className="mt-2 flex items-center gap-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-alu-navy text-sm font-semibold text-white" aria-hidden="true">
                          {founderInitials(p.founder.name)}
                        </span>
                        <div>
                          <p className="font-semibold">{p.founder.name}</p>
                          <p className="text-xs text-muted">
                            ALU{p.founder.cohortYear ? ` Class of ${p.founder.cohortYear}` : ''}
                            {p.founder.program ? ` · ${p.founder.program}` : ''}
                          </p>
                          <p className="inline-flex items-center gap-1 text-xs text-green-700 dark:text-green-400">
                            <GraduationCap className="h-3.5 w-3.5" aria-hidden="true" /> Verified ALU graduate
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                <div className="space-y-3">
                  <div className="rounded-md ring-1 ring-line">
                    <p className="flex items-center justify-between border-b border-line bg-subtle px-3 py-2 text-sm font-semibold">
                      Platform record <Pill tone="green">Approved</Pill>
                    </p>
                    <dl className="divide-y divide-line text-xs">
                      {[
                        ['Project code', <span key="c" className="font-mono">{p.projectCode}</span>],
                        ['Record type', p.type === 'company' ? 'Registered company' : 'Idea stage'],
                        ...(p.companyName ? [['Company name', p.companyName]] : []),
                        ['Approved on', formatDate(p.approvedAt)],
                        ['Status', <StatusPill key="s" status={p.status} />],
                      ].map(([k, v]) => (
                        <div key={k} className="flex items-center justify-between gap-2 px-3 py-2">
                          <dt className="text-muted">{k}</dt>
                          <dd className="text-right font-medium">{v}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                  <div className="flex gap-2 rounded-md bg-accent-soft/60 p-3 text-xs ring-1 ring-line">
                    <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
                    <p>{result.disclaimer}</p>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        <section className="card p-6">
          <p className="inline-flex items-center gap-1.5 text-xs font-medium text-accent">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> How verification works
          </p>
          <h2 className="mt-1 text-xl font-semibold">What a verified record means</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">Every venture listed on ALU Ventures goes through the same review before it can be verified here.</p>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {[
              [UserCheck, 'Administrator-reviewed', 'Graduate degrees and RDB company certificates are pre-checked automatically, then reviewed by an ALU Ventures administrator who makes every decision.', 'Decision', 'Human review'],
              [Lock, 'Private evidence', 'Certificates, revenue records and review notes are never shown publicly. This page shows only the summary the founder consented to publish.', 'Documents', 'Not public'],
              [Scale, 'Not an endorsement', 'A match confirms an approved record on this platform, not legal registration, investment quality or ALU endorsement. Always do your own due diligence.', 'Scope', 'Platform record'],
            ].map(([Icon, title, body, k, v]) => (
              <div key={title} className="flex flex-col rounded-md bg-subtle p-4 ring-1 ring-line">
                <span className="flex h-9 w-9 items-center justify-center rounded-md bg-surface text-accent ring-1 ring-line">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <h3 className="mt-3 font-semibold">{title}</h3>
                <p className="mt-1 flex-1 text-sm text-muted">{body}</p>
                <p className="mt-3 flex justify-between rounded bg-surface px-2 py-1 font-mono text-[11px] ring-1 ring-line">
                  <span className="text-muted">{k}</span>
                  <span className="font-semibold text-green-700 dark:text-green-400">{v}</span>
                </p>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-col gap-2 rounded-md bg-subtle p-3 text-sm ring-1 ring-line sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-center gap-2 text-muted">
              <Info className="h-4 w-4 shrink-0" aria-hidden="true" /> Investor or sponsor? Approved investors can browse every approved venture and request introductions.
            </p>
            <Link to="/register?role=investor" className="btn-secondary shrink-0">
              Request investor access
            </Link>
          </div>
        </section>
      </div>
    </LightPage>
  );
}

export function VentureCard({ project, to }) {
  const Icon = project.type === 'company' ? Building2 : Lightbulb;
  return (
    <Link to={to} className="card flex flex-col p-4 transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-accent-soft text-accent">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
        <Pill tone="slate">{project.sector}</Pill>
      </div>
      <h3 className="mt-3 font-semibold">{project.title}</h3>
      <p className="mt-1 line-clamp-3 flex-1 text-sm text-muted">{project.summary}</p>
      <div className="mt-3 flex items-center justify-between text-xs text-muted">
        <span>{project.stage}</span>
        <span className="font-mono">{project.projectCode}</span>
      </div>
    </Link>
  );
}

// FR06: public catalogue of approved, consented projects.
export function Ventures() {
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const filters = { sector: params.get('sector') || '', type: params.get('type') || '', stage: params.get('stage') || '', q: params.get('q') || '' };
  const [search, setSearch] = useState(filters.q);

  useEffect(() => {
    document.title = 'Ventures · ALU Ventures';
    setData(null);
    api
      .get(`/public/projects${qs({ ...filters, page: params.get('page') || 1 })}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [params]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (k, v) => {
    const next = { ...filters, [k]: v };
    setParams(Object.fromEntries(Object.entries(next).filter(([, val]) => val)));
  };

  return (
    <LightPage>
      <h1 className="text-3xl font-semibold tracking-tight">ALU graduate ventures</h1>
      <p className="mt-2 text-sm text-muted">Approved projects whose founders have consented to publication.</p>
      <form
        className="card mt-6 grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr]"
        onSubmit={(e) => {
          e.preventDefault();
          update('q', search);
        }}
      >
        <input className="input" placeholder="Search ventures…" aria-label="Search ventures" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="input" aria-label="Sector" value={filters.sector} onChange={(e) => update('sector', e.target.value)}>
          <option value="">All sectors</option>
          {SECTORS.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select className="input" aria-label="Stage" value={filters.stage} onChange={(e) => update('stage', e.target.value)}>
          <option value="">All stages</option>
          {STAGES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select className="input" aria-label="Type" value={filters.type} onChange={(e) => update('type', e.target.value)}>
          <option value="">All types</option>
          <option value="company">Registered companies</option>
          <option value="idea">Ideas</option>
        </select>
      </form>
      <div className="mt-6">
        {error && <Alert type="error">{error}</Alert>}
        {!data && !error && <PageLoader />}
        {data && data.projects.length === 0 && (
          <div className="card">
            <EmptyState icon={Search} title="No ventures match these filters">
              Try a different sector or clear the search.
            </EmptyState>
          </div>
        )}
        {data && data.projects.length > 0 && (
          <>
            <p className="mb-3 text-xs text-muted">{data.total} approved venture(s)</p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {data.projects.map((p) => (
                <VentureCard key={p.projectCode} project={p} to={`/ventures/${p.projectCode}`} />
              ))}
            </div>
            {data.total > data.pageSize && (
              <div className="mt-6 flex justify-center gap-2">
                <button type="button" className="btn-secondary" disabled={data.page <= 1} onClick={() => update('page', String(data.page - 1))}>
                  Previous
                </button>
                <button type="button" className="btn-secondary" disabled={data.page * data.pageSize >= data.total} onClick={() => update('page', String(data.page + 1))}>
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </LightPage>
  );
}

// Public list of open opportunities; applying requires an approved account.
export function PublicOpportunities() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    document.title = 'Opportunities · ALU Ventures';
    api
      .get('/public/opportunities')
      .then((d) => setRows(d.opportunities))
      .catch((e) => setError(e.message));
  }, []);
  return (
    <LightPage>
      <h1 className="text-3xl font-semibold tracking-tight">Hackathons, grants & competitions</h1>
      <p className="mt-2 text-sm text-muted">
        Published by ALU staff. Verified graduates apply with an approved project from their dashboard.
      </p>
      <div className="mt-6 space-y-3">
        {error && <Alert type="error">{error}</Alert>}
        {!rows && !error && <PageLoader />}
        {rows?.length === 0 && (
          <div className="card">
            <EmptyState icon={Search} title="No open opportunities right now">
              Check back soon.
            </EmptyState>
          </div>
        )}
        {rows?.map((o) => (
          <article key={o.id} className="card p-5">
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone="blue">{o.type}</Pill>
              <span className="text-xs text-muted">Closes {formatDate(o.deadline, true)}</span>
            </div>
            <h2 className="mt-2 text-lg font-semibold">{o.title}</h2>
            {o.organiser && <p className="text-xs text-muted">{o.organiser}</p>}
            <p className="mt-2 text-sm">{o.description}</p>
          </article>
        ))}
        <p className="pt-2 text-sm text-muted">
          ALU graduate?{' '}
          <Link to="/register" className="text-accent hover:underline">
            Create your free account
          </Link>{' '}
          to apply.
        </p>
      </div>
    </LightPage>
  );
}

export function PublicProject() {
  const { code } = useParams();
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api
      .get(`/public/verify/${encodeURIComponent(code)}`)
      .then((r) => {
        setResult(r);
        document.title = `${r.project.title} · ALU Ventures`;
      })
      .catch((e) => setError(e.message));
  }, [code]);
  return (
    <LightPage>
      <Link to="/ventures" className="text-sm text-accent hover:underline">
        ← All ventures
      </Link>
      <div className="mt-4">
        {error && <Alert type="warning">{error}</Alert>}
        {!result && !error && <PageLoader />}
        {result && <PublicProfileCard project={result.project} disclaimer={result.disclaimer} />}
        {result && (
          <p className="mt-4 text-sm text-muted">
            Investor or sponsor?{' '}
            <Link to="/register?role=investor" className="text-accent hover:underline">
              Request investor access
            </Link>{' '}
            to ask the founder for an introduction.
          </p>
        )}
      </div>
    </LightPage>
  );
}
