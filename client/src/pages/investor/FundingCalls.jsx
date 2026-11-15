import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { SECTORS } from '../../lib/constants';
import { Field, formatDate } from '../../components/ui';
import { Loading } from '../../components/admin';
import { EmptyNote } from '../../components/detail';

// An investor's funding calls: "We want to invest in agriculture, USD
// 5,000,000". Staff review each one; only the investor, staff and the
// administrator see it. An accepted call may become a competition.

export const CALL_TONE = {
  pending: 'border-line text-muted',
  accepted: 'border-line text-ink',
  published: 'border-accent text-accent',
  rejected: 'border-line text-muted',
};

export const money = (amount, currency) => `${currency} ${Number(amount).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

export function CallStatus({ call }) {
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[12px] font-medium ${CALL_TONE[call.status] || CALL_TONE.pending}`}>{call.statusLabel}</span>;
}

const EMPTY = { sector: '', amount: '', currency: 'USD', deadline: '', message: '' };

function CallForm({ onCreated, onCancel }) {
  const [v, setV] = useState(EMPTY);
  const [sectors, setSectors] = useState(SECTORS);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api
      .get('/public/sectors')
      .then((d) => d.sectors?.length && setSectors(d.sectors))
      .catch(() => {});
  }, []);
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setErrors({});
    try {
      await api.post('/funding-calls', v);
      setV(EMPTY);
      onCreated();
    } catch (err) {
      setErrors(err.fields || {});
      setError(err.fields ? '' : err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} noValidate className="space-y-4 border-t border-line p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Sector" htmlFor="fc-sector" error={errors.sector} required>
          <select id="fc-sector" className="input" value={v.sector} onChange={set('sector')}>
            <option value="">Choose a sector</option>
            {sectors.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="Deadline (optional)" htmlFor="fc-deadline" error={errors.deadline}>
          <input id="fc-deadline" type="date" className="input" value={v.deadline} onChange={set('deadline')} />
        </Field>
        <Field label="Amount available" htmlFor="fc-amount" error={errors.amount} required>
          <input id="fc-amount" type="number" min="1" step="any" inputMode="decimal" className="input" value={v.amount} onChange={set('amount')} />
        </Field>
        <Field label="Currency" htmlFor="fc-currency" error={errors.currency} help="Three letters, e.g. USD or RWF." required>
          <input id="fc-currency" className="input uppercase" maxLength={3} value={v.currency} onChange={set('currency')} />
        </Field>
      </div>
      <Field label="Message" htmlFor="fc-message" error={errors.message} help="What you want to fund and anything staff should know." required>
        <textarea id="fc-message" rows={4} maxLength={2000} className="input" value={v.message} onChange={set('message')} />
      </Field>
      {error && (
        <p className="text-[13px] text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="btn-primary min-h-11" disabled={busy}>
          {busy ? 'Submitting…' : 'Submit for review'}
        </button>
        <button type="button" className="btn-secondary min-h-11" onClick={onCancel}>
          Cancel
        </button>
      </div>
      <p className="text-[12px] text-muted">Only you and the ALU team see this call. Graduates do not see your name unless you agree with the ALU team to be named.</p>
    </form>
  );
}

export default function FundingCalls() {
  const [calls, setCalls] = useState(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const load = useCallback(() => {
    api
      .get('/funding-calls/mine')
      .then((d) => setCalls(d.calls))
      .catch((e) => (setError(e.message), setCalls([])));
  }, []);
  useEffect(load, [load]);

  return (
    <section className="rounded-xl border border-line bg-surface" aria-label="My funding calls">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div>
          <h2 className="!m-0 text-[16px] font-semibold text-ink">My funding calls</h2>
          <p className="mt-0.5 text-[13px] text-muted">Tell the ALU team what you want to fund. Staff review each call.</p>
        </div>
        {!open && (
          <button type="button" className="btn-primary min-h-11" onClick={() => (setOpen(true), setNotice(''))}>
            New funding call
          </button>
        )}
      </div>
      {open && (
        <CallForm
          onCreated={() => {
            setOpen(false);
            setNotice('Submitted. Staff will review it and you will get an email with their decision.');
            load();
          }}
          onCancel={() => setOpen(false)}
        />
      )}
      {notice && (
        <p className="border-t border-line px-5 py-3 text-[13px] text-ink" role="status">
          {notice}
        </p>
      )}
      {error && <p className="px-5 pb-3 text-[13px] text-red-600 dark:text-red-400">{error}</p>}
      <div className="border-t border-line">
        {!calls ? (
          <Loading />
        ) : calls.length === 0 ? (
          <div className="p-5">
            <EmptyNote>No funding calls yet.</EmptyNote>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {calls.map((c) => (
              <li key={c.id} className="px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[15px] font-semibold text-ink">
                      {c.sector} · {money(c.amount, c.currency)}
                    </p>
                    <p className="text-[12px] text-muted">
                      Submitted {formatDate(c.createdAt)}
                      {c.deadline ? ` · Deadline ${formatDate(c.deadline)}` : ''}
                    </p>
                  </div>
                  <CallStatus call={c} />
                </div>
                <p className="mt-2 whitespace-pre-line break-words text-[14px] leading-[1.55] text-ink">{c.message}</p>
                {c.decisionReason && (
                  <p className="mt-2 text-[13px] text-muted">
                    {c.status === 'rejected' ? 'Reason: ' : 'Note from the ALU team: '}
                    {c.decisionReason}
                  </p>
                )}
                {c.opportunity?.public && (
                  <Link to={`/opportunities/${c.opportunity.id}`} className="mt-2 inline-flex min-h-11 items-center text-[13px] font-semibold text-accent hover:underline lg:min-h-0">
                    View the competition
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
