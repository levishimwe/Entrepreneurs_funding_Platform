import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { formatDate } from '../../components/ui';
import ReasonDialog from '../../components/ReasonDialog';
import { AdminPage, DataTable, DeleteDialog, ListLayout, Loading, Messages, SearchInput, SidePanel, StatusPill, StatusSelect } from '../../components/admin';
import { Avatar, DecisionPanel, FieldGrid, InfoCard } from '../../components/detail';

const STATUSES = [
  ['pending', 'Pending review'],
  ['approved', 'Approved'],
  ['rejected', 'Rejected'],
  ['archived', 'Archived'],
];

const COPY = {
  graduate: { title: 'Graduates', endpoint: 'graduates', noun: 'graduate' },
  investor: { title: 'Investors', endpoint: 'investors', noun: 'investor' },
};

// Permanent delete is offered only for archived or rejected accounts (the server checks again).
const deletable = (row) => ['archived', 'rejected'].includes(row.status);

// Approval queue and records for graduate (FR02) or investor/sponsor (FR03) accounts.
export default function AccountQueue({ role }) {
  const copy = COPY[role];
  const [params, setParams] = useSearchParams();
  const tab = STATUSES.some(([k]) => k === params.get('status')) ? params.get('status') : 'pending';
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState('');
  const [facet, setFacet] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [viewing, setViewing] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [reason, setReason] = useState('');
  // A reason typed for one person never carries over to the next.
  useEffect(() => setReason(''), [viewing?.id]);

  const load = useCallback(() => {
    setRows(null);
    api
      .get(`/admin/${copy.endpoint}?status=${tab}`)
      .then((d) => setRows(d[copy.endpoint]))
      .catch((e) => setError(e.message));
  }, [copy.endpoint, tab]);

  useEffect(() => {
    document.title = `${copy.title} · ALU Ventures`;
    load();
  }, [load, copy.title]);

  const setTab = (status) => setParams({ status });
  // Investors can be filtered by type. Graduates have no document check: an
  // administrator approves each one after the alumni-email OTP.
  const facetOf = (row) => (role === 'graduate' ? '' : row.investorType || 'investor');
  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (rows || []).filter((r) => (!facet || facetOf(r) === facet) && (!term || `${r.fullName} ${r.email} ${r.organisation || ''} ${r.program || ''}`.toLowerCase().includes(term)));
  }, [rows, q, facet]); // eslint-disable-line react-hooks/exhaustive-deps

  const facetOptions = [
    ['', 'All'],
    ['investor', 'Investor'],
    ['sponsor', 'Sponsor'],
  ];
  const count = (key) => (rows ? rows.filter((r) => !key || facetOf(r) === key).length : null);

  const decide = (row, decision) => setDialog({ row, decision });

  const actions = (row, { inPanel = false } = {}) => (
    <>
      {!inPanel && (
        <button type="button" className="adm-act" onClick={() => setViewing(row)}>
          View
        </button>
      )}
      {row.status === 'pending_review' && (
        <>
          <button type="button" className={inPanel ? 'adm-primary' : 'adm-act'} onClick={() => decide(row, 'approve')}>
            Approve
          </button>
          <button type="button" className="adm-act adm-act-danger" onClick={() => decide(row, 'reject')}>
            Reject
          </button>
        </>
      )}
      {row.status === 'archived' ? (
        row.emailReleased ? (
          <span className="adm-muted ml-2 inline-block text-[12px]" title="This email address was registered again by a new account, so the old account cannot be unarchived. It stays archived with its history.">
            Email reused, cannot unarchive
          </span>
        ) : (
          <button type="button" className="adm-act" onClick={() => setDialog({ row, decision: 'unarchive' })}>
            Unarchive
          </button>
        )
      ) : (
        row.status !== 'pending_review' && (
          <button type="button" className="adm-act adm-act-danger" onClick={() => setDialog({ row, decision: 'archive' })}>
            Archive
          </button>
        )
      )}
      {deletable(row) && (
        <button type="button" className="adm-act adm-act-danger" onClick={() => setDeleting(row)}>
          Delete permanently
        </button>
      )}
    </>
  );

  const columns = [
    { key: 'name', label: 'Name', render: (r) => <button type="button" className="adm-a text-left font-medium" onClick={() => setViewing(r)}>{r.fullName}</button> },
    { key: 'email', label: 'Email', render: (r) => <span className="break-all">{r.email}</span> },
    role === 'graduate'
      ? { key: 'program', label: 'Programme', render: (r) => `${r.program || '—'}${r.cohortYear ? ` · ${r.cohortYear}` : ''}` }
      : { key: 'org', label: 'Organisation', render: (r) => `${r.organisation || '—'} · ${r.investorType === 'sponsor' ? 'Sponsor' : 'Investor'}` },
    { key: 'registered', label: 'Registered', render: (r) => formatDate(r.registeredAt) },
    { key: 'status', label: 'Status', render: (r) => <StatusPill status={r.status} /> },
  ];

  const isDecision = dialog && ['approve', 'reject'].includes(dialog.decision);
  return (
    <AdminPage title={copy.title} meta={rows ? `${shown.length} ${copy.noun}${shown.length === 1 ? '' : 's'}` : null}>
      <Messages notice={notice} error={error} />
      <ListLayout
        toolbar={
          <>
            <SearchInput value={q} onChange={setQ} placeholder="Search name or email" />
            <StatusSelect value={tab} options={STATUSES} onChange={setTab} />
          </>
        }
        filters={[
          { title: 'Status', value: tab, onChange: setTab, options: STATUSES },
          ...(role === 'investor' ? [{ title: 'Type', value: facet, onChange: setFacet, options: facetOptions.map(([k, l]) => [k, l, count(k)]) }] : []),
        ]}
      >
        {!rows ? <Loading /> : <DataTable columns={columns} rows={shown} actions={actions} empty={`No ${STATUSES.find(([k]) => k === tab)[1].toLowerCase()} ${copy.noun}s.`} />}
      </ListLayout>

      {viewing && (
        <SidePanel title={viewing.fullName} onClose={() => setViewing(null)}>
          <div className="space-y-4">
            <header className="card flex items-start gap-4 p-4 sm:p-5">
              <Avatar name={viewing.fullName} src={viewing.hasPhoto ? `/api/admin/users/${viewing.id}/photo` : null} size={56} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[17px] font-semibold text-ink [overflow-wrap:anywhere]">{viewing.fullName}</p>
                  <StatusPill status={viewing.status} />
                </div>
                <p className="mt-1 text-[13px] text-muted [overflow-wrap:anywhere]">
                  {role === 'graduate'
                    ? [viewing.program, viewing.cohortYear && `Class of ${viewing.cohortYear}`].filter(Boolean).join(' · ') || 'Graduate'
                    : [viewing.organisation, viewing.investorType === 'sponsor' ? 'Sponsor' : 'Investor'].filter(Boolean).join(' · ')}
                </p>
              </div>
            </header>

            <InfoCard title="Contact">
              <FieldGrid
                fields={[
                  ['Email', viewing.email],
                  ['Phone', viewing.phone],
                  ['Registered', formatDate(viewing.registeredAt, true)],
                ]}
              />
            </InfoCard>

            {role === 'graduate' ? (
              <InfoCard title="Graduate">
                <FieldGrid
                  fields={[
                    ['Programme', viewing.program],
                    ['Cohort', viewing.cohortYear],
                  ]}
                />
              </InfoCard>
            ) : (
              <InfoCard title="Organisation">
                <FieldGrid
                  fields={[
                    ['Organisation', viewing.organisation],
                    ['Type', viewing.investorType === 'sponsor' ? 'Sponsor' : 'Investor'],
                    ['Website', viewing.website ? <a key="w" className="adm-a" href={viewing.website} target="_blank" rel="noreferrer">{viewing.website}</a> : null],
                    ['Sectors', viewing.sectors?.length ? viewing.sectors.join(', ') : null],
                    ['About', viewing.bio, { wide: true }],
                  ]}
                />
                <label className="mt-4 flex min-h-11 items-center gap-2 border-t border-line pt-3 text-[14px]">
                  <input
                    type="checkbox"
                    checked={Boolean(viewing.showOnHome)}
                    disabled={viewing.status !== 'active'}
                    onChange={async (e) => {
                      const showOnHome = e.target.checked;
                      setError('');
                      try {
                        await api.patch(`/admin/investors/${viewing.id}/home`, { showOnHome });
                        setViewing({ ...viewing, showOnHome });
                        setRows((rs) => rs?.map((r) => (r.id === viewing.id ? { ...r, showOnHome } : r)));
                        setNotice(showOnHome ? `${viewing.fullName} now shows on the home page (name, organisation, sectors, bio).` : `${viewing.fullName} no longer shows on the home page.`);
                      } catch (err) {
                        setError(err.message);
                      }
                    }}
                  />
                  Show on home page
                </label>
              </InfoCard>
            )}

            <DecisionPanel
              status={<StatusPill status={viewing.status} />}
              help={
                role === 'graduate' && viewing.status === 'pending_review'
                  ? 'Email confirmed with a one-time code sent to this alumni address. Approve to let them submit projects; they are emailed either way.'
                  : null
              }
            >
              {viewing.status === 'pending_review' && (
                <label className="block text-[13px] font-medium text-ink">
                  Reason
                  <textarea
                    className="adm-field mt-1"
                    rows={3}
                    maxLength={1000}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Required to reject; emailed to them."
                  />
                </label>
              )}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 [&_.adm-act]:min-h-11 lg:[&_.adm-act]:min-h-9">{actions(viewing, { inPanel: true })}</div>
            </DecisionPanel>
          </div>
        </SidePanel>
      )}

      <ReasonDialog
        open={Boolean(dialog)}
        title={
          dialog
            ? { approve: `Approve ${dialog.row.fullName}?`, reject: `Reject ${dialog.row.fullName}?`, archive: `Archive ${dialog.row.fullName}?`, unarchive: `Unarchive ${dialog.row.fullName}?` }[dialog.decision]
            : ''
        }
        description={
          dialog
            ? {
                approve: 'They are emailed and gain access for their role.',
                reject: 'They are emailed this reason and cannot sign in.',
                archive: 'The account is signed out, cannot sign in and leaves the active lists. Nothing is deleted.',
                unarchive: 'The account returns to its previous status.',
              }[dialog.decision]
            : ''
        }
        reason={!isDecision ? 'none' : dialog?.decision === 'reject' ? 'required' : 'optional'}
        initialReason={viewing && dialog?.row.id === viewing.id ? reason : ''}
        confirmLabel={dialog ? { approve: 'Approve', reject: 'Reject', archive: 'Archive', unarchive: 'Unarchive' }[dialog.decision] : ''}
        tone={dialog?.decision === 'approve' ? 'success' : ['reject', 'archive'].includes(dialog?.decision) ? 'danger' : 'primary'}
        onClose={() => setDialog(null)}
        onConfirm={async (reason) => {
          await api.post(`/admin/${copy.endpoint}/${dialog.row.id}/${dialog.decision}`, isDecision ? { reason } : {});
          setNotice(`${dialog.row.fullName}: ${{ approve: 'approved and emailed', reject: 'rejected and emailed', archive: 'archived', unarchive: 'unarchived' }[dialog.decision]}.`);
          setViewing(null);
          setReason('');
          load();
        }}
      />
      <DeleteDialog
        open={Boolean(deleting)}
        title={deleting ? `Delete ${deleting.fullName} permanently?` : ''}
        planUrl={deleting ? `/admin/${copy.endpoint}/${deleting.id}/delete-plan` : ''}
        deleteUrl={deleting ? `/admin/${copy.endpoint}/${deleting.id}` : ''}
        onClose={() => setDeleting(null)}
        onDeleted={(removed) => {
          setNotice(`Deleted: ${removed.join(', ')}.`);
          setViewing(null);
          load();
        }}
      />
    </AdminPage>
  );
}
