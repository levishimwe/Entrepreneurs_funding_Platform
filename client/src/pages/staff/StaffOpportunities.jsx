import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { formatDate } from '../../components/ui';
import OpportunityForm from '../../components/OpportunityForm';
import AuditStrip from '../../components/AuditStrip';
import { AdminPage, EmptyRow, FilterLinks, Filters, Loading, Messages, Pager, StatusText, TableWrap } from '../../components/admin';

const TYPES = [
  ['', 'All types'],
  ['grant', 'Grants'],
  ['hackathon', 'Hackathons'],
  ['competition', 'Competitions'],
  ['other', 'Other'],
];
const STATUS_LABEL = { published: 'Live', pending_review: 'Under review', closed: 'Closed' };
const PAGE_SIZE = 20;

export const ref = (id) => `OPP-${String(id).padStart(4, '0')}`;

function cohortLabel(c = {}) {
  if (c.minCohortYear && c.maxCohortYear) return c.minCohortYear === c.maxCohortYear ? `Class of ${c.minCohortYear}` : `Classes ${c.minCohortYear}–${c.maxCohortYear}`;
  if (c.minCohortYear) return `Class of ${c.minCohortYear} on`;
  if (c.maxCohortYear) return `Up to class of ${c.maxCohortYear}`;
  return 'All alumni';
}

function deadlineNote(o) {
  if (o.status === 'pending_review') return 'awaiting publication';
  const days = Math.ceil((new Date(o.deadline) - Date.now()) / 86400000);
  if (days < 0) return 'closed';
  if (days === 0) return 'closes today';
  return `${days} day${days === 1 ? '' : 's'} left`;
}

// Staff opportunity management: staff submit opportunities for administrator
// publication (FR08) and review applicants (FR09).
export default function StaffOpportunities() {
  const [rows, setRows] = useState(null);
  const [activity, setActivity] = useState(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    document.title = 'Opportunities · ALU Ventures';
    api.get('/staff/opportunities').then((d) => setRows(d.opportunities)).catch((e) => setError(e.message));
    api.get('/staff/activity').then((d) => setActivity(d.entries)).catch(() => setActivity([]));
  }, []);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const term = q.trim().toLowerCase();
    return rows.filter(
      (o) =>
        (!type || o.type === type) &&
        (!status || o.status === status) &&
        (!term || `${o.title} ${o.organiser || ''} ${ref(o.id)}`.toLowerCase().includes(term))
    );
  }, [rows, q, type, status]);
  useEffect(() => setPage(1), [q, type, status]);

  const count = (s) => rows?.filter((o) => o.status === s).length ?? null;
  const shown = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <AdminPage
      title="Opportunities"
      hint="The administrator reviews and publishes submissions; you evaluate applicants once an opportunity is live."
      actions={
        <>
          <Link to="/opportunities" target="_blank" className="adm-btn">
            Public listing
          </Link>
          <Link to="/app/staff/new" className="adm-btn">
            Submit opportunity
          </Link>
        </>
      }
    >
      <Messages error={error} />
      <Filters>
        <FilterLinks
          label="Status"
          options={[
            ['', 'All', rows?.length ?? null],
            ['published', 'Live', count('published')],
            ['pending_review', 'Under review', count('pending_review')],
            ['closed', 'Closed', count('closed')],
          ]}
          value={status}
          onChange={setStatus}
        />
        <select aria-label="Filter by type" value={type} onChange={(e) => setType(e.target.value)}>
          {TYPES.map(([value, label]) => (
            <option key={label} value={value}>
              {label}
            </option>
          ))}
        </select>
        <input aria-label="Filter opportunities" placeholder="Title, sponsor or OPP ref" value={q} onChange={(e) => setQ(e.target.value)} />
      </Filters>

      {!rows ? (
        <Loading />
      ) : (
        <TableWrap>
          <table className="adm-table">
            <thead>
              <tr>
                <th>Ref</th>
                <th>Title</th>
                <th>Type</th>
                <th>Sponsor</th>
                <th>Cohort</th>
                <th className="adm-num">Applicants</th>
                <th>Deadline</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && <EmptyRow colSpan={9}>No opportunities yet.</EmptyRow>}
              {rows.length > 0 && shown.length === 0 && <EmptyRow colSpan={9}>No opportunities match these filters.</EmptyRow>}
              {shown.map((o) => (
                <tr key={o.id}>
                  <td className="adm-mono whitespace-nowrap">{ref(o.id)}</td>
                  <td>
                    {o.title}
                    {o.criteria?.sectors?.length > 0 && <div className="adm-muted">{o.criteria.sectors.join(', ')}</div>}
                  </td>
                  <td className="capitalize">{o.type}</td>
                  <td>{o.organiser || o.createdBy?.name}</td>
                  <td>{cohortLabel(o.criteria)}</td>
                  <td className="adm-num">
                    {o.applicationCount}
                    {o.tally.submitted > 0 && <div className="adm-muted">{o.tally.submitted} undecided</div>}
                  </td>
                  <td className="whitespace-nowrap">
                    {formatDate(o.deadline)}
                    <div className="adm-muted">{deadlineNote(o)}</div>
                  </td>
                  <td>
                    <StatusText status={o.status} label={STATUS_LABEL[o.status]} />
                  </td>
                  <td className="adm-actions">
                    {o.mine && o.status === 'pending_review' && (
                      <Link to={`/app/staff/${o.id}/edit`} className="adm-btn">
                        Edit
                      </Link>
                    )}
                    {o.status !== 'pending_review' && (
                      <Link to={`/app/staff/${o.id}`} className="adm-btn">
                        Applicants
                      </Link>
                    )}
                    {o.status === 'published' && (
                      <Link to="/opportunities" target="_blank" className="adm-btn">
                        Public page
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
      <Pager page={page} pageSize={PAGE_SIZE} total={filtered.length} onPage={setPage} />
      <AuditStrip title="History" entries={activity} />
    </AdminPage>
  );
}

// "Applicant selection" in the sidebar: jump straight to the opportunity with
// the most applications awaiting a decision, or list the reviewable ones.
export function StaffSelectionHome() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    document.title = 'Applicant selection · ALU Ventures';
    api.get('/staff/opportunities').then((d) => setRows(d.opportunities.filter((o) => o.status !== 'pending_review'))).catch((e) => setError(e.message));
  }, []);
  if (error) return <AdminPage title="Applicant selection"><Messages error={error} /></AdminPage>;
  if (!rows) return <AdminPage title="Applicant selection"><Loading /></AdminPage>;
  const pending = [...rows].sort((a, b) => b.tally.submitted - a.tally.submitted).find((o) => o.tally.submitted > 0);
  if (pending) return <Navigate to={`/app/staff/${pending.id}`} replace />;
  return (
    <AdminPage title="Applicant selection" hint="No applications are awaiting a decision.">
      <TableWrap>
        <table className="adm-table">
          <thead>
            <tr>
              <th>Ref</th>
              <th>Opportunity</th>
              <th className="adm-num">Applicants</th>
              <th className="adm-num">Selected</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <EmptyRow colSpan={5}>No published opportunities yet.</EmptyRow>}
            {rows.map((o) => (
              <tr key={o.id}>
                <td className="adm-mono">{ref(o.id)}</td>
                <td>{o.title}</td>
                <td className="adm-num">{o.applicationCount}</td>
                <td className="adm-num">{o.tally.selected}</td>
                <td className="adm-actions">
                  <Link to={`/app/staff/${o.id}`} className="adm-btn">
                    View
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
    </AdminPage>
  );
}

export function StaffOpportunityForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [initial, setInitial] = useState(id ? null : undefined);
  useEffect(() => {
    if (id) api.get(`/staff/opportunities/${id}`).then((d) => setInitial(d.opportunity));
  }, [id]);
  if (initial === null) return <AdminPage title="Edit submission"><Loading /></AdminPage>;
  return (
    <AdminPage title={id ? 'Edit submission' : 'Submit opportunity'} hint="The administrator reviews and publishes submissions.">
      <div className="border border-line bg-surface p-4">
        <OpportunityForm
          initial={initial}
          submitLabel={id ? 'Save submission' : 'Submit for publication'}
          onCancel={() => navigate('/app/staff')}
          onSubmit={async (data) => {
            if (id) await api.patch(`/staff/opportunities/${id}`, data);
            else await api.post('/staff/opportunities', data);
            navigate('/app/staff');
          }}
        />
      </div>
    </AdminPage>
  );
}
