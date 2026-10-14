import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Clock,
  ClipboardCheck,
  FileCheck2,
  GraduationCap,
  Handshake,
  MailCheck,
  Plus,
  ShieldCheck,
  Trophy,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Alert, PageLoader, StatusPill, formatDate } from '../components/ui';
import Avatar from '../components/Avatar';
import { Breadcrumb, StatTile, relativeTime } from '../components/kit';
import { VenturesPanel, useMyProjects } from './graduate/MyProjects';
import ReasonDialog from '../components/ReasonDialog';

function ProfileCard({ user }) {
  const g = user.graduateProfile || {};
  return (
    <section className="card p-4">
      <div className="flex items-center gap-3">
        <Avatar name={user.fullName} src={user.hasPhoto ? '/api/account/photo' : null} size="lg" />
        <div className="min-w-0">
          <p className="font-semibold">{user.fullName}</p>
          <p className="text-xs text-muted">Alum Founder · ALU</p>
          <p className="truncate text-xs text-muted">{user.email}</p>
        </div>
      </div>
      <dl className="mt-4 space-y-2 rounded-md bg-subtle p-3 text-xs ring-1 ring-line">
        <div className="flex justify-between gap-2">
          <dt className="text-muted">Founder status</dt>
          <dd className={user.approved ? 'font-semibold text-green-700 dark:text-green-400' : 'font-semibold text-amber-700 dark:text-amber-300'}>
            {user.approved ? 'Verified Alumnus' : g.verificationStatus === 'rejected' ? 'Not approved' : 'Pending review'}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted">Graduation</dt>
          <dd className="text-right">{g.cohortYear ? `Class of ${g.cohortYear}` : '—'}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted">Programme</dt>
          <dd className="text-right">{g.program || '—'}</dd>
        </div>
        <div>
          <dt className="text-muted">Contact</dt>
          <dd className="mt-0.5 break-all text-accent">{user.email}</dd>
          {user.phone && <dd className="text-muted">{user.phone}</dd>}
        </div>
      </dl>
    </section>
  );
}

const DOT = {
  approve: 'bg-green-500',
  submitted: 'bg-accent',
  reject: 'bg-red-500',
  similarity: 'bg-purple-500',
};
const dotFor = (action) =>
  action.endsWith('.approve') || action.endsWith('approved') || action.endsWith('selected')
    ? DOT.approve
    : action.includes('reject') || action.includes('not_selected')
      ? DOT.reject
      : action.includes('similarity')
        ? DOT.similarity
        : DOT.submitted;

function RecentActivity({ entries }) {
  return (
    <section className="card p-4">
      <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted">Recent activity</h2>
      {!entries ? (
        <p className="mt-3 text-sm text-muted">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="mt-3 text-sm text-muted">No activity yet.</p>
      ) : (
        <ol className="relative mt-3 space-y-4 border-l border-line pl-4">
          {entries.map((e) => (
            <li key={e.id} className="relative text-sm">
              <span className={`absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-surface ${dotFor(e.action)}`} aria-hidden="true" />
              <p className="font-medium">
                {e.label}
                {e.subject && (
                  <>
                    {': '}
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
              {e.reason && <p className="text-xs text-muted">“{e.reason}”</p>}
              <p className="mt-0.5 flex items-center gap-1 text-xs text-muted">
                <Clock className="h-3 w-3" aria-hidden="true" /> {relativeTime(e.at)}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function PendingSteps({ user }) {
  const status = user.graduateProfile?.verificationStatus;
  const steps = [
    { done: true, icon: MailCheck, title: 'Alumni email confirmed', body: user.email },
    { done: true, icon: FileCheck2, title: 'Degree certificate received', body: 'Stored privately. Automated checks help the administrator but never decide on their own.' },
    { current: true, icon: Clock, title: 'Administrator review', body: 'You will receive an email as soon as a decision is recorded.' },
    { icon: ShieldCheck, title: 'Verified graduate', body: 'Submit ventures, receive investor introductions and apply to funding opportunities.' },
  ];
  return (
    <section className="card p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">Account verification</h2>
        <StatusPill status={status === 'rejected' ? 'rejected' : 'pending_review'} />
      </div>
      <p className="mt-1 text-sm text-muted">
        An ALU Ventures administrator reviews every graduate account against the uploaded degree evidence. You can submit
        projects once your account is approved.
      </p>
      <ol className="mt-5 space-y-4">
        {steps.map(({ done, current, icon: Icon, title, body }) => (
          <li key={title} className="flex gap-3">
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${
                done ? 'border-green-500 bg-green-50 text-green-600 dark:bg-green-500/15' : current ? 'border-accent bg-accent-soft text-accent' : 'border-line text-muted'
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-medium">{title}</p>
              <p className="text-sm text-muted">{body}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function GrantSubmissions({ applications }) {
  return (
    <section className="card overflow-hidden">
      <header className="flex items-center justify-between gap-2 px-4 py-3">
        <h2 className="flex items-center gap-2 font-semibold">
          <Trophy className="h-4 w-4 text-accent" aria-hidden="true" /> Active Grant Submissions
        </h2>
        <Link to="/app/opportunities" className="inline-flex items-center gap-1 text-sm text-accent hover:underline">
          View all opportunities <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </header>
      {applications.length === 0 ? (
        <p className="border-t border-line px-4 py-6 text-center text-sm text-muted">You have not applied to any opportunity yet.</p>
      ) : (
        <div className="grid gap-3 border-t border-line p-4 sm:grid-cols-2">
          {applications.slice(0, 4).map((a) => (
            <div key={a.id} className="rounded-md bg-accent-soft/60 p-3 ring-1 ring-line">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold">{a.opportunity?.title}</p>
                <StatusPill status={a.status} />
              </div>
              <p className="mt-1 text-xs text-muted">Project: {a.project?.title}</p>
              {a.decisionNote && <p className="mt-1 text-xs">“{a.decisionNote}”</p>}
              <p className="mt-2 text-[11px] text-muted">Submitted: {formatDate(a.submittedAt)}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// Graduate Founder Dashboard (Figma). Every figure is live.
export default function GraduateOverview() {
  const { user, refresh } = useAuth();
  const { projects, error } = useMyProjects();
  const [applications, setApplications] = useState(null);
  const [activity, setActivity] = useState(null);
  const [intros, setIntros] = useState(null);
  const [declining, setDeclining] = useState(null);
  const loadIntros = () => api.get('/introductions').then((d) => setIntros(d.introductions)).catch(() => setIntros([]));

  useEffect(() => {
    document.title = 'Graduate Dashboard · ALU Ventures';
    refresh();
    api.get('/opportunities/applications').then((d) => setApplications(d.applications)).catch(() => setApplications([]));
    api.get('/account/activity').then((d) => setActivity(d.entries)).catch(() => setActivity([]));
    loadIntros();
  }, [refresh]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <Alert type="error">{error}</Alert>;
  if (!projects || !applications || !intros) return <PageLoader />;

  const count = (...s) => projects.filter((p) => s.includes(p.status)).length;
  const approvedCount = count('approved', 'funded', 'investor_limit_reached');
  const attention = projects.filter((p) => p.status === 'revision_required' || (p.status === 'similarity_flagged' && !p.clarificationSubmittedAt));
  const underReview = applications.filter((a) => ['submitted', 'shortlisted'].includes(a.status));
  const pendingIntros = intros.filter((i) => i.status === 'requested');
  const interest = (p) => {
    const mine = intros.filter((i) => i.project?.id === p.id);
    const pending = mine.filter((i) => i.status === 'requested').length;
    const introduced = mine.filter((i) => i.status === 'accepted').length;
    if (pending) return <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-800 ring-1 ring-inset ring-amber-600/25 dark:bg-amber-500/15 dark:text-amber-300">{pending} intro pending</span>;
    if (introduced) return <span className="text-xs text-green-700 dark:text-green-400">{introduced} introduced</span>;
    return <span className="text-xs text-muted">{p.status === 'approved' ? '0 inquiries' : '—'}</span>;
  };
  const g = user.graduateProfile || {};

  return (
    <>
      <Breadcrumb items={[['Alumni', '/app'], [user.fullName, null], ['Ventures']]} />
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Graduate Founder Dashboard</h1>
        {user.approved && (
          <Link to="/app/projects/new" className="btn-primary">
            <Plus className="h-4 w-4" aria-hidden="true" /> New Project
          </Link>
        )}
      </div>

      {pendingIntros.slice(0, 1).map((i) => (
        <div key={i.id} className="mb-3 flex flex-col gap-3 rounded-md border border-blue-200 bg-accent-soft/70 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-blue-500/30">
          <div className="flex gap-3">
            <Handshake className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
            <div>
              <p className="font-semibold">Action Required: Introduction Request from {i.investor.name}{i.investor.organisation ? ` (${i.investor.organisation})` : ''}</p>
              <p className="text-sm text-muted">
                They requested an introduction to discuss your project {i.project.title}. Review and accept or decline contact sharing.
                {pendingIntros.length > 1 && ` ${pendingIntros.length - 1} more request${pendingIntros.length > 2 ? 's' : ''} waiting.`}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <button type="button" className="text-sm font-medium text-red-600 hover:underline dark:text-red-400" onClick={() => setDeclining(i)}>
              Decline
            </button>
            <Link to="/app/introductions" className="btn-primary">
              Review &amp; Respond <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      ))}

      {attention.map((p) => (
        <Alert
          key={p.id}
          type="warning"
          className="mb-3"
          title={p.status === 'revision_required' ? `Action Required: Revision requested for ${p.title}` : `Action Required: Clarification needed for ${p.title}`}
          action={
            <Link to={`/app/projects/${p.id}`} className="btn-primary">
              Review &amp; Respond <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          }
        >
          {p.status === 'revision_required' ? p.reviewNote : 'Your project is similar to an approved project. Explain what makes it distinct.'}
        </Alert>
      ))}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Registered projects"
          icon={Building2}
          value={projects.length}
          unit={`(${approvedCount} approved)`}
          badge={approvedCount > 0 ? <StatusPill status="approved" label="Approved" /> : projects.length ? <StatusPill status="pending_review" /> : null}
        />
        <StatTile
          label="Applications"
          icon={ClipboardCheck}
          value={applications.length}
          unit={`(${underReview.length} under review)`}
          status={underReview.length ? `● ${underReview.slice(0, 2).map((a) => a.opportunity?.title).join(' + ')}` : 'No open applications'}
        />
        <StatTile
          label="Introductions"
          icon={Handshake}
          value={intros.length}
          unit={`(${pendingIntros.length} pending response)`}
          badge={pendingIntros.length ? <StatusPill status="requested" label="Pending Response" /> : intros.some((i) => i.status === 'accepted') ? <StatusPill status="accepted" /> : null}
          status={intros.length ? undefined : 'No investor requests yet'}
        />
        <StatTile label="Verified standing" icon={GraduationCap} value={g.cohortYear ? `Class of ${g.cohortYear}` : '—'} status={g.program || undefined}>
          <p className={`mt-1 inline-flex items-center gap-1 text-xs font-medium ${user.approved ? 'text-green-700 dark:text-green-400' : 'text-amber-700 dark:text-amber-300'}`}>
            {user.approved ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> : <Clock className="h-3.5 w-3.5" aria-hidden="true" />}
            {user.approved ? 'Verified ALU graduate' : 'Pending administrator review'}
          </p>
        </StatTile>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-6">
          {!user.approved ? (
            <PendingSteps user={user} />
          ) : projects.length ? (
            <VenturesPanel projects={projects} extraColumn={{ title: 'Investor interest', render: interest }} />
          ) : (
            <div className="card flex flex-col items-center px-6 py-10 text-center">
              <h2 className="text-base font-semibold">No projects submitted yet</h2>
              <p className="mt-1 max-w-md text-sm text-muted">Your account is verified — submit a venture to have it reviewed and published.</p>
              <Link to="/app/projects/new" className="btn-primary mt-4">
                <Plus className="h-4 w-4" aria-hidden="true" /> Submit Your First Project
              </Link>
            </div>
          )}
          {user.approved && <GrantSubmissions applications={applications} />}
        </div>
        <aside className="space-y-6">
          <ProfileCard user={user} />
          <RecentActivity entries={activity} />
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
    </>
  );
}
