import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Paperclip, Plus } from 'lucide-react';
import { api } from '../lib/api';
import { Alert, EmptyState, Field, PageHeader, PageLoader, StatusPill, formatDate } from '../components/ui';

// Contact admin: requests to the ALU Ventures administrator as threads with
// replies from both sides. Users only ever see their own threads.
const MAX_SHOT = 5 * 1024 * 1024;

function ScreenshotInput({ id, file, onChange, error }) {
  return (
    <Field label="Screenshot (optional)" htmlFor={id} error={error} help="JPEG or PNG, up to 5 MB. Only you and the administrator can see it.">
      <input
        id={id}
        type="file"
        accept="image/jpeg,image/png"
        className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-subtle file:px-3 file:py-1.5 file:text-sm"
        onChange={(e) => onChange(e.target.files?.[0] || null)}
      />
      {file && <p className="mt-1 text-xs text-muted">{file.name}</p>}
    </Field>
  );
}

const checkShot = (file) => (file && (!['image/jpeg', 'image/png'].includes(file.type) || file.size > MAX_SHOT) ? 'Use a JPEG or PNG up to 5 MB.' : '');

function NewRequest({ categories, initialCategory, onCreated, onCancel }) {
  const [form, setForm] = useState({ category: initialCategory || '', subject: '', message: '', requestedName: '' });
  const [file, setFile] = useState(null);
  const [fields, setFields] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    const shot = checkShot(file);
    if (shot) return setFields({ screenshot: shot });
    setBusy(true);
    setError('');
    setFields({});
    try {
      const data = new FormData();
      data.append('category', form.category);
      data.append('subject', form.subject);
      data.append('message', form.message);
      if (form.category === 'profile' && form.requestedName.trim()) data.append('requestedName', form.requestedName);
      if (file) data.append('screenshot', file);
      const res = await api.upload('/support/threads', data);
      onCreated(res.thread);
    } catch (err) {
      setFields(err.fields || {});
      setError(Object.keys(err.fields || {}).length ? '' : err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card space-y-4 p-5" onSubmit={submit} noValidate>
      <h2 className="font-semibold">New request</h2>
      {error && <Alert type="error">{error}</Alert>}
      <Field label="Category" htmlFor="c-category" error={fields.category} required>
        <select id="c-category" className="input" value={form.category} onChange={set('category')} required>
          <option value="">Choose…</option>
          {categories.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </Field>
      {form.category === 'profile' && (
        <Field label="New full name (if you are asking for a name change)" htmlFor="c-name" error={fields.requestedName} help="The administrator checks and applies it. For an email change, explain in the message.">
          <input id="c-name" className="input" value={form.requestedName} onChange={set('requestedName')} maxLength={150} autoComplete="name" />
        </Field>
      )}
      <Field label="Subject" htmlFor="c-subject" error={fields.subject} required>
        <input id="c-subject" className="input" value={form.subject} onChange={set('subject')} maxLength={200} required />
      </Field>
      <Field label="Message" htmlFor="c-message" error={fields.message} required>
        <textarea id="c-message" rows={5} className="input" value={form.message} onChange={set('message')} maxLength={5000} required />
      </Field>
      <ScreenshotInput id="c-shot" file={file} onChange={setFile} error={fields.screenshot} />
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? 'Sending…' : 'Send request'}
        </button>
      </div>
    </form>
  );
}

function Thread({ id, onChanged }) {
  const [thread, setThread] = useState(null);
  const [error, setError] = useState('');
  const [reply, setReply] = useState('');
  const [file, setFile] = useState(null);
  const [fileKey, setFileKey] = useState(0);
  const [fieldError, setFieldError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setThread(null);
    setError('');
    api
      .get(`/support/threads/${id}`)
      .then((d) => setThread(d.thread))
      .catch((e) => setError(e.message));
  }, [id]);

  const send = async (e) => {
    e.preventDefault();
    const shot = checkShot(file);
    if (shot) return setFieldError(shot);
    setBusy(true);
    setFieldError('');
    setError('');
    try {
      const data = new FormData();
      data.append('message', reply);
      if (file) data.append('screenshot', file);
      const res = await api.upload(`/support/threads/${id}/messages`, data);
      setThread(res.thread);
      setReply('');
      setFile(null);
      setFileKey((k) => k + 1);
      onChanged();
    } catch (err) {
      setFieldError(err.fields?.message || err.fields?.screenshot || '');
      if (!err.fields?.message && !err.fields?.screenshot) setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (error && !thread) return <Alert type="error">{error}</Alert>;
  if (!thread) return <PageLoader />;
  return (
    <section className="card overflow-hidden">
      <header className="border-b border-line bg-subtle px-5 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-semibold">{thread.subject}</h2>
          <StatusPill status={thread.status} />
        </div>
        <p className="mt-0.5 text-xs text-muted">
          {thread.categoryLabel} · started {formatDate(thread.createdAt)}
          {thread.requestedName && ` · requested name: ${thread.requestedName}${thread.nameAppliedAt ? ' (applied)' : ''}`}
        </p>
      </header>
      <ol className="space-y-3 p-5" aria-label="Messages">
        {thread.messages.map((m) => (
          <li key={m.id} className={`rounded-lg p-3 text-sm ring-1 ring-line ${m.authorRole === 'admin' ? 'bg-accent-soft/60' : 'bg-surface'}`}>
            <p className="text-xs text-muted">
              <span className="font-semibold text-ink">{m.authorRole === 'admin' ? m.authorName : 'You'}</span> · {formatDate(m.createdAt, true)}
            </p>
            <p className="mt-1 whitespace-pre-line">{m.body}</p>
            {m.attachment && (
              <a href={`/api/support/attachments/${m.id}`} target="_blank" rel="noreferrer" className="mt-2 block w-fit">
                <img src={`/api/support/attachments/${m.id}`} alt={m.attachment.name} className="max-h-48 rounded ring-1 ring-line" loading="lazy" />
              </a>
            )}
          </li>
        ))}
      </ol>
      {thread.archived ? (
        <p className="border-t border-line px-5 py-3 text-sm text-muted">This request is archived. Start a new request if you need more help.</p>
      ) : (
        <form className="space-y-3 border-t border-line p-5" onSubmit={send}>
          {error && <Alert type="error">{error}</Alert>}
          <Field label="Reply" htmlFor="c-reply" error={fieldError}>
            <textarea id="c-reply" rows={3} className="input" value={reply} onChange={(e) => setReply(e.target.value)} maxLength={5000} required />
          </Field>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="inline-flex cursor-pointer items-center gap-1.5 text-sm text-muted hover:text-ink">
              <Paperclip className="h-4 w-4" aria-hidden="true" />
              <span>{file ? file.name : 'Attach a screenshot'}</span>
              <input key={fileKey} type="file" accept="image/jpeg,image/png" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </label>
            <button type="submit" className="btn-primary" disabled={busy || !reply.trim()}>
              {busy ? 'Sending…' : 'Send reply'}
            </button>
          </div>
          {thread.status === 'resolved' && <p className="text-xs text-muted">Replying reopens this request.</p>}
        </form>
      )}
    </section>
  );
}

export default function Contact() {
  const [params, setParams] = useSearchParams();
  const [threads, setThreads] = useState(null);
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState('');
  const selected = params.get('thread');
  const presetCategory = params.get('category');
  const composing = params.get('new') === '1' || Boolean(presetCategory);

  const load = useCallback(() => {
    api
      .get('/support/threads')
      .then((d) => setThreads(d.threads))
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    document.title = 'Contact admin · ALU Ventures';
    load();
    api
      .get('/support/categories')
      .then((d) => setCategories(d.categories))
      .catch(() => {});
  }, [load]);

  if (error) return <Alert type="error">{error}</Alert>;
  if (!threads) return <PageLoader />;

  return (
    <>
      <PageHeader
        title="Contact admin"
        description="Ask for help or a change to your profile. Replies arrive here and by email."
        actions={
          !composing && (
            <button type="button" className="btn-primary" onClick={() => setParams({ new: '1' })}>
              <Plus className="h-4 w-4" aria-hidden="true" /> New request
            </button>
          )
        }
      />
      <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <nav className="card h-fit overflow-hidden" aria-label="Your requests">
          {threads.length === 0 ? (
            <p className="p-4 text-sm text-muted">No requests yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {threads.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => setParams({ thread: String(t.id) })}
                    aria-current={String(t.id) === selected ? 'true' : undefined}
                    className={`block w-full px-4 py-3 text-left hover:bg-subtle ${String(t.id) === selected ? 'bg-accent-soft' : ''}`}
                  >
                    <span className="flex items-start justify-between gap-2">
                      <span className="min-w-0 truncate text-sm font-medium">{t.subject}</span>
                      <StatusPill status={t.status} />
                    </span>
                    <span className="mt-0.5 block text-xs text-muted">
                      {t.startedBy === 'admin' ? 'From the administrator · ' : ''}
                      {formatDate(t.lastMessageAt)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </nav>
        <div className="min-w-0">
          {composing ? (
            <NewRequest
              categories={categories}
              initialCategory={presetCategory}
              onCancel={() => setParams({})}
              onCreated={(t) => {
                load();
                setParams({ thread: String(t.id) });
              }}
            />
          ) : selected ? (
            <Thread key={selected} id={selected} onChanged={load} />
          ) : (
            <div className="card">
              <EmptyState title="Choose a request" action={<button type="button" className="btn-secondary" onClick={() => setParams({ new: '1' })}>New request</button>}>
                Select a request on the left to read and reply, or start a new one.
              </EmptyState>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
