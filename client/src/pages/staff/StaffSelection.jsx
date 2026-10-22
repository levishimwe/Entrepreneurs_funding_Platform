import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { formatDate } from '../../components/ui';
import { CriteriaSummary } from '../../components/OpportunityForm';
import AuditStrip from '../../components/AuditStrip';
import { AdminPage, DataTable, KeyValue, ListLayout, Loading, Messages, SearchInput, SidePanel, StatusPill, StatusSelect, StatusText } from '../../components/admin';
import { ref } from './StaffOpportunities';

const NEXT = { submitted: ['shortlisted', 'selected', 'not_selected'], shortlisted: ['selected', 'not_selected'] };
const DECISIONS = {
  shortlisted: { label: 'Shortlist for the next round', hint: 'Advances the founder to the next stage, such as a pitch or interview.' },
  selected: { label: 'Selected (admitted)', hint: 'Admitted to take part. Final. The outcome is recorded on Results after the event.' },
  not_selected: { label: 'Not selected', hint: 'Final. The reason is shared with the applicant.' },
};
const STATUS_LABEL = { submitted: 'Under evaluation', shortlisted: 'Shortlisted', selected: 'Admitted', not_selected: 'Not selected' };
const STATUSES = [
  ['all', 'All'],
  ['submitted', 'Under evaluation'],
  ['shortlisted', 'Shortlisted'],
  ['selected', 'Admitted'],
  ['not_selected', 'Not selected'],
];
const MIN_REASON = 5;

const cohort = (a) => (a.applicant.cohortYear ? `Class of ${a.applicant.cohortYear}` : '—');

const RESULT_STATUS = { pending: 'Pending Admin Approval', approved: 'Approved', rejected: 'Rejected' };
// One applicant: details, then either the decision form or the recorded decision.
function ApplicationPanel({ application, resultsEnabled, onSaved, onClose }) {
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
    <SidePanel title={application.applicant.name} onClose={onClose}>
      <KeyValue
        rows={[
          ['Application', <span key="a" className="adm-mono">APP-{String(application.id).padStart(4, '0')}</span>],
          ['Status', <StatusText key="s" status={application.status} label={STATUS_LABEL[application.status]} />],
          ['Venture', `${application.project.title} (${application.project.projectCode})`],
          ['Sector and stage', `${application.project.sector} · ${application.project.stage}`],
          ['Summary', application.project.summary],
          ['Programme', `${application.applicant.program || '—'} · ${cohort(application)}`],
          ['Motivation', application.motivation],
          ...(application.eligibilityIssues.length
            ? [['Eligibility', <span key="e" className="adm-bad">Changed since applying: {application.eligibilityIssues.join(' ')}</span>]]
            : []),
        ]}
      />

      {options.length === 0 ? (
        <>
          <h2>Recorded decision</h2>
          <KeyValue
            rows={[
              ['Decision', <StatusText key="d" status={application.status} label={STATUS_LABEL[application.status]} />],
              ['By', application.decidedBy],
              ['On', formatDate(application.decidedAt, true)],
              ['Reason', application.decisionNote],
            ]}
          />
        </>
      ) : (
        <form onSubmit={save}>
          <h2>Decision</h2>
          <fieldset className="mb-3">
            <legend className="sr-only">Decision</legend>
            {options.map((key) => (
              <label key={key} className="block py-0.5">
                <input type="radio" name="decision" value={key} checked={decision === key} onChange={() => setDecision(key)} /> {DECISIONS[key].label}
                <span className="adm-muted"> — {DECISIONS[key].hint}</span>
              </label>
            ))}
          </fieldset>
          <label htmlFor="decision-note" className="block font-semibold">
            Reason (required, recorded in the audit log and shared with the founder)
          </label>
          <textarea id="decision-note" rows={4} className="adm-field mt-1" value={note} onChange={(e) => setNote(e.target.value)} aria-describedby="note-count" />
          <p id="note-count" className={`adm-hint ${error ? 'adm-bad' : ''}`}>
            {error || `${length} characters (minimum ${MIN_REASON})`}
          </p>
          <label className="block">
            <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} /> Email the decision and reason to the applicant
          </label>
          <p className="mt-3">
            <button type="submit" className="adm-btn adm-btn-primary" disabled={busy || !decision}>
              {busy ? 'Saving…' : 'Save decision'}
            </button>
          </p>
        </form>
      )}
      {resultsEnabled && application.status === 'selected' && (
        <p className="adm-hint mt-4">
          Admitted. {application.result ? `Result: ${RESULT_STATUS[application.result.status]}.` : 'The outcome (winner, prize) is recorded on the '}
          {!application.result && (
            <Link className="adm-a" to="/app/staff/results">
              Results
            </Link>
          )}
          {!application.result && ' page after the event is marked Completed.'}
        </p>
      )}
    </SidePanel>
  );
}

// Applicant selection (FR09): the designated ALU authority records shortlist /
// selected / not selected decisions with reasons.
export default function StaffSelection() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [audit, setAudit] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [tab, setTab] = useState('all');
  const [q, setQ] = useState('');
  const [cohortFilter, setCohortFilter] = useState('');
  const [openId, setOpenId] = useState(null);

  const load = useCallback(async () => {
    try {
      const [d, a] = await Promise.all([api.get(`/staff/opportunities/${id}`), api.get(`/staff/opportunities/${id}/audit`)]);
      setData(d);
      setAudit(a.entries);
      document.title = `Applicants: ${d.opportunity.title} · ALU Ventures`;
    } catch (e) {
      setError(e.message);
    }
  }, [id]);
  useEffect(() => {
    load();
  }, [load]);

  const cohorts = useMemo(() => [...new Set((data?.applications || []).map((a) => a.applicant.cohortYear).filter(Boolean))].sort(), [data]);
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

  if (error && !data) return <AdminPage title="Applicants"><Messages error={error} /></AdminPage>;
  if (!data) return <AdminPage title="Applicants"><Loading /></AdminPage>;
  const { opportunity, applications } = data;
  const count = (s) => (s === 'all' ? applications.length : applications.filter((a) => a.status === s).length);
  const open = applications.find((a) => a.id === openId);

  return (
    <AdminPage title={`Applicants: ${opportunity.title}`}>
      <p className="adm-hint">
        <Link className="adm-a" to="/app/staff">
          Opportunities
        </Link>
        {' / '}
        <span className="adm-mono">{ref(opportunity.id)}</span>
        {opportunity.organiser ? ` · ${opportunity.organiser}` : ''} · deadline {formatDate(opportunity.deadline, true)}
      </p>
      <div className="mb-3">
        <CriteriaSummary criteria={opportunity.criteria} />
      </div>
      <Messages notice={notice} error={error} />
      <ListLayout
        toolbar={
          <>
            <SearchInput value={q} onChange={setQ} placeholder="Candidate, venture or keyword" />
            <StatusSelect value={tab} options={STATUSES.map(([k, l]) => [k, l, count(k)])} onChange={setTab} />
          </>
        }
        filters={[
          { title: 'Status', value: tab, onChange: setTab, options: STATUSES.map(([k, l]) => [k, l, count(k)]) },
          { title: 'Cohort', value: cohortFilter, onChange: setCohortFilter, options: [['', 'All cohorts'], ...cohorts.map((c) => [String(c), `Class of ${c}`])] },
        ]}
        footer={<AuditStrip title="History" entries={audit} />}
      >
        <DataTable
          columns={[
            { key: 'name', label: 'Applicant', render: (a) => <span className="font-medium">{a.applicant.name}</span> },
            {
              key: 'venture',
              label: 'Venture',
              render: (a) => (
                <>
                  {a.project.title}
                  <div className="adm-muted text-[12px]">
                    {a.project.sector} · {a.project.stage}
                  </div>
                </>
              ),
            },
            {
              key: 'programme',
              label: 'Programme',
              render: (a) => (
                <>
                  {a.applicant.program || '—'}
                  <div className="adm-muted text-[12px]">{cohort(a)}</div>
                  {a.eligibilityIssues.length > 0 && <div className="adm-bad text-[12px]">Check eligibility</div>}
                </>
              ),
            },
            {
              key: 'status',
              label: 'Status',
              render: (a) => (
                <>
                  <StatusPill status={a.status} label={STATUS_LABEL[a.status]} />
                  {a.result && <div className="adm-muted text-[12px]">Result: {RESULT_STATUS[a.result.status]}</div>}
                </>
              ),
            },
          ]}
          rows={shown}
          rowClass={(a) => (a.id === openId ? 'adm-selected' : undefined)}
          actions={(a) => (
            <button type="button" className="adm-act" onClick={() => setOpenId(a.id)}>
              {NEXT[a.status] ? 'Decide' : 'View'}
            </button>
          )}
          empty={applications.length ? 'No applicants in this view.' : 'No applications yet.'}
        />
      </ListLayout>
      {open && (
        <ApplicationPanel
          application={open}
          resultsEnabled={data.resultsEnabled}
          onClose={() => setOpenId(null)}
          onSaved={async (message) => {
            setNotice(message);
            await load();
          }}
        />
      )}
    </AdminPage>
  );
}
