import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { formatDate } from '../../components/ui';
import ReasonDialog from '../../components/ReasonDialog';
import { AdminPage, EmptyRow, FilterLinks, Filters, Loading, Messages, StatusText, TableWrap } from '../../components/admin';

const STATUSES = [
  ['ready', 'Ready to record'],
  ['requested', 'Requested'],
  ['accepted', 'Introduced'],
  ['recorded', 'Investments recorded'],
  ['declined', 'Declined'],
  ['all', 'All'],
];

const yes = (on) => (on ? 'yes' : 'no');

// Introductions & funding (FR07, FR13): the administrator records an
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
    <AdminPage title="Introductions & funding" hint="Record an investment once both the founder and the investor have confirmed it. Two recorded investors close a project to new introductions.">
      <Messages notice={notice} error={error} />
      <Filters>
        <FilterLinks label="Show" options={STATUSES.map(([k, l]) => [k, l, data?.counts?.[k] ?? null])} value={tab} onChange={setTab} />
      </Filters>
      {!data ? (
        <Loading />
      ) : (
        <TableWrap>
          <table className="adm-table">
            <thead>
              <tr>
                <th>Project</th>
                <th>Investor</th>
                <th>Requested</th>
                <th>Introduction</th>
                <th>Met (both)</th>
                <th>Invested (investor / founder)</th>
                <th>Recorded</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.introductions.length === 0 && (
                <EmptyRow colSpan={8}>{tab === 'ready' ? 'No investments are waiting to be recorded.' : 'No introductions in this view.'}</EmptyRow>
              )}
              {data.introductions.map((i) => (
                <tr key={i.id}>
                  <td>
                    <Link className="adm-a" to={`/app/admin/projects/${i.project.id}`}>
                      {i.project.title}
                    </Link>
                    <div className="adm-mono adm-muted">{i.project.projectCode}</div>
                    <div className="adm-muted">
                      Founder: {i.project.founder} · <StatusText status={i.project.status} />
                    </div>
                  </td>
                  <td>
                    {i.investor.name}
                    {i.investor.organisation && <div className="adm-muted">{i.investor.organisation}</div>}
                  </td>
                  <td className="whitespace-nowrap">{formatDate(i.requestedAt)}</td>
                  <td>
                    <StatusText status={i.status} />
                  </td>
                  <td>{yes(i.meeting.investor && i.meeting.graduate)}</td>
                  <td>
                    {yes(i.investment.investor)} / {yes(i.investment.graduate)}
                  </td>
                  <td className="whitespace-nowrap">{i.investment.recordedAt ? formatDate(i.investment.recordedAt) : 'no'}</td>
                  <td className="adm-actions">
                    {i.status === 'accepted' && i.investment.investor && i.investment.graduate && !i.investment.recordedAt && (
                      <button type="button" className="adm-btn adm-btn-primary" onClick={() => setDialog(i)}>
                        Record investment
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
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
    </AdminPage>
  );
}
