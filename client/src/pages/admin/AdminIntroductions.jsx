import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { formatDate } from '../../components/ui';
import ReasonDialog from '../../components/ReasonDialog';
import { AdminPage, DataTable, ListLayout, Loading, Messages, SearchInput, StatusPill, StatusSelect } from '../../components/admin';

const STATUSES = [
  ['ready', 'Ready to record'],
  ['requested', 'Requested'],
  ['accepted', 'Introduced'],
  ['recorded', 'Investments recorded'],
  ['declined', 'Declined'],
  ['all', 'All'],
];
const yes = (on) => (on ? 'Yes' : 'No');

// Introductions & funding (FR07, FR13): the administrator records an
// investment only after both parties confirmed it.
export default function AdminIntroductions() {
  const [params, setParams] = useSearchParams();
  const tab = STATUSES.some(([k]) => k === params.get('status')) ? params.get('status') : 'ready';
  const [data, setData] = useState(null);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [dialog, setDialog] = useState(null);

  // Refreshes in place after recording; only a filter change shows the loader.
  const load = useCallback(() => {
    api.get(`/admin/introductions?status=${tab}`).then(setData).catch((e) => setError(e.message));
  }, [tab]);
  useEffect(() => {
    document.title = 'Introductions & funding · ALU Ventures';
    setData(null);
    load();
  }, [load]);

  const setTab = (status) => setParams({ status });
  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (data?.introductions || []).filter((i) => !term || `${i.project.title} ${i.project.projectCode} ${i.investor.name} ${i.investor.organisation || ''}`.toLowerCase().includes(term));
  }, [data, q]);
  const options = STATUSES.map(([k, l]) => [k, l, data?.counts?.[k] ?? null]);
  const ready = (i) => i.status === 'accepted' && i.investment.investor && i.investment.graduate && !i.investment.recordedAt;

  const columns = [
    {
      key: 'project',
      label: 'Project',
      render: (i) => (
        <>
          <Link className="adm-a font-medium" to={`/app/admin/projects/${i.project.id}`}>
            {i.project.title}
          </Link>
          <div className="adm-muted text-[12px]">{i.project.founder}</div>
        </>
      ),
    },
    { key: 'investor', label: 'Investor', render: (i) => `${i.investor.name}${i.investor.organisation ? ` · ${i.investor.organisation}` : ''}` },
    { key: 'requested', label: 'Requested', render: (i) => formatDate(i.requestedAt) },
    { key: 'status', label: 'Introduction', render: (i) => <StatusPill status={i.status} /> },
    { key: 'met', label: 'Met', render: (i) => yes(i.meeting.investor && i.meeting.graduate) },
    { key: 'invested', label: 'Invested (inv. / founder)', render: (i) => `${yes(i.investment.investor)} / ${yes(i.investment.graduate)}` },
    { key: 'recorded', label: 'Recorded', render: (i) => (i.investment.recordedAt ? formatDate(i.investment.recordedAt) : '—') },
  ];

  return (
    <AdminPage title="Introductions & funding" meta={data ? `${rows.length} shown` : null}>
      <Messages notice={notice} error={error} />
      <ListLayout
        toolbar={
          <>
            <SearchInput value={q} onChange={setQ} placeholder="Project or investor" />
            <StatusSelect value={tab} options={options} onChange={setTab} label="Show" />
          </>
        }
        filters={[{ title: 'Status', value: tab, onChange: setTab, options }]}
      >
        {!data ? (
          <Loading />
        ) : (
          <DataTable
            columns={columns}
            rows={rows}
            actions={(i) =>
              ready(i) ? (
                <button type="button" className="adm-act" onClick={() => setDialog(i)}>
                  Record investment
                </button>
              ) : null
            }
            empty={tab === 'ready' ? 'No investments waiting to be recorded.' : 'No introductions.'}
          />
        )}
      </ListLayout>
      <ReasonDialog
        open={Boolean(dialog)}
        reason="none"
        title="Record this investment?"
        description={dialog ? `${dialog.investor.name} → ${dialog.project.title}. Both sides confirmed it. A second distinct investor moves the project to Investor Limit Reached.` : ''}
        confirmLabel="Record investment"
        tone="success"
        onClose={() => setDialog(null)}
        onConfirm={async () => {
          const res = await api.post(`/admin/introductions/${dialog.id}/record-investment`);
          setNotice(
            res.projectStatus === 'investor_limit_reached'
              ? `Recorded. ${dialog.project.title} has ${res.confirmedInvestors} confirmed investors and reached the limit.`
              : `Recorded. ${dialog.project.title} has ${res.confirmedInvestors} confirmed investor.`
          );
          load();
        }}
      />
    </AdminPage>
  );
}
