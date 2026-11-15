import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { Field, formatDate } from '../../components/ui';
import ReasonDialog from '../../components/ReasonDialog';
import { AdminPage, DataTable, Loading, Messages, Pill, SidePanel } from '../../components/admin';
import { InfoCard } from '../../components/detail';
import { BATCH_TONE, FormatHelp, FormattedText, MessageComposer, QuotaNote, useQuota } from '../../components/messaging';

const STATUS_TONE = { Published: 'success', Emailed: 'info', Unpublished: 'neutral', Removed: 'neutral' };

function PublicForm({ initial, submitLabel, onSubmit, onCancel }) {
  const [title, setTitle] = useState(initial?.title || '');
  const [body, setBody] = useState(initial?.body || '');
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await onSubmit({ title: title.trim(), body: body.trim() });
      if (!initial) {
        setTitle('');
        setBody('');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Field label="Title" htmlFor="an-title" required>
        <input id="an-title" className="input" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <div>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <label htmlFor="an-body" className="label !mb-0">
            Announcement
          </label>
          <button type="button" className="min-h-11 text-[13px] font-semibold text-accent hover:underline lg:min-h-9" onClick={() => setPreview((p) => !p)} aria-pressed={preview}>
            {preview ? 'Edit' : 'Preview'}
          </button>
        </div>
        {preview ? (
          <div className="min-h-[160px] rounded-md border border-line bg-surface p-4 text-[14px] leading-[1.6] text-ink">
            <p className="mb-2 font-semibold">{title || 'Untitled'}</p>
            <FormattedText text={body} />
          </div>
        ) : (
          <textarea id="an-body" rows={7} className="input" maxLength={10000} value={body} onChange={(e) => setBody(e.target.value)} />
        )}
        <FormatHelp />
      </div>
      <p className="text-[12px] text-muted">Public announcements appear on the home page and the Announcements page for anyone, without signing in. Do not include personal contact details.</p>
      {error && (
        <p className="text-[13px] text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="btn-primary min-h-11" disabled={busy}>
          {busy ? 'Saving…' : submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="btn-secondary min-h-11" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

// Staff and administrators: public announcements for the home page, and
// private ones emailed to a chosen audience (Send message service).
export default function Announcements() {
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [visibility, setVisibility] = useState('public');
  const [editing, setEditing] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [busy, setBusy] = useState(false);
  const [quota, loadQuota] = useQuota();

  const load = useCallback(() => {
    api
      .get('/announcements')
      .then((d) => setList(d.announcements))
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    document.title = 'Announcements · ALU Ventures';
    load();
  }, [load]);

  const act = async (a, action, message) => {
    setError('');
    try {
      await api.post(`/announcements/${a.id}/${action}`);
      setNotice(message);
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <AdminPage title="Announcements">
      <Messages notice={notice} error={error} />
      <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <InfoCard title="New announcement">
          <fieldset className="mb-5">
            <legend className="label">Visibility</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {[
                ['public', 'Public', 'Shown on the home page. No sign-in needed.'],
                ['private', 'Private', 'Never on the home page. Emailed to the people you choose.'],
              ].map(([k, l, help]) => (
                <label key={k} className={`flex min-h-11 cursor-pointer gap-2 rounded-md border p-3 ${visibility === k ? 'border-accent bg-accent-soft' : 'border-line'}`}>
                  <input type="radio" name="visibility" value={k} checked={visibility === k} onChange={() => setVisibility(k)} className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    <span className="block text-[14px] font-medium text-ink">{l}</span>
                    <span className="block text-[12px] text-muted">{help}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          {visibility === 'public' ? (
            <PublicForm
              submitLabel="Publish"
              onSubmit={async (data) => {
                await api.post('/announcements', { ...data, visibility: 'public' });
                setNotice('Published on the home page.');
                load();
              }}
            />
          ) : (
            <MessageComposer
              subjectLabel="Title"
              submitLabel="Review and email"
              busy={busy}
              intro={<QuotaNote quota={quota} />}
              onSend={async ({ subject, ...rest }) => {
                setBusy(true);
                try {
                  const res = await api.post('/announcements', { ...rest, title: subject, visibility: 'private' });
                  setNotice(`Queued for ${res.recipients} ${res.recipients === 1 ? 'person' : 'people'}.`);
                  load();
                  loadQuota();
                } finally {
                  setBusy(false);
                }
              }}
            />
          )}
        </InfoCard>
        <section aria-label="Your announcements" className="min-w-0">
          <h2 className="mb-3 text-[15px] font-semibold text-ink">Announcements</h2>
          {!list ? (
            <Loading />
          ) : (
            <DataTable
              rows={list}
              empty="No announcements yet."
              columns={[
                { key: 'title', label: 'Title', render: (a) => <span className="font-medium">{a.title}</span> },
                { key: 'visibility', label: 'Visibility', render: (a) => (a.visibility === 'public' ? 'Public' : 'Private') },
                { key: 'status', label: 'Status', render: (a) => <Pill tone={STATUS_TONE[a.statusLabel]}>{a.statusLabel}</Pill> },
                {
                  key: 'delivery',
                  label: 'Recipients',
                  render: (a) =>
                    a.message ? (
                      <span>
                        {a.message.recipientCount} · <Pill tone={BATCH_TONE[a.message.status]}>{a.message.statusLabel}</Pill>
                      </span>
                    ) : (
                      '—'
                    ),
                },
                { key: 'date', label: 'Date', render: (a) => formatDate(a.publishedAt, true) },
              ]}
              actions={(a) =>
                a.status === 'removed' ? null : (
                  <span className="flex flex-wrap gap-1">
                    {a.visibility === 'public' && (
                      <>
                        <button type="button" className="adm-act" onClick={() => setEditing(a)}>
                          Edit
                        </button>
                        {a.status === 'published' ? (
                          <button type="button" className="adm-act" onClick={() => act(a, 'unpublish', 'Unpublished: it is no longer on the home page.')}>
                            Unpublish
                          </button>
                        ) : (
                          <button type="button" className="adm-act" onClick={() => act(a, 'publish', 'Published on the home page.')}>
                            Publish
                          </button>
                        )}
                      </>
                    )}
                    <button type="button" className="adm-act adm-act-danger" onClick={() => setRemoving(a)}>
                      Remove
                    </button>
                  </span>
                )
              }
            />
          )}
        </section>
      </div>
      {editing && (
        <SidePanel title="Edit announcement" onClose={() => setEditing(null)}>
          <PublicForm
            initial={editing}
            submitLabel="Save"
            onCancel={() => setEditing(null)}
            onSubmit={async (data) => {
              await api.patch(`/announcements/${editing.id}`, data);
              setEditing(null);
              setNotice('Saved.');
              load();
            }}
          />
        </SidePanel>
      )}
      <ReasonDialog
        open={Boolean(removing)}
        reason="none"
        tone="danger"
        title="Remove this announcement?"
        description={removing?.visibility === 'private' ? 'It leaves this list. Emails already sent cannot be recalled.' : 'It leaves the home page and this list. The record is kept.'}
        confirmLabel="Remove"
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          await api.post(`/announcements/${removing.id}/remove`);
          setNotice('Removed.');
          load();
        }}
      />
    </AdminPage>
  );
}
