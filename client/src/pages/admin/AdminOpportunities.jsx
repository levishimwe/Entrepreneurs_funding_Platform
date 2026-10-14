import { useCallback, useEffect, useState } from 'react';
import { Inbox, Plus } from 'lucide-react';
import { api } from '../../lib/api';
import { Alert, EmptyState, PageHeader, PageLoader, Pill, StatusPill, formatDate } from '../../components/ui';
import OpportunityForm, { CriteriaSummary } from '../../components/OpportunityForm';
import ReasonDialog from '../../components/ReasonDialog';

const TABS = [
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
      <>
        <PageHeader title={editing === 'new' ? 'Post an opportunity' : `Edit: ${editing.title}`} description={editing === 'new' ? 'Opportunities you post are published immediately.' : undefined} />
        <div className="card p-5">
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
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Hackathons & Opportunities"
        description="Publish staff proposals, post your own opportunities and close them when applications end. Selection decisions are made by ALU staff."
        actions={
          <button type="button" className="btn-primary" onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Post opportunity
          </button>
        }
      />
      {notice && <Alert type="success" className="mb-4">{notice}</Alert>}
      {error && <Alert type="error" className="mb-4">{error}</Alert>}
      <div className="mb-4 flex gap-1 border-b border-line" role="tablist">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === key ? 'border-accent font-medium' : 'border-transparent text-muted hover:text-ink'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {!rows ? (
        <PageLoader />
      ) : rows.length === 0 ? (
        <div className="card">
          <EmptyState icon={Inbox} title="No opportunities here" />
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((o) => (
            <div key={o.id} className="card flex flex-col gap-3 p-4 md:flex-row md:items-start">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold">{o.title}</h2>
                  <Pill tone="blue">{o.type}</Pill>
                  <StatusPill status={o.status} />
                </div>
                <p className="mt-1 text-xs text-muted">
                  Deadline {formatDate(o.deadline, true)} · {o.applicationCount} application(s) · proposed by {o.createdBy?.name} ({o.createdBy?.role})
                </p>
                <p className="mt-2 line-clamp-2 text-sm">{o.description}</p>
                <div className="mt-2">
                  <CriteriaSummary criteria={o.criteria} />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-secondary" onClick={() => setEditing(o)}>
                  Edit
                </button>
                {Object.entries(ACTIONS)
                  .filter(([, a]) => a.from.includes(o.status))
                  .map(([key, a]) => (
                    <button
                      key={key}
                      type="button"
                      className={a.tone === 'danger' ? 'btn-danger' : a.tone === 'success' ? 'btn-cta' : 'btn-secondary'}
                      onClick={() => setDialog({ key, action: a, o })}
                    >
                      {a.label}
                    </button>
                  ))}
              </div>
            </div>
          ))}
        </div>
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
    </>
  );
}
