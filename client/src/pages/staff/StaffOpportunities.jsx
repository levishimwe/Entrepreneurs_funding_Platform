import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { formatDate } from '../../components/ui';
import OpportunityForm from '../../components/OpportunityForm';
import AuditStrip from '../../components/AuditStrip';
import { AdminPage, DataTable, ListLayout, Loading, Messages, Pager, SearchInput, StatusPill, StatusSelect } from '../../components/admin';

const TYPES = [
  ['', 'All types'],
  ['grant', 'Grants'],
  ['hackathon', 'Hackathons'],
  ['competition', 'Competitions'],
  ['other', 'Other'],
];
const STATUS_LABEL = { published: 'Live', pending_review: 'Under review', closed: 'Closed' };
const PAGE_SIZE = 25;

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
    return rows.filter((o) => (!type || o.type === type) && (!status || o.status === status) && (!term || `${o.title} ${o.organiser || ''} ${ref(o.id)}`.toLowerCase().includes(term)));
  }, [rows, q, type, status]);
  useEffect(() => setPage(1), [q, type, status]);

  const count = (s) => (rows ? rows.filter((o) => !s || o.status === s).length : null);
  const statusOptions = [
    ['', 'All', count('')],
    ['published', 'Live', count('published')],
    ['pending_review', 'Under review', count('pending_review')],
    ['closed', 'Closed', count('closed')],
  ];
  const shown = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const columns = [
    {
      key: 'title',
      label: 'Title',
      render: (o) => (
        <>
          <span className="font-medium">{o.title}</span>
          <div className="adm-mono adm-muted">{ref(o.id)}</div>
        </>
      ),
    },
    { key: 'type', label: 'Type', render: (o) => <span className="capitalize">{o.type}</span> },
    { key: 'sponsor', label: 'Sponsor', render: (o) => o.organiser || o.createdBy?.name },
    { key: 'cohort', label: 'Cohort', render: (o) => cohortLabel(o.criteria) },
    { key: 'apps', label: 'Applicants', num: true, render: (o) => `${o.applicationCount}${o.tally.submitted ? ` (${o.tally.submitted} new)` : ''}` },
    {
      key: 'deadline',
      label: 'Deadline',
      render: (o) => (
        <>
          {formatDate(o.deadline)}
          <div className="adm-muted text-[12px]">{deadlineNote(o)}</div>
        </>
      ),
    },
    { key: 'status', label: 'Status', render: (o) => <StatusPill status={o.status} label={STATUS_LABEL[o.status]} /> },
  ];
  const actions = (o) => (
    <>
      {o.status !== 'pending_review' && (
        <Link to={`/app/staff/${o.id}`} className="adm-act">
          Applicants
        </Link>
      )}
      {o.mine && o.status === 'pending_review' && (
        <Link to={`/app/staff/${o.id}/edit`} className="adm-act">
          Edit
        </Link>
      )}
      {o.status === 'published' && (
        <Link to="/opportunities" target="_blank" className="adm-act">
          Public page
        </Link>
      )}
    </>
  );

  return (
    <AdminPage title="Opportunities" meta={rows ? `${filtered.length} shown` : null}>
      <Messages error={error} />
      <ListLayout
        toolbar={
          <>
            <SearchInput value={q} onChange={setQ} placeholder="Title, sponsor or OPP ref" />
            <StatusSelect value={status} options={statusOptions} onChange={setStatus} />
            <Link to="/app/staff/new" className="adm-primary">
              Submit opportunity
            </Link>
          </>
        }
        filters={[
          { title: 'Status', value: status, onChange: setStatus, options: statusOptions },
          { title: 'Type', value: type, onChange: setType, options: TYPES },
        ]}
        footer={
          <>
            <Pager page={page} pageSize={PAGE_SIZE} total={filtered.length} onPage={setPage} />
            <AuditStrip title="History" entries={activity} />
          </>
        }
      >
        {!rows ? <Loading /> : <DataTable columns={columns} rows={shown} actions={actions} empty={rows.length ? 'No opportunities match.' : 'No opportunities yet.'} />}
      </ListLayout>
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
    <AdminPage title="Applicant selection" meta="No applications awaiting a decision">
      <DataTable
        columns={[
          { key: 'title', label: 'Opportunity', render: (o) => <span className="font-medium">{o.title}</span> },
          { key: 'ref', label: 'Ref', render: (o) => <span className="adm-mono">{ref(o.id)}</span> },
          { key: 'apps', label: 'Applicants', num: true, render: (o) => o.applicationCount },
          { key: 'selected', label: 'Selected', num: true, render: (o) => o.tally.selected },
        ]}
        rows={rows}
        actions={(o) => (
          <Link to={`/app/staff/${o.id}`} className="adm-act">
            View
          </Link>
        )}
        empty="No published opportunities yet."
      />
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
    <AdminPage title={id ? 'Edit submission' : 'Submit opportunity'}>
      <div className="adm-card p-4 sm:p-6">
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
