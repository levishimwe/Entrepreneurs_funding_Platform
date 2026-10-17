import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, qs } from '../../lib/api';
import { formatDate } from '../../components/ui';
import ReasonDialog from '../../components/ReasonDialog';
import { availableActions } from '../../lib/projectActions';
import { AdminPage, EmptyRow, FilterLinks, Filters, Loading, Messages, Pager, StatusText, TableWrap } from '../../components/admin';

// Proposal status list plus Similarity Flagged.
const STATUSES = [
  ['pending_review', 'Pending review'],
  ['similarity_flagged', 'Similarity flagged'],
  ['revision_required', 'Revision required'],
  ['approved', 'Approved'],
  ['funded', 'Funded'],
  ['investor_limit_reached', 'Investor limit reached'],
  ['rejected', 'Rejected'],
  ['archived', 'Archived'],
];
const PAGE_SIZE = 20;
// Row shortcuts; every other action is on the project's page.
const ROW_ACTIONS = ['approve', 'reject'];

function rdbCheck(p) {
  if (p.type === 'idea') return <span className="adm-muted">Idea stage, no RDB file</span>;
  if (p.rdbFlag === 'suspicious') return <span className="adm-bad">Suspicious: {p.rdbIssue}</span>;
  return <StatusText status={p.rdbFlag || 'processing'} />;
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

// Project verification queue — FR05, FR11, FR13, FR16.
export default function ProjectQueue() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') || 'pending_review';
  const [search, setSearch] = useState(params.get('q') || '');
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [dialog, setDialog] = useState(null);

  const load = useCallback(() => {
    setData(null);
    api
      .get(`/admin/projects${qs({ status, q: params.get('q') })}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [status, params]);

  useEffect(() => {
    document.title = 'Projects · ALU Ventures';
    setPage(1);
    load();
  }, [load]);

  const setStatus = (s) => setParams({ status: s, ...(params.get('q') ? { q: params.get('q') } : {}) });
  const rows = data?.projects || [];
  const shown = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const suspiciousApproval = dialog?.key === 'approve' && dialog.project.rdbFlag === 'suspicious';

  return (
    <AdminPage
      title="Projects"
      hint="Approving a project whose RDB check is Suspicious requires a reason. Other actions are on each project's page."
      actions={
        <button type="button" className="adm-btn" disabled={!rows.length} onClick={() => exportCsv(rows, status)}>
          Export CSV
        </button>
      }
    >
      <Messages notice={notice} error={error} />
      <Filters>
        <FilterLinks label="Status" options={STATUSES.map(([k, l]) => [k, l, data?.counts?.[k] ?? null])} value={status} onChange={setStatus} />
        <form
          className="flex gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            setParams({ status, ...(search ? { q: search } : {}) });
          }}
        >
          <input aria-label="Search projects" placeholder="Title, project code or company" value={search} onChange={(e) => setSearch(e.target.value)} />
          <button type="submit" className="adm-btn">
            Search
          </button>
        </form>
      </Filters>

      {!data ? (
        <Loading />
      ) : (
        <TableWrap>
          <table className="adm-table">
            <thead>
              <tr>
                <th>Project</th>
                <th>Graduate</th>
                <th>Sector</th>
                <th>Status</th>
                <th>RDB check</th>
                <th className="adm-num">Investors</th>
                <th>Submitted</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && <EmptyRow colSpan={8}>No projects with this status.</EmptyRow>}
              {shown.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link className="adm-a" to={`/app/admin/projects/${p.id}`}>
                      {p.title}
                    </Link>
                    <div className="adm-mono adm-muted">
                      {p.projectCode}
                      {p.companyNumber && ` · RDB ${p.companyNumber}`}
                    </div>
                  </td>
                  <td>{p.owner?.name}</td>
                  <td>{p.sector}</td>
                  <td>
                    <StatusText status={p.status} />
                    {p.status === 'similarity_flagged' && p.similarityScore ? ` (${Math.round(p.similarityScore * 100)}%)` : ''}
                  </td>
                  <td>{rdbCheck(p)}</td>
                  <td className="adm-num">{p.confirmedInvestors} of 2</td>
                  <td className="whitespace-nowrap">{formatDate(p.submittedAt)}</td>
                  <td className="adm-actions">
                    <Link className="adm-btn" to={`/app/admin/projects/${p.id}`}>
                      View
                    </Link>
                    {availableActions(p)
                      .filter(([key]) => ROW_ACTIONS.includes(key))
                      .map(([key, a, disabled]) => (
                        <button
                          key={key}
                          type="button"
                          className={`adm-btn ${a.tone === 'danger' ? 'adm-btn-danger' : ''}`}
                          disabled={Boolean(disabled)}
                          title={disabled || undefined}
                          onClick={() => setDialog({ key, action: a, project: p })}
                        >
                          {a.label}
                        </button>
                      ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
      <Pager page={page} pageSize={PAGE_SIZE} total={rows.length} onPage={setPage} />

      <ReasonDialog
        open={Boolean(dialog)}
        title={dialog?.action.title}
        description={dialog ? `${dialog.project.title} (${dialog.project.projectCode}) — ${dialog.action.description}` : ''}
        warning={suspiciousApproval ? 'The RDB pre-check flagged this certificate as Suspicious. Record why you are approving.' : undefined}
        reason={suspiciousApproval ? 'required' : dialog?.action.reason}
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
    </AdminPage>
  );
}
