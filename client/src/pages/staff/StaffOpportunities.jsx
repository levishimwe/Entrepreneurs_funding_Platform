import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { ExternalLink, FilePen, Globe, Inbox, Plus, Search, Send, Users } from 'lucide-react';
import { api } from '../../lib/api';
import { Alert, EmptyState, PageLoader, formatDate } from '../../components/ui';
import OpportunityForm from '../../components/OpportunityForm';
import AuditStrip from '../../components/AuditStrip';
import { Breadcrumb, StatTile, initials } from '../../components/kit';

// Category tag colours, as in the Figma table (GRANT / CHALLENGE / HACKATHON).
const CATEGORY = {
  grant: { label: 'GRANT', cls: 'bg-blue-50 text-blue-700 ring-blue-600/20 dark:bg-blue-500/15 dark:text-blue-300' },
  competition: { label: 'CHALLENGE', cls: 'bg-amber-50 text-amber-800 ring-amber-600/25 dark:bg-amber-500/15 dark:text-amber-300' },
  hackathon: { label: 'HACKATHON', cls: 'bg-slate-100 text-slate-700 ring-slate-500/25 dark:bg-slate-500/20 dark:text-slate-300' },
  other: { label: 'OTHER', cls: 'bg-slate-100 text-slate-700 ring-slate-500/25 dark:bg-slate-500/20 dark:text-slate-300' },
};
const TYPE_FILTERS = [
  ['', 'All Types'],
  ['grant', 'Grants'],
  ['hackathon', 'Hackathons'],
  ['competition', 'Competitions'],
  ['other', 'Other'],
];
const STATUS = {
  published: { label: 'Live', cls: 'bg-green-50 text-green-700 ring-green-600/30 dark:bg-green-500/15 dark:text-green-300', dot: 'bg-green-500' },
  pending_review: { label: 'Under Review', cls: 'bg-blue-50 text-blue-700 ring-blue-600/30 dark:bg-blue-500/15 dark:text-blue-300', dot: 'bg-blue-500' },
  closed: { label: 'Closed', cls: 'bg-slate-100 text-slate-700 ring-slate-500/25 dark:bg-slate-500/20 dark:text-slate-300', dot: 'bg-slate-400' },
};
const PAGE_SIZE = 8;

export const ref = (id) => `REF: OPP-${String(id).padStart(4, '0')}`;
export { Breadcrumb, StatTile, initials };

function StatusBadge({ status }) {
  const s = STATUS[status] || STATUS.closed;
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${s.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} aria-hidden="true" />
      {s.label}
    </span>
  );
}

function cohortLabel(c = {}) {
  const yy = (y) => `'${String(y).slice(-2)}`;
  if (c.minCohortYear && c.maxCohortYear) return c.minCohortYear === c.maxCohortYear ? `Class of ${yy(c.minCohortYear)}` : `Class of ${yy(c.minCohortYear)}–${yy(c.maxCohortYear)}`;
  if (c.minCohortYear) return `Class of ${yy(c.minCohortYear)}+`;
  if (c.maxCohortYear) return `Up to class of ${yy(c.maxCohortYear)}`;
  return 'All Alumni';
}

function deadlineWindow(o) {
  const days = Math.ceil((new Date(o.deadline) - Date.now()) / 86400000);
  if (o.status === 'pending_review') return { text: 'Awaiting publication', tone: 'text-muted' };
  if (days < 0) return { text: 'Closed', tone: 'text-muted' };
  if (days === 0) return { text: 'Closes today', tone: 'text-amber-600 dark:text-amber-400' };
  return { text: `${days} day${days === 1 ? '' : 's'} left`, tone: days <= 7 ? 'text-amber-600 dark:text-amber-400' : 'text-green-700 dark:text-green-400' };
}

// Staff Opportunity Management (Figma), limited to the proposal: staff submit
// opportunities for administrator publication (FR08) and review applicants (FR09).
export default function StaffOpportunities() {
  const [rows, setRows] = useState(null);
  const [activity, setActivity] = useState(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    document.title = 'Hackathons & Opportunities · ALU Ventures';
    api.get('/staff/opportunities').then((d) => setRows(d.opportunities)).catch((e) => setError(e.message));
    api.get('/staff/activity').then((d) => setActivity(d.entries)).catch(() => setActivity([]));
  }, []);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const term = q.trim().toLowerCase();
    return rows.filter(
      (o) =>
        (!type || o.type === type) &&
        (!status || o.status === status) &&
        (!term || `${o.title} ${o.organiser || ''} opp-${String(o.id).padStart(4, '0')}`.toLowerCase().includes(term))
    );
  }, [rows, q, type, status]);
  useEffect(() => setPage(1), [q, type, status]);

  if (error) return <Alert type="error">{error}</Alert>;
  if (!rows) return <PageLoader />;

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const shown = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const myDrafts = rows.filter((o) => o.mine && o.status === 'pending_review').length;
  const underReview = rows.filter((o) => o.status === 'pending_review').length;
  const live = rows.filter((o) => o.status === 'published');
  const closingSoon = live.filter((o) => new Date(o.deadline) - Date.now() < 14 * 86400000).length;
  const totalApps = rows.reduce((n, o) => n + o.applicationCount, 0);
  const newApps = rows.reduce((n, o) => n + o.tally.submitted, 0);

  return (
    <>
      <Breadcrumb items={[['Workspace console', '/app/staff'], ['Hackathons & Opportunities']]} />
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-xl">
          <h1 className="text-2xl font-semibold tracking-tight">Staff Opportunity Management</h1>
          <p className="mt-1 text-sm text-muted">
            ALU Entrepreneurship workspace for staff to submit hackathons, grants and competitions for publication, and to
            review applicants with recorded decisions.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Link to="/opportunities" target="_blank" className="btn-secondary">
            <ExternalLink className="h-4 w-4" aria-hidden="true" /> Public listing
          </Link>
          <Link to="/app/staff/new" className="btn-primary">
            <Plus className="h-4 w-4" aria-hidden="true" /> Submit New Opportunity
          </Link>
        </div>
      </div>

      <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Active staff drafts" icon={FilePen} value={myDrafts} unit="in workspace" status="● Pending administrator review" statusTone="text-amber-600 dark:text-amber-400" />
        <StatTile label="Under review" icon={Send} value={underReview} unit="with administrator" status="● Awaiting publication" statusTone="text-accent" />
        <StatTile label="Live opportunities" icon={Globe} value={live.length} unit="live on portal" status={`● ${closingSoon} closing within 14 days`} statusTone="text-green-700 dark:text-green-400" />
        <StatTile label="Total applications" icon={Users} value={totalApps} unit="received" status={`${newApps} awaiting a decision`} />
      </div>

      {/* Filter bar */}
      <div className="card mb-3 flex flex-col gap-2 p-2 xl:flex-row xl:items-center">
        <label className="relative xl:w-80">
          <span className="sr-only">Filter opportunities</span>
          <Search className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-muted" aria-hidden="true" />
          <input className="input pl-8" placeholder="Filter opportunities by title, sponsor or ref…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Filter by type">
          {TYPE_FILTERS.map(([value, label]) => (
            <button
              key={label}
              type="button"
              aria-pressed={type === value}
              onClick={() => setType(value)}
              className={`rounded-md border px-2.5 py-1 text-xs ${type === value ? 'border-accent bg-accent-soft font-medium text-accent' : 'border-line bg-surface text-muted hover:text-ink'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs text-muted xl:ml-2">
          Status:
          <select className="input w-44 py-1" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All Statuses ({rows.length})</option>
            <option value="published">Live ({live.length})</option>
            <option value="pending_review">Under Review ({underReview})</option>
            <option value="closed">Closed ({rows.filter((o) => o.status === 'closed').length})</option>
          </select>
        </label>
        <span className="text-xs text-muted xl:ml-auto">
          {filtered.length} of {rows.length} visible
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="card">
          <EmptyState icon={Inbox} title="No opportunities yet" action={<Link to="/app/staff/new" className="btn-primary">Submit the first one</Link>}>
            Submissions are reviewed and published by the platform administrator.
          </EmptyState>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-line bg-subtle text-[11px] font-semibold uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-2.5">Title &amp; category</th>
                <th className="px-4 py-2.5">Sponsoring partner</th>
                <th className="px-4 py-2.5">Target cohort</th>
                <th className="px-4 py-2.5">Applicants</th>
                <th className="px-4 py-2.5">Deadline window</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {shown.map((o) => {
                const cat = CATEGORY[o.type] || CATEGORY.other;
                const window = deadlineWindow(o);
                const reviewable = o.status !== 'pending_review';
                return (
                  <tr key={o.id} className="hover:bg-subtle">
                    <td className="px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold">{o.title}</p>
                          <p className="mt-0.5 font-mono text-[11px] text-muted">{ref(o.id)}</p>
                        </div>
                        <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide ring-1 ring-inset ${cat.cls}`}>{cat.label}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-line bg-subtle text-[10px] font-semibold text-muted">
                          {initials(o.organiser || o.createdBy?.name)}
                        </span>
                        <span className="text-xs">{o.organiser || o.createdBy?.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-block whitespace-nowrap rounded-md border border-line bg-subtle px-2 py-0.5 text-xs">{cohortLabel(o.criteria)}</span>
                      {o.criteria?.sectors?.length > 0 && <p className="mt-1 text-[11px] text-muted">{o.criteria.sectors.join(', ')}</p>}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <span className="text-sm font-semibold tabular-nums">{o.applicationCount}</span>
                      <span className="block text-muted">{o.tally.submitted} under evaluation</span>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <span className="font-medium">{formatDate(o.deadline)}</span>
                      <span className={`block ${window.tone}`}>{window.text}</span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={o.status} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-0.5">
                        {o.mine && o.status === 'pending_review' && (
                          <Link to={`/app/staff/${o.id}/edit`} className="rounded-md p-1.5 text-muted hover:bg-subtle hover:text-ink" title="Edit submission" aria-label={`Edit ${o.title}`}>
                            <FilePen className="h-4 w-4" />
                          </Link>
                        )}
                        {reviewable && (
                          <Link to={`/app/staff/${o.id}`} className="rounded-md p-1.5 text-accent hover:bg-accent-soft" title="Evaluate applicants" aria-label={`Evaluate applicants for ${o.title}`}>
                            <Users className="h-4 w-4" />
                          </Link>
                        )}
                        {o.status === 'published' && (
                          <Link to="/opportunities" target="_blank" className="rounded-md p-1.5 text-muted hover:bg-subtle hover:text-ink" title="View on public portal" aria-label={`View ${o.title} on the public portal`}>
                            <Globe className="h-4 w-4" />
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-muted">
                    No opportunities match these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="flex items-center justify-between border-t border-line bg-subtle px-4 py-2 text-xs text-muted">
            <span>
              Page {page} of {pages} • {shown.length} brief{shown.length === 1 ? '' : 's'} shown
            </span>
            <div className="flex gap-1">
              <button type="button" className="btn-secondary px-2 py-0.5 text-xs" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </button>
              <button type="button" className="btn-secondary px-2 py-0.5 text-xs" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      <AuditStrip title="Opportunity Governance Audit Log" note="Every staff and administrator action is recorded" entries={activity} />
    </>
  );
}

// "Staff Selection" in the sidebar: jump straight to the opportunity with the
// most applications awaiting a decision, or list the reviewable ones.
export function StaffSelectionHome() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    document.title = 'Staff Selection · ALU Ventures';
    api.get('/staff/opportunities').then((d) => setRows(d.opportunities.filter((o) => o.status !== 'pending_review'))).catch((e) => setError(e.message));
  }, []);
  if (error) return <Alert type="error">{error}</Alert>;
  if (!rows) return <PageLoader />;
  const pending = [...rows].sort((a, b) => b.tally.submitted - a.tally.submitted).find((o) => o.tally.submitted > 0);
  if (pending) return <Navigate to={`/app/staff/${pending.id}`} replace />;
  return (
    <>
      <Breadcrumb items={[['Workspace console', '/app/staff'], ['Staff Selection']]} />
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Staff Selection</h1>
      <p className="mb-6 text-sm text-muted">No applications are awaiting a decision. Open an opportunity to review past decisions.</p>
      {rows.length === 0 ? (
        <div className="card">
          <EmptyState icon={Inbox} title="No published opportunities yet" />
        </div>
      ) : (
        <ul className="card divide-y divide-line">
          {rows.map((o) => (
            <li key={o.id}>
              <Link to={`/app/staff/${o.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-subtle">
                <span>
                  <span className="font-medium">{o.title}</span>
                  <span className="block font-mono text-[11px] text-muted">{ref(o.id)}</span>
                </span>
                <span className="text-xs text-muted">
                  {o.applicationCount} applicants · {o.tally.selected} selected
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export function StaffOpportunityForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [initial, setInitial] = useState(id ? null : undefined);
  useEffect(() => {
    if (id) api.get(`/staff/opportunities/${id}`).then((d) => setInitial(d.opportunity));
  }, [id]);
  if (initial === null) return <PageLoader />;
  return (
    <>
      <Breadcrumb items={[['Workspace console', '/app/staff'], ['Hackathons & Opportunities', '/app/staff'], [id ? 'Edit submission' : 'Submit New Opportunity']]} />
      <h1 className="text-2xl font-semibold tracking-tight">{id ? 'Edit submission' : 'Submit New Opportunity'}</h1>
      <p className="mb-6 mt-1 text-sm text-muted">The administrator reviews and publishes submissions. You evaluate applicants once it is live.</p>
      <div className="card p-5">
        <OpportunityForm
          initial={initial}
          submitLabel={id ? 'Save submission' : 'Submit for publication'}
          onCancel={() => navigate('/app/staff')}
          onSubmit={async (data) => {
            if (id) await api.patch(`/staff/opportunities/${id}`, data);
            else await api.post('/staff/opportunities', data);
            navigate('/app/staff');
          }}
        />
      </div>
    </>
  );
}
