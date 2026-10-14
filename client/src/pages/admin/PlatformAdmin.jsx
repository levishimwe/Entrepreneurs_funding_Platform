import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, RotateCw } from 'lucide-react';
import { api } from '../../lib/api';
import { Alert, Field, PageHeader, PageLoader, Pill, StatusPill, formatDate } from '../../components/ui';

// FR10: the persistent email outbox, with failures visible for follow-up.
export function Outbox() {
  const [status, setStatus] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    api.get(`/admin/notifications${status ? `?status=${status}` : ''}`).then(setData).catch((e) => setError(e.message));
  }, [status]);
  useEffect(() => {
    document.title = 'Email outbox · ALU Ventures';
    load();
  }, [load]);

  const retry = async (id) => {
    try {
      await api.post(`/admin/notifications/${id}/retry`);
    } catch (e) {
      setError(e.message);
    }
    load();
  };

  return (
    <>
      <PageHeader title="Email Outbox" description="Every notification is stored with its delivery status. Failed emails are retried automatically and can be retried here." />
      {error && <Alert type="error" className="mb-4">{error}</Alert>}
      <div className="mb-4 flex flex-wrap gap-2">
        {[['', 'All'], ['pending', 'Pending'], ['sent', 'Sent'], ['failed', 'Failed']].map(([k, l]) => (
          <button key={k} type="button" onClick={() => setStatus(k)} className={`rounded-full border px-3 py-1 text-xs ${status === k ? 'border-accent bg-accent-soft text-accent' : 'border-line text-muted'}`}>
            {l} {data?.counts && k && <span className="tabular-nums">({data.counts[k] || 0})</span>}
          </button>
        ))}
      </div>
      {!data ? (
        <PageLoader />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-line bg-subtle text-xs text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Subject</th>
                <th className="px-4 py-2 font-medium">Recipient</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Queued</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.notifications.map((n) => (
                <tr key={n.id}>
                  <td className="px-4 py-2">
                    {n.subject}
                    {n.lastError && <p className="text-xs text-red-600">{n.lastError}</p>}
                  </td>
                  <td className="px-4 py-2 text-xs">{n.toEmail}</td>
                  <td className="px-4 py-2">
                    <StatusPill status={n.status} /> <span className="text-xs text-muted">{n.attempts} attempt(s)</span>
                  </td>
                  <td className="px-4 py-2 text-xs text-muted">{formatDate(n.createdAt, true)}</td>
                  <td className="px-4 py-2 text-right">
                    {n.status !== 'sent' && (
                      <button type="button" className="btn-secondary px-2 py-1 text-xs" onClick={() => retry(n.id)}>
                        <RotateCw className="h-3 w-3" aria-hidden="true" /> Retry
                      </button>
                    )}
                    {n.previewUrl && (
                      <a href={n.previewUrl} target="_blank" rel="noreferrer" className="ml-2 inline-flex items-center gap-1 text-xs text-accent hover:underline">
                        Preview <ExternalLink className="h-3 w-3" aria-hidden="true" />
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
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

  if (!data) return error ? <Alert type="error">{error}</Alert> : <PageLoader />;
  return (
    <>
      <PageHeader title="Rules & Thresholds" description="Keyword map for sector suggestions and the thresholds used by similarity and name matching. Changes apply to new checks." />
      {notice && <Alert type="success" className="mb-4">{notice}</Alert>}
      {error && <Alert type="error" className="mb-4">{error}</Alert>}
      <div className="card mb-6 p-5">
        <h2 className="font-semibold">Thresholds</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Field label="Project similarity threshold" htmlFor="sim" help="0.30–0.99. Submissions at or above this score are Similarity Flagged.">
            <input id="sim" type="number" step="0.01" min="0.3" max="0.99" className="input" value={thresholds.similarity_threshold ?? ''} onChange={(e) => setThresholds((t) => ({ ...t, similarity_threshold: e.target.value }))} />
          </Field>
          <Field label="Document name-match threshold" htmlFor="ocr" help="0.50–1.00. Minimum fuzzy similarity between a certificate name and the profile name.">
            <input id="ocr" type="number" step="0.01" min="0.5" max="1" className="input" value={thresholds.ocr_name_match_threshold ?? ''} onChange={(e) => setThresholds((t) => ({ ...t, ocr_name_match_threshold: e.target.value }))} />
          </Field>
        </div>
        <button type="button" className="btn-primary mt-4" onClick={() => run(() => api.put('/admin/config/settings', thresholds), 'Thresholds saved.')}>
          Save thresholds
        </button>
      </div>
      <div className="card p-5">
        <h2 className="font-semibold">Sector keyword map</h2>
        <p className="text-xs text-muted">Comma-separated keywords. A project’s text is matched against these to suggest a sector; graduates always confirm.</p>
        <div className="mt-4 space-y-3">
          {data.sectors.map((s) => (
            <div key={s.id} className="flex flex-col gap-2 sm:flex-row sm:items-start">
              <div className="w-48 shrink-0 pt-1.5 text-sm font-medium">{s.sector}</div>
              <textarea rows={2} className="input" aria-label={`${s.sector} keywords`} value={drafts[s.id] || ''} onChange={(e) => setDrafts((d) => ({ ...d, [s.id]: e.target.value }))} />
              <button type="button" className="btn-secondary shrink-0" onClick={() => run(() => api.put(`/admin/config/sectors/${s.id}`, { keywords: list(drafts[s.id]) }), `${s.sector} keywords saved.`)}>
                Save
              </button>
            </div>
          ))}
        </div>
        <div className="mt-6 border-t border-line pt-4">
          <p className="mb-2 text-sm font-medium">Add a sector</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input className="input sm:w-48" placeholder="Sector name" aria-label="New sector name" value={newSector.sector} onChange={(e) => setNewSector((n) => ({ ...n, sector: e.target.value }))} />
            <input className="input" placeholder="keyword, keyword, …" aria-label="New sector keywords" value={newSector.keywords} onChange={(e) => setNewSector((n) => ({ ...n, keywords: e.target.value }))} />
            <button
              type="button"
              className="btn-primary shrink-0"
              onClick={() =>
                run(async () => {
                  await api.post('/admin/config/sectors', { sector: newSector.sector, keywords: list(newSector.keywords) });
                  setNewSector({ sector: '', keywords: '' });
                }, 'Sector added.')
              }
            >
              Add
            </button>
          </div>
          <p className="help">
            <Pill tone="slate">Note</Pill> New sectors appear in the project form’s sector list straight away.
          </p>
        </div>
      </div>
    </>
  );
}
