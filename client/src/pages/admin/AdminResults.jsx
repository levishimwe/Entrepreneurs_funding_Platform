import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { Field, formatDate } from '../../components/ui';
import ReasonDialog from '../../components/ReasonDialog';
import DocumentViewer from '../../components/DocumentViewer';
import { useAuth } from '../../context/AuthContext';
import { AdminPage, DataTable, ListLayout, Loading, Messages, Pill, SidePanel, StatusSelect } from '../../components/admin';
import { Avatar, DecisionPanel, EmptyNote, FieldGrid, InfoCard } from '../../components/detail';

const STATUSES = [
  ['pending', 'Pending Admin Approval'],
  ['approved', 'Approved'],
  ['rejected', 'Rejected'],
  ['all', 'All'],
];
const PILL = { pending: ['warning', 'Pending Admin Approval'], approved: ['success', 'Approved'], rejected: ['danger', 'Rejected'] };
const ResultPill = ({ status }) => <Pill tone={PILL[status]?.[0]}>{PILL[status]?.[1] || status}</Pill>;
const money = (amount, currency) => (amount === null || amount === undefined ? '—' : `${currency || ''} ${Number(amount).toLocaleString('en-GB')}`.trim());
const FUNDABLE = ['approved', 'investor_limit_reached']; // or Fully Funded with no recorded source

function ResultPanel({ result, onClose, onChanged }) {
  const { user } = useAuth();
  const [dialog, setDialog] = useState(null); // 'approve' | 'reject' | 'fund'
  const [reason, setReason] = useState('');
  const [fund, setFund] = useState({ name: result.awardTitle || result.opportunity?.title || '' });
  const own = result.submittedBy?.id === user.id;
  // Only an approved Won result with a prize amount funds the project.
  const wonWithAmount = result.status === 'approved' && result.outcome === 'won' && result.amount !== null;
  const canFund = wonWithAmount && (FUNDABLE.includes(result.project?.status) || (result.project?.status === 'funded' && !result.project?.fundingSource));

  return (
    <SidePanel title={`${result.outcomeLabel}${result.awardTitle ? ` · ${result.awardTitle}` : ''}`} onClose={onClose}>
      <div className="space-y-4">
        <header className="card flex items-start gap-4 p-4 sm:p-5">
          <Avatar name={result.graduate?.name} size={52} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[17px] font-semibold text-ink [overflow-wrap:anywhere]">{result.opportunity?.title}</p>
              <ResultPill status={result.status} />
            </div>
            <p className="mt-1 text-[13px] text-muted">
              {[result.outcomeLabel, result.awardTitle, money(result.amount, result.currency) !== '—' ? money(result.amount, result.currency) : null].filter(Boolean).join(' · ')}
            </p>
          </div>
        </header>

        <InfoCard title="Result">
          <FieldGrid
            fields={[
              ['Opportunity', `${result.opportunity?.title} (${result.opportunity?.type})`, { wide: true }],
              [
                'Project',
                <Link key="p" className="adm-a" to={`/app/admin/projects/${result.project?.id}`}>
                  {result.project?.title} · {result.project?.projectCode}
                </Link>,
              ],
              ['Project status', result.project?.status === 'funded' ? `Fully Funded${result.project.fundingSource === 'competition' ? ' (competition)' : ''}` : result.project?.status?.replace(/_/g, ' ')],
              ['Graduate', result.graduate?.name],
              ['Graduate email', result.graduate?.email],
              ['Outcome', result.outcomeLabel],
              ['Award or prize', result.awardTitle],
              ['Amount', result.amount === null || result.amount === undefined ? null : money(result.amount, result.currency)],
              ['Date', result.resultDate ? formatDate(result.resultDate) : null],
              ['Notes', result.notes, { wide: true }],
              ['Submitted by', `${result.submittedBy?.name} · ${formatDate(result.createdAt, true)}`],
              ...(result.decidedAt ? [['Decided by', `${result.decidedBy?.name} · ${formatDate(result.decidedAt, true)}`]] : []),
              ...(result.decisionReason ? [['Reason', result.decisionReason, { wide: true }]] : []),
            ]}
          />
        </InfoCard>

        <DecisionPanel status={<ResultPill status={result.status} />}>
          {result.status === 'pending' && !own && (
            <label className="block text-[13px] font-medium text-ink">
              Reason or note
              <textarea className="adm-field mt-1" rows={3} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Required to reject; emailed to the graduate." />
            </label>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {result.status === 'pending' &&
              (own ? (
                <p className="adm-hint !mb-0">You submitted this result, so another administrator must decide it.</p>
              ) : (
                <>
                  <button type="button" className="adm-primary" onClick={() => setDialog('approve')}>
                    Approve
                  </button>
                  <button type="button" className="adm-secondary" onClick={() => setDialog('reject')}>
                    Reject
                  </button>
                </>
              ))}
            {canFund && (
              <button type="button" className="adm-primary" onClick={() => setDialog('fund')}>
                Mark project Fully Funded
              </button>
            )}
            {result.status === 'approved' && !wonWithAmount && <p className="adm-hint !mb-0">Only a Won result with a prize amount can mark the project Fully Funded.</p>}
            {result.status !== 'pending' && !canFund && wonWithAmount && <p className="adm-hint !mb-0">No decision is needed.</p>}
          </div>
        </DecisionPanel>

        <InfoCard title="Proof">
          {result.proof ? (
            <DocumentViewer src={`/api/admin/results/${result.id}/proof`} mimeType={result.proof.mimeType} name={result.proof.name} height="h-[28rem]" />
          ) : (
            <EmptyNote>No proof file was attached.</EmptyNote>
          )}
        </InfoCard>
      </div>

      <ReasonDialog
        open={dialog === 'approve' || dialog === 'reject'}
        reason={dialog === 'reject' ? 'required' : 'optional'}
        reasonLabel={dialog === 'reject' ? 'Reason (emailed to the graduate)' : 'Note to the graduate'}
        tone={dialog === 'reject' ? 'danger' : 'success'}
        title={dialog === 'reject' ? 'Reject this result?' : 'Approve this result?'}
        description={dialog === 'reject' ? 'The graduate is emailed with your reason.' : 'It will show on the graduate’s profile and project, and the graduate is emailed.'}
        confirmLabel={dialog === 'reject' ? 'Reject' : 'Approve'}
        initialReason={reason}
        onClose={() => setDialog(null)}
        onConfirm={async (reason) => {
          const res = await api.post(`/admin/results/${result.id}/${dialog}`, reason ? { reason } : {});
          onChanged(dialog === 'reject' ? 'Result rejected. The graduate was emailed.' : 'Result approved. The graduate was emailed.', res.result);
        }}
      />
      <ReasonDialog
        open={dialog === 'fund'}
        reason="none"
        tone="success"
        title="Mark the project Fully Funded?"
        description={`“${result.project?.title}” leaves active investor discovery. Funding source: Competition.`}
        confirmLabel="Mark Fully Funded"
        onClose={() => setDialog(null)}
        onConfirm={async () => {
          await api.post(`/admin/results/${result.id}/mark-funded`, { name: fund.name });
          onChanged('Project marked Fully Funded by competition.', { ...result, project: { ...result.project, status: 'funded', fundingSource: 'competition' } });
        }}
      >
        <Field label="Competition or award name" htmlFor="f-name">
          <input id="f-name" className="input" value={fund.name} onChange={(e) => setFund({ ...fund, name: e.target.value })} maxLength={200} />
        </Field>
        <p>Amount: {money(result.amount, result.currency)} (from the approved result)</p>
      </ReasonDialog>
    </SidePanel>
  );
}

// Competition results recorded by staff, waiting for administrator approval.
export default function AdminResults() {
  const [params, setParams] = useSearchParams();
  const status = STATUSES.some(([k]) => k === params.get('status')) ? params.get('status') : 'pending';
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [open, setOpen] = useState(null);

  const load = useCallback(() => {
    api
      .get(`/admin/results?status=${status}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [status]);
  useEffect(() => {
    document.title = 'Competition results · ALU Ventures';
    setData(null);
    load();
  }, [load]);

  const setStatus = (s) => setParams({ status: s });
  const options = STATUSES.map(([k, l]) => [k, l, k === 'all' ? null : (data?.counts?.[k] ?? 0)]);

  const columns = [
    {
      key: 'project',
      label: 'Project',
      render: (r) => (
        <>
          <button type="button" className="adm-a text-left font-medium" onClick={() => setOpen(r)}>
            {r.project?.title}
          </button>
          <div className="adm-muted text-[12px]">{r.graduate?.name}</div>
        </>
      ),
    },
    { key: 'opportunity', label: 'Opportunity', render: (r) => r.opportunity?.title },
    { key: 'outcome', label: 'Outcome', render: (r) => `${r.outcomeLabel}${r.awardTitle ? ` · ${r.awardTitle}` : ''}` },
    { key: 'amount', label: 'Amount', num: true, render: (r) => money(r.amount, r.currency) },
    { key: 'status', label: 'Status', render: (r) => <ResultPill status={r.status} /> },
    { key: 'submitted', label: 'Submitted', render: (r) => formatDate(r.createdAt) },
  ];

  return (
    <AdminPage title="Competition results" meta={data ? `${data.results.length} shown` : null}>
      <Messages notice={notice} error={error} />
      <ListLayout
        toolbar={<StatusSelect value={status} options={options} onChange={setStatus} label="Show" />}
        filters={[{ title: 'Status', value: status, onChange: setStatus, options }]}
      >
        {!data ? (
          <Loading />
        ) : (
          <DataTable
            columns={columns}
            rows={data.results}
            actions={(r) => (
              <button type="button" className="adm-act" onClick={() => setOpen(r)}>
                {r.status === 'pending' ? 'Review' : 'Open'}
              </button>
            )}
            empty={status === 'pending' ? 'No results waiting for approval.' : 'No results.'}
          />
        )}
      </ListLayout>
      {open && (
        <ResultPanel
          key={`${open.id}-${open.status}-${open.project?.status}`}
          result={open}
          onClose={() => setOpen(null)}
          onChanged={(message, updated) => {
            setNotice(message);
            if (updated) setOpen(updated);
            load();
          }}
        />
      )}
    </AdminPage>
  );
}
