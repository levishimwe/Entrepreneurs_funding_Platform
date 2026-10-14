import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Circle, Handshake } from 'lucide-react';
import { api } from '../../lib/api';
import { Alert, PageHeader, PageLoader, StatusPill, formatDate } from '../../components/ui';
import ReasonDialog from '../../components/ReasonDialog';

const TABS = [
  ['ready', 'Ready to record'],
  ['requested', 'Requested'],
  ['accepted', 'Introduced'],
  ['recorded', 'Investments recorded'],
  ['declined', 'Declined'],
  ['all', 'All'],
];

const Tick = ({ on, label }) => (
  <span className={`inline-flex items-center gap-1 ${on ? 'text-green-700 dark:text-green-400' : 'text-muted'}`}>
    {on ? <CheckCircle2 className="h-3.5 w-3.5" aria-label="Yes" /> : <Circle className="h-3.5 w-3.5" aria-label="No" />} {label}
  </span>
);

// Introductions & Funding (FR07, FR13): the administrator records an
// investment only after both parties confirmed it.
export default function AdminIntroductions() {
  const [tab, setTab] = useState('ready');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [dialog, setDialog] = useState(null);

  // Refreshes in place after recording; only a tab change shows the loader.
  const load = useCallback(() => {
    api.get(`/admin/introductions?status=${tab}`).then(setData).catch((e) => setError(e.message));
  }, [tab]);
  useEffect(() => {
    document.title = 'Introductions & funding · ALU Ventures';
    setData(null);
    load();
  }, [load]);

  return (
    <>
      <PageHeader title="Introductions & Funding" description="Track introductions and record investment outcomes once the founder and the investor have both confirmed them. Two recorded investors move a project to Investor Limit Reached." />
      {notice && <Alert type="success" className="mb-4">{notice}</Alert>}
      {error && <Alert type="error" className="mb-4">{error}</Alert>}
      <div className="mb-3 overflow-x-auto border-b border-line">
        <div className="flex min-w-max gap-1" role="tablist">
          {TABS.map(([key, label]) => (
            <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm ${tab === key ? 'border-accent font-semibold' : 'border-transparent text-muted hover:text-ink'}`}>
              {label}
              {data?.counts && <span className="rounded-full bg-subtle px-1.5 text-xs tabular-nums text-muted ring-1 ring-line">{data.counts[key]}</span>}
            </button>
          ))}
        </div>
      </div>
      {!data ? (
        <PageLoader />
      ) : data.introductions.length === 0 ? (
        <div className="card flex flex-col items-center px-6 py-12 text-center">
          <Handshake className="h-8 w-8 text-muted" aria-hidden="true" />
          <p className="mt-2 text-sm text-muted">{tab === 'ready' ? 'No investments are waiting to be recorded.' : 'No introductions in this view.'}</p>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="border-b border-line bg-subtle text-[11px] font-semibold uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-2.5">Project</th>
                <th className="px-4 py-2.5">Investor</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Confirmations</th>
                <th className="px-4 py-2.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.introductions.map((i) => (
                <tr key={i.id} className="align-top">
                  <td className="px-4 py-3">
                    <Link to={`/app/admin/projects/${i.project.id}`} className="font-semibold hover:text-accent hover:underline">
                      {i.project.title}
                    </Link>
                    <p className="font-mono text-[11px] text-muted">{i.project.projectCode}</p>
                    <p className="text-xs text-muted">Founder: {i.project.founder}</p>
                  </td>
                  <td className="px-4 py-3">
                    {i.investor.name}
                    {i.investor.organisation && <p className="text-xs text-muted">{i.investor.organisation}</p>}
                    <p className="text-xs text-muted">Requested {formatDate(i.requestedAt)}</p>
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={i.status} />
                    <div className="mt-1">
                      <StatusPill status={i.project.status} />
                    </div>
                  </td>
                  <td className="space-y-0.5 px-4 py-3 text-xs">
                    <div className="flex flex-col">
                      <Tick on={i.meeting.investor && i.meeting.graduate} label="Meeting confirmed by both" />
                      <Tick on={i.investment.investor} label="Investment confirmed by investor" />
                      <Tick on={i.investment.graduate} label="Investment confirmed by founder" />
                      <Tick on={Boolean(i.investment.recordedAt)} label={i.investment.recordedAt ? `Recorded ${formatDate(i.investment.recordedAt)}` : 'Not recorded'} />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {i.status === 'accepted' && i.investment.investor && i.investment.graduate && !i.investment.recordedAt ? (
                      <button type="button" className="btn-cta" onClick={() => setDialog(i)}>
                        Record investment
                      </button>
                    ) : (
                      <span className="text-xs text-muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ReasonDialog
        open={Boolean(dialog)}
        reason="none"
        title="Record this investment?"
        description={dialog ? `${dialog.investor.name} → ${dialog.project.title}. Both parties confirmed it. If this is the second distinct investor, the project moves to Investor Limit Reached and leaves discovery.` : ''}
        confirmLabel="Record investment"
        tone="success"
        onClose={() => setDialog(null)}
        onConfirm={async () => {
          const res = await api.post(`/admin/introductions/${dialog.id}/record-investment`);
          setNotice(
            res.projectStatus === 'investor_limit_reached'
              ? `Recorded. ${dialog.project.title} now has ${res.confirmedInvestors} confirmed investors and has reached the investor limit.`
              : `Recorded. ${dialog.project.title} has ${res.confirmedInvestors} confirmed investor.`
          );
          load();
        }}
      />
    </>
  );
}
