import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BadgeCheck, Building2, CheckCircle2, Clock, GraduationCap, Info, Mail, MapPin, Target, Users } from 'lucide-react';
import { api } from '../../lib/api';
import { Alert, PageLoader, Pill, StatusPill, formatDate } from '../../components/ui';
import { Breadcrumb, SectionCard, initials } from '../../components/kit';
import { ExpressInterestDialog } from './Discover';

const INTRO_TEXT = {
  requested: 'Introduction requested — waiting for the founder to accept or decline.',
  accepted: 'Introduced — contact details are in My Introductions.',
  declined: 'The founder declined this introduction. No contact details were shared.',
};

// Project Detail (Figma "Investor View").
export default function InvestorProject() {
  const { code } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [expressing, setExpressing] = useState(false);

  const load = useCallback(
    () =>
      api
        .get(`/investor/projects/${code}`)
        .then((d) => {
          setData(d);
          document.title = `${d.project.title} · ALU Ventures`;
        })
        .catch((e) => setError(e.message)),
    [code]
  );
  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return (
      <Alert type="warning" action={<Link to="/app/discover" className="btn-secondary">Back to projects</Link>}>
        {error}
      </Alert>
    );
  }
  if (!data) return <PageLoader />;
  const { project: p, introduction } = data;
  const f = p.founder || {};

  return (
    <>
      <Breadcrumb items={[['Investor portal', '/app/discover'], ['Browse Approved Projects', '/app/discover'], [p.title]]} />
      {notice && <Alert type="success" className="mb-4">{notice}</Alert>}

      <section className="card mb-5 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{p.title}</h1>
              {p.rdbRegistered ? (
                <Pill tone="green">
                  <BadgeCheck className="h-3 w-3" aria-hidden="true" /> RDB registered #{p.companyNumber}
                </Pill>
              ) : (
                <Pill tone="slate">Idea stage · ALU verified</Pill>
              )}
              {p.status !== 'approved' && <StatusPill status={p.status} />}
            </div>
            {f.cohortYear && (
              <p className="mt-1">
                <span className="rounded bg-subtle px-2 py-0.5 text-xs ring-1 ring-line">ALU Cohort {f.cohortYear}</span>
              </p>
            )}
            <p className="mt-2 max-w-3xl text-sm text-muted">{p.summary}</p>
          </div>
          <div className="flex shrink-0 flex-col items-stretch gap-1.5 sm:items-end">
            {introduction ? (
              <Link to="/app/introductions" className="btn-secondary">
                <Mail className="h-4 w-4" aria-hidden="true" /> View introduction
              </Link>
            ) : p.acceptingIntroductions ? (
              <button type="button" className="btn-primary" onClick={() => setExpressing(true)}>
                <Mail className="h-4 w-4" aria-hidden="true" /> Express Interest
              </button>
            ) : (
              <span className="text-xs text-muted">No longer accepting introductions</span>
            )}
            <span className="font-mono text-[11px] text-muted">{p.projectCode}</span>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3 text-xs">
          <span className="rounded bg-subtle px-2 py-0.5 ring-1 ring-line">{p.sector}</span>
          <span className="rounded bg-subtle px-2 py-0.5 ring-1 ring-line">Stage: {p.stage}</span>
          <span className="inline-flex items-center gap-1 rounded bg-subtle px-2 py-0.5 ring-1 ring-line">
            <MapPin className="h-3 w-3" aria-hidden="true" /> {p.country}
          </span>
          {p.fundingSought && <span className="rounded bg-subtle px-2 py-0.5 ring-1 ring-line">Seeking: {p.fundingSought}</span>}
          <span className="ml-auto inline-flex items-center gap-1 text-muted">
            <Clock className="h-3 w-3" aria-hidden="true" /> Approved {formatDate(p.approvedAt)}
          </span>
        </div>
      </section>

      {introduction && (
        <Alert type={introduction.status === 'declined' ? 'warning' : 'info'} className="mb-5">
          {INTRO_TEXT[introduction.status]}
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-5">
          <SectionCard icon={Target} title="Venture Overview & Market Need">
            <p className="whitespace-pre-line text-sm leading-relaxed">{p.description}</p>
          </SectionCard>
          <SectionCard icon={Users} title="Investment status" meta={`Limit: ${p.investorLimit} confirmed investors`}>
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-2xl font-semibold tabular-nums">
                {p.confirmedInvestors}
                <span className="text-sm font-normal text-muted"> / {p.investorLimit}</span>
              </p>
              {p.confirmedInvestors === 1 && (
                <Pill tone="amber">
                  <Users className="h-3 w-3" aria-hidden="true" /> 1 Investor
                </Pill>
              )}
            </div>
            <p className="mt-2 text-sm text-muted">
              Confirmed investment outcomes recorded by the administrator after both the founder and the investor confirmed
              them. A project leaves discovery when it is fully funded or reaches two confirmed investors. Introductions alone
              are not counted.
            </p>
          </SectionCard>
        </div>

        <aside className="space-y-5">
          <section className="card p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted">Venture founder</h2>
              <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 dark:text-green-400">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> ALU verified
              </span>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-alu-navy font-semibold text-white" aria-hidden="true">
                {initials(f.name)}
              </span>
              <div>
                <p className="font-semibold">{f.name}</p>
                <p className="text-xs text-accent">
                  {f.cohortYear ? `Class of '${String(f.cohortYear).slice(-2)}` : 'ALU graduate'}
                  {f.program ? `, ${f.program}` : ''}
                </p>
              </div>
            </div>
            <dl className="mt-3 divide-y divide-line rounded-md text-xs ring-1 ring-line">
              <div className="flex items-center justify-between px-3 py-2">
                <dt className="text-muted">Degree verification</dt>
                <dd className="inline-flex items-center gap-1 font-medium text-green-700 dark:text-green-400">
                  <GraduationCap className="h-3.5 w-3.5" aria-hidden="true" /> Admin reviewed
                </dd>
              </div>
              <div className="flex items-center justify-between px-3 py-2">
                <dt className="text-muted">Contact details</dt>
                <dd className="font-medium">{introduction?.status === 'accepted' ? 'Shared with you' : 'After acceptance'}</dd>
              </div>
            </dl>
          </section>

          <section className="card p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted">Corporate record</h2>
              <span className="text-xs text-muted">{p.country}</span>
            </div>
            <dl className="mt-3 space-y-2 text-xs">
              {(p.rdbRegistered
                ? [
                    ['Legal entity name', p.companyName],
                    ['Entity type', 'Registered company (RDB)'],
                    ['RDB registration ID', <span key="r" className="font-mono text-accent">{p.companyNumber}</span>],
                  ]
                : [['Entity type', 'Idea stage — not yet registered']]
              )
                .concat([
                  ['Project code', <span key="c" className="font-mono">{p.projectCode}</span>],
                  ['Approved on', formatDate(p.approvedAt)],
                ])
                .map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-2">
                    <dt className="text-muted">{k}</dt>
                    <dd className="text-right font-medium">{v}</dd>
                  </div>
                ))}
            </dl>
          </section>

          <section className="card bg-accent-soft/60 p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Info className="h-4 w-4 text-accent" aria-hidden="true" /> ALU Ventures review
            </h2>
            <p className="mt-1 text-xs text-muted">
              This record was approved by an ALU Ventures administrator after reviewing the founder&apos;s degree and, for
              registered companies, their RDB certificate. It is not an investment recommendation; do your own due diligence.
            </p>
            {p.rdbRegistered && (
              <p className="mt-2 inline-flex items-center gap-1 text-xs text-muted">
                <Building2 className="h-3.5 w-3.5" aria-hidden="true" /> Certificate reviewed — documents stay private.
              </p>
            )}
          </section>
        </aside>
      </div>

      <ExpressInterestDialog
        project={expressing ? p : null}
        onClose={() => setExpressing(false)}
        onDone={(res) => {
          setNotice(res.duplicate ? 'You already requested an introduction to this project.' : 'Introduction requested. The founder will accept or decline before contact details are shared.');
          load();
        }}
      />
    </>
  );
}
