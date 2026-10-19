import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { formatDate } from '../../components/ui';
import OpportunityForm, { CriteriaSummary } from '../../components/OpportunityForm';
import ReasonDialog from '../../components/ReasonDialog';
import { AdminPage, DataTable, DeleteDialog, ListLayout, Loading, Messages, SearchInput, StatusPill, StatusSelect } from '../../components/admin';

const STATUSES = [
  ['pending_review', 'Staff proposals'],
  ['published', 'Published'],
  ['closed', 'Closed'],
  ['archived', 'Archived'],
];
const TYPES = [
  ['', 'All'],
  ['hackathon', 'Hackathon'],
  ['grant', 'Grant'],
  ['competition', 'Competition'],
  ['other', 'Other'],
];
const ACTIONS = {
  publish: { label: 'Publish', tone: 'success', from: ['pending_review', 'closed'], description: 'Graduates can see it and apply until the deadline.' },
  close: { label: 'Close', tone: 'primary', from: ['published'], description: 'Stops new applications. Staff can still record decisions.' },
  archive: { label: 'Archive', tone: 'danger', from: ['pending_review', 'published', 'closed'], description: 'Hides it from every list. Applications and decisions are kept.' },
  unarchive: { label: 'Unarchive', tone: 'primary', from: ['archived'], description: 'It returns to its previous status (closed if the deadline has passed).' },
};
const ended = (o) => new Date(o.deadline) <= new Date() || o.status === 'closed' || (o.status === 'archived' && o.statusBeforeArchive === 'closed');

// FR08: the administrator reviews, publishes and manages opportunities.
export default function AdminOpportunities() {
  const [params, setParams] = useSearchParams();
  const tab = STATUSES.some(([k]) => k === params.get('status')) ? params.get('status') : 'pending_review';
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState(null); // 'new' | opportunity
  const [dialog, setDialog] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const load = useCallback(() => {
    setRows(null);
    api.get(`/admin/opportunities?status=${tab}`).then((d) => setRows(d.opportunities)).catch((e) => setError(e.message));
  }, [tab]);
  useEffect(() => {
    document.title = 'Opportunities · ALU Ventures';
    load();
  }, [load]);

  const setTab = (status) => setParams({ status });
  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (rows || []).filter((o) => (!type || o.type === type) && (!term || `${o.title} ${o.organiser || ''}`.toLowerCase().includes(term)));
  }, [rows, q, type]);

  if (editing) {
    return (
      <AdminPage title={editing === 'new' ? 'Add opportunity' : `Edit ${editing.title}`}>
        <div className="adm-card p-4 sm:p-6">
          <OpportunityForm
            initial={editing === 'new' ? null : editing}
            submitLabel={editing === 'new' ? 'Publish opportunity' : 'Save changes'}
            onCancel={() => setEditing(null)}
            onSubmit={async (data) => {
              if (editing === 'new') await api.post('/admin/opportunities', data);
              else await api.patch(`/admin/opportunities/${editing.id}`, data);
              setNotice(editing === 'new' ? 'Opportunity published.' : 'Changes saved.');
              setEditing(null);
              if (editing === 'new') setTab('published');
              else load();
            }}
          />
        </div>
      </AdminPage>
    );
  }

  const columns = [
    {
      key: 'title',
      label: 'Title',
      render: (o) => (
        <>
          <span className="font-medium">{o.title}</span>
          <CriteriaSummary criteria={o.criteria} />
        </>
      ),
    },
    { key: 'type', label: 'Type', render: (o) => <span className="capitalize">{o.type}</span> },
    { key: 'status', label: 'Status', render: (o) => <StatusPill status={o.status} /> },
    { key: 'deadline', label: 'Deadline', render: (o) => formatDate(o.deadline) },
    { key: 'apps', label: 'Applications', num: true, render: (o) => o.applicationCount },
    { key: 'by', label: 'Proposed by', render: (o) => o.createdBy?.name },
  ];
  const actions = (o) => (
    <>
      {o.status !== 'archived' && (
        <button type="button" className="adm-act" onClick={() => setEditing(o)}>
          Edit
        </button>
      )}
      {Object.entries(ACTIONS)
        .filter(([, a]) => a.from.includes(o.status))
        .map(([key, a]) => (
          <button key={key} type="button" className={`adm-act ${a.tone === 'danger' ? 'adm-act-danger' : ''}`} onClick={() => setDialog({ key, action: a, o })}>
            {a.label}
          </button>
        ))}
      {ended(o) && (
        <button type="button" className="adm-act adm-act-danger" onClick={() => setDeleting(o)}>
          Delete
        </button>
      )}
    </>
  );

  return (
    <AdminPage title="Opportunities" meta={rows ? `${shown.length} shown` : null}>
      <Messages notice={notice} error={error} />
      <ListLayout
        toolbar={
          <>
            <SearchInput value={q} onChange={setQ} placeholder="Title or organiser" />
            <StatusSelect value={tab} options={STATUSES} onChange={setTab} />
            <button type="button" className="adm-primary" onClick={() => setEditing('new')}>
              Add opportunity
            </button>
          </>
        }
        filters={[
          { title: 'Status', value: tab, onChange: setTab, options: STATUSES },
          { title: 'Type', value: type, onChange: setType, options: TYPES.map(([k, l]) => [k, l, rows ? rows.filter((o) => !k || o.type === k).length : null]) },
        ]}
      >
        {!rows ? <Loading /> : <DataTable columns={columns} rows={shown} actions={actions} empty="No opportunities." />}
      </ListLayout>
      <ReasonDialog
        open={Boolean(dialog)}
        title={`${dialog?.action.label} “${dialog?.o.title}”?`}
        description={dialog?.action.description}
        reason={dialog?.key === 'unarchive' ? 'none' : 'optional'}
        confirmLabel={dialog?.action.label}
        tone={dialog?.action.tone}
        onClose={() => setDialog(null)}
        onConfirm={async (reason) => {
          await api.post(`/admin/opportunities/${dialog.o.id}/${dialog.key}`, dialog.key === 'unarchive' ? {} : { reason });
          setNotice(`${dialog.action.label}: ${dialog.o.title}.`);
          load();
        }}
      />
      <DeleteDialog
        open={Boolean(deleting)}
        title={deleting ? `Delete ${deleting.title}?` : ''}
        planUrl={deleting ? `/admin/opportunities/${deleting.id}/delete-plan` : ''}
        deleteUrl={deleting ? `/admin/opportunities/${deleting.id}` : ''}
        onClose={() => setDeleting(null)}
        onDeleted={(removed) => {
          setNotice(`Deleted: ${removed.join(', ')}.`);
          load();
        }}
      />
    </AdminPage>
  );
}
