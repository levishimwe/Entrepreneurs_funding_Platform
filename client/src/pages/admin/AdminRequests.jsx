import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, qs } from '../../lib/api';
import { Field, formatDate } from '../../components/ui';
import ReasonDialog from '../../components/ReasonDialog';
import { AdminPage, DataTable, KeyValue, ListLayout, Loading, Messages, SearchInput, SidePanel, StatusPill, StatusSelect } from '../../components/admin';

const STATUSES = [
  ['open', 'Open'],
  ['in_progress', 'In progress'],
  ['resolved', 'Resolved'],
  ['all', 'All'],
  ['archived', 'Archived'],
];
const CATEGORIES = [
  ['', 'All'],
  ['profile', 'Profile'],
  ['project', 'Project'],
  ['account', 'Account or login'],
  ['opportunity', 'Opportunity'],
  ['introduction', 'Investor introduction'],
  ['other', 'Other'],
];
const ROLE = { graduate: 'Graduate', investor: 'Investor' };

function ThreadPanel({ id, onClose, onChanged }) {
  const [thread, setThread] = useState(null);
  const [error, setError] = useState('');
  const [reply, setReply] = useState('');
  const [nextStatus, setNextStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState(null); // 'apply' | 'delete'

  useEffect(() => {
    api
      .get(`/admin/requests/${id}`)
      .then((d) => setThread(d.thread))
      .catch((e) => setError(e.message));
  }, [id]);

  const run = async (fn) => {
    setBusy(true);
    setError('');
    try {
      const res = await fn();
      if (res?.thread) setThread(res.thread);
      onChanged();
      return res;
    } catch (e) {
      setError(e.message);
      return null;
    } finally {
      setBusy(false);
    }
  };
  const send = async (e) => {
    e.preventDefault();
    const res = await run(() => api.post(`/admin/requests/${id}/messages`, { message: reply, ...(nextStatus ? { status: nextStatus } : {}) }));
    if (res) {
      setReply('');
      setNextStatus('');
    }
  };

  const nameChange = thread?.category === 'profile' && thread.requestedName;
  return (
    <SidePanel title={thread ? thread.subject : 'Request'} onClose={onClose}>
      <Messages error={error} />
      {!thread ? (
        !error && <Loading />
      ) : (
        <>
          <KeyValue
            rows={[
              ['From', `${thread.user?.name} · ${ROLE[thread.user?.role] || thread.user?.role}`],
              ['Email', thread.user?.email],
              ['Category', thread.categoryLabel],
              ['Status', <StatusPill key="s" status={thread.status} />],
              ...(nameChange ? [['Requested name', `${thread.requestedName}${thread.nameAppliedAt ? ` (applied ${formatDate(thread.nameAppliedAt)})` : ''}`]] : []),
              ['Started', `${formatDate(thread.createdAt, true)}${thread.startedBy === 'admin' ? ' by an administrator' : ''}`],
              ...(thread.archivedAt ? [['Archived', formatDate(thread.archivedAt, true)]] : []),
            ]}
          />

          <div className="mt-4 flex flex-wrap gap-2">
            {nameChange && !thread.nameAppliedAt && (
              <button type="button" className="adm-primary" disabled={busy} onClick={() => setDialog('apply')}>
                Apply change
              </button>
            )}
            {!thread.archivedAt && (
              <StatusSelect
                label="Set status"
                value={thread.status}
                options={STATUSES.slice(0, 3)}
                onChange={(status) => run(() => api.post(`/admin/requests/${id}/status`, { status }))}
              />
            )}
            {thread.status === 'resolved' && (
              <>
                <button
                  type="button"
                  className="adm-secondary"
                  disabled={busy}
                  onClick={() => run(() => api.post(`/admin/requests/${id}/${thread.archivedAt ? 'unarchive' : 'archive'}`).then(() => api.get(`/admin/requests/${id}`)))}
                >
                  {thread.archivedAt ? 'Unarchive' : 'Archive'}
                </button>
                <button type="button" className="adm-act adm-act-danger" disabled={busy} onClick={() => setDialog('delete')}>
                  Delete
                </button>
              </>
            )}
          </div>

          <h2 className="mt-6">Conversation</h2>
          <ol className="mt-2 space-y-2" aria-label="Messages">
            {thread.messages.map((m) => (
              <li key={m.id} className={`adm-card p-3 ${m.authorRole === 'admin' ? 'bg-[var(--adm-accent-soft)]' : ''}`}>
                <p className="adm-muted text-[12px]">
                  <strong className="text-[var(--adm-text)]">{m.authorRole === 'admin' ? 'Administrator' : thread.user?.name}</strong> · {formatDate(m.createdAt, true)}
                </p>
                <p className="mt-1 whitespace-pre-line">{m.body}</p>
                {m.attachment && (
                  <a href={`/api/admin/requests/attachments/${m.id}`} target="_blank" rel="noreferrer" className="mt-2 block w-fit">
                    <img src={`/api/admin/requests/attachments/${m.id}`} alt={m.attachment.name} className="max-h-56 rounded border border-[var(--adm-border)]" loading="lazy" />
                  </a>
                )}
              </li>
            ))}
          </ol>

          {thread.archivedAt ? (
            <p className="adm-hint mt-4">Archived. Unarchive to reply.</p>
          ) : (
            <form className="mt-4 space-y-2" onSubmit={send}>
              <Field label="Reply (emailed to the user)" htmlFor="r-reply">
                <textarea id="r-reply" rows={4} className="adm-field" value={reply} onChange={(e) => setReply(e.target.value)} maxLength={5000} required />
              </Field>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <StatusSelect label="Status after reply" value={nextStatus} options={[['', 'Status: automatic'], ['in_progress', 'Mark in progress'], ['resolved', 'Mark resolved']]} onChange={setNextStatus} />
                <button type="submit" className="adm-primary" disabled={busy || !reply.trim()}>
                  {busy ? 'Sending…' : 'Send reply'}
                </button>
              </div>
            </form>
          )}

          <ReasonDialog
            open={dialog === 'apply'}
            reason="none"
            title="Apply the name change?"
            description={`The account name changes from “${thread.user?.name}” to “${thread.requestedName}”. The user is emailed and the request is resolved.`}
            confirmLabel="Apply change"
            tone="success"
            onClose={() => setDialog(null)}
            onConfirm={async () => {
              const res = await api.post(`/admin/requests/${id}/apply-name`);
              setThread(res.thread);
              onChanged();
            }}
          />
          <ReasonDialog
            open={dialog === 'delete'}
            reason="none"
            tone="danger"
            title="Delete this request?"
            description="The conversation and any screenshots are removed permanently. An audit entry records the ids only."
            confirmLabel="Delete permanently"
            onClose={() => setDialog(null)}
            onConfirm={async () => {
              await api.delete(`/admin/requests/${id}`);
              onChanged('Request deleted.');
              onClose();
            }}
          />
        </>
      )}
    </SidePanel>
  );
}

// Start a conversation with any graduate or investor.
function NewMessagePanel({ onClose, onSent }) {
  const [search, setSearch] = useState('');
  const [found, setFound] = useState([]);
  const [to, setTo] = useState(null);
  const [form, setForm] = useState({ subject: '', message: '', category: 'other' });
  const [fields, setFields] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (search.trim().length < 2) return setFound([]);
    const t = setTimeout(() => {
      api
        .get(`/admin/requests/recipients${qs({ q: search.trim() })}`)
        .then((d) => setFound(d.users))
        .catch(() => setFound([]));
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  const send = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setFields({});
    try {
      const res = await api.post('/admin/requests', { userId: to.id, ...form });
      onSent(res.thread);
    } catch (err) {
      setFields(err.fields || {});
      setError(Object.keys(err.fields || {}).length ? '' : err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SidePanel title="New message" onClose={onClose}>
      <Messages error={error} />
      {!to ? (
        <>
          <Field label="To (graduate or investor)" htmlFor="n-to" help="Type at least 2 letters of a name or email.">
            <input id="n-to" className="adm-input" type="search" value={search} onChange={(e) => setSearch(e.target.value)} autoComplete="off" />
          </Field>
          <ul className="mt-2">
            {found.map((u) => (
              <li key={u.id}>
                <button type="button" className="adm-act" onClick={() => setTo(u)}>
                  {u.name}
                </button>{' '}
                <span className="adm-muted text-[12px]">
                  {u.email} · {ROLE[u.role]}
                </span>
              </li>
            ))}
            {search.trim().length >= 2 && found.length === 0 && <li className="adm-muted">No matching graduate or investor.</li>}
          </ul>
        </>
      ) : (
        <form className="space-y-3" onSubmit={send}>
          <p>
            To <strong>{to.name}</strong> <span className="adm-muted">({to.email})</span>{' '}
            <button type="button" className="adm-act" onClick={() => setTo(null)}>
              Change
            </button>
          </p>
          <Field label="Category" htmlFor="n-cat">
            <select id="n-cat" className="adm-input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {CATEGORIES.slice(1).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Subject" htmlFor="n-subject" error={fields.subject}>
            <input id="n-subject" className="adm-input" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} maxLength={200} required />
          </Field>
          <Field label="Message (emailed and shown on their Contact page)" htmlFor="n-message" error={fields.message}>
            <textarea id="n-message" rows={6} className="adm-field" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} maxLength={5000} required />
          </Field>
          <div className="flex justify-end">
            <button type="submit" className="adm-primary" disabled={busy}>
              {busy ? 'Sending…' : 'Send message'}
            </button>
          </div>
        </form>
      )}
    </SidePanel>
  );
}

// Requests inbox: help requests from graduates and investors.
export default function AdminRequests() {
  const [params, setParams] = useSearchParams();
  const status = STATUSES.some(([k]) => k === params.get('status')) ? params.get('status') : 'open';
  const category = CATEGORIES.some(([k]) => k === params.get('category')) ? params.get('category') : '';
  const open = params.get('id');
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [composing, setComposing] = useState(false);

  const load = useCallback(() => {
    api
      .get(`/admin/requests${qs({ status, category, q: search })}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [status, category, search]);
  useEffect(() => {
    document.title = 'Requests · ALU Ventures';
    setData(null);
    load();
  }, [load]);

  const setParam = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  };
  const statusOptions = STATUSES.map(([k, l]) => [k, l, k === 'all' ? null : (data?.counts?.[k] ?? null)]);

  const columns = [
    {
      key: 'subject',
      label: 'Subject',
      render: (t) => (
        <button type="button" className="adm-a text-left font-medium" onClick={() => setParam('id', String(t.id))}>
          {t.subject}
        </button>
      ),
    },
    {
      key: 'from',
      label: 'From',
      render: (t) => (
        <>
          {t.user?.name}
          <div className="adm-muted text-[12px]">{ROLE[t.user?.role] || t.user?.role}</div>
        </>
      ),
    },
    { key: 'category', label: 'Category', render: (t) => t.categoryLabel },
    { key: 'status', label: 'Status', render: (t) => <StatusPill status={t.status} /> },
    { key: 'last', label: 'Last message', render: (t) => formatDate(t.lastMessageAt, true) },
  ];

  return (
    <AdminPage title="Requests" meta={data ? `${data.threads.length} shown` : null}>
      <Messages notice={notice} error={error} />
      <ListLayout
        toolbar={
          <>
            <SearchInput value={q} onChange={setQ} onSubmit={() => setSearch(q.trim())} placeholder="Subject, name or email" />
            <StatusSelect value={status} options={statusOptions} onChange={(v) => setParam('status', v)} label="Show" />
            <button type="button" className="adm-primary" onClick={() => setComposing(true)}>
              New message
            </button>
          </>
        }
        filters={[
          { title: 'Status', value: status, onChange: (v) => setParam('status', v), options: statusOptions },
          { title: 'Category', value: category, onChange: (v) => setParam('category', v), options: CATEGORIES },
        ]}
      >
        {!data ? (
          <Loading />
        ) : (
          <DataTable
            columns={columns}
            rows={data.threads}
            actions={(t) => (
              <button type="button" className="adm-act" onClick={() => setParam('id', String(t.id))}>
                Open
              </button>
            )}
            empty="No requests."
          />
        )}
      </ListLayout>
      {open && (
        <ThreadPanel
          key={open}
          id={open}
          onClose={() => setParam('id', '')}
          onChanged={(message) => {
            if (typeof message === 'string') setNotice(message);
            load();
          }}
        />
      )}
      {composing && (
        <NewMessagePanel
          onClose={() => setComposing(false)}
          onSent={(t) => {
            setComposing(false);
            setNotice(`Message sent to ${t.user?.name}.`);
            load();
            setParam('id', String(t.id));
          }}
        />
      )}
    </AdminPage>
  );
}
