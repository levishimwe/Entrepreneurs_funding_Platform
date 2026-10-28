import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { formatDate } from '../../components/ui';
import ReasonDialog from '../../components/ReasonDialog';
import { AdminPage, DataTable, ListLayout, Loading, Messages, Pill, StatusSelect } from '../../components/admin';

const VIEWS = [
  ['reported', 'Reported'],
  ['all', 'All posts'],
  ['removed', 'Removed'],
];

// Graduate posts: reports from investors, and removal with a reason (soft
// delete; the graduate sees the reason).
export default function AdminPosts() {
  const [params, setParams] = useSearchParams();
  const view = VIEWS.some(([k]) => k === params.get('view')) ? params.get('view') : 'reported';
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [removing, setRemoving] = useState(null);

  const load = useCallback(() => {
    api
      .get(`/admin/posts?view=${view}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [view]);
  useEffect(() => {
    document.title = 'Posts · ALU Ventures';
    setData(null);
    load();
  }, [load]);

  const setView = (v) => setParams({ view: v });
  const options = VIEWS.map(([k, l]) => [k, l, data?.counts?.[k] ?? null]);
  const dismiss = async (p) => {
    await api.post(`/admin/posts/${p.id}/dismiss-reports`);
    setNotice('Reports dismissed. The post stays up.');
    load();
  };

  return (
    <AdminPage title="Posts" meta={data ? `${data.posts.length} shown` : null}>
      <Messages notice={notice} error={error} />
      <ListLayout
        toolbar={<StatusSelect value={view} options={options} onChange={setView} label="Show" />}
        filters={[{ title: 'View', value: view, onChange: setView, options }]}
      >
        {!data ? (
          <Loading />
        ) : (
          <DataTable
            columns={[
              { key: 'graduate', label: 'Graduate', render: (p) => <span className="font-medium">{p.graduate.name}</span> },
              {
                key: 'body',
                label: 'Post',
                render: (p) => (
                  <>
                    <span className="whitespace-pre-line break-words">{p.body}</span>
                    {p.imageUrl && (
                      <a href={p.imageUrl} target="_blank" rel="noopener noreferrer" className="adm-a mt-1 block text-[12px]">
                        View image
                      </a>
                    )}
                  </>
                ),
              },
              {
                key: 'reports',
                label: 'Reports',
                render: (p) =>
                  p.openReports.length ? (
                    <ul className="space-y-1">
                      {p.openReports.map((r) => (
                        <li key={r.id} className="text-[12px]">
                          <span className="font-medium">{r.reporter}</span>
                          {r.reason ? `: “${r.reason}”` : ''}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="adm-muted">—</span>
                  ),
              },
              {
                key: 'status',
                label: 'Status',
                render: (p) =>
                  p.removed ? (
                    <>
                      <Pill tone="danger">Removed</Pill>
                      <div className="adm-muted mt-1 text-[12px]">{p.removed.reason}</div>
                    </>
                  ) : (
                    <Pill tone="success">Live</Pill>
                  ),
              },
              { key: 'created', label: 'Posted', render: (p) => formatDate(p.createdAt, true) },
            ]}
            rows={data.posts}
            actions={(p) =>
              p.removed ? null : (
                <>
                  {p.openReports.length > 0 && (
                    <button type="button" className="adm-act" onClick={() => dismiss(p)}>
                      Dismiss reports
                    </button>
                  )}
                  <button type="button" className="adm-act adm-act-danger" onClick={() => setRemoving(p)}>
                    Remove
                  </button>
                </>
              )
            }
            empty={view === 'reported' ? 'No reported posts.' : 'No posts in this view.'}
          />
        )}
      </ListLayout>
      <ReasonDialog
        open={Boolean(removing)}
        reason="required"
        tone="danger"
        title="Remove this post?"
        description={removing ? `By ${removing.graduate.name}. It disappears from their profile and the investor feed; they see your reason.` : ''}
        confirmLabel="Remove post"
        onClose={() => setRemoving(null)}
        onConfirm={async (reason) => {
          await api.post(`/admin/posts/${removing.id}/remove`, { reason });
          setNotice('Post removed.');
          load();
        }}
      />
    </AdminPage>
  );
}
