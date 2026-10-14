import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ClipboardCheck, Download, FileText, Inbox, MoreVertical, Search, ShieldCheck, TriangleAlert } from 'lucide-react';
import { api, qs } from '../../lib/api';
import { Alert, PageLoader, StatusPill, formatDate } from '../../components/ui';
import ReasonDialog from '../../components/ReasonDialog';
import { ARCHIVE_NOTICE, availableActions } from '../../lib/projectActions';

// Proposal status list plus Similarity Flagged.
const TABS = [
  ['pending_review', 'Pending Review'],
  ['similarity_flagged', 'Similarity Flagged'],
  ['revision_required', 'Revision Required'],
  ['approved', 'Approved & Seeking Investment'],
  ['funded', 'Fully Funded'],
  ['investor_limit_reached', 'Investor Limit Reached'],
  ['rejected', 'Rejected'],
  ['archived', 'Archived'],
];
const PAGE_SIZE = 10;
const TONE = {
  green: 'text-green-700 dark:text-green-400',
  blue: 'text-accent',
  amber: 'text-amber-600 dark:text-amber-400',
  purple: 'text-purple-600 dark:text-purple-400',
};

function Badge({ tone, children }) {
  const cls = {
    green: 'bg-green-50 text-green-700 ring-green-600/25 dark:bg-green-500/15 dark:text-green-300',
    amber: 'bg-amber-50 text-amber-800 ring-amber-600/30 dark:bg-amber-500/15 dark:text-amber-300',
    slate: 'bg-slate-100 text-slate-700 ring-slate-500/25 dark:bg-slate-500/20 dark:text-slate-300',
    blue: 'bg-blue-50 text-blue-700 ring-blue-600/25 dark:bg-blue-500/15 dark:text-blue-300',
    purple: 'bg-purple-50 text-purple-700 ring-purple-600/25 dark:bg-purple-500/15 dark:text-purple-300',
    red: 'bg-red-50 text-red-700 ring-red-600/25 dark:bg-red-500/15 dark:text-red-300',
  }[tone];
  return <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${cls}`}>{children}</span>;
}

// Row badges. "One Investor" is a badge on an approved project, not a status.
function RowBadges({ p }) {
  const badges = [];
  if (p.status === 'approved') badges.push(['green', 'Seeking Investment']);
  if (p.status === 'approved' && p.confirmedInvestors === 1) badges.push(['amber', '1 Investor Confirmed']);
  if (p.status === 'investor_limit_reached') badges.push(['slate', 'Investor Limit Reached']);
  if (p.status === 'funded') badges.push(['green', 'Funded']);
  if (p.status === 'archived') badges.push(['slate', 'Archived']);
  if (p.status === 'similarity_flagged') badges.push(['purple', `Similarity ${p.similarityScore ? `${Math.round(p.similarityScore * 100)}%` : 'flag'}`]);
  if (p.status === 'revision_required') badges.push(['blue', 'Revision Required']);
  if (p.status === 'pending_review') badges.push(['amber', 'Pending Review']);
  if (p.status === 'rejected') badges.push(['red', 'Rejected']);
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {badges.map(([tone, text]) => (
        <Badge key={text} tone={tone}>
          {text}
        </Badge>
      ))}
    </div>
  );
}

function VerificationCell({ p }) {
  if (p.type === 'idea') {
    return (
      <>
        <Badge tone="slate">Idea stage</Badge>
        <p className="mt-0.5 text-[11px] text-muted">Declaration — no RDB file</p>
      </>
    );
  }
  if (p.rdbFlag === 'processing') return <StatusPill status="processing" />;
  const suspicious = p.rdbFlag === 'suspicious';
  return (
    <>
      <StatusPill status={p.rdbFlag} />
      <p className={`mt-0.5 text-[11px] ${suspicious ? 'text-red-600 dark:text-red-400' : 'text-muted'}`}>
        {suspicious ? p.rdbIssue : p.status === 'funded' ? 'Funding recorded' : 'All automated checks passed'}
      </p>
    </>
  );
}

function ActionMenu({ project, onPick }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  const actions = availableActions(project);
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className={`rounded-md border p-1.5 ${open ? 'border-accent bg-accent text-white' : 'border-line bg-surface text-muted hover:text-ink'}`}
        aria-label={`More actions for ${project.title}`}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-56 rounded-md border border-line bg-surface py-1 text-sm shadow-lg">
          <Link to={`/app/admin/projects/${project.id}`} className="block px-3 py-1.5 hover:bg-subtle">
            View full review
          </Link>
          {actions.map(([key, a, disabled]) => (
            <button
              key={key}
              type="button"
              disabled={Boolean(disabled)}
              title={disabled || undefined}
              onClick={() => {
                setOpen(false);
                onPick(key, a);
              }}
              className={`block w-full px-3 py-1.5 text-left hover:bg-subtle disabled:cursor-not-allowed disabled:opacity-50 ${a.tone === 'danger' ? 'text-red-600 dark:text-red-400' : ''}`}
            >
              {a.label}
              {disabled && <span className="block text-[11px] text-muted">{disabled}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function exportCsv(rows, status) {
  const header = ['Project code', 'Title', 'Type', 'Sector', 'Status', 'RDB check', 'RDB issue', 'Company number', 'Graduate', 'Graduate email', 'Confirmed investors', 'Submitted'];
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = rows.map((p) =>
    [p.projectCode, p.title, p.type, p.sector, p.status, p.rdbFlag || '', p.rdbIssue || '', p.companyNumber || '', p.owner?.name, p.owner?.email, p.confirmedInvestors, p.submittedAt].map(esc).join(',')
  );
  const blob = new Blob([[header.map(esc).join(','), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: `alu-ventures-${status}-${new Date().toISOString().slice(0, 10)}.csv` });
  a.click();
  URL.revokeObjectURL(url);
}

// Project Verification Queue (Figma) — FR05, FR11, FR13, FR16.
export default function ProjectQueue() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') || 'pending_review';
  const [search, setSearch] = useState(params.get('q') || '');
  const [data, setData] = useState(null);
  const [stats, setStats] = useState(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [dialog, setDialog] = useState(null);
  const [archiveRow, setArchiveRow] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setData(null);
    api
      .get(`/admin/projects${qs({ status, q: params.get('q') })}`)
      .then(setData)
      .catch((e) => setError(e.message));
    api.get('/admin/dashboard').then(setStats).catch(() => setStats(null));
  }, [status, params]);

  useEffect(() => {
    document.title = 'Project verification queue · ALU Ventures';
    setPage(1);
    setArchiveRow(null);
    load();
  }, [load]);

  const setTab = (s) => setParams({ status: s, ...(params.get('q') ? { q: params.get('q') } : {}) });
  const pick = (project) => (key, action) => {
    if (key === 'archive') setArchiveRow(project.id);
    else setDialog({ key, action, project });
  };
  const confirmArchive = async (project) => {
    setBusy(true);
    try {
      await api.post(`/admin/projects/${project.id}/archive`, {});
      setNotice(`Archived: ${project.title}. Its project, introduction and funding history is retained.`);
      setArchiveRow(null);
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const rows = data?.projects || [];
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const shown = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <ShieldCheck className="h-6 w-6 text-accent" aria-hidden="true" /> Project Verification Queue
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            ALU administration review queue for RDB certificate pre-checks, similarity flags and graduate founder submissions.
            Every decision is recorded with your name, the time and your reason.
          </p>
        </div>
        <button type="button" className="btn-secondary shrink-0" disabled={!rows.length} onClick={() => exportCsv(rows, status)}>
          <Download className="h-4 w-4" aria-hidden="true" /> Export (.csv)
        </button>
      </div>

      {stats && (
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {stats.cards.map((c) => (
            <div key={c.key} className="card p-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{c.label}</p>
              <p className={`mt-1 text-xl font-semibold tabular-nums ${TONE[c.tone] || ''}`}>{c.value}</p>
              {c.hint && <p className="text-[11px] text-muted">{c.hint}</p>}
            </div>
          ))}
        </div>
      )}

      {notice && <Alert type="success" className="mb-4">{notice}</Alert>}
      {error && <Alert type="error" className="mb-4">{error}</Alert>}

      <div className="mb-3 overflow-x-auto border-b border-line">
        <div className="flex min-w-max gap-1" role="tablist">
          {TABS.map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={status === key}
              onClick={() => setTab(key)}
              className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm ${status === key ? 'border-accent font-semibold' : 'border-transparent text-muted hover:text-ink'}`}
            >
              {label}
              {data?.counts && (
                <span className={`rounded-full px-1.5 text-xs tabular-nums ${status === key ? 'bg-accent text-white' : 'bg-subtle text-muted ring-1 ring-line'}`}>{data.counts[key] ?? 0}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="card overflow-hidden">
        <form
          className="flex flex-col gap-2 border-b border-line bg-subtle p-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            setParams({ status, ...(search ? { q: search } : {}) });
          }}
        >
          <label className="relative flex-1">
            <span className="sr-only">Search projects</span>
            <Search className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-muted" aria-hidden="true" />
            <input className="input pl-8" placeholder="Search by title, project code or company…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
          <button type="submit" className="btn-secondary">
            Search
          </button>
        </form>

        {!data ? (
          <PageLoader />
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-12 text-center">
            <Inbox className="h-8 w-8 text-muted" aria-hidden="true" />
            <p className="mt-2 font-medium">No projects in this queue</p>
            <p className="text-sm text-muted">Projects appear here as graduates submit them or their status changes.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="border-b border-line bg-subtle text-[11px] font-semibold uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-2.5">Project name &amp; badges</th>
                  <th className="px-4 py-2.5">Graduate name</th>
                  <th className="px-4 py-2.5">Status &amp; verification</th>
                  <th className="px-4 py-2.5">Submitted date</th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {shown.map((p) => {
                  const suspicious = p.rdbFlag === 'suspicious';
                  return (
                    <Fragment key={p.id}>
                      <tr className={suspicious ? 'bg-red-50/60 dark:bg-red-500/5' : 'hover:bg-subtle'}>
                        <td className="px-4 py-3">
                          <Link to={`/app/admin/projects/${p.id}`} className="font-semibold hover:text-accent hover:underline">
                            {p.title}
                          </Link>
                          <RowBadges p={p} />
                          <p className="mt-1 font-mono text-[11px] text-muted">
                            {p.companyNumber ? `RDB-${p.companyNumber}` : 'No RDB number'} · {p.sector}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <p>{p.owner?.name}</p>
                          <p className="font-mono text-[11px] text-muted">{p.projectCode}</p>
                        </td>
                        <td className="px-4 py-3">
                          <VerificationCell p={p} />
                        </td>
                        <td className="px-4 py-3 text-xs text-muted">{formatDate(p.submittedAt)}</td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1.5">
                            <Link
                              to={`/app/admin/projects/${p.id}`}
                              className={`btn px-2.5 py-1 text-xs ${suspicious ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300' : 'border-line bg-surface hover:bg-subtle'}`}
                            >
                              Review
                            </Link>
                            <ActionMenu project={p} onPick={pick(p)} />
                          </div>
                        </td>
                      </tr>
                      {archiveRow === p.id && (
                        <tr>
                          <td colSpan={5} className="bg-amber-50 px-4 py-3 dark:bg-amber-500/10">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                              <p className="text-sm">
                                <span className="flex items-center gap-1.5 font-semibold text-amber-800 dark:text-amber-300">
                                  <TriangleAlert className="h-4 w-4" aria-hidden="true" /> Archive Confirmation Preview
                                </span>
                                <span className="text-amber-900/80 dark:text-amber-200/80">{ARCHIVE_NOTICE}</span>
                              </p>
                              <div className="flex shrink-0 gap-2">
                                <button type="button" className="btn-secondary px-2.5 py-1 text-xs" onClick={() => setArchiveRow(null)}>
                                  Dismiss
                                </button>
                                <button type="button" className="btn border-transparent bg-amber-700 px-2.5 py-1 text-xs text-white hover:bg-amber-800" disabled={busy} onClick={() => confirmArchive(p)}>
                                  {busy ? 'Archiving…' : 'Confirm Archive'}
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {rows.length > 0 && (
          <div className="flex items-center justify-between border-t border-line bg-subtle px-4 py-2 text-xs text-muted">
            <span>
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, rows.length)} of {rows.length} verification item{rows.length === 1 ? '' : 's'}
            </span>
            <div className="flex gap-1">
              <button type="button" className="btn-secondary px-2 py-0.5 text-xs" disabled={page <= 1} onClick={() => setPage((x) => x - 1)}>
                Previous
              </button>
              {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-current={n === page ? 'page' : undefined}
                  className={`rounded-md px-2 py-0.5 text-xs ring-1 ring-line ${n === page ? 'bg-surface font-semibold text-ink' : 'text-muted hover:bg-surface'}`}
                  onClick={() => setPage(n)}
                >
                  {n}
                </button>
              ))}
              <button type="button" className="btn-secondary px-2 py-0.5 text-xs" disabled={page >= pages} onClick={() => setPage((x) => x + 1)}>
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <section className="card p-4">
          <h2 className="flex items-center gap-2 font-semibold">
            <FileText className="h-4 w-4 text-accent" aria-hidden="true" /> RDB Verification Notes
          </h2>
          <p className="mt-2 border-t border-line pt-2 text-sm text-muted">
            Company submissions are pre-checked by reading the RDB certificate: official markings, a registration number that
            matches the submitted company code, an unexpired validity date, and a fuzzy match between the director or company
            name and the graduate&apos;s name. The result is a preliminary flag only — there is no live connection to RDB.
          </p>
        </section>
        <section className="card p-4">
          <h2 className="flex items-center gap-2 font-semibold">
            <ClipboardCheck className="h-4 w-4 text-accent" aria-hidden="true" /> Verification Guidelines
          </h2>
          <ol className="mt-2 list-decimal space-y-1 border-t border-line pt-2 pl-4 text-sm text-muted">
            <li>Open the document beside the checks and confirm what failed.</li>
            <li>A name mismatch may be an authorised representative — check the stated relationship.</li>
            <li>Approving a Suspicious flag requires a recorded reason; otherwise request a revision or reject.</li>
          </ol>
        </section>
      </div>

      <ReasonDialog
        open={Boolean(dialog)}
        title={dialog?.action.title}
        description={dialog ? `${dialog.project.title} (${dialog.project.projectCode}) — ${dialog.action.description}` : ''}
        warning={dialog?.key === 'approve' && dialog.project.rdbFlag === 'suspicious' ? 'The RDB pre-check flagged this certificate as Suspicious. Record why you are approving.' : undefined}
        reason={dialog?.key === 'approve' && dialog.project.rdbFlag === 'suspicious' ? 'required' : dialog?.action.reason}
        reasonLabel={dialog?.action.reasonLabel}
        confirmLabel={dialog?.action.label}
        tone={dialog?.action.tone}
        onClose={() => setDialog(null)}
        onConfirm={async (reason) => {
          await api.post(`/admin/projects/${dialog.project.id}/${dialog.key}`, { reason });
          setNotice(`${dialog.action.label}: ${dialog.project.title} — recorded.`);
          load();
        }}
      />
    </>
  );
}
