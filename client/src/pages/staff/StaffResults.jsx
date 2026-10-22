import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { formatDate } from '../../components/ui';
import ReasonDialog from '../../components/ReasonDialog';
import ResultForm from '../../components/ResultForm';
import { AdminPage, DataTable, KeyValue, Loading, Messages, Pill, SidePanel, StatusPill } from '../../components/admin';
import { ref } from './StaffOpportunities';

export const RESULT_PILL = { pending: ['warning', 'Pending Admin Approval'], approved: ['success', 'Approved'], rejected: ['danger', 'Rejected'] };
export const ResultPill = ({ status }) => <Pill tone={RESULT_PILL[status]?.[0]}>{RESULT_PILL[status]?.[1] || status}</Pill>;
const money = (amount, currency) => (amount === null || amount === undefined ? '—' : `${currency || ''} ${Number(amount).toLocaleString('en-GB')}`.trim());

// Results (staff): after a hackathon or competition is Completed, record each
// admitted participant's outcome for administrator approval.
export default function StaffResults() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [completing, setCompleting] = useState(null);
  const [editing, setEditing] = useState(null); // { opportunity, participant }

  const load = useCallback(() => {
    api
      .get('/staff/results')
      .then((d) => setRows(d.opportunities))
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    document.title = 'Results · ALU Ventures';
    load();
  }, [load]);

  const columns = [
    {
      key: 'participant',
      label: 'Participant',
      render: (p) => (
        <>
          <span className="font-medium">{p.applicant.name}</span>
          <div className="adm-muted text-[12px]">
            {p.project.title} · <span className="adm-mono">{p.project.projectCode}</span>
          </div>
        </>
      ),
    },
    { key: 'outcome', label: 'Outcome', render: (p) => (p.result ? `${p.result.outcomeLabel}${p.result.awardTitle ? ` · ${p.result.awardTitle}` : ''}` : '—') },
    { key: 'amount', label: 'Amount', num: true, render: (p) => (p.result ? money(p.result.amount, p.result.currency) : '—') },
    {
      key: 'status',
      label: 'Status',
      render: (p) =>
        p.result ? (
          <>
            <ResultPill status={p.result.status} />
            {p.result.status === 'rejected' && p.result.decisionReason && <div className="adm-muted mt-1 text-[12px]">Reason: {p.result.decisionReason}</div>}
          </>
        ) : (
          <span className="adm-muted">Not recorded</span>
        ),
    },
  ];

  return (
    <AdminPage title="Results" meta={rows ? `${rows.length} opportunit${rows.length === 1 ? 'y' : 'ies'}` : null}>
      <Messages notice={notice} error={error} />
      {!rows ? (
        <Loading />
      ) : rows.length === 0 ? (
        <p className="adm-card adm-muted p-4">No hackathon or competition has ended yet. Opportunities appear here once applications close.</p>
      ) : (
        rows.map((o) => (
          <section key={o.id} className="mb-6">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h2 className="!m-0">{o.title}</h2>
              <span className="adm-mono adm-muted">{ref(o.id)}</span>
              <StatusPill status={o.stage} />
              {o.completedAt ? (
                <span className="adm-muted text-[12px]">Completed {formatDate(o.completedAt)}</span>
              ) : (
                <button type="button" className="adm-primary ml-auto" onClick={() => setCompleting(o)}>
                  Mark completed
                </button>
              )}
            </div>
            {!o.completedAt && <p className="adm-hint">The event has ended. Mark it Completed to record results.</p>}
            <DataTable
              columns={columns}
              rows={o.participants}
              rowKey={(p) => p.applicationId}
              actions={(p) =>
                !o.completedAt ? null : !p.result ? (
                  <button type="button" className="adm-act" onClick={() => setEditing({ opportunity: o, participant: p })}>
                    Record result
                  </button>
                ) : p.result.status === 'rejected' ? (
                  <button type="button" className="adm-act" onClick={() => setEditing({ opportunity: o, participant: p })}>
                    Edit and resubmit
                  </button>
                ) : null
              }
              empty="No participants were selected."
            />
          </section>
        ))
      )}

      <ReasonDialog
        open={Boolean(completing)}
        reason="none"
        title={`Mark ${completing?.title} Completed?`}
        description="Confirms the event is over. You can then record results for the selected participants. This is recorded in the audit log."
        confirmLabel="Mark completed"
        onClose={() => setCompleting(null)}
        onConfirm={async () => {
          await api.post(`/staff/opportunities/${completing.id}/complete`);
          setNotice(`${completing.title} is Completed. Record each participant's result.`);
          load();
        }}
      />
      {editing && (
        <SidePanel title={editing.participant.result ? 'Edit and resubmit result' : 'Record result'} onClose={() => setEditing(null)}>
          <KeyValue
            rows={[
              ['Opportunity', `${editing.opportunity.title} (${ref(editing.opportunity.id)})`],
              ['Participant', editing.participant.applicant.name],
              ['Project', `${editing.participant.project.title} · ${editing.participant.project.projectCode}`],
              ...(editing.participant.result?.decisionReason ? [['Rejected because', editing.participant.result.decisionReason]] : []),
            ]}
          />
          <div className="mt-4">
            <ResultForm
              applicationId={editing.participant.applicationId}
              rejected={editing.participant.result?.status === 'rejected' ? editing.participant.result : null}
              onCancel={() => setEditing(null)}
              onSaved={(message) => {
                setEditing(null);
                setNotice(message);
                load();
              }}
            />
          </div>
        </SidePanel>
      )}
    </AdminPage>
  );
}
