import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { formatDate } from '../components/ui';
import { relativeTime } from '../components/kit';
import ReasonDialog from '../components/ReasonDialog';
import { AdminPage, DataTable, KeyValue, Loading, Messages, StatTile, StatusPill } from '../components/admin';
import { projectActions, projectColumns, useMyProjects } from './graduate/MyProjects';

function Profile({ user, projects }) {
  const g = user.graduateProfile || {};
  // Competition results confirmed by the administrator.
  const results = projects.flatMap((p) => (p.competitionResults || []).map((r) => ({ ...r, projectTitle: p.title })));
  return (
    <section>
      <h2 className="!mt-0">Profile</h2>
      <KeyValue
        compact
        rows={[
          ['Name', user.fullName],
          ['Status', <StatusPill key="s" status={user.approved ? 'active' : g.verificationStatus === 'rejected' ? 'rejected' : 'pending_review'} />],
          ['Graduation', g.cohortYear ? `Class of ${g.cohortYear}` : null],
          ['Programme', g.program],
          ['Email', user.email],
          ...(results.length
            ? [
                [
                  'Competition results',
                  <ul key="r">
                    {results.map((r) => (
                      <li key={r.id}>
                        {r.outcomeLabel}
                        {r.awardTitle ? ` · ${r.awardTitle}` : ''} <span className="adm-muted">({r.opportunity?.title})</span>
                      </li>
                    ))}
                  </ul>,
                ],
              ]
            : []),
        ]}
      />
    </section>
  );
}

function Activity({ entries }) {
  return (
    <section>
      <h2>Recent activity</h2>
      <div className="adm-card">
        {!entries ? (
          <Loading />
        ) : entries.length === 0 ? (
          <p className="adm-muted p-4">No activity yet.</p>
        ) : (
          <ul>
            {entries.map((e) => (
              <li key={e.id} className="border-b border-[var(--adm-border)] px-4 py-2 last:border-0">
                <p>
                  {e.label}
                  {e.subject && (
                    <>
                      {': '}
                      {e.projectId ? (
                        <Link to={`/app/projects/${e.projectId}`} className="adm-a">
                          {e.subject}
                        </Link>
                      ) : (
                        e.subject
                      )}
                    </>
                  )}
                </p>
                {e.reason && <p className="adm-muted">“{e.reason}”</p>}
                <p className="adm-muted text-[12px]">{relativeTime(e.at)}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

// Graduate dashboard: what needs attention, a compact tile row, then tables.
export default function GraduateOverview() {
  const { user, refresh } = useAuth();
  const { projects, error } = useMyProjects();
  const [applications, setApplications] = useState(null);
  const [activity, setActivity] = useState(null);
  const [intros, setIntros] = useState(null);
  const [declining, setDeclining] = useState(null);
  const loadIntros = () => api.get('/introductions').then((d) => setIntros(d.introductions)).catch(() => setIntros([]));

  useEffect(() => {
    document.title = 'Dashboard · ALU Ventures';
    refresh();
    api.get('/opportunities/applications').then((d) => setApplications(d.applications)).catch(() => setApplications([]));
    api.get('/account/activity').then((d) => setActivity(d.entries)).catch(() => setActivity([]));
    loadIntros();
  }, [refresh]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <AdminPage title="Dashboard"><Messages error={error} /></AdminPage>;
  if (!projects || !applications || !intros) return <AdminPage title="Dashboard"><Loading /></AdminPage>;

  const approved = projects.filter((p) => ['approved', 'funded', 'investor_limit_reached'].includes(p.status)).length;
  const underReview = applications.filter((a) => ['submitted', 'shortlisted'].includes(a.status)).length;
  const pendingIntros = intros.filter((i) => i.status === 'requested');
  const attention = [
    ...projects
      .filter((p) => p.status === 'revision_required' || (p.status === 'similarity_flagged' && !p.clarificationSubmittedAt))
      .map((p) => [p.status === 'revision_required' ? `Revision requested: ${p.title}` : `Clarification needed: ${p.title}`, `/app/projects/${p.id}`]),
    ...pendingIntros.map((i) => [`Introduction request from ${i.investor.name}: ${i.project.title}`, '/app/introductions', i]),
  ];
  const interest = (p) => {
    const mine = intros.filter((i) => i.project?.id === p.id);
    const pending = mine.filter((i) => i.status === 'requested').length;
    const introduced = mine.filter((i) => i.status === 'accepted').length;
    return pending ? `${pending} pending` : introduced ? `${introduced} introduced` : '—';
  };

  return (
    <AdminPage title="Dashboard">
      {!user.approved && (
        <p className="adm-message">
          Your graduate account is waiting for administrator review. You will be emailed when a decision is recorded; you can then submit projects.
        </p>
      )}
      {attention.length > 0 && (
        <section className="adm-card mb-6" aria-label="Needs attention">
          <h2 className="!m-0 border-b border-[var(--adm-border)] px-4 py-3">Needs attention</h2>
          <ul>
            {attention.map(([label, to, intro]) => (
              <li key={label} className="flex items-center justify-between gap-3 border-b border-[var(--adm-border)] px-4 py-3 last:border-0">
                <Link to={to} className="adm-a">
                  {label}
                </Link>
                {intro && (
                  <button type="button" className="adm-act adm-act-danger" onClick={() => setDeclining(intro)}>
                    Decline
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatTile label={`Projects (${approved} approved)`} value={projects.length} to="/app/projects" />
        <StatTile label={`Applications (${underReview} under review)`} value={applications.length} to="/app/opportunities" />
        <StatTile label={`Introductions (${pendingIntros.length} pending)`} value={intros.length} to="/app/introductions" />
        <StatTile label="Cohort" value={user.graduateProfile?.cohortYear || '—'} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="!m-0">Projects</h2>
            {user.approved && (
              <Link to="/app/projects/new" className="adm-primary">
                New project
              </Link>
            )}
          </div>
          <DataTable
            columns={[...projectColumns.filter((c) => !['updated', 'type'].includes(c.key)), { key: 'interest', label: 'Investor interest', render: interest }]}
            rows={projects}
            actions={projectActions}
            empty={user.approved ? 'No projects yet. Submit one with New project.' : 'No projects yet.'}
          />

          {user.approved && (
            <>
              <div className="mb-2 mt-6 flex items-center justify-between gap-2">
                <h2 className="!m-0">Applications</h2>
                <Link to="/app/opportunities" className="adm-a">
                  Opportunities
                </Link>
              </div>
              <DataTable
                columns={[
                  { key: 'opportunity', label: 'Opportunity', render: (a) => <span className="font-medium">{a.opportunity?.title}</span> },
                  { key: 'project', label: 'Project', render: (a) => a.project?.title },
                  { key: 'status', label: 'Status', render: (a) => <StatusPill status={a.status} /> },
                  { key: 'submitted', label: 'Submitted', render: (a) => formatDate(a.submittedAt) },
                ]}
                rows={applications.slice(0, 5)}
                empty="No applications yet."
              />
            </>
          )}
        </div>
        <aside className="min-w-0">
          <Profile user={user} projects={projects} />
          <Activity entries={activity} />
        </aside>
      </div>

      <ReasonDialog
        open={Boolean(declining)}
        reason="none"
        title={`Decline the introduction from ${declining?.investor.name}?`}
        description="The investor is told the request was declined. No contact details are shared."
        confirmLabel="Decline"
        tone="danger"
        onClose={() => setDeclining(null)}
        onConfirm={async () => {
          await api.post(`/introductions/${declining.id}/decline`);
          loadIntros();
        }}
      />
    </AdminPage>
  );
}
