import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { formatDate } from '../../components/ui';
import { CriteriaSummary } from '../../components/OpportunityForm';
import AuditStrip from '../../components/AuditStrip';
import { AdminPage, EmptyRow, FilterLinks, Filters, KeyValue, Loading, Messages, SidePanel, StatusText, TableWrap } from '../../components/admin';
import { ref } from './StaffOpportunities';

const NEXT = { submitted: ['shortlisted', 'selected', 'not_selected'], shortlisted: ['selected', 'not_selected'] };
const DECISIONS = {
  shortlisted: { label: 'Shortlist for the next round', hint: 'Advances the founder to the next stage, such as a pitch or interview.' },
  selected: { label: 'Selected', hint: 'Final.' },
  not_selected: { label: 'Not selected', hint: 'Final. The reason is shared with the applicant.' },
};
const STATUS_LABEL = { submitted: 'Under evaluation', shortlisted: 'Shortlisted', selected: 'Selected', not_selected: 'Not selected' };
const STATUSES = [
  ['all', 'All'],
  ['submitted', 'Under evaluation'],
  ['shortlisted', 'Shortlisted'],
  ['selected', 'Selected'],
  ['not_selected', 'Not selected'],
];
const MIN_REASON = 5;

const cohort = (a) => (a.applicant.cohortYear ? `Class of ${a.applicant.cohortYear}` : '—');

// One applicant: details, then either the decision form or the recorded decision.
function ApplicationPanel({ application, onSaved, onClose }) {
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
      <Filters>
        <FilterLinks label="Status" options={STATUSES.map(([k, l]) => [k, l, count(k)])} value={tab} onChange={setTab} />
        <select aria-label="Filter by cohort" value={cohortFilter} onChange={(e) => setCohortFilter(e.target.value)}>
          <option value="">All cohorts</option>
          {cohorts.map((c) => (
            <option key={c} value={c}>
              Class of {c}
            </option>
          ))}
        </select>
        <input aria-label="Filter applicants" placeholder="Candidate, venture or keyword" value={q} onChange={(e) => setQ(e.target.value)} />
      </Filters>

      <TableWrap>
        <table className="adm-table">
          <thead>
            <tr>
              <th>Applicant</th>
              <th>Venture</th>
              <th>Programme</th>
              <th>Status</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {applications.length === 0 && <EmptyRow colSpan={5}>No applications yet. Approved graduates can apply until the deadline.</EmptyRow>}
            {applications.length > 0 && shown.length === 0 && <EmptyRow colSpan={5}>No applicants in this view.</EmptyRow>}
            {shown.map((a) => (
              <tr key={a.id} className={a.id === openId ? 'adm-selected' : undefined}>
                <td>{a.applicant.name}</td>
                <td>
                  {a.project.title}
                  <div className="adm-muted">
                    {a.project.sector} · {a.project.stage}
                  </div>
                </td>
                <td>
                  {a.applicant.program || '—'}
                  <div className="adm-muted">{cohort(a)}</div>
                  {a.eligibilityIssues.length > 0 && <div className="adm-bad">Check eligibility</div>}
                </td>
                <td>
                  <StatusText status={a.status} label={STATUS_LABEL[a.status]} />
                </td>
                <td className="adm-actions">
                  <button type="button" className="adm-btn" onClick={() => setOpenId(a.id)}>
                    {NEXT[a.status] ? 'Decide' : 'View'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>

      {open && (
        <ApplicationPanel
          application={open}
          onClose={() => setOpenId(null)}
          onSaved={async (message) => {
            setNotice(message);
            await load();
          }}
        />
      )}
      <AuditStrip title="History" entries={audit} />
    </AdminPage>
  );
}
