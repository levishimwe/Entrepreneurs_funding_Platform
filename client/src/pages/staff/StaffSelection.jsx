import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, ClipboardCheck, Hourglass, Inbox, Search, Star, TriangleAlert, Users, XCircle } from 'lucide-react';
import { api } from '../../lib/api';
import { Alert, EmptyState, PageLoader, formatDate } from '../../components/ui';
import { CriteriaSummary } from '../../components/OpportunityForm';
import AuditStrip from '../../components/AuditStrip';
import { Breadcrumb, StatTile, initials, ref } from './StaffOpportunities';

const NEXT = { submitted: ['shortlisted', 'selected', 'not_selected'], shortlisted: ['selected', 'not_selected'] };
const DECISIONS = {
  shortlisted: {
    label: 'Shortlist for the next round',
    body: 'Advances the founder to the next stage, such as a pitch or interview.',
    icon: Star,
    on: 'border-accent bg-accent-soft',
  },
  selected: {
    label: 'Mark as Selected',
    body: 'Final. The applicant is selected for this opportunity.',
    icon: CheckCircle2,
    on: 'border-green-500 bg-green-50 dark:bg-green-500/10',
  },
  not_selected: {
    label: 'Mark as Not Selected',
    body: 'Final. Requires an explicit reason, shared with the applicant.',
    icon: XCircle,
    on: 'border-red-400 bg-red-50 dark:bg-red-500/10',
    labelCls: 'text-red-700 dark:text-red-300',
  },
};
const DECISION_PILL = {
  submitted: ['Under evaluation', 'bg-amber-50 text-amber-800 ring-amber-600/25 dark:bg-amber-500/15 dark:text-amber-300'],
  shortlisted: ['Shortlisted', 'bg-blue-50 text-blue-700 ring-blue-600/25 dark:bg-blue-500/15 dark:text-blue-300'],
  selected: ['Selected', 'bg-green-50 text-green-700 ring-green-600/25 dark:bg-green-500/15 dark:text-green-300'],
  not_selected: ['Not selected', 'bg-red-50 text-red-700 ring-red-600/25 dark:bg-red-500/15 dark:text-red-300'],
};
const TABS = [
  ['all', 'All Applicants'],
  ['submitted', 'Under Evaluation'],
  ['shortlisted', 'Shortlisted'],
  ['selected', 'Selected'],
  ['not_selected', 'Not Selected'],
];
const MIN_REASON = 5;

function DecisionPill({ status }) {
  const [label, cls] = DECISION_PILL[status] || DECISION_PILL.submitted;
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${cls}`}>{label}</span>;
}

const cohort = (a) => (a.applicant.cohortYear ? `Class of '${String(a.applicant.cohortYear).slice(-2)}` : '—');

// "Evaluation audit inspector" panel from the Figma: one applicant, one decision.
function DecisionPanel({ application, onSaved }) {
  const options = NEXT[application.status] || [];
  const [decision, setDecision] = useState(options[0] || '');
  const [note, setNote] = useState('');
  const [notify, setNotify] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDecision((NEXT[application.status] || [])[0] || '');
    setNote('');
    setNotify(true);
    setError('');
  }, [application.id, application.status]);

  const length = note.trim().length;
  const save = async (e) => {
    e.preventDefault();
    if (length < MIN_REASON) return setError(`Give a reason for this decision (at least ${MIN_REASON} characters).`);
    setBusy(true);
    setError('');
    try {
      const res = await api.post(`/staff/applications/${application.id}/decision`, { decision, note: note.trim(), notify });
      onSaved(`${DECISIONS[decision].label}: ${application.applicant.name}${res.notified ? ' — the applicant has been emailed.' : ' — recorded without emailing the applicant.'}`);
    } catch (err) {
      setError(err.fields?.note || err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card overflow-hidden">
      <div className="flex items-start justify-between gap-2 border-b border-line bg-subtle px-4 py-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Evaluation audit inspector</p>
          <p className="text-sm font-semibold">Decision &amp; Feedback</p>
        </div>
        <span className="rounded border border-line bg-surface px-1.5 py-0.5 font-mono text-[10px] text-muted">APP-{String(application.id).padStart(4, '0')}</span>
      </div>

      <div className="space-y-2 border-b border-line px-4 py-3 text-sm">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-semibold">{application.applicant.name}</p>
            <p className="text-xs text-muted">
              {application.project.title} · <span className="font-mono">{application.project.projectCode}</span>
            </p>
          </div>
          <DecisionPill status={application.status} />
        </div>
        <p className="text-xs">
          <span className="font-semibold">Motivation: </span>
          {application.motivation}
        </p>
        <p className="text-xs text-muted">{application.project.summary}</p>
        {application.eligibilityIssues.length > 0 && (
          <p className="flex gap-1.5 text-xs text-amber-700 dark:text-amber-300">
            <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Eligibility changed since applying: {application.eligibilityIssues.join(' ')}
          </p>
        )}
      </div>

      {options.length === 0 ? (
        <div className="space-y-1 p-4 text-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Recorded decision</p>
          <DecisionPill status={application.status} />
          <p className="pt-1 text-xs text-muted">
            By {application.decidedBy} on {formatDate(application.decidedAt, true)}
          </p>
          <p>“{application.decisionNote}”</p>
        </div>
      ) : (
        <form onSubmit={save} className="space-y-3 p-4">
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">
              Selection Status Decision <span className="text-red-600">*</span>
            </legend>
            <div className="space-y-2">
              {options.map((key) => {
                const d = DECISIONS[key];
                const Icon = d.icon;
                return (
                  <label key={key} className={`flex cursor-pointer gap-3 rounded-md border p-3 ${decision === key ? d.on : 'border-line hover:bg-subtle'}`}>
                    <input type="radio" name="decision" value={key} checked={decision === key} onChange={() => setDecision(key)} className="mt-1" />
                    <span>
                      <span className={`flex items-center gap-1.5 text-sm font-medium ${decision === key ? d.labelCls || '' : ''}`}>
                        <Icon className="h-4 w-4" aria-hidden="true" /> {d.label}
                      </span>
                      <span className="block text-xs text-muted">{d.body}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
          <div>
            <div className="flex items-baseline justify-between gap-2">
              <label htmlFor="decision-note" className="text-sm font-semibold">
                Reason for Decision <span className="text-red-600">*</span>
              </label>
              <span className="text-[11px] text-muted">Mandatory audit trail</span>
            </div>
            <p className="mb-1.5 text-xs text-muted">This rationale is archived in the audit log and shared with the founder as feedback.</p>
            <textarea id="decision-note" rows={5} className="input" value={note} onChange={(e) => setNote(e.target.value)} aria-describedby="note-count" />
            <p id="note-count" className={`mt-1 text-[11px] ${error ? 'text-red-600' : length >= MIN_REASON ? 'text-green-700 dark:text-green-400' : 'text-muted'}`}>
              {error || `${length} characters • ${length >= MIN_REASON ? 'Min requirement met' : `Minimum ${MIN_REASON}`}`}
            </p>
          </div>
          <label className="flex gap-2 rounded-md border border-line p-3 text-sm">
            <input type="checkbox" className="mt-0.5 h-4 w-4" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
            <span>
              <span className="font-medium">Notify applicant by email</span>
              <span className="block text-xs text-muted">Sends the decision and your reason after it is saved.</span>
            </span>
          </label>
          <button type="submit" className="btn-primary w-full" disabled={busy || !decision}>
            {busy ? 'Saving…' : 'Save decision'}
          </button>
        </form>
      )}
    </div>
  );
}

// Staff Selection & Evaluation (Figma). FR09: the designated ALU authority
// records shortlist / selected / not selected decisions with reasons.
export default function StaffSelection() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [audit, setAudit] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [tab, setTab] = useState('all');
  const [q, setQ] = useState('');
  const [cohortFilter, setCohortFilter] = useState('');
  const [selectedId, setSelectedId] = useState(null);

  const load = useCallback(async () => {
    try {
      const [d, a] = await Promise.all([api.get(`/staff/opportunities/${id}`), api.get(`/staff/opportunities/${id}/audit`)]);
      setData(d);
      setAudit(a.entries);
      document.title = `Selection: ${d.opportunity.title} · ALU Ventures`;
      setSelectedId((current) => current ?? d.applications.find((x) => NEXT[x.status])?.id ?? d.applications[0]?.id ?? null);
    } catch (e) {
      setError(e.message);
    }
  }, [id]);
  useEffect(() => {
    load();
  }, [load]);

  const cohorts = useMemo(
    () => [...new Set((data?.applications || []).map((a) => a.applicant.cohortYear).filter(Boolean))].sort(),
    [data]
  );
  const shown = useMemo(() => {
    if (!data) return [];
    const term = q.trim().toLowerCase();
    return data.applications.filter(
      (a) =>
        (tab === 'all' || a.status === tab) &&
        (!cohortFilter || String(a.applicant.cohortYear) === cohortFilter) &&
        (!term || `${a.applicant.name} ${a.project.title} ${a.project.projectCode} ${a.project.summary}`.toLowerCase().includes(term))
    );
  }, [data, tab, q, cohortFilter]);

  if (error) return <Alert type="error">{error}</Alert>;
  if (!data) return <PageLoader />;
  const { opportunity, applications } = data;
  const count = (s) => applications.filter((a) => a.status === s).length;
  const decided = count('selected') + count('not_selected');
  const total = applications.length;
  const selected = applications.find((a) => a.id === selectedId);
  const rejectionRate = total ? `${Math.round((count('not_selected') / total) * 1000) / 10}%` : '—';

  return (
    <>
      <Breadcrumb items={[['Opportunities', '/app/staff'], [opportunity.title, null], ['Applicant Evaluation & Selection']]} />
      <div className="mb-6">
        <h1 className="max-w-3xl text-2xl font-semibold tracking-tight">Staff Selection &amp; Evaluation: {opportunity.title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-line bg-subtle px-2.5 py-0.5 text-xs font-medium">
            {total} Total Applicant{total === 1 ? '' : 's'} • <span className="font-mono">{ref(opportunity.id).replace('REF: ', '')}</span>
          </span>
          <span className="text-xs text-muted">
            {opportunity.organiser ? `${opportunity.organiser} · ` : ''}Deadline {formatDate(opportunity.deadline, true)}
          </span>
        </div>
        <p className="mt-2 max-w-3xl text-sm text-muted">
          Review eligible applications against the published criteria, record each decision with a reason, and notify
          founders once decisions are saved.
        </p>
        <div className="mt-1">
          <CriteriaSummary criteria={opportunity.criteria} />
        </div>
      </div>

      {notice && <Alert type="success" className="mb-4">{notice}</Alert>}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Decisions completed" icon={ClipboardCheck} value={decided} unit={`/ ${total} applicants`} status={`${total ? Math.round((decided / total) * 100) : 0}% decided`} statusTone="text-green-700 dark:text-green-400">
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-subtle ring-1 ring-line">
            <div className="h-full bg-green-600" style={{ width: `${total ? (decided / total) * 100 : 0}%` }} />
          </div>
        </StatTile>
        <StatTile label="Shortlisted candidates" icon={Star} value={count('shortlisted')} status="Ready for the next round" statusTone="text-accent" />
        <StatTile label="Under evaluation" icon={Hourglass} value={count('submitted')} status="Awaiting a staff decision" statusTone="text-amber-600 dark:text-amber-400" />
        <StatTile label="Rejection rate" icon={Users} value={rejectionRate} unit={`${count('not_selected')} of ${total}`} status="All logged with audit rationales" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0">
          <div className="mb-3 overflow-x-auto border-b border-line">
            <div className="flex min-w-max gap-1" role="tablist">
              {TABS.map(([key, label]) => (
                <button
                  key={key}
                  role="tab"
                  aria-selected={tab === key}
                  onClick={() => setTab(key)}
                  className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm ${tab === key ? 'border-accent font-medium' : 'border-transparent text-muted hover:text-ink'}`}
                >
                  {label}
                  <span className="rounded-full bg-subtle px-1.5 text-xs tabular-nums text-muted ring-1 ring-line">{key === 'all' ? total : count(key)}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="mb-3 flex flex-col gap-2 sm:flex-row">
            <label className="relative flex-1">
              <span className="sr-only">Filter applicants</span>
              <Search className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-muted" aria-hidden="true" />
              <input className="input pl-8" placeholder="Filter by candidate, venture or keyword…" value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
            <select className="input sm:w-44" aria-label="Filter by cohort" value={cohortFilter} onChange={(e) => setCohortFilter(e.target.value)}>
              <option value="">All cohorts</option>
              {cohorts.map((c) => (
                <option key={c} value={c}>
                  Class of {c}
                </option>
              ))}
            </select>
          </div>

          {total === 0 ? (
            <div className="card">
              <EmptyState icon={Inbox} title="No applications yet">
                Approved graduates can apply until the deadline.
              </EmptyState>
            </div>
          ) : (
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead className="border-b border-line bg-subtle text-[11px] font-semibold uppercase tracking-wide text-muted">
                  <tr>
                    <th className="w-10 px-3 py-2.5">
                      <span className="sr-only">Selected</span>
                    </th>
                    <th className="px-3 py-2.5">Applicant &amp; venture</th>
                    <th className="px-3 py-2.5">ALU degree &amp; cohort</th>
                    <th className="px-3 py-2.5">Project pitch summary</th>
                    <th className="px-3 py-2.5">Decision</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {shown.map((a) => {
                    const active = a.id === selectedId;
                    return (
                      <tr key={a.id} onClick={() => setSelectedId(a.id)} className={`cursor-pointer align-top ${active ? 'bg-accent-soft' : 'hover:bg-subtle'}`}>
                        <td className="px-3 py-3">
                          <input type="checkbox" readOnly checked={active} onClick={() => setSelectedId(a.id)} aria-label={`Inspect ${a.applicant.name}`} className="h-4 w-4" />
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-start gap-2.5">
                            <span
                              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                                a.status === 'not_selected' ? 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300' : 'bg-subtle text-muted ring-1 ring-line'
                              }`}
                              aria-hidden="true"
                            >
                              {initials(a.applicant.name)}
                            </span>
                            <span className="min-w-0">
                              <span className="block font-semibold">{a.applicant.name}</span>
                              <span className="block text-xs text-muted">{a.project.title}</span>
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-xs">
                          {a.applicant.program || '—'}
                          <span className="block text-muted">{cohort(a)}</span>
                          {a.eligibilityIssues.length > 0 && (
                            <span className="mt-0.5 inline-flex items-center gap-1 text-amber-700 dark:text-amber-300">
                              <TriangleAlert className="h-3 w-3" aria-hidden="true" /> Check eligibility
                            </span>
                          )}
                        </td>
                        <td className="max-w-72 px-3 py-3 text-xs">
                          <span className="line-clamp-2">{a.project.summary}</span>
                          <span className="block text-muted">
                            {a.project.sector} · {a.project.stage}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <DecisionPill status={a.status} />
                        </td>
                      </tr>
                    );
                  })}
                  {shown.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-3 py-8 text-center text-sm text-muted">
                        No applicants in this view.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              <p className="border-t border-line bg-subtle px-3 py-2 text-xs text-muted">
                Showing {shown.length} of {total} records • <span className="font-mono">{ref(opportunity.id).replace('REF: ', '')}</span>
              </p>
            </div>
          )}
        </div>

        <aside className="lg:sticky lg:top-20 lg:self-start">
          {selected ? (
            <DecisionPanel
              application={selected}
              onSaved={async (message) => {
                setNotice(message);
                await load();
              }}
            />
          ) : (
            <div className="card p-4 text-sm text-muted">Select an applicant to record a decision.</div>
          )}
        </aside>
      </div>

      <AuditStrip title="Staff Selection Governance Audit Log" note="Mandatory decision rationales enabled" entries={audit} />
    </>
  );
}
