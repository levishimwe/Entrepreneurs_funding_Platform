import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BadgeCheck,
  Eye,
  FileCheck2,
  FolderOpen,
  FolderPlus,
  Folders,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Trophy,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { Alert, PageLoader, StatusPill } from '../../components/ui';
import { Breadcrumb, CountTabs, InitialsBox, relativeTime } from '../../components/kit';

export function useMyProjects() {
  const [state, setState] = useState({ projects: null, error: '' });
  useEffect(() => {
    api
      .get('/projects/mine')
      .then((d) => setState({ projects: d.projects, error: '' }))
      .catch((e) => setState({ projects: [], error: e.message }));
  }, []);
  return state;
}

const EDITABLE = ['pending_review', 'revision_required', 'approved'];

function RowMenu({ project }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button type="button" className="rounded p-1 text-muted hover:bg-subtle hover:text-ink" aria-label={`Actions for ${project.title}`} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <MoreVertical className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-1 w-40 rounded-md border border-line bg-surface py-1 text-sm shadow-lg">
          <Link to={`/app/projects/${project.id}`} className="flex items-center gap-2 px-3 py-1.5 hover:bg-subtle">
            <Eye className="h-3.5 w-3.5" aria-hidden="true" /> View
          </Link>
          {EDITABLE.includes(project.status) && (
            <Link to={`/app/projects/${project.id}/edit`} className="flex items-center gap-2 px-3 py-1.5 hover:bg-subtle">
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Revise
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

// "Registered Ventures & Incubations" table from the Figma dashboard.
export function VenturesTable({ projects, extraColumn }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] text-left text-sm">
        <thead className="border-b border-line bg-subtle text-[11px] font-semibold uppercase tracking-wide text-muted">
          <tr>
            <th className="min-w-[15rem] px-4 py-2.5">Venture &amp; ID</th>
            <th className="px-4 py-2.5">Type / Sector</th>
            <th className="px-4 py-2.5">Verification</th>
            <th className="px-4 py-2.5">RDB file no.</th>
            {extraColumn && <th className="px-4 py-2.5">{extraColumn.title}</th>}
            <th className="px-4 py-2.5">Updated</th>
            <th className="w-10 px-2 py-2.5">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {projects.map((p) => (
            <tr key={p.id} className="hover:bg-subtle">
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <InitialsBox name={p.title} />
                  <span className="min-w-0">
                    <Link to={`/app/projects/${p.id}`} className="block font-semibold text-accent hover:underline">
                      {p.title}
                    </Link>
                    <span className="font-mono text-[11px] text-muted">{p.projectCode}</span>
                  </span>
                </div>
              </td>
              <td className="px-4 py-3 text-xs">
                <span className="block font-medium">{p.type === 'company' ? 'Registered Co.' : 'Idea Concept'}</span>
                <span className="text-muted">
                  {p.sector} · {p.stage}
                </span>
              </td>
              <td className="whitespace-nowrap px-4 py-3">
                <StatusPill status={p.status} />
              </td>
              <td className="px-4 py-3">
                {p.companyNumber ? (
                  <span className="rounded border border-line bg-subtle px-1.5 py-0.5 font-mono text-[11px]">{p.companyNumber}</span>
                ) : (
                  <span className="whitespace-nowrap text-xs text-muted">N/A (idea stage)</span>
                )}
              </td>
              {extraColumn && <td className="px-4 py-3">{extraColumn.render(p)}</td>}
              <td className="px-4 py-3 text-xs text-muted">{relativeTime(p.updatedAt)}</td>
              <td className="px-2 py-3">
                <RowMenu project={p} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const TABS = (projects) => [
  ['all', 'All Ventures', projects.length],
  ['company', 'Registered (RDB)', projects.filter((p) => p.type === 'company').length],
  ['idea', 'Idea Stage', projects.filter((p) => p.type === 'idea').length],
];

// Tabs + filter + "Registered Ventures & Incubations" card.
export function VenturesPanel({ projects, extraColumn }) {
  const [tab, setTab] = useState('all');
  const [q, setQ] = useState('');
  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return projects.filter(
      (p) => (tab === 'all' || p.type === tab) && (!term || `${p.title} ${p.projectCode} ${p.sector}`.toLowerCase().includes(term))
    );
  }, [projects, tab, q]);
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="overflow-x-auto rounded-md bg-subtle p-1 ring-1 ring-line">
          <CountTabs tabs={TABS(projects)} value={tab} onChange={setTab} label="Venture type" />
        </div>
        <label className="relative sm:w-64">
          <span className="sr-only">Filter ventures</span>
          <Search className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-muted" aria-hidden="true" />
          <input className="input pl-8" placeholder="Filter ventures…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      </div>
      <section className="card overflow-hidden">
        <header className="flex items-center justify-between gap-2 border-b border-line bg-subtle px-4 py-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Folders className="h-4 w-4 text-muted" aria-hidden="true" /> Registered Ventures &amp; Incubations
          </h2>
          <span className="text-xs text-muted">Sorted by: Recently updated</span>
        </header>
        {shown.length ? (
          <VenturesTable projects={shown} extraColumn={extraColumn} />
        ) : (
          <p className="px-4 py-8 text-center text-sm text-muted">No ventures match this view.</p>
        )}
        <p className="flex items-center justify-between border-t border-line px-4 py-2 text-xs text-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500" aria-hidden="true" /> Live records from ALU Ventures
          </span>
          <span>
            Showing {shown.length} of {projects.length} venture{projects.length === 1 ? '' : 's'}
          </span>
        </p>
      </section>
    </div>
  );
}

const STEPS = [
  {
    step: 'Step 01',
    icon: FileCheck2,
    title: '1. Prepare RDB Certificate',
    body: 'Upload your Rwanda Development Board registration for incorporated companies, or submit an idea-stage declaration for an unregistered venture.',
    foot: 'Required: PDF, PNG or JPEG',
    note: 'Automated pre-check',
  },
  {
    step: 'Step 02',
    icon: ShieldCheck,
    title: '2. Administrator Verification',
    body: 'An ALU Ventures administrator reviews your evidence and any automated flags, then approves, requests a revision or rejects with a reason.',
    foot: 'You are emailed every decision',
    note: 'Human review',
  },
  {
    step: 'Step 03',
    icon: Trophy,
    title: '3. Unlock Opportunities',
    body: 'Approved projects can receive introductions from approved investors and apply to hackathons, grants and competitions published by ALU staff.',
    foot: 'Free for every graduate',
    note: 'Introductions & grants',
  },
];

export default function MyProjects() {
  const { user } = useAuth();
  const { projects, error } = useMyProjects();
  const [tab, setTab] = useState('active');

  useEffect(() => {
    document.title = 'My projects · ALU Ventures';
  }, []);

  if (error) return <Alert type="error">{error}</Alert>;
  if (!projects) return <PageLoader />;
  const active = projects.filter((p) => !['archived', 'rejected'].includes(p.status));
  const closed = projects.filter((p) => ['archived', 'rejected'].includes(p.status));
  const cohort = user.graduateProfile?.cohortYear;

  return (
    <>
      <Breadcrumb items={[['Alumni', '/app'], [user.fullName, '/app'], ['Projects']]} />
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          My Projects
          <span className="rounded-full bg-subtle px-2 py-0.5 text-xs font-medium text-muted ring-1 ring-line">
            {projects.length} project{projects.length === 1 ? '' : 's'}
          </span>
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          {user.approved && cohort && (
            <span className="inline-flex items-center gap-1.5 rounded-md bg-green-50 px-2.5 py-1 text-xs font-medium text-green-800 ring-1 ring-inset ring-green-600/25 dark:bg-green-500/15 dark:text-green-300">
              <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" /> Alumni Degree: ALU Class of &apos;{String(cohort).slice(-2)} Verified
            </span>
          )}
          {user.approved && projects.length > 0 && (
            <Link to="/app/projects/new" className="btn-primary">
              <Plus className="h-4 w-4" aria-hidden="true" /> New Project
            </Link>
          )}
        </div>
      </div>

      {!user.approved && (
        <Alert type="warning" className="mb-4" title="Your account is still under review">
          You can submit projects once an administrator approves your graduate account.
        </Alert>
      )}

      {projects.length === 0 ? (
        <>
          <div className="mb-3 flex items-center gap-1 rounded-md bg-subtle p-1 ring-1 ring-line sm:w-fit">
            <CountTabs tabs={[['active', 'Active Ventures', 0], ['closed', 'Archived & Rejected', 0]]} value={tab} onChange={setTab} label="Project list" />
          </div>
          <div className="card flex flex-col items-center px-6 py-14 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-xl bg-accent-soft text-accent">
              <FolderPlus className="h-8 w-8" aria-hidden="true" />
            </div>
            <h2 className="text-lg font-semibold">No projects submitted yet</h2>
            <p className="mt-2 max-w-lg text-sm text-muted">
              You have not registered any startup or idea with ALU Ventures. Register your project to have its evidence
              verified, apply for hackathons and grants, and receive introduction requests from approved investors.
            </p>
            {user.approved && (
              <Link to="/app/projects/new" className="btn-primary mt-5">
                <Plus className="h-4 w-4" aria-hidden="true" /> Submit Your First Project
              </Link>
            )}
          </div>
          <div className="mt-6 flex items-baseline justify-between">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted">What happens after registration?</h2>
            <span className="text-xs text-muted">Each step is recorded with a timestamp</span>
          </div>
          <div className="mt-3 grid gap-4 md:grid-cols-3">
            {STEPS.map(({ step, icon: Icon, title, body, foot, note }) => (
              <div key={step} className="card flex flex-col p-4">
                <div className="flex items-center justify-between">
                  <span className="rounded bg-subtle px-1.5 py-0.5 text-[11px] font-medium text-muted ring-1 ring-line">{step}</span>
                  <Icon className="h-4 w-4 text-muted" aria-hidden="true" />
                </div>
                <h3 className="mt-3 font-semibold">{title}</h3>
                <p className="mt-1 flex-1 text-sm text-muted">{body}</p>
                <p className="mt-3 flex items-center justify-between border-t border-line pt-2 text-xs">
                  <span className="text-muted">{foot}</span>
                  <span className="font-medium text-green-700 dark:text-green-400">{note}</span>
                </p>
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="mb-3 flex items-center gap-1 rounded-md bg-subtle p-1 ring-1 ring-line sm:w-fit">
            <CountTabs tabs={[['active', 'Active Ventures', active.length], ['closed', 'Archived & Rejected', closed.length]]} value={tab} onChange={setTab} label="Project list" />
          </div>
          {(tab === 'active' ? active : closed).length ? (
            <VenturesPanel projects={tab === 'active' ? active : closed} />
          ) : (
            <div className="card flex flex-col items-center px-6 py-10 text-center">
              <FolderOpen className="h-8 w-8 text-muted" aria-hidden="true" />
              <p className="mt-2 text-sm text-muted">{tab === 'active' ? 'No active ventures.' : 'No archived or rejected ventures.'}</p>
            </div>
          )}
          <p className="mt-3 text-right text-xs">
            <Link to="/app/opportunities" className="inline-flex items-center gap-1 text-accent hover:underline">
              Browse hackathons &amp; grants <ArrowRight className="h-3 w-3" aria-hidden="true" />
            </Link>
          </p>
        </>
      )}
    </>
  );
}
