import { useState } from 'react';
import { SECTORS, STAGES } from '../lib/constants';
import { Alert, Field } from './ui';

const toLocalInput = (d) => {
  if (!d) return '';
  const date = new Date(d);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

const EMPTY = {
  title: '',
  type: 'hackathon',
  organiser: '',
  description: '',
  applicationInstructions: '',
  prize: '',
  deadline: '',
  criteria: { sectors: [], projectTypes: [], stages: [], minCohortYear: '', maxCohortYear: '', notes: '' },
};

function Chips({ options, value, onChange, label }) {
  return (
    <fieldset>
      <legend className="label">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map(([v, l]) => {
          const on = value.includes(v);
          return (
            <button
              key={v}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(on ? value.filter((x) => x !== v) : [...value, v])}
              className={`rounded-full border px-2.5 py-1 text-xs ${on ? 'border-accent bg-accent-soft text-accent' : 'border-line text-muted hover:text-ink'}`}
            >
              {l}
            </button>
          );
        })}
      </div>
      <p className="help">Leave empty to accept all.</p>
    </fieldset>
  );
}

// Shared by the administrator (publishes directly) and staff (proposals).
export default function OpportunityForm({ initial, submitLabel, onSubmit, onCancel }) {
  const [v, setV] = useState(() => {
    if (!initial) return EMPTY;
    return {
      ...EMPTY,
      ...initial,
      organiser: initial.organiser || '',
      applicationInstructions: initial.applicationInstructions || '',
      prize: initial.prize || '',
      deadline: toLocalInput(initial.deadline),
      criteria: { ...EMPTY.criteria, ...initial.criteria, minCohortYear: initial.criteria?.minCohortYear || '', maxCohortYear: initial.criteria?.maxCohortYear || '' },
    };
  });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setV((s) => ({ ...s, [k]: e.target.value }));
  const setC = (k, value) => setV((s) => ({ ...s, criteria: { ...s.criteria, [k]: value } }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setErrors({});
    try {
      await onSubmit({
        ...v,
        deadline: v.deadline ? new Date(v.deadline).toISOString() : '',
        criteria: {
          ...v.criteria,
          minCohortYear: v.criteria.minCohortYear ? Number(v.criteria.minCohortYear) : null,
          maxCohortYear: v.criteria.maxCohortYear ? Number(v.criteria.maxCohortYear) : null,
        },
      });
    } catch (err) {
      setError(err.message);
      setErrors(err.fields || {});
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {error && <Alert type="error">{error}</Alert>}
      <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
        <Field label="Title" htmlFor="o-title" required error={errors.title}>
          <input id="o-title" className="input" value={v.title} onChange={set('title')} />
        </Field>
        <Field label="Type" htmlFor="o-type" required error={errors.type}>
          <select id="o-type" className="input" value={v.type} onChange={set('type')}>
            <option value="hackathon">Hackathon</option>
            <option value="grant">Grant</option>
            <option value="competition">Competition</option>
            <option value="other">Other</option>
          </select>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Organiser / sponsoring partner" htmlFor="o-org" error={errors.organiser}>
          <input id="o-org" className="input" value={v.organiser} onChange={set('organiser')} />
        </Field>
        <Field label="Deadline" htmlFor="o-deadline" required error={errors.deadline}>
          <input id="o-deadline" type="datetime-local" className="input" value={v.deadline} onChange={set('deadline')} />
        </Field>
      </div>
      <Field label="Description" htmlFor="o-desc" required error={errors.description}>
        <textarea id="o-desc" rows={4} className="input" value={v.description} onChange={set('description')} />
      </Field>
      <Field label="Application instructions" htmlFor="o-instr" error={errors.applicationInstructions} help="Included in the email sent to selected applicants.">
        <textarea id="o-instr" rows={2} className="input" value={v.applicationInstructions} onChange={set('applicationInstructions')} />
      </Field>
      <div className="rounded-md border border-line p-4">
        <p className="mb-3 text-sm font-semibold">Eligibility criteria</p>
        <div className="space-y-4">
          <Chips label="Sectors" options={SECTORS.map((s) => [s, s])} value={v.criteria.sectors} onChange={(x) => setC('sectors', x)} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Chips label="Project type" options={[['company', 'Registered company'], ['idea', 'Idea stage']]} value={v.criteria.projectTypes} onChange={(x) => setC('projectTypes', x)} />
            <Chips label="Stage" options={STAGES.map((s) => [s, s])} value={v.criteria.stages} onChange={(x) => setC('stages', x)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Earliest graduating cohort" htmlFor="o-min" error={errors['criteria.minCohortYear']}>
              <input id="o-min" type="number" className="input" value={v.criteria.minCohortYear} onChange={(e) => setC('minCohortYear', e.target.value)} />
            </Field>
            <Field label="Latest graduating cohort" htmlFor="o-max" error={errors['criteria.maxCohortYear']}>
              <input id="o-max" type="number" className="input" value={v.criteria.maxCohortYear} onChange={(e) => setC('maxCohortYear', e.target.value)} />
            </Field>
          </div>
          <Field label="Other requirements (shown to applicants)" htmlFor="o-notes">
            <textarea id="o-notes" rows={2} className="input" value={v.criteria.notes} onChange={(e) => setC('notes', e.target.value)} />
          </Field>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        {onCancel && (
          <button type="button" className="btn-secondary" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  );
}

export function CriteriaSummary({ criteria = {} }) {
  const parts = [];
  if (criteria.sectors?.length) parts.push(`Sectors: ${criteria.sectors.join(', ')}`);
  if (criteria.projectTypes?.length) parts.push(criteria.projectTypes.map((t) => (t === 'company' ? 'Registered companies' : 'Ideas')).join(' & '));
  if (criteria.stages?.length) parts.push(`Stages: ${criteria.stages.join(', ')}`);
  if (criteria.minCohortYear || criteria.maxCohortYear) parts.push(`Cohorts ${criteria.minCohortYear || '…'}–${criteria.maxCohortYear || '…'}`);
  return (
    <div className="text-xs text-muted">
      <p>{parts.length ? parts.join(' · ') : 'Open to all approved graduate projects'}</p>
      {criteria.notes && <p className="mt-0.5">{criteria.notes}</p>}
    </div>
  );
}
