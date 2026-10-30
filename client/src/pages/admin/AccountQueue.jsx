import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { formatDate } from '../../components/ui';
import ReasonDialog from '../../components/ReasonDialog';
import { AdminPage, DataTable, DeleteDialog, KeyValue, ListLayout, Loading, Messages, SearchInput, SidePanel, StatusPill, StatusSelect } from '../../components/admin';

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

const wasRejected = (row) => row.status === 'rejected' || (row.status === 'archived' && row.statusBeforeArchive === 'rejected');

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

  const actions = (row) => (
    <>
      <button type="button" className="adm-act" onClick={() => setViewing(row)}>
        View
      </button>
      {row.status === 'pending_review' && (
        <>
          <button type="button" className="adm-act" onClick={() => decide(row, 'approve')}>
            Approve
          </button>
          <button type="button" className="adm-act adm-act-danger" onClick={() => decide(row, 'reject')}>
            Reject
          </button>
        </>
      )}
      {row.status === 'archived' ? (
        <button type="button" className="adm-act" onClick={() => setDialog({ row, decision: 'unarchive' })}>
          Unarchive
        </button>
      ) : (
        row.status !== 'pending_review' && (
          <button type="button" className="adm-act adm-act-danger" onClick={() => setDialog({ row, decision: 'archive' })}>
            Archive
          </button>
        )
      )}
      {wasRejected(row) && (
        <button type="button" className="adm-act adm-act-danger" onClick={() => setDeleting(row)}>
          Delete
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
          <p className="mb-4">{actions(viewing)}</p>
          <KeyValue
            rows={[
              ['Status', <StatusPill key="s" status={viewing.status} />],
              ['Email', viewing.email],
              ['Phone', viewing.phone],
              ['Registered', formatDate(viewing.registeredAt, true)],
              ...(viewing.hasPhoto ? [['Profile photo', <img key="p" src={`/api/admin/users/${viewing.id}/photo`} alt="" className="h-16 w-16 rounded-lg object-cover" />]] : []),
              ...(role === 'graduate'
                ? [
                    ['Programme', viewing.program],
                    ['Cohort', viewing.cohortYear],
                  ]
                : [
                    ['Organisation', viewing.organisation],
                    ['Type', viewing.investorType === 'sponsor' ? 'Sponsor' : 'Investor'],
                    ['Website', viewing.website ? <a key="w" className="adm-a" href={viewing.website} target="_blank" rel="noreferrer">{viewing.website}</a> : null],
                    ['Sectors', viewing.sectors?.length ? viewing.sectors.join(', ') : null],
                    ['About', viewing.bio],
                    [
                      'Home page',
                      <label key="h" className="inline-flex items-center gap-2">
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
                      </label>,
                    ],
                  ]),
            ]}
          />
          {role === 'graduate' && viewing.status === 'pending_review' && (
            <p className="adm-hint mt-4">Email confirmed with a one-time code sent to this alumni address. Approve to let them submit projects; they are emailed either way.</p>
          )}
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
        confirmLabel={dialog ? { approve: 'Approve', reject: 'Reject', archive: 'Archive', unarchive: 'Unarchive' }[dialog.decision] : ''}
        tone={dialog?.decision === 'approve' ? 'success' : ['reject', 'archive'].includes(dialog?.decision) ? 'danger' : 'primary'}
        onClose={() => setDialog(null)}
        onConfirm={async (reason) => {
          await api.post(`/admin/${copy.endpoint}/${dialog.row.id}/${dialog.decision}`, isDecision ? { reason } : {});
          setNotice(`${dialog.row.fullName}: ${{ approve: 'approved and emailed', reject: 'rejected and emailed', archive: 'archived', unarchive: 'unarchived' }[dialog.decision]}.`);
          setViewing(null);
          load();
        }}
      />
      <DeleteDialog
        open={Boolean(deleting)}
        title={deleting ? `Delete ${deleting.fullName}?` : ''}
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
