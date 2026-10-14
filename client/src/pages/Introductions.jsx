import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Circle, Handshake, Inbox, Mail, Phone } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Alert, PageLoader, StatusPill, formatDate } from '../components/ui';
import { Breadcrumb, CountTabs, InitialsBox, StatTile } from '../components/kit';
import ReasonDialog from '../components/ReasonDialog';

const STATUS_LABEL = {
  investor: { requested: 'Awaiting founder', accepted: 'Introduced', declined: 'Declined' },
  graduate: { requested: 'Awaiting your response', accepted: 'Introduced', declined: 'Declined' },
};

function Step({ done, label, by }) {
  return (
    <li className="flex items-center gap-1.5 text-xs">
      {done ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600" aria-label="Confirmed" /> : <Circle className="h-3.5 w-3.5 text-muted" aria-label="Not yet" />}
      <span className={done ? '' : 'text-muted'}>
        {label} <span className="text-muted">({by})</span>
      </span>
    </li>
  );
}

function Contact({ name, email, phone, extra }) {
  return (
    <div className="rounded-md bg-green-50/70 p-3 text-sm ring-1 ring-green-600/20 dark:bg-green-500/10">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-green-800 dark:text-green-300">Contact details shared</p>
      <p className="mt-1 font-medium">{name}</p>
      <a href={`mailto:${email}`} className="inline-flex items-center gap-1 text-accent hover:underline">
        <Mail className="h-3.5 w-3.5" aria-hidden="true" /> {email}
      </a>
      {phone && (
        <p className="inline-flex items-center gap-1 pl-3 text-muted">
          <Phone className="h-3.5 w-3.5" aria-hidden="true" /> {phone}
        </p>
      )}
      {extra}
    </div>
  );
}

// Investor "My Introductions" and the graduate's "Investor Introductions"
// (FR07): request → accept/decline → follow-up and investment confirmations.
export default function Introductions() {
  const { user } = useAuth();
  const role = user.role === 'investor' ? 'investor' : 'graduate';
  const base = role === 'investor' ? '/investor/introductions' : '/introductions';
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [tab, setTab] = useState('all');
  const [dialog, setDialog] = useState(null);

  const load = useCallback(() => {
    api
      .get(base)
      .then((d) => setRows(d.introductions))
      .catch((e) => setError(e.message));
  }, [base]);
  useEffect(() => {
    document.title = `${role === 'investor' ? 'My introductions' : 'Investor introductions'} · ALU Ventures`;
    load();
  }, [load, role]);

  const act = async (intro, path, message) => {
    setError('');
    try {
      await api.post(`${base}/${intro.id}/${path}`);
      setNotice(message);
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  if (error && !rows) {
    return error.includes('pending') ? <Alert type="warning" title="Your investor account is awaiting approval">You can request introductions once an administrator approves your account.</Alert> : <Alert type="error">{error}</Alert>;
  }
  if (!rows) return <PageLoader />;

  const count = (s) => rows.filter((r) => r.status === s).length;
  const shown = tab === 'all' ? rows : rows.filter((r) => r.status === tab);
  const me = role === 'investor' ? 'investor' : 'graduate';
  const them = role === 'investor' ? 'graduate' : 'investor';

  return (
    <>
      <Breadcrumb items={role === 'investor' ? [['Investor portal', '/app/discover'], ['My Introductions']] : [['Alumni', '/app'], ['Investor Introductions']]} />
      <div className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight">{role === 'investor' ? 'My Introductions' : 'Investor Introductions'}</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          {role === 'investor'
            ? 'Every introduction you requested. Founders accept or decline; contact details appear here only after they accept.'
            : 'Introduction requests from approved investors. Your contact details are shared only if you accept.'}
        </p>
      </div>
      {notice && <Alert type="success" className="mb-4">{notice}</Alert>}
      {error && <Alert type="error" className="mb-4">{error}</Alert>}

      <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label={role === 'investor' ? 'Requests sent' : 'Requests received'} icon={Handshake} value={rows.length} />
        <StatTile label={role === 'investor' ? 'Awaiting founder' : 'Awaiting your response'} icon={Inbox} value={count('requested')} valueTone={count('requested') ? 'text-amber-600 dark:text-amber-400' : ''} />
        <StatTile label="Introduced" icon={CheckCircle2} value={count('accepted')} valueTone="text-green-700 dark:text-green-400" />
        <StatTile label="Recorded investments" icon={CheckCircle2} value={rows.filter((r) => r.investment.recordedAt).length} status="Recorded by the administrator" />
      </div>

      <div className="mb-3 w-fit rounded-md bg-subtle p-1 ring-1 ring-line">
        <CountTabs
          tabs={[
            ['all', 'All', rows.length],
            ['requested', role === 'investor' ? 'Awaiting founder' : 'Awaiting response', count('requested')],
            ['accepted', 'Introduced', count('accepted')],
            ['declined', 'Declined', count('declined')],
          ]}
          value={tab}
          onChange={setTab}
          label="Introduction status"
        />
      </div>

      {shown.length === 0 ? (
        <div className="card flex flex-col items-center px-6 py-12 text-center">
          <Handshake className="h-8 w-8 text-muted" aria-hidden="true" />
          <p className="mt-2 font-medium">{rows.length ? 'Nothing in this view' : 'No introductions yet'}</p>
          <p className="mt-1 max-w-md text-sm text-muted">
            {role === 'investor' ? 'Browse approved projects and use Express Interest to request an introduction.' : 'When an approved investor requests an introduction to one of your approved projects, it appears here.'}
          </p>
          {role === 'investor' && !rows.length && (
            <Link to="/app/discover" className="btn-primary mt-4">
              Browse projects
            </Link>
          )}
        </div>
      ) : (
        <ul className="space-y-3">
          {shown.map((r) => {
            const title = role === 'investor' ? r.project.title : `${r.investor.name}${r.investor.organisation ? ` · ${r.investor.organisation}` : ''}`;
            const sub = role === 'investor' ? `${r.project.projectCode} · ${r.project.sector} · ${r.project.stage}` : `About ${r.project.title} (${r.project.projectCode})`;
            const accepted = r.status === 'accepted';
            return (
              <li key={r.id} className="card p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start">
                  <InitialsBox name={role === 'investor' ? r.project.title : r.investor.name} className="h-10 w-10 text-sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {role === 'investor' ? (
                        <Link to={`/app/discover/${r.project.projectCode}`} className="font-semibold hover:text-accent hover:underline">
                          {title}
                        </Link>
                      ) : (
                        <span className="font-semibold">{title}</span>
                      )}
                      <StatusPill status={r.status} label={STATUS_LABEL[role][r.status]} />
                      {r.investment.recordedAt && <StatusPill status="selected" label="Investment recorded" />}
                    </div>
                    <p className="text-xs text-muted">
                      {sub} · requested {formatDate(r.requestedAt)}
                    </p>
                    {r.message && <p className="mt-2 text-sm">“{r.message}”</p>}
                    {accepted && (
                      <div className="mt-3 grid gap-3 lg:grid-cols-2">
                        {role === 'investor' ? (
                          <Contact name={r.founder.name} email={r.founder.email} phone={r.founder.phone} />
                        ) : (
                          <Contact
                            name={r.investor.name}
                            email={r.investor.email}
                            phone={r.investor.phone}
                            extra={r.investor.website && (
                              <a href={r.investor.website} target="_blank" rel="noreferrer" className="block text-xs text-accent hover:underline">
                                {r.investor.website}
                              </a>
                            )}
                          />
                        )}
                        <div className="rounded-md bg-subtle p-3 ring-1 ring-line">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Follow-up</p>
                          <ul className="mt-1.5 space-y-1">
                            <Step done={r.meeting[me]} label="Meeting confirmed" by="you" />
                            <Step done={r.meeting[them]} label="Meeting confirmed" by={them === 'investor' ? 'investor' : 'founder'} />
                            <Step done={r.investment[me]} label="Investment confirmed" by="you" />
                            <Step done={r.investment[them]} label="Investment confirmed" by={them === 'investor' ? 'investor' : 'founder'} />
                            <Step done={Boolean(r.investment.recordedAt)} label="Investment recorded" by="administrator" />
                          </ul>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col gap-2 md:w-52">
                    {role === 'graduate' && r.status === 'requested' && (
                      <>
                        <button type="button" className="btn-cta" onClick={() => setDialog({ intro: r, kind: 'accept' })}>
                          Accept &amp; share contact
                        </button>
                        <button type="button" className="btn-danger" onClick={() => setDialog({ intro: r, kind: 'decline' })}>
                          Decline
                        </button>
                      </>
                    )}
                    {accepted && !r.meeting[me] && (
                      <button type="button" className="btn-secondary" onClick={() => act(r, 'confirm-meeting', 'Follow-up meeting confirmed.')}>
                        Confirm we met
                      </button>
                    )}
                    {accepted && r.meeting[me] && !r.investment[me] && (
                      <button type="button" className="btn-secondary" onClick={() => setDialog({ intro: r, kind: 'invest' })}>
                        Confirm an investment
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ReasonDialog
        open={Boolean(dialog)}
        reason="none"
        title={
          dialog?.kind === 'accept'
            ? `Accept the introduction from ${dialog.intro.investor.name}?`
            : dialog?.kind === 'decline'
              ? `Decline the introduction from ${dialog.intro.investor.name}?`
              : 'Confirm an investment?'
        }
        description={
          dialog?.kind === 'accept'
            ? 'We will email you both an introduction with each other’s name, email and phone number.'
            : dialog?.kind === 'decline'
              ? 'The investor is told the request was declined. No contact details are shared.'
              : 'Confirm only if an investment was actually agreed. Both parties must confirm before the administrator can record it.'
        }
        confirmLabel={dialog?.kind === 'accept' ? 'Accept introduction' : dialog?.kind === 'decline' ? 'Decline' : 'Confirm investment'}
        tone={dialog?.kind === 'decline' ? 'danger' : dialog?.kind === 'accept' ? 'success' : 'primary'}
        onClose={() => setDialog(null)}
        onConfirm={async () => {
          const path = { accept: 'accept', decline: 'decline', invest: 'confirm-investment' }[dialog.kind];
          await api.post(`${base}/${dialog.intro.id}/${path}`);
          setNotice(
            dialog.kind === 'accept'
              ? 'Introduction accepted. You and the investor have both been emailed each other’s contact details.'
              : dialog.kind === 'decline'
                ? 'Introduction declined. No contact details were shared.'
                : 'Investment confirmed. The administrator records it once both sides have confirmed.'
          );
          load();
        }}
      />
    </>
  );
}
