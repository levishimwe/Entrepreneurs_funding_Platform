import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, qs } from '../../lib/api';
import { formatDate } from '../../components/ui';
import ReasonDialog from '../../components/ReasonDialog';
import { availableActions } from '../../lib/projectActions';
import { AdminPage, DataTable, DeleteDialog, ListLayout, Loading, Messages, Pager, SearchInput, StatusPill, StatusSelect } from '../../components/admin';

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
const PAGE_SIZE = 25;
// Row shortcuts; every action is also on the project's page.
const ROW_ACTIONS = ['approve', 'reject', 'archive', 'restore'];
const wasRejected = (p) => p.status === 'rejected' || (p.status === 'archived' && p.statusBeforeArchive === 'rejected');

function rdbCheck(p) {
  if (p.type === 'idea') return <span className="adm-muted">Idea stage</span>;
  if (p.rdbFlag === 'suspicious') return <span className="adm-pill adm-pill-danger" title={p.rdbIssue}>{p.rdbIssue || 'Suspicious'}</span>;
  return <StatusPill status={p.rdbFlag || 'processing'} />;
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
  const [type, setType] = useState('');
  const [check, setCheck] = useState('');
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [dialog, setDialog] = useState(null);
  const [deleting, setDeleting] = useState(null);

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
  const checkOf = (p) => (p.type === 'idea' ? 'idea' : p.rdbFlag || 'processing');
  const rows = useMemo(() => (data?.projects || []).filter((p) => (!type || p.type === type) && (!check || checkOf(p) === check)), [data, type, check]);
  const shown = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const suspiciousApproval = dialog?.key === 'approve' && dialog.project.rdbFlag === 'suspicious';
  const facetCount = (fn) => (data ? data.projects.filter(fn).length : null);

  const columns = [
    {
      key: 'project',
      label: 'Project',
      render: (p) => (
        <>
          <Link className="adm-a font-medium" to={`/app/admin/projects/${p.id}`}>
            {p.title}
          </Link>
          <div className="adm-mono adm-muted">{p.projectCode}</div>
        </>
      ),
    },
    {
      key: 'graduate',
      label: 'Graduate',
      render: (p) => (
        <>
          {p.owner?.name}
          <div className="adm-muted text-[12px]">{p.sector}</div>
        </>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (p) => (
        <StatusPill status={p.status} label={p.status === 'similarity_flagged' && p.similarityScore ? `Similarity ${Math.round(p.similarityScore * 100)}%` : undefined} />
      ),
    },
    { key: 'rdb', label: 'RDB check', render: rdbCheck },
    { key: 'investors', label: 'Investors', num: true, render: (p) => `${p.confirmedInvestors} / 2` },
    { key: 'submitted', label: 'Submitted', className: 'whitespace-nowrap', render: (p) => formatDate(p.submittedAt) },
  ];

  const actions = (p) => (
    <>
      <Link className="adm-act" to={`/app/admin/projects/${p.id}`}>
        Review
      </Link>
      {availableActions(p)
        .filter(([key]) => ROW_ACTIONS.includes(key))
        .filter(([key]) => key !== 'archive' || !['pending_review', 'similarity_flagged'].includes(p.status))
        .map(([key, a, disabled]) => (
          <button
            key={key}
            type="button"
            className={`adm-act ${a.tone === 'danger' ? 'adm-act-danger' : ''}`}
            disabled={Boolean(disabled)}
            title={disabled || undefined}
            onClick={() => setDialog({ key, action: a, project: p })}
          >
            {a.label}
          </button>
        ))}
      {wasRejected(p) && (
        <button type="button" className="adm-act adm-act-danger" onClick={() => setDeleting(p)}>
          Delete
        </button>
      )}
    </>
  );

  return (
    <AdminPage title="Projects" meta={data ? `${rows.length} project${rows.length === 1 ? '' : 's'}` : null}>
      <Messages notice={notice} error={error} />
      <ListLayout
        toolbar={
          <>
            <SearchInput value={search} onChange={setSearch} onSubmit={() => setParams({ status, ...(search ? { q: search } : {}) })} placeholder="Title, code or company" />
            <StatusSelect value={status} options={STATUSES.map(([k, l]) => [k, l, data?.counts?.[k] ?? null])} onChange={setStatus} />
            <button type="button" className="adm-primary" disabled={!rows.length} onClick={() => exportCsv(rows, status)}>
              Export CSV
            </button>
          </>
        }
        filters={[
          { title: 'Status', value: status, onChange: setStatus, options: STATUSES.map(([k, l]) => [k, l, data?.counts?.[k] ?? null]) },
          {
            title: 'Type',
            value: type,
            onChange: setType,
            options: [
              ['', 'All', facetCount(() => true)],
              ['company', 'Registered company', facetCount((p) => p.type === 'company')],
              ['idea', 'Idea stage', facetCount((p) => p.type === 'idea')],
            ],
          },
          {
            title: 'RDB check',
            value: check,
            onChange: setCheck,
            options: [
              ['', 'All'],
              ['suspicious', 'Suspicious', facetCount((p) => checkOf(p) === 'suspicious')],
              ['likely_valid', 'Likely valid', facetCount((p) => checkOf(p) === 'likely_valid')],
              ['processing', 'Checking', facetCount((p) => checkOf(p) === 'processing')],
            ],
          },
        ]}
        footer={<Pager page={page} pageSize={PAGE_SIZE} total={rows.length} onPage={setPage} />}
      >
        {!data ? <Loading /> : <DataTable columns={columns} rows={shown} actions={actions} empty="No projects match." />}
      </ListLayout>

      <ReasonDialog
        open={Boolean(dialog)}
        title={dialog?.action.title}
        description={dialog ? `${dialog.project.title} (${dialog.project.projectCode}). ${dialog.action.description}` : ''}
        warning={suspiciousApproval ? 'The RDB check flagged this certificate as Suspicious. Record why you are approving.' : undefined}
        reason={suspiciousApproval ? 'required' : dialog?.action.reason}
        reasonLabel={dialog?.action.reasonLabel}
        confirmLabel={dialog?.action.label}
        tone={dialog?.action.tone}
        onClose={() => setDialog(null)}
        onConfirm={async (reason) => {
          await api.post(`/admin/projects/${dialog.project.id}/${dialog.key}`, { reason });
          setNotice(`${dialog.action.label}: ${dialog.project.title}.`);
          load();
        }}
      />
      <DeleteDialog
        open={Boolean(deleting)}
        title={deleting ? `Delete ${deleting.title}?` : ''}
        planUrl={deleting ? `/admin/projects/${deleting.id}/delete-plan` : ''}
        deleteUrl={deleting ? `/admin/projects/${deleting.id}` : ''}
        onClose={() => setDeleting(null)}
        onDeleted={(removed) => {
          setNotice(`Deleted: ${removed.join(', ')}.`);
          load();
        }}
      />
    </AdminPage>
  );
}
