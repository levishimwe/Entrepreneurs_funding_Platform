import { useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { formatDate } from '../../components/ui';
import ReasonDialog from '../../components/ReasonDialog';
import { Pill } from '../../components/admin';
import { InfoCard } from '../../components/detail';

// Automatic selection: preview (changes nothing), then Confirm. It uses only
// the eligibility criteria and the number of places on the opportunity, and
// application time for ties. Motivation texts are shown, never scored.

const TONE = { selected: 'success', not_selected: 'neutral', over_capacity: 'warning', decided: 'neutral' };
const FILTERS = [
  ['all', 'All'],
  ['selected', 'Selected'],
  ['not_selected', 'Not selected'],
  ['over_capacity', 'Over capacity'],
  ['decided', 'Already decided'],
];

function Checks({ checks }) {
  return (
    <ul className="space-y-0.5 text-[12px]">
      {checks.map((c) => (
        <li key={c.id} className={c.passed ? 'text-muted' : 'text-ink'}>
          <span aria-hidden="true">{c.passed ? '✓ ' : '✗ '}</span>
          <span className="sr-only">{c.passed ? 'Passed: ' : 'Failed: '}</span>
          {c.label}: {c.detail}
        </li>
      ))}
    </ul>
  );
}

function Row({ r, choice, onChoice }) {
  const [open, setOpen] = useState(false);
  const canChoose = r.eligible && (r.proposed === 'selected' || r.proposed === 'over_capacity');
  const effective = canChoose ? choice : r.proposed;
  return (
    <li className="space-y-2 px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[14px] font-semibold text-ink">{r.applicant.name}</p>
          <p className="text-[13px] text-muted">
            {r.project.title} · {r.project.sector} · {r.project.stage}
          </p>
          <p className="text-[12px] text-muted">
            Applied {formatDate(r.submittedAt, true)}
            {r.rank ? ` · position ${r.rank}` : ''}
          </p>
        </div>
        <Pill tone={TONE[effective]}>{effective === r.proposed ? r.proposedLabel : effective === 'selected' ? 'Selected by staff' : 'Left for staff decision'}</Pill>
      </div>
      <Checks checks={r.checks} />
      <p className="text-[13px] text-ink">{r.reason}</p>
      {canChoose && (
        <label className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
          Result on confirm
          <select className="input w-full sm:w-auto" value={choice} onChange={(e) => onChoice(e.target.value)}>
            <option value="selected">Selected</option>
            <option value="over_capacity">Leave for staff decision</option>
          </select>
        </label>
      )}
      <button type="button" className="min-h-11 text-[13px] font-semibold text-accent hover:underline lg:min-h-0" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {open ? 'Hide motivation' : 'Show motivation'}
      </button>
      {open && <p className="whitespace-pre-line break-words rounded-md border border-line bg-subtle p-3 text-[13px] leading-[1.55] text-ink">{r.motivation}</p>}
    </li>
  );
}

export default function SelectionPreview({ opportunity, onConfirmed }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('all');
  const [choices, setChoices] = useState({});
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState('');

  const load = async () => {
    setBusy(true);
    setError('');
    try {
      const d = await api.get(`/staff/opportunities/${opportunity.id}/selection`);
      setData(d);
      setChoices(Object.fromEntries(d.rows.filter((r) => r.eligible && ['selected', 'over_capacity'].includes(r.proposed)).map((r) => [r.applicationId, r.proposed])));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const rows = useMemo(() => (data ? data.rows.filter((r) => filter === 'all' || r.proposed === filter) : []), [data, filter]);
  const chosen = data ? data.rows.filter((r) => (choices[r.applicationId] ?? r.proposed) === 'selected').length : 0;
  const changed = data ? Object.fromEntries(Object.entries(choices).filter(([id, v]) => data.rows.find((r) => r.applicationId === Number(id))?.proposed !== v)) : {};
  const notSelected = data ? data.rows.filter((r) => r.proposed === 'not_selected').length : 0;
  const waiting = data ? data.rows.filter((r) => (choices[r.applicationId] ?? r.proposed) === 'over_capacity').length : 0;

  return (
    <InfoCard
      title="Automatic selection"
      meta={
        <span>
          {opportunity.capacity ? `${opportunity.capacity} places` : 'No limit on places'}
          {opportunity.readyForSelection ? ' · Ready for selection' : ''}
        </span>
      }
    >
      <div className="space-y-4">
        <p className="text-[13px] leading-[1.55] text-muted">
          Checks each application against this opportunity&apos;s criteria (sectors, project type, stage, graduating cohort). Eligible applicants are selected up to the number of places, earliest application first; anyone over that is left for your decision. Nothing changes and nobody is emailed until you confirm.
        </p>
        {notice && (
          <p className="text-[13px] text-ink" role="status">
            {notice}
          </p>
        )}
        {error && (
          <p className="text-[13px] text-red-600 dark:text-red-400" role="alert">
            {error}
          </p>
        )}
        <button type="button" className="adm-secondary" disabled={busy} onClick={load}>
          {busy ? 'Checking…' : data ? 'Refresh preview' : 'Preview selection'}
        </button>
        {data && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[13px] text-ink">
                {chosen} selected{data.capacity ? ` of ${data.placesLeft} places left` : ''} · {notSelected} not selected · {waiting} left for staff
                {data.alreadySelected ? ` · ${data.alreadySelected} already selected earlier` : ''}
              </p>
              <label className="flex items-center gap-2 text-[13px] text-muted">
                Show
                <select className="input w-auto" value={filter} onChange={(e) => setFilter(e.target.value)}>
                  {FILTERS.map(([k, l]) => (
                    <option key={k} value={k}>
                      {l} ({k === 'all' ? data.rows.length : data.counts[k]})
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {data.capacity && chosen > data.placesLeft && <p className="text-[13px] text-ink">You have chosen more applicants than there are places left.</p>}
            <ul className="divide-y divide-line rounded-md border border-line">
              {rows.length === 0 && <li className="p-4 text-[13px] text-muted">No applications in this view.</li>}
              {rows.map((r) => (
                <Row key={r.applicationId} r={r} choice={choices[r.applicationId]} onChoice={(v) => setChoices((c) => ({ ...c, [r.applicationId]: v }))} />
              ))}
            </ul>
            {data.canConfirm ? (
              <button type="button" className="adm-primary" disabled={busy} onClick={() => setConfirming(true)}>
                Confirm selection
              </button>
            ) : (
              <p className="text-[13px] text-muted">Applications are open until {formatDate(opportunity.deadline, true)}. You can confirm the selection after the deadline.</p>
            )}
          </>
        )}
      </div>
      <ReasonDialog
        open={confirming}
        reason="none"
        title="Confirm the selection?"
        description={`${chosen} will be selected and ${notSelected} not selected, each emailed with the reason (selected applicants also get the application instructions). ${waiting} stay undecided for you. Results already decided are not changed.`}
        confirmLabel="Confirm and email"
        onClose={() => setConfirming(false)}
        onConfirm={async () => {
          const res = await api.post(`/staff/opportunities/${opportunity.id}/selection/confirm`, { choices: changed });
          setNotice(`${res.selected} selected and ${res.notSelected} not selected. The applicants are being emailed.`);
          setData(null);
          onConfirmed();
        }}
      />
    </InfoCard>
  );
}
