import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { Field, formatDate } from '../../components/ui';
import ReasonDialog from '../../components/ReasonDialog';
import { AdminPage, DataTable, KeyValue, ListLayout, Loading, Messages, Pill, SearchInput, SidePanel, StatusPill, StatusSelect } from '../../components/admin';

const TYPE_LABEL = { grant: 'Grant', hackathon: 'Hackathon', competition: 'Competition', other: 'Other' };
const TYPES = [['', 'All'], ...Object.entries(TYPE_LABEL)];
const daysUntil = (d) => Math.ceil((new Date(d) - Date.now()) / 86400000);

function criteriaText(c = {}) {
  const parts = ['Verified ALU graduates'];
  if (c.sectors?.length) parts.push(`Sectors: ${c.sectors.join(', ')}`);
  if (c.projectTypes?.length === 1) parts.push(c.projectTypes[0] === 'company' ? 'Registered companies only' : 'Idea-stage projects only');
  if (c.stages?.length) parts.push(`Stages: ${c.stages.join(', ')}`);
  if (c.minCohortYear || c.maxCohortYear) parts.push(`Cohorts ${c.minCohortYear || '…'}–${c.maxCohortYear || '…'}`);
  return parts.join(' · ');
}

// Opportunities for graduates (FR08): one table, details in a side panel.
export default function Opportunities() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [applications, setApplications] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  // ?view=applied opens "My applications" (the sidebar's Results link).
  const [params, setParams] = useSearchParams();
  const view = params.get('view') === 'applied' ? 'applied' : 'open';
  const setView = (v) => setParams(v === 'applied' ? { view: 'applied' } : {});
  const [type, setType] = useState('');
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState(null);
  const [applying, setApplying] = useState(null);
  const [projectId, setProjectId] = useState('');

  const load = useCallback(() => {
    Promise.all([api.get('/opportunities'), api.get('/opportunities/applications')])
      .then(([o, a]) => {
        setData(o.opportunities);
        setApplications(a.applications);
      })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    document.title = 'Opportunities · ALU Ventures';
    load();
  }, [load]);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (data || [])
      .filter((o) => (!type || o.type === type) && (!term || `${o.title} ${o.organiser || ''} ${o.description}`.toLowerCase().includes(term)))
      .sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
  }, [data, type, q]);
  const appRows = applications.filter((a) => !type || a.opportunity?.type === type);
  const viewOptions = [
    ['open', 'Open opportunities', data?.length ?? null],
    ['applied', 'My applications', applications.length],
  ];
  const eligibleFor = (o) => o.projects.filter((p) => !p.applied && p.issues.length === 0);
  const startApply = (o) => {
    setProjectId(String(eligibleFor(o)[0]?.id || ''));
    setApplying(o);
  };
  const open = data?.find((o) => o.id === openId);

  return (
    <AdminPage title="Opportunities" meta={data ? `${view === 'open' ? rows.length : appRows.length} shown` : null}>
      <Messages notice={notice} error={error} />
      {!user.approved && <p className="adm-message">You can apply once your graduate account and a project are approved.</p>}
      <ListLayout
        toolbar={
          <>
            <SearchInput value={q} onChange={setQ} placeholder="Title or organiser" />
            <StatusSelect value={view} options={viewOptions} onChange={setView} label="Show" />
          </>
        }
        filters={[
          { title: 'View', value: view, onChange: setView, options: viewOptions },
          { title: 'Type', value: type, onChange: setType, options: TYPES },
        ]}
      >
        {!data ? (
          <Loading />
        ) : view === 'open' ? (
          <DataTable
            columns={[
              {
                key: 'title',
                label: 'Opportunity',
                render: (o) => (
                  <>
                    <button type="button" className="adm-a text-left font-medium" onClick={() => setOpenId(o.id)}>
                      {o.title}
                    </button>
                    <div className="adm-muted text-[12px]">{o.organiser || 'ALU Ventures'}</div>
                  </>
                ),
              },
              { key: 'type', label: 'Type', render: (o) => <Pill>{TYPE_LABEL[o.type]}</Pill> },
              { key: 'prize', label: 'Prize', render: (o) => o.prize || '—' },
              {
                key: 'deadline',
                label: 'Deadline',
                render: (o) => (
                  <>
                    {formatDate(o.deadline)}
                    <div className="adm-muted text-[12px]">{daysUntil(o.deadline) <= 0 ? 'closes today' : `${daysUntil(o.deadline)} days left`}</div>
                  </>
                ),
              },
              {
                key: 'you',
                label: 'Your projects',
                render: (o) => {
                  const applied = o.projects.find((p) => p.applied);
                  if (applied) return <StatusPill status={applied.applied} />;
                  const n = eligibleFor(o).length;
                  return n ? `${n} eligible` : <span className="adm-muted">None eligible</span>;
                },
              },
            ]}
            rows={rows}
            actions={(o) => (
              <>
                <button type="button" className="adm-act" onClick={() => setOpenId(o.id)}>
                  Details
                </button>
                {user.approved && eligibleFor(o).length > 0 && (
                  <button type="button" className="adm-act" onClick={() => startApply(o)}>
                    Apply
                  </button>
                )}
              </>
            )}
            empty={data.length ? 'No opportunities match.' : 'No open opportunities right now.'}
          />
        ) : (
          <DataTable
            columns={[
              { key: 'opp', label: 'Opportunity', render: (a) => <span className="font-medium">{a.opportunity?.title}</span> },
              { key: 'type', label: 'Type', render: (a) => TYPE_LABEL[a.opportunity?.type] || '—' },
              { key: 'project', label: 'Project', render: (a) => a.project?.title },
              { key: 'status', label: 'Status', render: (a) => <StatusPill status={a.status} /> },
              { key: 'note', label: 'Feedback', render: (a) => a.decisionNote || '—' },
              { key: 'submitted', label: 'Submitted', render: (a) => formatDate(a.submittedAt) },
            ]}
            rows={appRows}
            empty="You have not applied to any opportunity yet."
          />
        )}
      </ListLayout>

      {open && (
        <SidePanel title={open.title} onClose={() => setOpenId(null)}>
          <KeyValue
            rows={[
              ['Type', TYPE_LABEL[open.type]],
              ['Organiser', open.organiser || 'ALU Ventures'],
              ['Prize', open.prize],
              ['Deadline', formatDate(open.deadline, true)],
              ['Who can apply', criteriaText(open.criteria)],
              ...(open.criteria?.notes ? [['Notes', open.criteria.notes]] : []),
              ['Description', <span key="d" className="whitespace-pre-line">{open.description}</span>],
              ...(open.applicationInstructions ? [['If selected', open.applicationInstructions]] : []),
            ]}
          />
          <h2>Your projects</h2>
          <DataTable
            columns={[
              { key: 'title', label: 'Project', render: (p) => p.title },
              { key: 'state', label: 'Eligibility', render: (p) => (p.applied ? <StatusPill status={p.applied} /> : p.issues.length ? <span className="adm-muted">{p.issues.join(' ')}</span> : 'Eligible') },
            ]}
            rows={open.projects}
            empty="You have no projects yet. Submit one and have it approved to apply."
          />
          {user.approved && eligibleFor(open).length > 0 && (
            <button type="button" className="adm-primary mt-4" onClick={() => startApply(open)}>
              Apply
            </button>
          )}
        </SidePanel>
      )}

      <ReasonDialog
        open={Boolean(applying)}
        title={`Apply to ${applying?.title}`}
        description="ALU staff review applications against the published criteria and record every decision with a reason."
        reason="required"
        reasonLabel="Why is your project a good fit?"
        confirmLabel="Submit application"
        onClose={() => setApplying(null)}
        onConfirm={async (motivation) => {
          try {
            await api.post(`/opportunities/${applying.id}/apply`, { projectId: Number(projectId), motivation });
          } catch (err) {
            if (err.details?.issues) err.message = err.details.issues.join(' ');
            if (err.fields?.motivation) err.fields = { reason: err.fields.motivation };
            throw err;
          }
          setNotice(`Application submitted to ${applying.title}.`);
          load();
        }}
      >
        <Field label="Project" htmlFor="apply-project">
          <select id="apply-project" className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            {applying &&
              eligibleFor(applying).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title} ({p.projectCode})
                </option>
              ))}
          </select>
        </Field>
      </ReasonDialog>
    </AdminPage>
  );
}
