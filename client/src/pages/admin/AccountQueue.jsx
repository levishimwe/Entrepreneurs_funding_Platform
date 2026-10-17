import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { formatDate } from '../../components/ui';
import VerificationChecks from '../../components/VerificationChecks';
import ReasonDialog from '../../components/ReasonDialog';
import { AdminPage, EmptyRow, FilterLinks, Filters, KeyValue, Loading, Messages, SidePanel, StatusText, TableWrap } from '../../components/admin';

const STATUSES = [
  ['pending', 'Pending review'],
  ['approved', 'Approved'],
  ['rejected', 'Rejected'],
];

const COPY = {
  graduate: { title: 'Graduates', endpoint: 'graduates', hint: 'Approving a Suspicious degree check requires a reason.' },
  investor: { title: 'Investors and sponsors', endpoint: 'investors' },
};

// Approval queue for graduate (FR02) or investor/sponsor (FR03) accounts.
export default function AccountQueue({ role }) {
  const copy = COPY[role];
  const [tab, setTab] = useState('pending');
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [viewing, setViewing] = useState(null);
  const [dialog, setDialog] = useState(null);

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

  const decide = (row, decision) =>
    setDialog({ row, decision, suspicious: role === 'graduate' && row.degree?.flag === 'suspicious' });

  const actions = (row) => (
    <>
      <button type="button" className="adm-btn" onClick={() => setViewing(row)}>
        View
      </button>
      {tab === 'pending' && (
        <>
          <button type="button" className="adm-btn" onClick={() => decide(row, 'approve')}>
            Approve
          </button>
          <button type="button" className="adm-btn adm-btn-danger" onClick={() => decide(row, 'reject')}>
            Reject
          </button>
        </>
      )}
    </>
  );

  return (
    <AdminPage title={copy.title} hint={copy.hint}>
      <Messages notice={notice} error={error} />
      <Filters>
        <FilterLinks label="Status" options={STATUSES} value={tab} onChange={setTab} />
      </Filters>
      {!rows ? (
        <Loading />
      ) : (
        <TableWrap>
          <table className="adm-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                {role === 'graduate' ? (
                  <>
                    <th>Programme</th>
                    <th>Degree check</th>
                  </>
                ) : (
                  <>
                    <th>Organisation</th>
                    <th>Type</th>
                  </>
                )}
                <th>Registered</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && <EmptyRow colSpan={7}>{tab === 'pending' ? 'No accounts are waiting for review.' : `No ${tab} accounts.`}</EmptyRow>}
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.fullName}</td>
                  <td>
                    {row.email}
                    {row.phone && <div className="adm-muted">{row.phone}</div>}
                  </td>
                  {role === 'graduate' ? (
                    <>
                      <td>
                        {row.program}
                        <div className="adm-muted">Class of {row.cohortYear}</div>
                      </td>
                      <td>{row.degree ? <StatusText status={row.degree.flag || 'processing'} /> : <span className="adm-bad">No degree file</span>}</td>
                    </>
                  ) : (
                    <>
                      <td>{row.organisation || '—'}</td>
                      <td>{row.investorType === 'sponsor' ? 'Sponsor' : 'Investor'}</td>
                    </>
                  )}
                  <td className="whitespace-nowrap">{formatDate(row.registeredAt)}</td>
                  <td>
                    <StatusText status={row.status} />
                  </td>
                  <td className="adm-actions">{actions(row)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}

      {viewing && (
        <SidePanel title={viewing.fullName} onClose={() => setViewing(null)}>
          <KeyValue
            rows={[
              ['Email', viewing.email],
              ['Phone', viewing.phone],
              ['Registered', formatDate(viewing.registeredAt, true)],
              ['Status', <StatusText key="s" status={viewing.status} />],
              ...(viewing.hasPhoto
                ? [['Profile photo', <img key="p" src={`/api/admin/users/${viewing.id}/photo`} alt="" className="h-16 w-16 rounded object-cover" />]]
                : []),
              ...(role === 'graduate'
                ? [
                    ['Programme', viewing.program],
                    ['Cohort', viewing.cohortYear],
                  ]
                : [
                    ['Organisation', viewing.organisation],
                    ['Type', viewing.investorType === 'sponsor' ? 'Sponsor' : 'Investor'],
                    [
                      'Website',
                      viewing.website ? (
                        <a key="w" className="adm-a" href={viewing.website} target="_blank" rel="noreferrer">
                          {viewing.website}
                        </a>
                      ) : null,
                    ],
                    ['Sectors of interest', viewing.sectors?.length ? viewing.sectors.join(', ') : null],
                    ['About', viewing.bio],
                  ]),
            ]}
          />
          {role === 'graduate' && (
            <>
              <h2>Degree certificate</h2>
              <VerificationChecks document={viewing.degree} title={`Registered as “${viewing.fullName}”`} />
            </>
          )}
          {tab === 'pending' && <p className="mt-3">{actions(viewing)}</p>}
        </SidePanel>
      )}

      <ReasonDialog
        open={Boolean(dialog)}
        title={dialog?.decision === 'approve' ? `Approve ${dialog?.row.fullName}?` : `Reject ${dialog?.row.fullName}?`}
        description={
          dialog?.decision === 'approve'
            ? 'They will be emailed and gain full access for their role.'
            : 'They will be emailed this reason and will not be able to sign in.'
        }
        warning={dialog?.suspicious && dialog?.decision === 'approve' ? 'The automated degree check flagged this account as Suspicious. Record why you are approving it.' : undefined}
        reason={dialog?.decision === 'reject' || dialog?.suspicious ? 'required' : 'optional'}
        confirmLabel={dialog?.decision === 'approve' ? 'Approve account' : 'Reject account'}
        tone={dialog?.decision === 'approve' ? 'success' : 'danger'}
        onClose={() => setDialog(null)}
        onConfirm={async (reason) => {
          await api.post(`/admin/${copy.endpoint}/${dialog.row.id}/${dialog.decision}`, { reason });
          setNotice(`${dialog.row.fullName} was ${dialog.decision === 'approve' ? 'approved' : 'rejected'} and has been emailed.`);
          setViewing(null);
          load();
        }}
      />
    </AdminPage>
  );
}
