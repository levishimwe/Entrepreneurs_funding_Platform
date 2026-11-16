import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { formatDate } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { AdminPage, DataTable, DeleteDialog, ListLayout, Loading, Messages, SidePanel, StatusSelect } from '../../components/admin';
import { DecisionPanel, EmptyNote, FieldGrid, HistorySection, InfoCard, LongText } from '../../components/detail';
import OpportunityForm from '../../components/OpportunityForm';
import { CallStatus, money } from '../investor/FundingCalls';

const VIEWS = [
  ['pending', 'Pending'],
  ['accepted', 'Accepted'],
  ['rejected', 'Rejected'],
  ['all', 'All'],
];
const ACTION_LABEL = {
  'funding_call.submitted': 'Submitted by the investor',
  'funding_call.accepted': 'Accepted',
  'funding_call.rejected': 'Rejected',
  'funding_call.competition_proposed': 'Competition submitted for publication',
  'funding_call.published': 'Competition published',
};

// The competition form, prefilled from the call. Staff edit it; the
// administrator publishes it like any staff proposal.
const prefill = (c) => ({
  title: `${c.sector} funding competition`,
  type: 'competition',
  organiser: '',
  description: `${c.message}\n\nFunding available: ${money(c.amount, c.currency)}.`,
  prize: money(c.amount, c.currency).slice(0, 150),
  deadline: c.deadline ? `${c.deadline}T17:00:00` : '',
  criteria: { sectors: [c.sector], projectTypes: [], stages: [], minCohortYear: '', maxCohortYear: '', notes: '' },
});

function CallPanel({ id, onClose, onChanged, canDelete }) {
  const [deleting, setDeleting] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [building, setBuilding] = useState(false);
  const load = useCallback(() => {
    api
      .get(`/funding-calls/review/${id}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [id]);
  useEffect(load, [load]);

  const decide = async (decision) => {
    setError('');
    if (decision === 'reject' && reason.trim().length < 5) return setError('Give the reason for rejecting (at least 5 characters).');
    setBusy(true);
    try {
      await api.post(`/funding-calls/review/${id}/${decision}`, { reason });
      setNotice(decision === 'accept' ? 'Accepted. The investor gets an email.' : 'Rejected. The investor gets an email with your reason.');
      setReason('');
      load();
      onChanged();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const c = data?.call;
  return (
    <SidePanel title={c ? `${c.sector} · ${money(c.amount, c.currency)}` : 'Funding call'} onClose={onClose}>
      <Messages notice={notice} error={error} />
      {!c ? (
        <Loading />
      ) : (
        <div className="space-y-4">
          <InfoCard title="Funding call" action={<CallStatus call={c} />}>
            <FieldGrid
              fields={[
                ['Sector', c.sector],
                ['Amount available', money(c.amount, c.currency)],
                ['Deadline', c.deadline ? formatDate(c.deadline) : null],
                ['Submitted', formatDate(c.createdAt, true)],
                ['Investor', c.investor?.name],
                ['Organisation', c.investor?.organisation],
              ]}
            />
          </InfoCard>
          <InfoCard title="Message">
            <LongText>{c.message}</LongText>
          </InfoCard>
          {c.status === 'pending' ? (
            <DecisionPanel title="Decision" help="Decide from the amount and the details. The investor is emailed your decision; a reason is required to reject.">
              <label htmlFor="fc-reason" className="label">
                Reason or note
              </label>
              <textarea id="fc-reason" rows={3} className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
              <div className="flex flex-wrap gap-2">
                <button type="button" className="adm-primary" disabled={busy} onClick={() => decide('accept')}>
                  Accept
                </button>
                <button type="button" className="adm-btn adm-btn-danger" disabled={busy} onClick={() => decide('reject')}>
                  Reject
                </button>
              </div>
            </DecisionPanel>
          ) : (
            <InfoCard title="Decision">
              <FieldGrid
                fields={[
                  ['Decision', c.statusLabel],
                  ['Decided by', c.decidedBy],
                  ['Decided', c.decidedAt ? formatDate(c.decidedAt, true) : null],
                  [c.status === 'rejected' ? 'Reason' : 'Note', c.decisionReason, { wide: true }],
                ]}
                hideEmpty
              />
            </InfoCard>
          )}
          {c.status === 'accepted' && (
            <InfoCard title="Competition">
              {c.opportunity && c.opportunity.status !== 'archived' ? (
                <p className="text-[14px] text-ink">
                  {c.opportunity.title} · {c.opportunity.status === 'pending_review' ? 'Waiting for the administrator to publish it' : c.opportunity.public ? 'Published' : c.opportunity.status}
                </p>
              ) : building ? (
                <OpportunityForm
                  initial={prefill(c)}
                  submitLabel="Submit for publication"
                  onCancel={() => setBuilding(false)}
                  onSubmit={async (form) => {
                    await api.post(`/funding-calls/review/${id}/competition`, form);
                    setBuilding(false);
                    setNotice('Submitted. The administrator reviews and publishes it.');
                    load();
                    onChanged();
                  }}
                />
              ) : (
                <div className="space-y-3">
                  <p className="text-[13px] text-muted">
                    Turn this call into a competition. The form is prefilled from the call; edit it before submitting. Graduates do not see the investor&apos;s name unless you write it in.
                  </p>
                  <button type="button" className="adm-primary" onClick={() => setBuilding(true)}>
                    Create competition
                  </button>
                </div>
              )}
            </InfoCard>
          )}
          <HistorySection count={data.history.length} latest={data.history[0] ? ACTION_LABEL[data.history[0].action] || data.history[0].action : null}>
            {data.history.length === 0 ? (
              <EmptyNote>No history yet.</EmptyNote>
            ) : (
              <ul className="divide-y divide-line">
                {data.history.map((h) => (
                  <li key={h.id} className="py-2 text-[13px]">
                    <span className="block text-ink">{ACTION_LABEL[h.action] || h.action}</span>
                    <span className="block text-muted">
                      {[h.actor, formatDate(h.at, true)].filter(Boolean).join(' · ')}
                      {h.reason ? ` · ${h.reason}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </HistorySection>
          {/* Rejected is a funding call's archived state; administrators only. */}
          {canDelete && c.status === 'rejected' && (
            <div>
              <button type="button" className="adm-act adm-act-danger" onClick={() => setDeleting(true)}>
                Delete permanently
              </button>
            </div>
          )}
        </div>
      )}
      <DeleteDialog
        open={deleting}
        title={c ? `Delete the ${c.sector} funding call from ${c.investor?.organisation || c.investor?.name || 'this investor'} permanently?` : ''}
        planUrl={`/admin/funding-calls/${id}/delete-plan`}
        deleteUrl={`/admin/funding-calls/${id}`}
        onClose={() => setDeleting(false)}
        onDeleted={() => {
          onChanged('Funding call deleted.');
          onClose();
        }}
      />
    </SidePanel>
  );
}

// Staff and administrators review investors' funding calls.
export default function FundingCallsReview() {
  const [params, setParams] = useSearchParams();
  const view = VIEWS.some(([k]) => k === params.get('status')) ? params.get('status') : 'pending';
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [viewing, setViewing] = useState(null);
  const [notice, setNotice] = useState('');
  const { user } = useAuth();
  const load = useCallback(() => {
    api
      .get(`/funding-calls/review${view === 'all' ? '' : `?status=${view}`}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [view]);
  useEffect(() => {
    document.title = 'Funding calls · ALU Ventures';
    setData(null);
    load();
  }, [load]);
  const options = VIEWS.map(([k, l]) => [k, l, k === 'all' ? null : (data?.counts?.[k] ?? 0)]);
  const setView = (v) => setParams(v === 'pending' ? {} : { status: v });

  return (
    <AdminPage title="Funding calls" meta={data ? `${data.calls.length} shown` : null}>
      <Messages notice={notice} error={error} />
      <ListLayout toolbar={<StatusSelect value={view} options={options} onChange={setView} label="Show" />} filters={[{ title: 'Status', value: view, onChange: setView, options }]}>
        {!data ? (
          <Loading />
        ) : (
          <DataTable
            rows={data.calls}
            empty="No funding calls here."
            columns={[
              { key: 'call', label: 'Call', render: (c) => <span className="font-medium">{`${c.sector} · ${money(c.amount, c.currency)}`}</span> },
              { key: 'investor', label: 'Investor', render: (c) => c.investor?.organisation || c.investor?.name || '—' },
              { key: 'deadline', label: 'Deadline', render: (c) => (c.deadline ? formatDate(c.deadline) : '—') },
              { key: 'status', label: 'Status', render: (c) => <CallStatus call={c} /> },
              { key: 'date', label: 'Submitted', render: (c) => formatDate(c.createdAt) },
            ]}
            actions={(c) => (
              <button type="button" className="adm-act" onClick={() => setViewing(c.id)}>
                Open
              </button>
            )}
          />
        )}
      </ListLayout>
      {viewing && (
        <CallPanel
          id={viewing}
          canDelete={user?.role === 'admin' && view === 'rejected'}
          onClose={() => setViewing(null)}
          onChanged={(message) => {
            if (typeof message === 'string') setNotice(message);
            load();
          }}
        />
      )}
    </AdminPage>
  );
}
