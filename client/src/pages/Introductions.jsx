import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { formatDate } from '../components/ui';
import ReasonDialog from '../components/ReasonDialog';
import { AdminPage, DataTable, KeyValue, ListLayout, Loading, Messages, SearchInput, SidePanel, StatusPill, StatusSelect } from '../components/admin';

const STATUS_LABEL = {
  investor: { requested: 'Awaiting founder', accepted: 'Introduced', declined: 'Declined' },
  graduate: { requested: 'Awaiting your response', accepted: 'Introduced', declined: 'Declined' },
};
const yes = (v) => (v ? 'Yes' : 'No');

// Introductions (FR07) for investors and graduates: request → accept or
// decline → meeting and investment confirmations, recorded by the admin.
export default function Introductions() {
  const { user } = useAuth();
  const role = user.role === 'investor' ? 'investor' : 'graduate';
  const base = role === 'investor' ? '/investor/introductions' : '/introductions';
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [status, setStatus] = useState('all');
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState(null);
  const [dialog, setDialog] = useState(null);

  const load = useCallback(() => {
    api
      .get(base)
      .then((d) => setRows(d.introductions))
      .catch((e) => setError(e.message));
  }, [base]);
  useEffect(() => {
    document.title = 'Introductions · ALU Ventures';
    load();
  }, [load]);

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

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (rows || []).filter(
      (r) => (status === 'all' || r.status === status) && (!term || `${r.project.title} ${r.investor?.name || ''} ${r.investor?.organisation || ''}`.toLowerCase().includes(term))
    );
  }, [rows, status, q]);

  if (error && !rows) {
    return (
      <AdminPage title="Introductions">
        <Messages error={error.includes('pending') ? 'Your investor account is awaiting approval. You can request introductions once an administrator approves it.' : error} />
      </AdminPage>
    );
  }

  const count = (s) => (rows || []).filter((r) => s === 'all' || r.status === s).length;
  const options = [
    ['all', 'All', rows ? count('all') : null],
    ['requested', STATUS_LABEL[role].requested, rows ? count('requested') : null],
    ['accepted', 'Introduced', rows ? count('accepted') : null],
    ['declined', 'Declined', rows ? count('declined') : null],
  ];
  const me = role;
  const them = role === 'investor' ? 'graduate' : 'investor';
  const open = rows?.find((r) => r.id === openId);

  const actions = (r) => {
    const accepted = r.status === 'accepted';
    return (
      <>
        <button type="button" className="adm-act" onClick={() => setOpenId(r.id)}>
          Open
        </button>
        {role === 'graduate' && r.status === 'requested' && (
          <>
            <button type="button" className="adm-act" onClick={() => setDialog({ intro: r, kind: 'accept' })}>
              Accept
            </button>
            <button type="button" className="adm-act adm-act-danger" onClick={() => setDialog({ intro: r, kind: 'decline' })}>
              Decline
            </button>
          </>
        )}
        {accepted && !r.meeting[me] && (
          <button type="button" className="adm-act" onClick={() => act(r, 'confirm-meeting', 'Meeting confirmed.')}>
            Confirm we met
          </button>
        )}
        {accepted && r.meeting[me] && !r.investment[me] && (
          <button type="button" className="adm-act" onClick={() => setDialog({ intro: r, kind: 'invest' })}>
            Confirm investment
          </button>
        )}
      </>
    );
  };

  return (
    <AdminPage title="Introductions" meta={rows ? `${shown.length} shown` : null}>
      <Messages notice={notice} error={error} />
      <ListLayout
        toolbar={
          <>
            <SearchInput value={q} onChange={setQ} placeholder={role === 'investor' ? 'Project or code' : 'Investor or project'} />
            <StatusSelect value={status} options={options} onChange={setStatus} label="Show" />
            {role === 'investor' && (
              <Link to="/app/discover" className="adm-primary">
                Browse projects
              </Link>
            )}
          </>
        }
        filters={[{ title: 'Status', value: status, onChange: setStatus, options }]}
      >
        {!rows ? (
          <Loading />
        ) : (
          <DataTable
            columns={[
              role === 'investor'
                ? {
                    key: 'project',
                    label: 'Project',
                    render: (r) => (
                      <>
                        <Link to={`/app/discover/${r.project.id}`} className="adm-a font-medium">
                          {r.project.title}
                        </Link>
                      </>
                    ),
                  }
                : {
                    key: 'investor',
                    label: 'Investor',
                    render: (r) => (
                      <>
                        <span className="font-medium">{r.investor.name}</span>
                        <div className="adm-muted text-[12px]">{r.investor.organisation}</div>
                      </>
                    ),
                  },
              role === 'investor'
                ? { key: 'sector', label: 'Sector', render: (r) => `${r.project.sector} · ${r.project.stage}` }
                : { key: 'project', label: 'Project', render: (r) => r.project.title },
              {
                key: 'status',
                label: 'Status',
                render: (r) => (
                  <>
                    <StatusPill status={r.status} label={STATUS_LABEL[role][r.status]} />
                    {r.investment.recordedAt && <div className="adm-muted mt-1 text-[12px]">Investment recorded</div>}
                  </>
                ),
              },
              { key: 'requested', label: 'Requested', render: (r) => formatDate(r.requestedAt) },
            ]}
            rows={shown}
            actions={actions}
            empty={rows.length ? 'Nothing in this view.' : role === 'investor' ? 'No introductions yet. Use Browse projects to request one.' : 'No introduction requests yet.'}
          />
        )}
      </ListLayout>

      {open && (
        <SidePanel title={role === 'investor' ? open.project.title : open.investor.name} onClose={() => setOpenId(null)}>
          <KeyValue
            rows={[
              ['Status', <StatusPill key="s" status={open.status} label={STATUS_LABEL[role][open.status]} />],
              ['Project', open.project.title],
              ...(role === 'graduate' ? [['Investor', `${open.investor.name}${open.investor.organisation ? ` · ${open.investor.organisation}` : ''}`]] : []),
              ['Requested', formatDate(open.requestedAt, true)],
              ...(open.message ? [['Message', `“${open.message}”`]] : []),
              ...(open.status === 'accepted'
                ? role === 'investor'
                  ? [
                      ['Founder', open.founder.name],
                      ['Email', <a key="e" className="adm-a" href={`mailto:${open.founder.email}`}>{open.founder.email}</a>],
                      ['Phone', open.founder.phone],
                    ]
                  : [
                      ['Email', <a key="e" className="adm-a" href={`mailto:${open.investor.email}`}>{open.investor.email}</a>],
                      ['Phone', open.investor.phone],
                      ['Website', open.investor.website],
                    ]
                : []),
            ]}
          />
          {open.status === 'accepted' && (
            <>
              <h2>Follow-up</h2>
              <KeyValue
                rows={[
                  ['Meeting confirmed (you)', yes(open.meeting[me])],
                  [`Meeting confirmed (${them === 'investor' ? 'investor' : 'founder'})`, yes(open.meeting[them])],
                  ['Investment confirmed (you)', yes(open.investment[me])],
                  [`Investment confirmed (${them === 'investor' ? 'investor' : 'founder'})`, yes(open.investment[them])],
                  ['Recorded by the administrator', open.investment.recordedAt ? formatDate(open.investment.recordedAt) : 'No'],
                ]}
              />
            </>
          )}
          <p className="mt-4">{actions(open)}</p>
        </SidePanel>
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
        tone={dialog?.kind === 'decline' ? 'danger' : 'primary'}
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
    </AdminPage>
  );
}
