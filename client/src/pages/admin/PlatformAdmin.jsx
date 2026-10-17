import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { formatDate } from '../../components/ui';
import { AdminPage, EmptyRow, FilterLinks, Filters, Loading, Messages, StatusText, TableWrap } from '../../components/admin';

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
    <AdminPage title="Email outbox" hint="Failed emails are retried automatically; Retry sends one again now.">
      <Messages error={error} />
      <Filters>
        <FilterLinks
          label="Status"
          options={[['', 'All'], ['pending', 'Pending'], ['sent', 'Sent'], ['failed', 'Failed']].map(([k, l]) => [k, l, k ? data?.counts?.[k] || 0 : undefined])}
          value={status}
          onChange={setStatus}
        />
      </Filters>
      {!data ? (
        <Loading />
      ) : (
        <TableWrap>
          <table className="adm-table">
            <thead>
              <tr>
                <th>Subject</th>
                <th>Recipient</th>
                <th>Status</th>
                <th className="adm-num">Attempts</th>
                <th>Queued</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.notifications.length === 0 && <EmptyRow colSpan={6}>No emails.</EmptyRow>}
              {data.notifications.map((n) => (
                <tr key={n.id}>
                  <td>
                    {n.subject}
                    {n.lastError && <div className="adm-bad">{n.lastError}</div>}
                  </td>
                  <td className="break-all">{n.toEmail}</td>
                  <td>
                    <StatusText status={n.status} />
                  </td>
                  <td className="adm-num">{n.attempts}</td>
                  <td className="whitespace-nowrap">{formatDate(n.createdAt, true)}</td>
                  <td className="adm-actions">
                    {n.status !== 'sent' && (
                      <button type="button" className="adm-btn" onClick={() => retry(n.id)}>
                        Retry
                      </button>
                    )}
                    {n.previewUrl && (
                      <a href={n.previewUrl} target="_blank" rel="noreferrer" className="adm-btn">
                        Preview
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
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
    <AdminPage title="Rules & thresholds" hint="Changes apply to new checks and submissions.">
      <Messages notice={notice} error={error} />

      <TableWrap>
        <table className="adm-table">
          <thead>
            <tr>
              <th>Threshold</th>
              <th>Value</th>
              <th>Range</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <label htmlFor="sim">Project similarity (at or above → Similarity Flagged)</label>
              </td>
              <td>
                <input id="sim" type="number" step="0.01" min="0.3" max="0.99" className="adm-field max-w-28" value={thresholds.similarity_threshold ?? ''} onChange={(e) => setThresholds((t) => ({ ...t, similarity_threshold: e.target.value }))} />
              </td>
              <td className="adm-muted">0.30–0.99</td>
            </tr>
            <tr>
              <td>
                <label htmlFor="ocr">Document name match (certificate name vs profile name)</label>
              </td>
              <td>
                <input id="ocr" type="number" step="0.01" min="0.5" max="1" className="adm-field max-w-28" value={thresholds.ocr_name_match_threshold ?? ''} onChange={(e) => setThresholds((t) => ({ ...t, ocr_name_match_threshold: e.target.value }))} />
              </td>
              <td className="adm-muted">0.50–1.00</td>
            </tr>
          </tbody>
        </table>
      </TableWrap>
      <p className="mt-2">
        <button type="button" className="adm-btn adm-btn-primary" onClick={() => run(() => api.put('/admin/config/settings', thresholds), 'Thresholds saved.')}>
          Save thresholds
        </button>
      </p>

      <h2>Sector keyword map</h2>
      <p className="adm-hint">Comma-separated keywords suggest a sector from a project’s text; graduates always confirm. New sectors appear in the project form straight away.</p>
      <TableWrap>
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
                <td className="whitespace-nowrap">{s.sector}</td>
                <td>
                  <textarea rows={2} className="adm-field" aria-label={`${s.sector} keywords`} value={drafts[s.id] || ''} onChange={(e) => setDrafts((d) => ({ ...d, [s.id]: e.target.value }))} />
                </td>
                <td className="adm-actions">
                  <button type="button" className="adm-btn" onClick={() => run(() => api.put(`/admin/config/sectors/${s.id}`, { keywords: list(drafts[s.id]) }), `${s.sector} keywords saved.`)}>
                    Save
                  </button>
                </td>
              </tr>
            ))}
            <tr>
              <td>
                <input className="adm-field" placeholder="New sector" aria-label="New sector name" value={newSector.sector} onChange={(e) => setNewSector((n) => ({ ...n, sector: e.target.value }))} />
              </td>
              <td>
                <input className="adm-field" placeholder="keyword, keyword, …" aria-label="New sector keywords" value={newSector.keywords} onChange={(e) => setNewSector((n) => ({ ...n, keywords: e.target.value }))} />
              </td>
              <td className="adm-actions">
                <button
                  type="button"
                  className="adm-btn"
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
      </TableWrap>
    </AdminPage>
  );
}
