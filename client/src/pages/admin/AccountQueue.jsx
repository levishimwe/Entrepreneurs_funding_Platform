import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Inbox } from 'lucide-react';
import { api } from '../../lib/api';
import { Alert, EmptyState, PageHeader, PageLoader, Pill, StatusPill, formatDate } from '../../components/ui';
import VerificationChecks from '../../components/VerificationChecks';
import ReasonDialog from '../../components/ReasonDialog';
import Avatar from '../../components/Avatar';

const TABS = [
  ['pending', 'Pending review'],
  ['approved', 'Approved'],
  ['rejected', 'Rejected'],
];

const COPY = {
  graduate: {
    title: 'Graduate Approval Queue',
    description: 'Review each graduate’s degree evidence. The automated flag helps you prioritise — you make the decision.',
    endpoint: 'graduates',
  },
  investor: {
    title: 'Investor & Sponsor Approvals',
    description: 'Review the identity, organisation and interests of each investor or sponsor before granting access.',
    endpoint: 'investors',
  },
};

// Approval queue for graduate (FR02) or investor/sponsor (FR03) accounts.
export default function AccountQueue({ role }) {
  const copy = COPY[role];
  const [tab, setTab] = useState('pending');
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [open, setOpen] = useState(null);
  const [dialog, setDialog] = useState(null);

  const load = useCallback(() => {
    setRows(null);
    api
      .get(`/admin/${copy.endpoint}?status=${tab}`)
      .then((d) => setRows(d[copy.endpoint]))
      .catch((e) => setError(e.message));
  }, [copy.endpoint, tab]);

  useEffect(() => {
    document.title = `${copy.title} · ALU Ventures`;
    load();
  }, [load, copy.title]);

  const decide = (row, decision) =>
    setDialog({
      row,
      decision,
      suspicious: role === 'graduate' && row.degree?.flag === 'suspicious',
    });

  return (
    <>
      <PageHeader title={copy.title} description={copy.description} />
      {notice && <Alert type="success" className="mb-4">{notice}</Alert>}
      {error && <Alert type="error" className="mb-4">{error}</Alert>}

      <div className="mb-4 flex gap-1 border-b border-line" role="tablist">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === key ? 'border-accent font-medium text-ink' : 'border-transparent text-muted hover:text-ink'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {!rows ? (
        <PageLoader />
      ) : rows.length === 0 ? (
        <div className="card">
          <EmptyState icon={Inbox} title="Nothing here">
            {tab === 'pending' ? 'No accounts are waiting for review.' : `No ${tab} accounts yet.`}
          </EmptyState>
        </div>
      ) : (
        <div className="card divide-y divide-line">
          {rows.map((row) => {
            const expanded = open === row.id;
            return (
              <div key={row.id}>
                <div className="flex flex-col gap-3 p-4 md:flex-row md:items-center">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-start gap-2 text-left"
                    onClick={() => setOpen(expanded ? null : row.id)}
                    aria-expanded={expanded}
                  >
                    {expanded ? <ChevronDown className="mt-2.5 h-4 w-4 shrink-0" /> : <ChevronRight className="mt-2.5 h-4 w-4 shrink-0" />}
                    <Avatar name={row.fullName} src={row.hasPhoto ? `/api/admin/users/${row.id}/photo` : null} size="md" />
                    <span className="min-w-0">
                      <span className="block font-medium">{row.fullName}</span>
                      <span className="block truncate text-xs text-muted">
                        {row.email}
                        {row.phone && ` · ${row.phone}`} · registered {formatDate(row.registeredAt)}
                      </span>
                    </span>
                  </button>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    {role === 'graduate' ? (
                      <>
                        <span className="text-muted">{row.program} · {row.cohortYear}</span>
                        <StatusPill status={row.degree ? row.degree.flag || 'processing' : 'pending'} label={!row.degree ? 'No degree file' : undefined} />
                      </>
                    ) : (
                      <>
                        <span className="text-muted">{row.organisation}</span>
                        <Pill tone="slate">{row.investorType === 'sponsor' ? 'Sponsor' : 'Investor'}</Pill>
                      </>
                    )}
                    {tab !== 'pending' && <StatusPill status={row.status} />}
                  </div>
                  {tab === 'pending' && (
                    <div className="flex gap-2">
                      <button type="button" className="btn-danger" onClick={() => decide(row, 'reject')}>
                        Reject
                      </button>
                      <button type="button" className="btn-cta" onClick={() => decide(row, 'approve')}>
                        Approve
                      </button>
                    </div>
                  )}
                </div>
                {expanded && (
                  <div className="border-t border-line bg-canvas p-4">
                    {role === 'graduate' ? (
                      <VerificationChecks document={row.degree} title={`ALU degree certificate — registered as “${row.fullName}”`} />
                    ) : (
                      <dl className="grid gap-3 text-sm sm:grid-cols-2">
                        <div>
                          <dt className="text-muted">Website</dt>
                          <dd>{row.website ? <a className="text-accent hover:underline" href={row.website} target="_blank" rel="noreferrer">{row.website}</a> : '—'}</dd>
                        </div>
                        <div>
                          <dt className="text-muted">Sectors of interest</dt>
                          <dd className="flex flex-wrap gap-1">{row.sectors.length ? row.sectors.map((s) => <Pill key={s}>{s}</Pill>) : '—'}</dd>
                        </div>
                        <div className="sm:col-span-2">
                          <dt className="text-muted">About</dt>
                          <dd>{row.bio || '—'}</dd>
                        </div>
                      </dl>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ReasonDialog
        open={Boolean(dialog)}
        title={dialog?.decision === 'approve' ? `Approve ${dialog?.row.fullName}?` : `Reject ${dialog?.row.fullName}?`}
        description={
          dialog?.decision === 'approve'
            ? 'They will be emailed and gain full access for their role.'
            : 'They will be emailed this reason and will not be able to sign in.'
        }
        warning={dialog?.suspicious && dialog?.decision === 'approve' ? 'The automated degree check flagged this account as Suspicious. Record why you are approving it.' : undefined}
        reason={dialog?.decision === 'reject' || dialog?.suspicious ? 'required' : 'optional'}
        confirmLabel={dialog?.decision === 'approve' ? 'Approve account' : 'Reject account'}
        tone={dialog?.decision === 'approve' ? 'success' : 'danger'}
        onClose={() => setDialog(null)}
        onConfirm={async (reason) => {
          await api.post(`/admin/${copy.endpoint}/${dialog.row.id}/${dialog.decision}`, { reason });
          setNotice(`${dialog.row.fullName} was ${dialog.decision === 'approve' ? 'approved' : 'rejected'} and has been emailed.`);
          load();
        }}
      />
    </>
  );
}
