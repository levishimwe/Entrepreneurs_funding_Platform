import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { formatDate } from '../../components/ui';
import OpportunityForm, { CriteriaSummary } from '../../components/OpportunityForm';
import ReasonDialog from '../../components/ReasonDialog';
import { AdminPage, EmptyRow, FilterLinks, Filters, Loading, Messages, StatusText, TableWrap } from '../../components/admin';

const STATUSES = [
  ['pending_review', 'Staff proposals'],
  ['published', 'Published'],
  ['closed', 'Closed'],
];
const ACTIONS = {
  publish: { label: 'Publish', tone: 'success', from: ['pending_review', 'closed'], description: 'Graduates can see it and apply until the deadline.' },
  close: { label: 'Close', tone: 'primary', from: ['published'], description: 'Stops new applications. Staff can still record decisions.' },
  archive: { label: 'Archive', tone: 'danger', from: ['pending_review', 'published', 'closed'], description: 'Hides the opportunity. Applications and decisions are kept.' },
};

// FR08: the administrator reviews, publishes and manages opportunities.
export default function AdminOpportunities() {
  const [tab, setTab] = useState('pending_review');
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState(null); // 'new' | opportunity
  const [dialog, setDialog] = useState(null);

  const load = useCallback(() => {
    setRows(null);
    api.get(`/admin/opportunities?status=${tab}`).then((d) => setRows(d.opportunities)).catch((e) => setError(e.message));
  }, [tab]);
  useEffect(() => {
    document.title = 'Opportunities · ALU Ventures';
    load();
  }, [load]);

  if (editing) {
    return (
      <AdminPage title={editing === 'new' ? 'Add opportunity' : `Edit: ${editing.title}`} hint={editing === 'new' ? 'Opportunities you add are published immediately.' : undefined}>
        <div className="border border-line bg-surface p-4">
          <OpportunityForm
            initial={editing === 'new' ? null : editing}
            submitLabel={editing === 'new' ? 'Publish opportunity' : 'Save changes'}
            onCancel={() => setEditing(null)}
            onSubmit={async (data) => {
              if (editing === 'new') await api.post('/admin/opportunities', data);
              else await api.patch(`/admin/opportunities/${editing.id}`, data);
              setNotice(editing === 'new' ? 'Opportunity published.' : 'Changes saved.');
              setEditing(null);
              setTab(editing === 'new' ? 'published' : tab);
              load();
            }}
          />
        </div>
      </AdminPage>
    );
  }

  return (
    <AdminPage
      title="Opportunities"
      hint="Selection decisions are made by ALU staff."
      actions={
        <button type="button" className="adm-btn" onClick={() => setEditing('new')}>
          Add opportunity
        </button>
      }
    >
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
                <th>Title</th>
                <th>Type</th>
                <th>Status</th>
                <th>Deadline</th>
                <th className="adm-num">Applications</th>
                <th>Proposed by</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && <EmptyRow colSpan={7}>No opportunities with this status.</EmptyRow>}
              {rows.map((o) => (
                <tr key={o.id}>
                  <td>
                    {o.title}
                    <CriteriaSummary criteria={o.criteria} />
                  </td>
                  <td className="capitalize">{o.type}</td>
                  <td>
                    <StatusText status={o.status} />
                  </td>
                  <td className="whitespace-nowrap">{formatDate(o.deadline, true)}</td>
                  <td className="adm-num">{o.applicationCount}</td>
                  <td>
                    {o.createdBy?.name}
                    <div className="adm-muted capitalize">{o.createdBy?.role}</div>
                  </td>
                  <td className="adm-actions">
                    <button type="button" className="adm-btn" onClick={() => setEditing(o)}>
                      Edit
                    </button>
                    {Object.entries(ACTIONS)
                      .filter(([, a]) => a.from.includes(o.status))
                      .map(([key, a]) => (
                        <button key={key} type="button" className={`adm-btn ${a.tone === 'danger' ? 'adm-btn-danger' : ''}`} onClick={() => setDialog({ key, action: a, o })}>
                          {a.label}
                        </button>
                      ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
      <ReasonDialog
        open={Boolean(dialog)}
        title={`${dialog?.action.label} “${dialog?.o.title}”?`}
        description={dialog?.action.description}
        confirmLabel={dialog?.action.label}
        tone={dialog?.action.tone}
        onClose={() => setDialog(null)}
        onConfirm={async (reason) => {
          await api.post(`/admin/opportunities/${dialog.o.id}/${dialog.key}`, { reason });
          setNotice(`${dialog.action.label}: ${dialog.o.title}.`);
          load();
        }}
      />
    </AdminPage>
  );
}
