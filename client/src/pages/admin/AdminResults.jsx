import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { Field, formatDate } from '../../components/ui';
import ReasonDialog from '../../components/ReasonDialog';
import DocumentViewer from '../../components/DocumentViewer';
import { useAuth } from '../../context/AuthContext';
import { AdminPage, DataTable, KeyValue, ListLayout, Loading, Messages, Pill, SidePanel, StatusSelect } from '../../components/admin';

const STATUSES = [
  ['pending', 'Pending Admin Approval'],
  ['approved', 'Approved'],
  ['rejected', 'Rejected'],
  ['all', 'All'],
];
const PILL = { pending: ['warning', 'Pending Admin Approval'], approved: ['success', 'Approved'], rejected: ['danger', 'Rejected'] };
const ResultPill = ({ status }) => <Pill tone={PILL[status]?.[0]}>{PILL[status]?.[1] || status}</Pill>;
const money = (amount, currency) => (amount === null || amount === undefined ? '—' : `${currency || ''} ${Number(amount).toLocaleString('en-GB')}`.trim());
const FUNDABLE = ['approved', 'investor_limit_reached'];

function ResultPanel({ result, onClose, onChanged }) {
  const { user } = useAuth();
  const [dialog, setDialog] = useState(null); // 'approve' | 'reject' | 'fund'
  const [fund, setFund] = useState({ name: result.awardTitle || result.opportunity?.title || '', amount: result.amount ?? '', currency: result.currency || '' });
  const own = result.submittedBy?.id === user.id;
  const canFund = result.status === 'approved' && FUNDABLE.includes(result.project?.status);

  return (
    <SidePanel title={`${result.outcomeLabel}${result.awardTitle ? ` · ${result.awardTitle}` : ''}`} onClose={onClose}>
      <KeyValue
        rows={[
          ['Status', <ResultPill key="s" status={result.status} />],
          ['Opportunity', `${result.opportunity?.title} (${result.opportunity?.type})`],
          [
            'Project',
            <Link key="p" className="adm-a" to={`/app/admin/projects/${result.project?.id}`}>
              {result.project?.title} · {result.project?.projectCode}
            </Link>,
          ],
          ['Graduate', `${result.graduate?.name} · ${result.graduate?.email}`],
          ['Outcome', result.outcomeLabel],
          ['Award or prize', result.awardTitle],
          ['Amount', money(result.amount, result.currency)],
          ['Date', result.resultDate ? formatDate(result.resultDate) : null],
          ['Notes', result.notes],
          ['Submitted by', `${result.submittedBy?.name} · ${formatDate(result.createdAt, true)}`],
          ...(result.decidedAt ? [['Decided by', `${result.decidedBy?.name} · ${formatDate(result.decidedAt, true)}`]] : []),
          ...(result.decisionReason ? [['Reason', result.decisionReason]] : []),
          ['Project status', result.project?.status === 'funded' ? `Fully Funded${result.project.fundingSource === 'competition' ? ' (competition)' : ''}` : result.project?.status?.replace(/_/g, ' ')],
        ]}
      />

      <div className="mt-4 flex flex-wrap gap-2">
        {result.status === 'pending' &&
          (own ? (
            <p className="adm-hint">You submitted this result, so another administrator must decide it.</p>
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
      </div>

      <h2 className="mt-6">Proof</h2>
      {result.proof ? (
        <div className="mt-2">
          <DocumentViewer src={`/api/admin/results/${result.id}/proof`} mimeType={result.proof.mimeType} name={result.proof.name} height="h-[28rem]" />
        </div>
      ) : (
        <p className="adm-muted mt-1">No proof file was attached.</p>
      )}

      <ReasonDialog
        open={dialog === 'approve' || dialog === 'reject'}
        reason={dialog === 'reject' ? 'required' : 'optional'}
        reasonLabel={dialog === 'reject' ? 'Reason (emailed to the graduate)' : 'Note to the graduate'}
        tone={dialog === 'reject' ? 'danger' : 'success'}
        title={dialog === 'reject' ? 'Reject this result?' : 'Approve this result?'}
        description={dialog === 'reject' ? 'The graduate is emailed with your reason.' : 'It will show on the graduate’s profile and project, and the graduate is emailed.'}
        confirmLabel={dialog === 'reject' ? 'Reject' : 'Approve'}
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
          await api.post(`/admin/results/${result.id}/mark-funded`, fund);
          onChanged('Project marked Fully Funded by competition.', { ...result, project: { ...result.project, status: 'funded', fundingSource: 'competition' } });
        }}
      >
        <Field label="Competition or award name" htmlFor="f-name">
          <input id="f-name" className="input" value={fund.name} onChange={(e) => setFund({ ...fund, name: e.target.value })} maxLength={200} />
        </Field>
        <div className="grid grid-cols-[1fr_7rem] gap-3">
          <Field label="Amount (optional)" htmlFor="f-amount">
            <input id="f-amount" type="number" min="0" step="any" className="input" value={fund.amount} onChange={(e) => setFund({ ...fund, amount: e.target.value })} />
          </Field>
          <Field label="Currency" htmlFor="f-cur">
            <input id="f-cur" className="input uppercase" value={fund.currency} onChange={(e) => setFund({ ...fund, currency: e.target.value })} maxLength={3} placeholder="RWF" />
          </Field>
        </div>
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
