import { History } from 'lucide-react';

const VERB = {
  'opportunity.proposed': 'submitted opportunity',
  'opportunity.edited': 'edited opportunity',
  'opportunity.published': 'published opportunity',
  'opportunity.closed': 'closed applications for',
  'opportunity.archived': 'archived opportunity',
  'application.submitted': 'received application from',
  'application.shortlisted': 'altered status for',
  'application.selected': 'altered status for',
  'application.not_selected': 'altered status for',
};
const RESULT = {
  'application.shortlisted': 'SHORTLISTED',
  'application.selected': 'SELECTED',
  'application.not_selected': 'NOT_SELECTED',
};

// "KWIZERA, S." style, as in the Figma governance log.
function surnameFirst(name = '') {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return name.toUpperCase();
  const last = parts.pop();
  return `${last.toUpperCase()}, ${parts[0][0].toUpperCase()}.`;
}

const utcTime = (d) => new Date(d).toISOString().slice(11, 19);
const utcDate = (d) => new Date(d).toISOString().slice(0, 10);

// Governance audit log (FR10): who did what, to whom, when, and why.
export default function AuditStrip({ title = 'Staff Selection Governance Audit Log', note, entries }) {
  return (
    <section className="card mt-6 bg-subtle" aria-label={title}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <History className="h-4 w-4 text-muted" aria-hidden="true" /> {title}
        </h2>
        {note && <span className="text-xs text-muted">{note}</span>}
      </div>
      {!entries ? (
        <p className="px-4 py-3 font-mono text-xs text-muted">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="px-4 py-3 font-mono text-xs text-muted">No recorded actions yet.</p>
      ) : (
        <ul className="divide-y divide-line font-mono text-xs">
          {entries.map((e) => (
            <li key={e.id} className="flex flex-col gap-0.5 px-4 py-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
              <span className="min-w-0">
                <span className="text-muted" title={utcDate(e.at)}>
                  [{utcDate(e.at)} {utcTime(e.at)} UTC]
                </span>{' '}
                <span className="text-ink">{e.actor?.email || 'system'}</span> <span className="text-muted">{VERB[e.action] || e.action}</span>{' '}
                <span className="font-semibold text-ink">
                  {e.entityType === 'application' ? surnameFirst(e.subject || 'applicant') : e.subject}
                </span>
                {RESULT[e.action] && (
                  <span className={e.action === 'application.not_selected' ? 'text-red-600 dark:text-red-400' : 'text-green-700 dark:text-green-400'}>
                    {' '}
                    -&gt; {RESULT[e.action]}
                  </span>
                )}
                {e.reason && <span className="block truncate text-muted">  rationale: “{e.reason}”</span>}
              </span>
              <span className="shrink-0 text-muted">
                #{String(e.id).padStart(5, '0')}
                {RESULT[e.action] && (e.notified ? ' · applicant emailed' : ' · not emailed')}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
