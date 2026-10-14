import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  CalendarClock,
  CheckCircle2,
  Circle,
  ClipboardList,
  Hourglass,
  Inbox,
  ListChecks,
  Search,
  Send,
  Timer,
  Trophy,
  XCircle,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { Alert, Field, PageLoader, StatusPill, formatDate } from '../../components/ui';
import { StatTile, Tag } from '../../components/kit';
import ReasonDialog from '../../components/ReasonDialog';

const TYPE = {
  grant: { label: 'Grant', tone: 'amber', border: 'border-t-amber-500' },
  hackathon: { label: 'Hackathon', tone: 'blue', border: 'border-t-accent' },
  competition: { label: 'Competition', tone: 'green', border: 'border-t-green-600' },
  other: { label: 'Other', tone: 'slate', border: 'border-t-slate-400' },
};
const daysUntil = (d) => Math.ceil((new Date(d) - Date.now()) / 86400000);

function CriteriaPills({ criteria = {} }) {
  const pills = [];
  if (criteria.sectors?.length) pills.push(`Sector: ${criteria.sectors.join(' & ')}`);
  if (criteria.projectTypes?.length) pills.push(criteria.projectTypes.includes('company') && criteria.projectTypes.length === 1 ? 'Registered companies only' : criteria.projectTypes.includes('idea') && criteria.projectTypes.length === 1 ? 'Idea-stage projects only' : 'Companies & ideas');
  if (criteria.stages?.length) pills.push(`Stage: ${criteria.stages.join(' / ')}`);
  if (criteria.minCohortYear || criteria.maxCohortYear) pills.push(`Cohorts ${criteria.minCohortYear || '…'}–${criteria.maxCohortYear || '…'}`);
  pills.unshift('Verified ALU graduates');
  return (
    <div className="flex flex-wrap gap-1.5">
      {pills.map((p) => (
        <span key={p} className="inline-flex items-center gap-1 rounded bg-subtle px-2 py-0.5 text-[11px] ring-1 ring-line">
          <BadgeCheck className="h-3 w-3 text-green-600" aria-hidden="true" /> {p}
        </span>
      ))}
    </div>
  );
}

function OpportunityCard({ o, canApply, onApply }) {
  const [open, setOpen] = useState(false);
  const t = TYPE[o.type] || TYPE.other;
  const days = daysUntil(o.deadline);
  const applied = o.projects.filter((p) => p.applied);
  const eligible = o.projects.filter((p) => !p.applied && p.issues.length === 0);
  return (
    <article className={`card overflow-hidden border-t-4 ${t.border}`}>
      <div className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <Tag tone={t.tone}>{t.label}</Tag>
            {o.organiser && (
              <span className="inline-flex items-center gap-1">
                <Building2 className="h-3.5 w-3.5" aria-hidden="true" /> {o.organiser}
              </span>
            )}
          </div>
          <span
            className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
              days <= 7 ? 'bg-amber-50 text-amber-800 ring-amber-600/25 dark:bg-amber-500/15 dark:text-amber-300' : 'bg-subtle text-muted ring-line'
            }`}
          >
            <Timer className="h-3.5 w-3.5" aria-hidden="true" /> {days <= 0 ? 'Closes today' : days <= 14 ? `Expires in ${days} day${days === 1 ? '' : 's'}` : `Deadline: ${formatDate(o.deadline)}`}
          </span>
        </div>
        <h2 className="mt-2 text-lg font-semibold">{o.title}</h2>
        <p className="mt-1 text-sm text-muted">{o.description}</p>
        <div className="mt-3">
          <CriteriaPills criteria={o.criteria} />
        </div>
        {o.criteria?.notes && <p className="mt-2 text-xs text-muted">{o.criteria.notes}</p>}
        {applied.map((p) => (
          <div key={p.id} className="mt-3 flex items-center justify-between gap-2 rounded-md bg-accent-soft/60 px-3 py-2 text-sm ring-1 ring-line">
            <span className="inline-flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-green-500" aria-hidden="true" />
              Applied with <span className="font-medium">{p.title}</span>
            </span>
            <StatusPill status={p.applied} />
          </div>
        ))}
        {open && (
          <div className="mt-3 rounded-md border border-line p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Eligibility of your projects</p>
            {o.projects.length === 0 ? (
              <p className="text-sm text-muted">You have no projects yet. Submit one and have it approved to apply.</p>
            ) : (
              <ul className="space-y-1.5">
                {o.projects.map((p) => (
                  <li key={p.id} className="flex gap-2 text-sm">
                    {p.applied ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-label="Applied" />
                    ) : p.issues.length === 0 ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" aria-label="Eligible" />
                    ) : (
                      <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-label="Not eligible" />
                    )}
                    <span>
                      {p.title}
                      <span className="block text-xs text-muted">{p.applied ? 'Already applied' : p.issues.length ? p.issues.join(' ') : 'Eligible to apply'}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {o.applicationInstructions && <p className="mt-2 border-t border-line pt-2 text-xs text-muted">Next steps if selected: {o.applicationInstructions}</p>}
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2 border-t border-line bg-subtle px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted">Applications close {formatDate(o.deadline, true)}</p>
        <div className="flex gap-2">
          <button type="button" className="btn-secondary" aria-expanded={open} onClick={() => setOpen((x) => !x)}>
            {open ? 'Hide Eligibility' : 'View Eligibility Criteria'}
          </button>
          <button type="button" className="btn-primary" disabled={!canApply || eligible.length === 0} onClick={() => onApply(o, eligible)}>
            Apply Now <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </article>
  );
}

function ApplicationCard({ a }) {
  return (
    <article className="card overflow-hidden border-t-4 border-t-slate-300 dark:border-t-slate-600">
      <div className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Tag tone={(TYPE[a.opportunity?.type] || TYPE.other).tone}>{(TYPE[a.opportunity?.type] || TYPE.other).label}</Tag>
          <span className="inline-flex items-center gap-1 rounded bg-green-50 px-2 py-0.5 text-xs font-medium text-green-800 ring-1 ring-inset ring-green-600/25 dark:bg-green-500/15 dark:text-green-300">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Submitted: {formatDate(a.submittedAt)}
          </span>
        </div>
        <h2 className="mt-2 text-lg font-semibold">{a.opportunity?.title}</h2>
        <p className="text-sm text-muted">Project: {a.project?.title}</p>
        <div className="mt-3 flex items-center justify-between gap-2 rounded-md bg-subtle px-3 py-2 text-sm ring-1 ring-line">
          <span className="inline-flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${a.status === 'selected' ? 'bg-green-500' : a.status === 'not_selected' ? 'bg-red-500' : 'bg-accent'}`} aria-hidden="true" />
            Stage: <StatusPill status={a.status} />
          </span>
          <span className="font-mono text-[11px] text-muted">Application APP-{String(a.id).padStart(4, '0')}</span>
        </div>
        {a.decisionNote && <p className="mt-2 text-sm">Feedback from ALU staff: “{a.decisionNote}”</p>}
      </div>
    </article>
  );
}

// Funding Opportunities & Catalytic Grants (Figma), graduate view (FR08).
export default function Opportunities() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [applications, setApplications] = useState([]);
  const [projects, setProjects] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [tab, setTab] = useState('all');
  const [q, setQ] = useState('');
  const [sector, setSector] = useState('');
  const [soonestFirst, setSoonestFirst] = useState(true);
  const [applying, setApplying] = useState(null);
  const [projectId, setProjectId] = useState('');

  const load = useCallback(() => {
    Promise.all([api.get('/opportunities'), api.get('/opportunities/applications'), api.get('/projects/mine')])
      .then(([o, a, p]) => {
        setData(o.opportunities);
        setApplications(a.applications);
        setProjects(p.projects);
      })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    document.title = 'Funding opportunities · ALU Ventures';
    load();
  }, [load]);

  const sectors = useMemo(() => [...new Set((data || []).flatMap((o) => o.criteria?.sectors || []))].sort(), [data]);
  const shown = useMemo(() => {
    if (!data) return [];
    const term = q.trim().toLowerCase();
    return data
      .filter(
        (o) =>
          (tab === 'all' || o.type === tab) &&
          (!sector || !o.criteria?.sectors?.length || o.criteria.sectors.includes(sector)) &&
          (!term || `${o.title} ${o.organiser || ''} ${o.description}`.toLowerCase().includes(term))
      )
      .sort((a, b) => (soonestFirst ? 1 : -1) * (new Date(a.deadline) - new Date(b.deadline)));
  }, [data, tab, q, sector, soonestFirst]);

  if (error) return <Alert type="error">{error}</Alert>;
  if (!data) return <PageLoader />;

  const count = (type) => data.filter((o) => o.type === type).length;
  const closingSoon = data.filter((o) => daysUntil(o.deadline) <= 14).length;
  const decided = applications.filter((a) => ['selected', 'not_selected', 'shortlisted'].includes(a.status)).length;
  const approvedProjects = projects.filter((p) => ['approved', 'funded', 'investor_limit_reached'].includes(p.status));
  const approvedCompanies = approvedProjects.filter((p) => p.type === 'company');
  const checklist = [
    { done: user.approved, title: 'ALU alumni validation', body: 'Graduate account approved by an administrator' },
    { done: approvedProjects.length > 0, title: 'Approved project', body: approvedProjects.length ? `${approvedProjects.length} approved project${approvedProjects.length === 1 ? '' : 's'}` : 'Submit a project and have it approved' },
    { done: approvedCompanies.length > 0, title: 'Entity registration (RDB)', body: 'Needed only for calls open to registered companies' },
  ];
  const readiness = Math.round((checklist.filter((c) => c.done).length / checklist.length) * 100);
  const organisers = Object.entries(data.reduce((m, o) => ({ ...m, [o.organiser || 'ALU Ventures']: (m[o.organiser || 'ALU Ventures'] || 0) + 1 }), {})).sort((a, b) => b[1] - a[1]);
  const mix = ['grant', 'hackathon', 'competition', 'other'].map((t) => [t, count(t)]).filter(([, n]) => n);
  const tabs = [
    ['all', 'All', data.length],
    ['grant', 'Grants', count('grant')],
    ['hackathon', 'Hackathons', count('hackathon')],
    ['competition', 'Competitions', count('competition')],
    ...(count('other') ? [['other', 'Other', count('other')]] : []),
    ['applied', 'Applied', applications.length],
  ];

  return (
    <>
      <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Open opportunities" icon={Trophy} value={data.length} unit="live" status={`Across ${organisers.length} organiser${organisers.length === 1 ? '' : 's'}`} />
        <StatTile label="Closing soon" icon={CalendarClock} value={closingSoon} unit="within 14 days" status="Apply before the deadline" statusTone={closingSoon ? 'text-amber-600 dark:text-amber-400' : 'text-muted'} />
        <StatTile label="My applications" icon={Send} value={applications.length} unit="submitted" status={`${applications.filter((a) => a.status === 'submitted').length} under review`} />
        <StatTile label="Decisions received" icon={Hourglass} value={decided} unit="from ALU staff" status={`${applications.filter((a) => a.status === 'selected').length} selected`} statusTone="text-green-700 dark:text-green-400" />
      </div>

      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-accent">
            Institutional pipeline <span className="text-muted">·</span>{' '}
            <span className="normal-case text-green-700 dark:text-green-400">● {new Date().getFullYear()} cycle</span>
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Funding Opportunities &amp; Catalytic Grants</h1>
          <p className="mt-1 max-w-xl text-sm text-muted">Hackathons, grants and competitions published by ALU staff and open to verified ALU graduates with an approved project.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {user.approved && (
            <span className="inline-flex items-center gap-1.5 rounded-md bg-surface px-2.5 py-1.5 text-xs ring-1 ring-line">
              <BadgeCheck className="h-3.5 w-3.5 text-green-600" aria-hidden="true" /> Verified graduate
            </span>
          )}
          <button type="button" className="btn-secondary" onClick={() => setTab('applied')}>
            <ClipboardList className="h-4 w-4" aria-hidden="true" /> My Submissions ({applications.length})
          </button>
        </div>
      </div>

      {notice && <Alert type="success" className="mb-4">{notice}</Alert>}
      {!user.approved && <Alert type="info" className="mb-4">You can apply once your graduate account and a project are approved.</Alert>}

      <div className="mb-4 flex flex-col gap-2 xl:flex-row xl:items-center">
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="Opportunity type">
          {tabs.map(([key, label, n]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm ${tab === key ? 'bg-accent font-medium text-white' : 'text-muted hover:bg-subtle hover:text-ink'}`}
            >
              {label}
              <span className={`rounded-full px-1.5 text-xs tabular-nums ${tab === key ? 'bg-white/25' : 'bg-subtle ring-1 ring-line'}`}>{n}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-1 flex-wrap gap-2 xl:justify-end">
          <label className="relative min-w-48 flex-1 xl:max-w-64">
            <span className="sr-only">Filter opportunities</span>
            <Search className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-muted" aria-hidden="true" />
            <input className="input pl-8" placeholder="Filter opportunities…" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <select className="input w-auto" aria-label="Filter by sector" value={sector} onChange={(e) => setSector(e.target.value)}>
            <option value="">All sectors</option>
            {sectors.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <button type="button" className="btn-secondary" onClick={() => setSoonestFirst((x) => !x)} aria-label="Toggle deadline order">
            <CalendarClock className="h-4 w-4" aria-hidden="true" /> Deadline {soonestFirst ? '↑' : '↓'}
          </button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 space-y-4">
          {tab === 'applied' ? (
            applications.length ? (
              applications.map((a) => <ApplicationCard key={a.id} a={a} />)
            ) : (
              <div className="card flex flex-col items-center px-6 py-12 text-center">
                <Inbox className="h-8 w-8 text-muted" aria-hidden="true" />
                <p className="mt-2 text-sm text-muted">You have not applied to any opportunity yet.</p>
              </div>
            )
          ) : shown.length ? (
            shown.map((o) => (
              <OpportunityCard
                key={o.id}
                o={o}
                canApply={user.approved}
                onApply={(opp, eligible) => {
                  setProjectId(String(eligible[0]?.id || ''));
                  setApplying(opp);
                }}
              />
            ))
          ) : (
            <div className="card flex flex-col items-center px-6 py-12 text-center">
              <Trophy className="h-8 w-8 text-muted" aria-hidden="true" />
              <p className="mt-2 font-medium">{data.length ? 'No opportunities match these filters' : 'No open opportunities right now'}</p>
              <p className="mt-1 text-sm text-muted">New hackathons, grants and competitions appear here as ALU staff publish them.</p>
            </div>
          )}
        </div>

        <aside className="space-y-4">
          <section className="card p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted">Eligibility checklist</h2>
              <ListChecks className="h-4 w-4 text-accent" aria-hidden="true" />
            </div>
            <p className="mt-1 text-xs text-muted">What the server checks before accepting an application:</p>
            <ul className="mt-3 space-y-2.5">
              {checklist.map((c) => (
                <li key={c.title} className="flex gap-2 text-sm">
                  {c.done ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" aria-label="Done" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-label="Not yet" />}
                  <span>
                    <span className="font-medium">{c.title}</span>
                    <span className="block text-xs text-muted">{c.body}</span>
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex items-center justify-between border-t border-line pt-2 text-xs">
              <span className="text-muted">Profile readiness: {readiness}%</span>
              {!approvedProjects.length && user.approved && (
                <Link to="/app/projects/new" className="text-accent hover:underline">
                  Submit a project →
                </Link>
              )}
            </div>
          </section>

          {organisers.length > 0 && (
            <section className="card p-4">
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted">Organisers</h2>
              <ul className="mt-3 space-y-2.5">
                {organisers.slice(0, 5).map(([name, n]) => (
                  <li key={name} className="flex items-center gap-2.5 text-sm">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-subtle text-[10px] font-semibold text-muted ring-1 ring-line">
                      {name.split(/\s+/).map((s) => s[0]).slice(0, 2).join('').toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium">{name}</span>
                    <span className="text-xs text-muted">
                      {n} open
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {mix.length > 0 && (
            <section className="card p-4">
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted">Open calls by track</h2>
              <div className="mt-3 flex h-2 overflow-hidden rounded-full ring-1 ring-line">
                {mix.map(([t, n]) => (
                  <span key={t} className={{ grant: 'bg-amber-500', hackathon: 'bg-accent', competition: 'bg-green-600', other: 'bg-slate-400' }[t]} style={{ width: `${(n / data.length) * 100}%` }} />
                ))}
              </div>
              <ul className="mt-2 grid grid-cols-2 gap-1 text-xs text-muted">
                {mix.map(([t, n]) => (
                  <li key={t} className="flex items-center gap-1.5">
                    <span className={`h-2 w-2 rounded-full ${{ grant: 'bg-amber-500', hackathon: 'bg-accent', competition: 'bg-green-600', other: 'bg-slate-400' }[t]}`} aria-hidden="true" />
                    {TYPE[t].label} ({Math.round((n / data.length) * 100)}%)
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>

      <ReasonDialog
        open={Boolean(applying)}
        title={`Apply to ${applying?.title}`}
        description="ALU staff review applications against the published criteria and record every decision with a reason."
        reason="required"
        reasonLabel="Why is your project a good fit?"
        confirmLabel="Submit application"
        onClose={() => setApplying(null)}
        onConfirm={async (motivation) => {
          try {
            await api.post(`/opportunities/${applying.id}/apply`, { projectId: Number(projectId), motivation });
          } catch (err) {
            if (err.details?.issues) err.message = err.details.issues.join(' ');
            if (err.fields?.motivation) err.fields = { reason: err.fields.motivation };
            throw err;
          }
          setNotice(`Application submitted to ${applying.title}.`);
          load();
        }}
      >
        <Field label="Project" htmlFor="apply-project">
          <select id="apply-project" className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            {applying?.projects
              .filter((p) => !p.applied && p.issues.length === 0)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title} ({p.projectCode})
                </option>
              ))}
          </select>
        </Field>
      </ReasonDialog>
    </>
  );
}
