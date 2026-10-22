import { useState } from 'react';
import { api } from '../lib/api';

// Staff record a participant's outcome (or correct a rejected one and resubmit).
// Either way it waits for administrator approval.
const OUTCOMES = [
  ['won', 'Won'],
  ['participated', 'Participated'],
  ['not_placed', 'Not placed'],
];

const fromResult = (r) =>
  r
    ? { outcome: r.outcome, awardTitle: r.awardTitle || '', amount: r.amount ?? '', currency: r.currency || '', resultDate: r.resultDate || '', notes: r.notes || '' }
    : { outcome: '', awardTitle: '', amount: '', currency: '', resultDate: '', notes: '' };

export default function ResultForm({ applicationId, rejected, onSaved, onCancel }) {
  const [form, setForm] = useState(() => fromResult(rejected));
  const [proof, setProof] = useState(null);
  const [fields, setFields] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((v) => ({ ...v, [k]: e.target.value }));
  const id = `r${applicationId}`;

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setFields({});
    try {
      const data = new FormData();
      Object.entries(form).forEach(([k, v]) => data.append(k, v));
      if (proof) data.append('proof', proof);
      if (rejected) await api.upload(`/staff/results/${rejected.id}`, data, 'PUT');
      else await api.upload(`/staff/applications/${applicationId}/result`, data);
      onSaved(rejected ? 'Result corrected and resubmitted for admin approval.' : 'Result recorded. It is pending admin approval.');
    } catch (err) {
      setFields(err.fields || {});
      setError(Object.keys(err.fields || {}).length ? '' : err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="space-y-3" onSubmit={save} noValidate>
      {error && <p className="adm-bad">{error}</p>}
      <fieldset>
        <legend className="adm-label">Outcome</legend>
        {OUTCOMES.map(([k, l]) => (
          <label key={k} className="mr-4 inline-flex items-center gap-1.5 py-0.5">
            <input type="radio" name={`${id}-outcome`} value={k} checked={form.outcome === k} onChange={set('outcome')} /> {l}
          </label>
        ))}
        {fields.outcome && <p className="adm-bad text-[12px]">{fields.outcome}</p>}
      </fieldset>
      <label className="block">
        <span className="adm-label">Prize or award title</span>
        <input className="adm-input" value={form.awardTitle} onChange={set('awardTitle')} maxLength={200} />
      </label>
      <div className="grid gap-3 sm:grid-cols-[1fr_6rem_10rem]">
        <label className="block">
          <span className="adm-label">Amount</span>
          <input className="adm-input" type="number" min="0" step="any" value={form.amount} onChange={set('amount')} />
          {fields.amount && <span className="adm-bad block text-[12px]">{fields.amount}</span>}
        </label>
        <label className="block">
          <span className="adm-label">Currency</span>
          <input className="adm-input uppercase" value={form.currency} onChange={set('currency')} maxLength={3} placeholder="RWF" />
          {fields.currency && <span className="adm-bad block text-[12px]">{fields.currency}</span>}
        </label>
        <label className="block">
          <span className="adm-label">Date</span>
          <input className="adm-input" type="date" value={form.resultDate} onChange={set('resultDate')} />
        </label>
      </div>
      <label className="block">
        <span className="adm-label">Notes</span>
        <textarea rows={3} className="adm-field" value={form.notes} onChange={set('notes')} maxLength={2000} />
      </label>
      <label className="block">
        <span className="adm-label">Proof (optional, private): PDF, PNG or JPEG up to 10 MB{rejected?.hasProof ? '. Leave empty to keep the current file.' : ''}</span>
        <input className="block text-[13px]" type="file" accept="application/pdf,image/png,image/jpeg" onChange={(e) => setProof(e.target.files?.[0] || null)} />
        {fields.proof && <span className="adm-bad block text-[12px]">{fields.proof}</span>}
      </label>
      <div className="flex gap-2">
        <button type="submit" className="adm-primary" disabled={busy || !form.outcome}>
          {busy ? 'Saving…' : rejected ? 'Resubmit for approval' : 'Submit for approval'}
        </button>
        {onCancel && (
          <button type="button" className="adm-secondary" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
