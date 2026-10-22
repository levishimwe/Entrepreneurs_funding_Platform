import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { formatDate } from '../../components/ui';
import { AdminPage, DataTable, ListLayout, Loading, Messages, SearchInput, StatusPill, StatusSelect } from '../../components/admin';

export function useMyProjects() {
  const [state, setState] = useState({ projects: null, error: '' });
  useEffect(() => {
    api
      .get('/projects/mine')
      .then((d) => setState({ projects: d.projects, error: '' }))
      .catch((e) => setState({ projects: [], error: e.message }));
  }, []);
  return state;
}

export const EDITABLE = ['pending_review', 'revision_required', 'approved'];
const CLOSED = ['archived', 'rejected'];

// Columns shared by My projects and the dashboard.
export const projectColumns = [
  {
    key: 'title',
    label: 'Project',
    render: (p) => (
      <>
        <Link className="adm-a font-medium" to={`/app/projects/${p.id}`}>
          {p.title}
        </Link>
        <div className="adm-mono adm-muted">{p.projectCode}</div>
      </>
    ),
  },
  { key: 'type', label: 'Type', render: (p) => (p.type === 'company' ? 'Registered company' : 'Idea stage') },
  { key: 'sector', label: 'Sector', render: (p) => `${p.sector} · ${p.stage}` },
  { key: 'status', label: 'Status', render: (p) => <StatusPill status={p.status} /> },
  { key: 'updated', label: 'Updated', render: (p) => formatDate(p.updatedAt) },
];

export const projectActions = (p) => (
  <>
    <Link to={`/app/projects/${p.id}`} className="adm-act">
      View
    </Link>
    {EDITABLE.includes(p.status) && (
      <Link to={`/app/projects/${p.id}/edit`} className="adm-act">
        Revise
      </Link>
    )}
  </>
);

const VIEWS = [
  ['active', 'Active'],
  ['closed', 'Archived & rejected'],
  ['all', 'All'],
];
const TYPES = [
  ['', 'All'],
  ['company', 'Registered company'],
  ['idea', 'Idea stage'],
];

export default function MyProjects() {
  const { user } = useAuth();
  const { projects, error } = useMyProjects();
  const [view, setView] = useState('active');
  const [type, setType] = useState('');
  const [q, setQ] = useState('');

  useEffect(() => {
    document.title = 'My projects · ALU Ventures';
  }, []);

  const inView = (p) => view === 'all' || (view === 'closed' ? CLOSED.includes(p.status) : !CLOSED.includes(p.status));
  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (projects || []).filter((p) => inView(p) && (!type || p.type === type) && (!term || `${p.title} ${p.projectCode} ${p.sector}`.toLowerCase().includes(term)));
  }, [projects, view, type, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const count = (v) => (projects || []).filter((p) => v === 'all' || (v === 'closed' ? CLOSED.includes(p.status) : !CLOSED.includes(p.status))).length;
  const viewOptions = VIEWS.map(([k, l]) => [k, l, projects ? count(k) : null]);

  return (
    <AdminPage title="My projects" meta={projects ? `${rows.length} shown` : null}>
      <Messages error={error} />
      {!user.approved && <p className="adm-message">You can submit projects once an administrator approves your graduate account.</p>}
      <ListLayout
        toolbar={
          <>
            <SearchInput value={q} onChange={setQ} placeholder="Title, code or sector" />
            <StatusSelect value={view} options={viewOptions} onChange={setView} label="Show" />
            {user.approved && (
              <Link to="/app/projects/new" className="adm-primary">
                New project
              </Link>
            )}
          </>
        }
        filters={[
          { title: 'Status', value: view, onChange: setView, options: viewOptions },
          { title: 'Type', value: type, onChange: setType, options: TYPES },
        ]}
      >
        {!projects ? (
          <Loading />
        ) : (
          <DataTable columns={projectColumns} rows={rows} actions={projectActions} empty={projects.length ? 'No projects in this view.' : 'No projects submitted yet.'} />
        )}
      </ListLayout>
    </AdminPage>
  );
}
