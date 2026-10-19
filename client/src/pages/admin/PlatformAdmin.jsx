import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, qs } from '../../lib/api';
import { formatDate } from '../../components/ui';
import ReasonDialog from '../../components/ReasonDialog';
import { AdminPage, DataTable, ListLayout, Loading, Messages, SearchInput, StatusPill, StatusSelect, useSelection } from '../../components/admin';

const STATUSES = [
  ['', 'All'],
  ['pending', 'Pending'],
  ['sent', 'Sent'],
  ['failed', 'Failed'],
  ['archived', 'Archived'],
];
const AGES = [
  ['', 'Any age'],
  ['7', 'Older than 7 days'],
  ['30', 'Older than 30 days'],
  ['90', 'Older than 90 days'],
];
const olderThan = (n, days) => !days || Date.now() - new Date(n.createdAt) > Number(days) * 86400000;

// FR10: the persistent email outbox, with failures visible for follow-up.
export function Outbox() {
  const [status, setStatus] = useState('');
  const [age, setAge] = useState('');
  const [q, setQ] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirm, setConfirm] = useState(null); // { title, description, run, label, tone }
  const [purge, setPurge] = useState(null); // { status, olderThanDays, count }
  const selection = useSelection();

  const load = useCallback(() => {
    api.get(`/admin/notifications${status ? `?status=${status}` : ''}`).then(setData).catch((e) => setError(e.message));
  }, [status]);
  useEffect(() => {
    document.title = 'Email outbox · ALU Ventures';
    setData(null);
    selection.clear();
    load();
  }, [load]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (data?.notifications || []).filter((n) => olderThan(n, age) && (!term || `${n.subject} ${n.toEmail}`.toLowerCase().includes(term)));
  }, [data, age, q]);
  const counts = data?.counts || {};
  const options = STATUSES.map(([k, l]) => [k, l, k ? counts[k] || 0 : undefined]);
  const selected = [...selection.selected];

  const run = async (fn, message) => {
    setError('');
    try {
      await fn();
      setNotice(message);
      selection.clear();
      load();
    } catch (e) {
      setError(e.message);
    }
  };
  const bulk = (action) => api.post('/admin/notifications/bulk', { action, ids: selected });

  const columns = [
    {
      key: 'subject',
      label: 'Subject',
      render: (n) => (
        <>
          <span className="font-medium">{n.subject}</span>
          {n.lastError && <div className="adm-bad text-[12px]">{n.lastError}</div>}
        </>
      ),
    },
    { key: 'to', label: 'Recipient', render: (n) => <span className="break-all">{n.toEmail}</span> },
    { key: 'status', label: 'Status', render: (n) => (n.archivedAt ? <StatusPill status="archived" /> : <StatusPill status={n.status} />) },
    { key: 'attempts', label: 'Attempts', num: true, render: (n) => n.attempts },
    { key: 'queued', label: 'Queued', render: (n) => formatDate(n.createdAt, true) },
  ];
  const actions = (n) => (
    <>
      {n.status !== 'sent' && !n.archivedAt && (
        <button type="button" className="adm-act" onClick={() => run(() => api.post(`/admin/notifications/${n.id}/retry`), 'Retry sent.')}>
          Retry
        </button>
      )}
      {n.previewUrl && (
        <a href={n.previewUrl} target="_blank" rel="noreferrer" className="adm-act">
          Preview
        </a>
      )}
      <button
        type="button"
        className="adm-act"
        onClick={() => run(() => api.post(`/admin/notifications/${n.id}/${n.archivedAt ? 'unarchive' : 'archive'}`), n.archivedAt ? 'Email unarchived.' : 'Email archived.')}
      >
        {n.archivedAt ? 'Unarchive' : 'Archive'}
      </button>
      <button
        type="button"
        className="adm-act adm-act-danger"
        onClick={() =>
          setConfirm({
            title: 'Delete this email?',
            description: `Permanently removes the email “${n.subject}” to ${n.toEmail}. It cannot be undone.`,
            label: 'Delete permanently',
            run: () => api.delete(`/admin/notifications/${n.id}`),
            done: 'Email deleted.',
          })
        }
      >
        Delete
      </button>
    </>
  );

  const openPurge = async (next) => {
    const filter = { status: next.status || 'all', ...(next.olderThanDays ? { olderThanDays: next.olderThanDays } : {}) };
    const { count } = await api.get(`/admin/notifications/purge-preview${qs(filter)}`);
    setPurge({ ...next, count });
  };

  return (
    <AdminPage title="Email outbox" meta={data ? `${rows.length} shown` : null}>
      <Messages notice={notice} error={error} />
      <ListLayout
        toolbar={
          <>
            <SearchInput value={q} onChange={setQ} placeholder="Subject or recipient" />
            <StatusSelect value={status} options={options} onChange={setStatus} />
            <button type="button" className="adm-secondary" onClick={() => openPurge({ status: status === 'archived' ? '' : status, olderThanDays: age })}>
              Delete by status or age
            </button>
          </>
        }
        filters={[
          { title: 'Status', value: status, onChange: setStatus, options },
          { title: 'Age', value: age, onChange: setAge, options: AGES },
        ]}
      >
        {selected.length > 0 && (
          <div className="adm-card mb-2 flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2">
            <span className="font-semibold">{selected.length} selected</span>
            <button type="button" className="adm-act" onClick={() => run(() => bulk('archive'), `${selected.length} archived.`)}>
              Archive
            </button>
            <button type="button" className="adm-act" onClick={() => run(() => bulk('unarchive'), `${selected.length} unarchived.`)}>
              Unarchive
            </button>
            <button
              type="button"
              className="adm-act adm-act-danger"
              onClick={() =>
                setConfirm({
                  title: `Delete ${selected.length} selected email${selected.length === 1 ? '' : 's'}?`,
                  description: `Permanently removes the ${selected.length} selected email${selected.length === 1 ? '' : 's'} from the outbox. It cannot be undone.`,
                  label: 'Delete permanently',
                  run: () => bulk('delete'),
                  done: `${selected.length} deleted.`,
                })
              }
            >
              Delete selected
            </button>
            <button type="button" className="adm-act" onClick={selection.clear}>
              Clear
            </button>
          </div>
        )}
        {!data ? <Loading /> : <DataTable columns={columns} rows={rows} actions={actions} selection={selection} empty="No emails." />}
      </ListLayout>

      <ReasonDialog
        open={Boolean(confirm)}
        reason="none"
        tone="danger"
        title={confirm?.title}
        description={confirm?.description}
        confirmLabel={confirm?.label}
        onClose={() => setConfirm(null)}
        onConfirm={() => run(confirm.run, confirm.done)}
      />
      <ReasonDialog
        open={Boolean(purge)}
        reason="none"
        tone="danger"
        title="Delete emails by status and age"
        confirmLabel={purge?.count ? `Delete ${purge.count} email${purge.count === 1 ? '' : 's'}` : 'Nothing to delete'}
        confirmDisabled={!purge?.count}
        onClose={() => setPurge(null)}
        onConfirm={() =>
          run(
            () => api.post('/admin/notifications/purge', { status: purge.status || 'all', ...(purge.olderThanDays ? { olderThanDays: Number(purge.olderThanDays) } : {}) }),
            `${purge.count} email${purge.count === 1 ? '' : 's'} deleted.`
          )
        }
      >
        <div className="flex flex-wrap gap-2">
          <StatusSelect value={purge?.status || ''} options={STATUSES.filter(([k]) => k !== 'archived').map(([k, l]) => [k, k ? l : 'Any status'])} onChange={(s) => openPurge({ ...purge, status: s })} />
          <StatusSelect value={purge?.olderThanDays || ''} options={AGES} onChange={(d) => openPurge({ ...purge, olderThanDays: d })} label="Age" />
        </div>
        <p className="mt-2">
          {purge?.count
            ? `Permanently removes ${purge.count} email${purge.count === 1 ? '' : 's'} (archived ones included). It cannot be undone.`
            : 'No emails match.'}
        </p>
      </ReasonDialog>
    </AdminPage>
  );
}

// FR15/FR16: administrator-maintained keyword map and thresholds.
export function RulesConfig() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [thresholds, setThresholds] = useState({});
  const [drafts, setDrafts] = useState({});
  const [newSector, setNewSector] = useState({ sector: '', keywords: '' });

  const load = useCallback(
    () =>
      api
        .get('/admin/config')
        .then((d) => {
          setData(d);
          setThresholds(d.settings);
          setDrafts(Object.fromEntries(d.sectors.map((s) => [s.id, s.keywords.join(', ')])));
        })
        .catch((e) => setError(e.message)),
    []
  );
  useEffect(() => {
    document.title = 'Rules & thresholds · ALU Ventures';
    load();
  }, [load]);

  const run = async (fn, message) => {
    setError('');
    setNotice('');
    try {
      await fn();
      setNotice(message);
      load();
    } catch (e) {
      setError(e.message);
    }
  };
  const list = (s) => s.split(',').map((k) => k.trim()).filter(Boolean);

  if (!data) return <AdminPage title="Rules & thresholds">{error ? <Messages error={error} /> : <Loading />}</AdminPage>;
  return (
    <AdminPage title="Rules & thresholds">
      <Messages notice={notice} error={error} />
      <section className="adm-card mb-6 p-4 sm:p-6">
        <h2 className="!mt-0">Thresholds</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block font-medium">Project similarity</span>
            <input type="number" step="0.01" min="0.3" max="0.99" className="adm-input" value={thresholds.similarity_threshold ?? ''} onChange={(e) => setThresholds((t) => ({ ...t, similarity_threshold: e.target.value }))} />
            <span className="adm-hint mt-1 block">0.30–0.99 · at or above → Similarity Flagged</span>
          </label>
          <label className="block">
            <span className="mb-1 block font-medium">Document name match</span>
            <input type="number" step="0.01" min="0.5" max="1" className="adm-input" value={thresholds.ocr_name_match_threshold ?? ''} onChange={(e) => setThresholds((t) => ({ ...t, ocr_name_match_threshold: e.target.value }))} />
            <span className="adm-hint mt-1 block">0.50–1.00 · certificate name vs profile name</span>
          </label>
        </div>
        <button type="button" className="adm-primary mt-4" onClick={() => run(() => api.put('/admin/config/settings', thresholds), 'Thresholds saved.')}>
          Save thresholds
        </button>
      </section>

      <h2>Sector keyword map</h2>
      <div className="adm-card adm-scroll">
        <table className="adm-table">
          <thead>
            <tr>
              <th>Sector</th>
              <th className="w-full">Keywords</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.sectors.map((s) => (
              <tr key={s.id}>
                <td className="whitespace-nowrap font-medium">{s.sector}</td>
                <td>
                  <textarea rows={2} className="adm-field" aria-label={`${s.sector} keywords`} value={drafts[s.id] || ''} onChange={(e) => setDrafts((d) => ({ ...d, [s.id]: e.target.value }))} />
                </td>
                <td className="adm-actions">
                  <button type="button" className="adm-act" onClick={() => run(() => api.put(`/admin/config/sectors/${s.id}`, { keywords: list(drafts[s.id]) }), `${s.sector} saved.`)}>
                    Save
                  </button>
                </td>
              </tr>
            ))}
            <tr>
              <td>
                <input className="adm-input" placeholder="New sector" aria-label="New sector name" value={newSector.sector} onChange={(e) => setNewSector((n) => ({ ...n, sector: e.target.value }))} />
              </td>
              <td>
                <input className="adm-input" placeholder="keyword, keyword" aria-label="New sector keywords" value={newSector.keywords} onChange={(e) => setNewSector((n) => ({ ...n, keywords: e.target.value }))} />
              </td>
              <td className="adm-actions">
                <button
                  type="button"
                  className="adm-act"
                  onClick={() =>
                    run(async () => {
                      await api.post('/admin/config/sectors', { sector: newSector.sector, keywords: list(newSector.keywords) });
                      setNewSector({ sector: '', keywords: '' });
                    }, 'Sector added.')
                  }
                >
                  Add
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </AdminPage>
  );
}
