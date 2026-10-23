import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { formatDate } from '../../components/ui';
import ReasonDialog from '../../components/ReasonDialog';
import { AdminPage, DataTable, ListLayout, Loading, Messages, Pill, StatusSelect } from '../../components/admin';

const STATUSES = [
  ['pending', 'Pending'],
  ['approved', 'Approved'],
  ['rejected', 'Rejected'],
  ['all', 'All'],
];
const PILL = { pending: 'warning', approved: 'success', rejected: 'danger' };

// Testimonies for the home page: only approved ones are public.
export default function AdminTestimonials() {
  const [params, setParams] = useSearchParams();
  const status = STATUSES.some(([k]) => k === params.get('status')) ? params.get('status') : 'pending';
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [dialog, setDialog] = useState(null); // { t, decision }

  const load = useCallback(() => {
    api
      .get(`/admin/testimonials?status=${status}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [status]);
  useEffect(() => {
    document.title = 'Testimonies · ALU Ventures';
    setData(null);
    load();
  }, [load]);

  const setStatus = (s) => setParams({ status: s });
  const options = STATUSES.map(([k, l]) => [k, l, k === 'all' ? null : (data?.counts?.[k] ?? 0)]);

  return (
    <AdminPage title="Testimonies" meta={data ? `${data.testimonials.length} shown` : null}>
      <Messages notice={notice} error={error} />
      <ListLayout toolbar={<StatusSelect value={status} options={options} onChange={setStatus} label="Show" />} filters={[{ title: 'Status', value: status, onChange: setStatus, options }]}>
        {!data ? (
          <Loading />
        ) : (
          <DataTable
            columns={[
              {
                key: 'author',
                label: 'From',
                render: (t) => (
                  <>
                    <span className="font-medium">{t.author?.name}</span>
                    <div className="adm-muted text-[12px]">{t.role}</div>
                  </>
                ),
              },
              { key: 'body', label: 'Testimony', render: (t) => <span className="whitespace-pre-line">“{t.body}”</span> },
              { key: 'status', label: 'Status', render: (t) => <Pill tone={PILL[t.status]}>{t.status[0].toUpperCase() + t.status.slice(1)}</Pill> },
              { key: 'updated', label: 'Updated', render: (t) => formatDate(t.updatedAt) },
            ]}
            rows={data.testimonials}
            actions={(t) => (
              <>
                {t.status !== 'approved' && (
                  <button type="button" className="adm-act" onClick={() => setDialog({ t, decision: 'approve' })}>
                    Approve
                  </button>
                )}
                {t.status !== 'rejected' && (
                  <button type="button" className="adm-act adm-act-danger" onClick={() => setDialog({ t, decision: 'reject' })}>
                    {t.status === 'approved' ? 'Unpublish' : 'Reject'}
                  </button>
                )}
              </>
            )}
            empty="No testimonies in this view."
          />
        )}
      </ListLayout>
      <ReasonDialog
        open={Boolean(dialog)}
        reason={dialog?.decision === 'reject' ? 'required' : 'none'}
        tone={dialog?.decision === 'reject' ? 'danger' : 'primary'}
        title={dialog?.decision === 'reject' ? 'Reject this testimony?' : 'Publish this testimony on the home page?'}
        description={dialog ? `From ${dialog.t.author?.name} (${dialog.t.role}).` : ''}
        confirmLabel={dialog?.decision === 'reject' ? 'Reject' : 'Approve'}
        onClose={() => setDialog(null)}
        onConfirm={async (reason) => {
          await api.post(`/admin/testimonials/${dialog.t.id}/${dialog.decision}`, reason ? { reason } : {});
          setNotice(dialog.decision === 'reject' ? 'Testimony rejected.' : 'Testimony approved. It now shows on the home page.');
          load();
        }}
      />
    </AdminPage>
  );
}
