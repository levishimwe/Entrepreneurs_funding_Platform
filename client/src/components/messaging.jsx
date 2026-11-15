import { Fragment, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Field } from './ui';

// Shared by Send message and private announcements: the audience picker, the
// formatted preview and today's sending allowance. The server
// (services/bulkMail.js) decides who may receive and enforces every rule.

export const AUDIENCES = [
  ['graduates', 'All graduates', 'Approved, active graduate accounts.'],
  ['investors', 'All investors and sponsors', 'Approved, active investor and sponsor accounts.'],
  ['selected', 'Selected people', 'Search and tick the people who should receive it.'],
];

// Same rules as the email: blank line = paragraph, "- " lines = list, **bold**.
function inline(text) {
  return text.split(/(\*\*.+?\*\*)/g).map((part, i) => (/^\*\*.+\*\*$/.test(part) ? <strong key={i}>{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>));
}
export function FormattedText({ text }) {
  const blocks = String(text || '')
    .replace(/\r\n/g, '\n')
    .trim()
    .split(/\n\s*\n/)
    .filter(Boolean);
  if (!blocks.length) return <p className="text-muted">Nothing written yet.</p>;
  return blocks.map((block, i) => {
    const lines = block.split('\n');
    if (lines.every((l) => /^\s*-\s+/.test(l))) {
      return (
        <ul key={i} className="mb-3 list-disc pl-5">
          {lines.map((l, j) => (
            <li key={j}>{inline(l.replace(/^\s*-\s+/, ''))}</li>
          ))}
        </ul>
      );
    }
    return (
      <p key={i} className="mb-3 break-words">
        {lines.map((l, j) => (
          <Fragment key={j}>
            {j > 0 && <br />}
            {inline(l)}
          </Fragment>
        ))}
      </p>
    );
  });
}

export function FormatHelp() {
  return <p className="help">Plain text. Leave a blank line between paragraphs, start lines with “- ” for a list, and wrap words in **two stars** for bold.</p>;
}

/** Today's allowance from GET /messages/quota. */
export function useQuota() {
  const [quota, setQuota] = useState(null);
  const load = () =>
    api
      .get('/messages/quota')
      .then(setQuota)
      .catch(() => setQuota(null));
  useEffect(() => {
    load();
  }, []);
  return [quota, load];
}

export function QuotaNote({ quota }) {
  if (!quota) return null;
  return (
    <p className="text-[13px] text-muted">
      {quota.remainingToday} of {quota.limit} emails can still be sent today. Anything over that is queued and sent the next day.
    </p>
  );
}

function PeoplePicker({ value, onChange }) {
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [people, setPeople] = useState([]);
  const [known, setKnown] = useState({});
  useEffect(() => {
    const t = setTimeout(() => {
      api
        .get(`/messages/people?q=${encodeURIComponent(q)}&role=${role}`)
        .then((d) => {
          setPeople(d.people);
          setKnown((k) => ({ ...k, ...Object.fromEntries(d.people.map((p) => [p.id, p])) }));
        })
        .catch(() => setPeople([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q, role]);
  const toggle = (id) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);

  return (
    <div className="space-y-3 rounded-md border border-line p-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <input className="input" type="search" placeholder="Search by name" aria-label="Search people by name" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input" aria-label="Role" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="">Graduates and investors</option>
          <option value="graduate">Graduates</option>
          <option value="investor">Investors and sponsors</option>
        </select>
      </div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5" aria-label="Selected people">
          {value.map((id) => (
            <button key={id} type="button" onClick={() => toggle(id)} className="min-h-9 rounded-full border border-line px-2.5 text-xs text-ink hover:bg-subtle" aria-label={`Remove ${known[id]?.name || 'person'}`}>
              {known[id]?.name || `Person ${id}`} ×
            </button>
          ))}
        </div>
      )}
      <ul className="max-h-64 divide-y divide-line overflow-y-auto rounded-md border border-line">
        {people.length === 0 && <li className="p-3 text-[13px] text-muted">Nobody matches.</li>}
        {people.map((p) => (
          <li key={p.id}>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 hover:bg-subtle">
              <input type="checkbox" checked={value.includes(p.id)} onChange={() => toggle(p.id)} className="h-4 w-4 shrink-0" />
              <span className="min-w-0">
                <span className="block truncate text-[14px] text-ink">{p.name}</span>
                <span className="block truncate text-[12px] text-muted">{[p.role === 'graduate' ? 'Graduate' : 'Investor or sponsor', p.detail].filter(Boolean).join(' · ')}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AudiencePicker({ audience, userIds, onChange }) {
  return (
    <fieldset className="space-y-3">
      <legend className="label">Who receives it</legend>
      <div className="grid gap-2 sm:grid-cols-3">
        {AUDIENCES.map(([key, label, help]) => (
          <label key={key} className={`flex min-h-11 cursor-pointer gap-2 rounded-md border p-3 ${audience === key ? 'border-accent bg-accent-soft' : 'border-line'}`}>
            <input type="radio" name="audience" value={key} checked={audience === key} onChange={() => onChange({ audience: key, userIds })} className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <span className="block text-[14px] font-medium text-ink">{label}</span>
              <span className="block text-[12px] text-muted">{help}</span>
            </span>
          </label>
        ))}
      </div>
      {audience === 'selected' && <PeoplePicker value={userIds} onChange={(ids) => onChange({ audience, userIds: ids })} />}
    </fieldset>
  );
}

/** Subject, body, preview and audience, then a confirm step showing the count. */
export function MessageComposer({ subjectLabel = 'Subject', submitLabel = 'Review and send', onSend, busy, intro }) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [aud, setAud] = useState({ audience: 'graduates', userIds: [] });
  const [tab, setTab] = useState('write');
  const [plan, setPlan] = useState(null);
  const [error, setError] = useState('');

  const review = async (e) => {
    e.preventDefault();
    setError('');
    if (subject.trim().length < 3) return setError(`Write a ${subjectLabel.toLowerCase()} (at least 3 characters).`);
    if (body.trim().length < 10) return setError('Write the message (at least 10 characters).');
    if (aud.audience === 'selected' && !aud.userIds.length) return setError('Tick at least one person.');
    try {
      setPlan(await api.post('/messages/audience', aud));
    } catch (err) {
      setError(err.message);
    }
  };
  const send = async () => {
    setError('');
    try {
      await onSend({ subject: subject.trim(), body: body.trim(), ...aud, confirm: true });
      setSubject('');
      setBody('');
      setAud({ audience: 'graduates', userIds: [] });
      setPlan(null);
    } catch (err) {
      setError(err.message);
      setPlan(null);
    }
  };

  return (
    <form onSubmit={review} className="space-y-5">
      {intro}
      <Field label={subjectLabel} htmlFor="msg-subject" required>
        <input id="msg-subject" className="input" maxLength={200} value={subject} onChange={(e) => setSubject(e.target.value)} />
      </Field>
      <div>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <label htmlFor="msg-body" className="label !mb-0">
            Message
          </label>
          <div className="flex rounded-md border border-line p-0.5 text-[13px]" role="tablist" aria-label="Write or preview">
            {['write', 'preview'].map((t) => (
              <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`min-h-11 rounded px-3 lg:min-h-9 ${tab === t ? 'bg-subtle font-medium text-ink' : 'text-muted'}`}>
                {t === 'write' ? 'Write' : 'Preview'}
              </button>
            ))}
          </div>
        </div>
        {tab === 'write' ? (
          <textarea id="msg-body" rows={9} className="input" maxLength={10000} value={body} onChange={(e) => setBody(e.target.value)} />
        ) : (
          <div className="min-h-[200px] rounded-md border border-line bg-surface p-4 text-[14px] leading-[1.6] text-ink" aria-live="polite">
            <p className="mb-3 text-muted">Hello [name],</p>
            <FormattedText text={body} />
          </div>
        )}
        <FormatHelp />
      </div>
      <AudiencePicker audience={aud.audience} userIds={aud.userIds} onChange={(v) => (setAud(v), setPlan(null))} />
      {error && (
        <p className="text-[13px] text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}
      {plan ? (
        <div className="card space-y-3 p-4" role="region" aria-label="Confirm sending">
          <p className="text-[14px] text-ink">
            {plan.recipients === 0 ? (
              'Nobody in this audience can receive email (approved, active accounts only).'
            ) : (
              <>
                This will be emailed to <strong>{plan.recipients}</strong> {plan.recipients === 1 ? 'person' : 'people'}.
                {plan.later > 0 ? ` ${plan.sendToday} go today; ${plan.later} wait for the next day because of the daily limit.` : ' All of them go today.'}
              </>
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            {plan.recipients > 0 && (
              <button type="button" className="btn-primary min-h-11" disabled={busy} onClick={send}>
                {busy ? 'Sending…' : `Send to ${plan.recipients}`}
              </button>
            )}
            <button type="button" className="btn-secondary min-h-11" onClick={() => setPlan(null)}>
              Back to editing
            </button>
          </div>
        </div>
      ) : (
        <button type="submit" className="btn-primary min-h-11">
          {submitLabel}
        </button>
      )}
    </form>
  );
}

export const BATCH_TONE = { queued: 'neutral', sending: 'info', sent: 'success', partly_failed: 'warning' };
