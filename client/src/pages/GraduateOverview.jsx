import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { relativeTime } from '../components/kit';
import ReasonDialog from '../components/ReasonDialog';
import { Loading, Messages } from '../components/admin';
import { MemberAvatar, MemberCard, MemberColumns } from '../layouts/MemberShell';
import { useMyProjects } from './graduate/MyProjects';

// Graduate Activity: needs-attention items, a post box (coming next), the
// graduate's own events, and on the right their next steps and profile.

const LIVE = ['approved', 'funded', 'investor_limit_reached'];
// Events the graduate did themselves; the rest come from the platform.
const OWN = new Set([
  'account.registered',
  'account.email_verified',
  'project.submitted',
  'project.revised',
  'project.sector_confirmed',
  'project.clarification_submitted',
  'application.submitted',
  'introduction.accepted',
  'introduction.declined',
]);
const FILTERS = [
  ['all', 'All activity', () => true],
  ['projects', 'Projects', (e) => e.action.startsWith('project.')],
  ['opportunities', 'Opportunities', (e) => e.action.startsWith('application.')],
  ['introductions', 'Introductions', (e) => e.action.startsWith('introduction.')],
  ['account', 'Account', (e) => e.action.startsWith('account.') || e.action.startsWith('document.')],
];

function NextSteps({ data }) {
  if (!data)
    return (
      <MemberCard title="Next steps">
        <div className="p-5">
          <Loading />
        </div>
      </MemberCard>
    );
  const pct = data.total ? Math.round((data.done / data.total) * 100) : 0;
  return (
    <MemberCard
      title="Next steps"
      action={
        <span className="text-[13px] font-semibold tabular-nums text-muted">
          {data.done}/{data.total}
        </span>
      }
    >
      <div className="px-5 pb-5 pt-3">
        <div
          className="h-1.5 overflow-hidden rounded-full bg-subtle"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={data.total}
          aria-valuenow={data.done}
          aria-label="Steps completed"
        >
          <div className="h-full rounded-full bg-accent transition-[width] duration-700" style={{ width: `${pct}%` }} />
        </div>
        <ol className="mt-4 space-y-1">
          {data.steps.map((s) => {
            const current = s.key === data.current;
            const marker = (
              <span
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                  s.done ? 'border-accent bg-accent text-white' : current ? 'border-accent' : 'border-line'
                }`}
                aria-hidden="true"
              >
                {s.done && <Check className="h-3 w-3" strokeWidth={2.5} />}
              </span>
            );
            if (current) {
              return (
                <li key={s.key} className="rounded-xl border border-accent bg-accent-soft/40 p-4">
                  <div className="flex gap-3">
                    {marker}
                    <div className="min-w-0">
                      <p className="text-[14px] font-semibold text-ink">{s.label}</p>
                      <p className="mt-0.5 text-[13px] leading-[1.5] text-muted">{s.detail}</p>
                    </div>
                  </div>
                  {s.action && (
                    <Link
                      to={s.action.to}
                      className="mt-3 flex h-10 items-center justify-center rounded-lg bg-accent text-[14px] font-semibold text-white transition-colors hover:bg-accent-strong"
                    >
                      {s.action.label}
                    </Link>
                  )}
                </li>
              );
            }
            return (
              <li key={s.key} className={`flex gap-3 px-1 py-2 text-[14px] ${s.notApplicable ? 'text-muted' : 'text-ink'}`}>
                {marker}
                <span className="min-w-0">
                  <span className={s.done ? 'text-muted line-through decoration-line' : ''}>{s.label}</span>
                  {s.notApplicable && <span className="block text-[12px]">Not needed for idea-stage projects</span>}
                  <span className="sr-only">{s.done ? ' (done)' : s.notApplicable ? '' : ' (to do)'}</span>
                </span>
              </li>
            );
          })}
        </ol>
        {!data.current && <p className="mt-3 text-[13px] text-muted">All steps are done.</p>}
      </div>
    </MemberCard>
  );
}

function ProfileCard({ user, projects }) {
  const g = user.graduateProfile || {};
  const results = projects.flatMap((p) => (p.competitionResults || []).map((r) => ({ ...r, projectTitle: p.title })));
  const status = user.approved ? 'Approved' : g.verificationStatus === 'rejected' ? 'Not approved' : 'Pending review';
  return (
    <MemberCard title="Profile">
      <div className="px-5 pb-5 pt-3">
        <div className="flex items-center gap-3">
          <MemberAvatar user={user} size={44} />
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold text-ink">{user.fullName}</p>
            <p className="text-[13px] text-muted">
              {status}
              {g.cohortYear ? ` · Class of ${g.cohortYear}` : ''}
            </p>
          </div>
        </div>
        {g.program && <p className="mt-3 text-[13px] text-muted">{g.program}</p>}
        {results.length > 0 && (
          <div className="mt-4 border-t border-line pt-3">
            <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">Competition results</p>
            <ul className="mt-2 space-y-1.5 text-[13px]">
              {results.map((r) => (
                <li key={r.id}>
                  <span className="font-medium text-ink">{r.outcomeLabel}</span>
                  {r.awardTitle ? ` · ${r.awardTitle}` : ''} <span className="text-muted">({r.opportunity?.title})</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </MemberCard>
  );
}

export default function GraduateOverview() {
  const { user, refresh } = useAuth();
  const { projects, error } = useMyProjects();
  const [activity, setActivity] = useState(null);
  const [steps, setSteps] = useState(null);
  const [intros, setIntros] = useState(null);
  const [declining, setDeclining] = useState(null);
  const [filter, setFilter] = useState('all');
  const loadIntros = () =>
    api
      .get('/introductions')
      .then((d) => setIntros(d.introductions))
      .catch(() => setIntros([]));

  useEffect(() => {
    document.title = 'Activity · ALU Ventures';
    refresh();
    api
      .get('/account/activity?limit=50')
      .then((d) => setActivity(d.entries))
      .catch(() => setActivity([]));
    api
      .get('/account/next-steps')
      .then(setSteps)
      .catch(() => setSteps(null));
    loadIntros();
  }, [refresh]); // eslint-disable-line react-hooks/exhaustive-deps

  // The audit trail plus "listed" events for live, publicly consented projects.
  const feed = useMemo(() => {
    if (!activity || !projects) return null;
    const listed = projects
      .filter((p) => LIVE.includes(p.status) && p.publicationConsent && p.approvedAt)
      .map((p) => ({
        id: `listed-${p.id}`,
        action: 'project.listed',
        label: 'Listed on Browse ventures',
        subject: p.title,
        projectId: p.id,
        at: p.approvedAt,
      }));
    const test = FILTERS.find(([k]) => k === filter)[2];
    return [...activity, ...listed].filter(test).sort((a, b) => new Date(b.at) - new Date(a.at));
  }, [activity, projects, filter]);

  if (error) return <Messages error={error} />;
  if (!projects || !intros) return <Loading />;

  const attention = [
    ...projects
      .filter((p) => p.status === 'revision_required' || (p.status === 'similarity_flagged' && !p.clarificationSubmittedAt))
      .map((p) => [p.status === 'revision_required' ? `Revision requested: ${p.title}` : `Clarification needed: ${p.title}`, `/app/projects/${p.id}`]),
    ...intros.filter((i) => i.status === 'requested').map((i) => [`Introduction request from ${i.investor.name}: ${i.project.title}`, '/app/introductions', i]),
  ];

  return (
    <MemberColumns
      aside={
        <>
          <NextSteps data={steps} />
          <ProfileCard user={user} projects={projects} />
        </>
      }
    >
      {!user.approved && (
        <p className="rounded-xl border border-line bg-surface px-5 py-4 text-[14px] text-ink">
          Your graduate account is waiting for administrator review. You will be emailed when a decision is recorded; you can then submit projects.
        </p>
      )}

      {attention.length > 0 && (
        <MemberCard title="Needs attention">
          <ul className="mt-2">
            {attention.map(([label, to, intro]) => (
              <li key={label} className="flex items-center justify-between gap-3 border-t border-line px-5 py-3 first:border-0">
                <Link to={to} className="text-[14px] font-medium text-accent hover:underline">
                  {label}
                </Link>
                {intro && (
                  <button type="button" className="text-[13px] font-semibold text-[#b91c1c] hover:underline" onClick={() => setDeclining(intro)}>
                    Decline
                  </button>
                )}
              </li>
            ))}
          </ul>
        </MemberCard>
      )}

      {/* Posts arrive in a later release; the box is shown but disabled. */}
      <section className="flex items-center gap-4 rounded-xl border border-line bg-surface p-5" aria-label="Write a post">
        <MemberAvatar user={user} size={44} />
        <div
          className="flex h-11 flex-1 items-center justify-between gap-3 rounded-full border border-line bg-subtle px-5 text-[14px] text-muted"
          aria-disabled="true"
        >
          Write a post…
          <span className="rounded-full border border-line bg-surface px-2.5 py-0.5 text-[12px] font-medium">Coming next</span>
        </div>
      </section>

      <section aria-label="Your activity">
        <div className="mb-3 flex items-center justify-between gap-3">
          <label className="relative">
            <span className="sr-only">Show</span>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="h-10 cursor-pointer rounded-lg border border-line bg-surface pl-3 pr-8 text-[14px] font-semibold text-ink outline-none focus:border-accent"
            >
              {FILTERS.map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          {feed && <span className="text-[13px] text-muted">{feed.length} events</span>}
        </div>
        <div className="rounded-xl border border-line bg-surface">
          {!feed ? (
            <div className="p-5">
              <Loading />
            </div>
          ) : feed.length === 0 ? (
            <p className="px-5 py-10 text-center text-[14px] text-muted">Nothing here yet. Your project and application updates will appear here.</p>
          ) : (
            <ul>
              {feed.map((e, i) => (
                <li key={e.id} className="land-rise flex gap-3 border-t border-line px-5 py-4 first:border-0" style={{ '--d': `${Math.min(i, 8) * 40}ms` }}>
                  {OWN.has(e.action) ? (
                    <MemberAvatar user={user} size={36} />
                  ) : (
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-subtle text-[11px] font-semibold text-muted ring-1 ring-line"
                      aria-hidden="true"
                    >
                      AV
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] leading-[1.5] text-ink">
                      <span className="font-semibold">{e.label}</span>
                      {e.subject && (
                        <>
                          {' · '}
                          {e.projectId ? (
                            <Link to={`/app/projects/${e.projectId}`} className="text-accent hover:underline">
                              {e.subject}
                            </Link>
                          ) : (
                            e.subject
                          )}
                        </>
                      )}
                    </p>
                    {e.reason && <p className="mt-0.5 text-[13px] text-muted">“{e.reason}”</p>}
                  </div>
                  <time className="shrink-0 text-[13px] text-muted" dateTime={e.at}>
                    {relativeTime(e.at)}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

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
    </MemberColumns>
  );
}
