import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { formatDate } from '../../components/ui';
import VerificationChecks, { adminFileUrl } from '../../components/VerificationChecks';
import DocumentViewer from '../../components/DocumentViewer';
import ReasonDialog from '../../components/ReasonDialog';
import { ARCHIVE_NOTICE, availableActions } from '../../lib/projectActions';
import { statusLabel } from '../../lib/status';
import { DeleteDialog, Messages, StatusPill, StatusText } from '../../components/admin';
import { Avatar, DecisionPanel, DetailHeader, DetailLayout, DetailSkeleton, EmptyNote, FieldGrid, FileList, HistorySection, InfoCard, LongText } from '../../components/detail';

const KIND_LABEL = {
  rdb_certificate: 'RDB certificate',
  revenue_document: 'Revenue document',
  rra_certificate: 'RRA certificate',
  supporting_document: 'Supporting document',
};

const RESULT_STATUS = { pending: 'Pending Admin Approval', approved: 'Approved', rejected: 'Rejected' };
const money = (amount, currency) => (amount === null || amount === undefined ? '—' : `${currency || ''} ${Number(amount).toLocaleString('en-GB')}`.trim());

// Fully Funded projects: funding details and whether the home page may show it.
function FundingSection({ project, onSaved }) {
  const f = project.funding;
  const [form, setForm] = useState({ showOnHome: f.showOnHome, showAmount: f.showAmount, fundingName: f.name || '', fundingAmount: f.amount ?? '', fundingCurrency: f.currency || '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.patch(`/admin/projects/${project.id}/funding`, form);
      onSaved();
    } catch (err) {
      setError(Object.values(err.fields || {})[0] || err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="space-y-3" onSubmit={save}>
      {error && <p className="adm-bad">{error}</p>}
      <p>
        Source: <strong>{f.source === 'competition' ? 'Competition' : f.source === 'investor' ? 'Investor' : 'Not recorded'}</strong>
      </p>
      <div className="grid gap-3 sm:grid-cols-[1fr_9rem_6rem]">
        <label className="block text-[13px]">
          Funding name
          <input className="adm-input mt-1" value={form.fundingName} onChange={(e) => setForm({ ...form, fundingName: e.target.value })} maxLength={200} />
        </label>
        <label className="block text-[13px]">
          Amount
          <input className="adm-input mt-1" type="number" min="0" step="any" value={form.fundingAmount} onChange={(e) => setForm({ ...form, fundingAmount: e.target.value })} />
        </label>
        <label className="block text-[13px]">
          Currency
          <input className="adm-input mt-1 uppercase" value={form.fundingCurrency} onChange={(e) => setForm({ ...form, fundingCurrency: e.target.value })} maxLength={3} placeholder="RWF" />
        </label>
      </div>
      <label className="flex min-h-11 items-center gap-2">
        <input type="checkbox" checked={form.showOnHome} onChange={(e) => setForm({ ...form, showOnHome: e.target.checked })} /> Show on home page
      </label>
      <label className="flex min-h-11 items-center gap-2">
        <input type="checkbox" checked={form.showAmount} onChange={(e) => setForm({ ...form, showAmount: e.target.checked })} /> Show amount publicly
      </label>
      {form.showOnHome && !project.publicationConsent && <p className="adm-hint">The founder has not consented to publication, so it will not appear on the home page.</p>}
      <button type="submit" className="adm-primary" disabled={busy}>
        {busy ? 'Saving…' : 'Save funding'}
      </button>
    </form>
  );
}

export default function AdminProjectDetail() {
  const { id } = useParams();
  const [project, setProject] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [dialog, setDialog] = useState(null);
  const [reason, setReason] = useState('');
  const [preview, setPreview] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [removingImage, setRemovingImage] = useState(false);
  const navigate = useNavigate();

  const load = useCallback(
    () =>
      api
        .get(`/admin/projects/${id}`)
        .then((d) => {
          setProject(d.project);
          document.title = `${d.project.title} · ALU Ventures`;
        })
        .catch((e) => setError(e.message)),
    [id]
  );
  useEffect(() => {
    load();
  }, [load]);

  if (error && !project) {
    return (
      <div className="adm">
        <DetailHeader back={{ to: '/app/admin/projects', label: 'Projects' }} title="Project" />
        <Messages error={error} />
      </div>
    );
  }
  if (!project) return <DetailSkeleton aside />;

  const rdbDocs = project.documents.filter((d) => d.kind === 'rdb_certificate');
  const latestRdb = rdbDocs.at(-1);
  const rraDocs = project.documents.filter((d) => d.kind === 'rra_certificate');
  const otherDocs = project.documents.filter((d) => !['rdb_certificate', 'rra_certificate'].includes(d.kind));
  const actions = availableActions(project);
  const suspiciousApproval = dialog?.key === 'approve' && latestRdb?.flag === 'suspicious';
  const fundedHint = actions.some(([k, , d]) => k === 'mark_funded' && d);
  const deletable = ['archived', 'rejected'].includes(project.status);

  const actionButtons = (
    <>
      {actions.length === 0 && !deletable && <span className="text-[13px] text-muted">No actions in this state.</span>}
      {actions.map(([key, a, disabled]) => (
        <button
          key={key}
          type="button"
          disabled={Boolean(disabled)}
          title={disabled || undefined}
          onClick={() => setDialog({ key, action: a })}
          className={key === 'approve' ? 'adm-primary' : `adm-act ${a.tone === 'danger' ? 'adm-act-danger' : ''}`}
        >
          {a.label}
        </button>
      ))}
      {deletable && (
        <button type="button" className="adm-act adm-act-danger" onClick={() => setDeleting(true)}>
          Delete permanently
        </button>
      )}
    </>
  );

  const decision = (
    <DecisionPanel
      status={
        <>
          <StatusPill status={project.status} />
          {project.status === 'archived' && project.statusBeforeArchive && <span>from {statusLabel(project.statusBeforeArchive)}</span>}
        </>
      }
      help={fundedHint ? 'Mark as Funded needs an investment confirmed by both sides.' : `Confirmed investors: ${project.confirmedInvestors} of 2.`}
    >
      {actions.length > 0 && (
        <label className="block text-[13px] font-medium text-ink">
          Reason or note
          <textarea
            className="adm-field mt-1"
            rows={3}
            maxLength={1000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Required to reject or request a revision; emailed to the graduate."
          />
        </label>
      )}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">{actionButtons}</div>
    </DecisionPanel>
  );

  return (
    <div className="adm">
      <DetailHeader
        back={{ to: '/app/admin/projects', label: 'Projects', current: <span className="adm-mono">{project.projectCode}</span> }}
        title={project.title}
        avatar={<Avatar name={project.title} src={project.imageUrl} size={52} square />}
        status={<StatusPill status={project.status} />}
        meta={[statusLabel(project.type), project.sector, project.stage, `Submitted ${formatDate(project.submittedAt)}`].filter(Boolean).join(' · ')}
        actions={actionButtons}
      />
      <Messages notice={notice} error={error} />

      <DetailLayout aside={decision}>
        <InfoCard title="Project details">
          <FieldGrid
            fields={[
              ['Summary', project.summary, { wide: true }],
              ['Type', statusLabel(project.type)],
              ['Funding sought', project.fundingSought],
              ['Sector', project.sector],
              ['Suggested sector', project.suggestedSector],
              ['Stage', project.stage],
              ['Publication consent', project.publicationConsent ? 'Yes' : 'No'],
              ...(project.type === 'company'
                ? [
                    ['Company', project.companyName],
                    ['RDB code', project.companyNumber],
                    ['Relationship to company', project.relationshipToCompany],
                  ]
                : [['Idea declaration', project.ideaDeclaration ? 'Confirmed' : 'Missing']]),
              ['Submitted', formatDate(project.submittedAt, true)],
              ['Confirmed investors', `${project.confirmedInvestors} of 2`],
            ]}
          />
        </InfoCard>

        <InfoCard title="Graduate">
          <div className="flex items-center gap-3">
            <Avatar name={project.owner.name} size={40} />
            <div className="min-w-0">
              <p className="truncate text-[14px] font-semibold text-ink">{project.owner.name}</p>
              <p className="truncate text-[13px] text-muted">{project.owner.email}</p>
            </div>
          </div>
          <div className="mt-4">
            <FieldGrid
              fields={[
                ['Programme', project.owner.program],
                ['Cohort', project.owner.cohortYear ? `Class of ${project.owner.cohortYear}` : null],
              ]}
            />
          </div>
        </InfoCard>

        <InfoCard title="Description">
          <LongText>{project.description}</LongText>
        </InfoCard>

        {project.imageUrl && (
          <InfoCard
            title="Background image"
            action={
              <button type="button" className="adm-act adm-act-danger" onClick={() => setRemovingImage(true)}>
                Remove image
              </button>
            }
          >
            <img src={project.imageUrl} alt={project.title} className="aspect-[16/5] w-full rounded-lg object-cover" />
            <p className="adm-hint !mb-0 mt-3">
              {project.imagePublic ? 'Shown on the public venture page and cards.' : 'Not public: shown only once the project is approved and published.'}
            </p>
          </InfoCard>
        )}

        {project.status === 'similarity_flagged' && (
          <InfoCard title={`Similarity flag (${Math.round((project.similarityScore || 0) * 100)}%)`}>
            <ul className="divide-y divide-line rounded-lg border border-line">
              {project.similarityMatches.map((m) => (
                <li key={m.projectCode} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
                  <span className="min-w-0">
                    <span className="block font-medium text-ink">{m.title}</span>
                    <span className="adm-mono text-muted">{m.projectCode}</span>
                  </span>
                  <span className="tabular-nums text-[13px] font-semibold">{Math.round(m.score * 100)}%</span>
                </li>
              ))}
            </ul>
            <h3 className="mb-1 mt-4 text-[13px] font-semibold text-ink">Graduate’s clarification</h3>
            {project.clarificationText ? (
              <>
                <LongText>{project.clarificationText}</LongText>
                <p className="mt-1 text-[12px] text-muted">Sent {formatDate(project.clarificationSubmittedAt, true)}</p>
              </>
            ) : (
              <EmptyNote>Not submitted yet. A clarification request was emailed.</EmptyNote>
            )}
          </InfoCard>
        )}

        <InfoCard title="RDB certificate">
          {project.type === 'company' ? (
            <>
              <VerificationChecks document={latestRdb} title="Latest RDB certificate" />
              {rdbDocs.length > 1 && <p className="adm-hint mt-2 !mb-0">{rdbDocs.length - 1} earlier certificate(s) on file.</p>}
            </>
          ) : (
            <EmptyNote>Idea-stage project: the graduate declared it is not yet registered, so no RDB certificate is required.</EmptyNote>
          )}
        </InfoCard>

        {rraDocs.length > 0 && (
          <InfoCard title="RRA document (optional)">
            <VerificationChecks document={rraDocs.at(-1)} title="Latest RRA document" />
            {rraDocs.length > 1 && <p className="adm-hint mt-2 !mb-0">{rraDocs.length - 1} earlier RRA document(s) on file.</p>}
          </InfoCard>
        )}

        <InfoCard title="Other evidence" meta={otherDocs.length ? `${otherDocs.length} file${otherDocs.length === 1 ? '' : 's'}` : null}>
          <FileList
            files={otherDocs.map((d) => ({ id: d.id, name: d.originalName, mimeType: d.mimeType, sizeBytes: d.sizeBytes, label: KIND_LABEL[d.kind], date: d.uploadedAt }))}
            empty="No other evidence uploaded."
            actions={(f) => (
              <button type="button" className="adm-act inline-flex min-h-11 items-center lg:min-h-9" aria-expanded={preview === f.id} onClick={() => setPreview(preview === f.id ? null : f.id)}>
                {preview === f.id ? 'Hide' : 'View'}
              </button>
            )}
          >
            {(f) =>
              preview === f.id && (
                <div className="border-t border-line p-3">
                  <DocumentViewer src={adminFileUrl(f.id)} mimeType={f.mimeType} name={f.name} height="h-96" />
                </div>
              )
            }
          </FileList>
        </InfoCard>

        {project.status === 'funded' && project.funding && (
          <InfoCard title="Funding and home page">
            <FundingSection
              key={JSON.stringify(project.funding)}
              project={project}
              onSaved={async () => {
                setNotice('Funding saved.');
                await load();
              }}
            />
          </InfoCard>
        )}

        {project.competitionResults?.length > 0 && (
          <InfoCard title="Competition results">
            <ul className="divide-y divide-line rounded-lg border border-line">
              {project.competitionResults.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-[14px]">
                  <span className="min-w-0">
                    <span className="block font-medium text-ink">{r.opportunity?.title}</span>
                    <span className="text-[13px] text-muted">
                      {r.outcomeLabel}
                      {r.awardTitle ? ` · ${r.awardTitle}` : ''} · {money(r.amount, r.currency)}
                    </span>
                  </span>
                  <Link className="adm-a text-[13px]" to={`/app/admin/results?status=${r.status}`}>
                    {RESULT_STATUS[r.status]}
                  </Link>
                </li>
              ))}
            </ul>
          </InfoCard>
        )}

        <InfoCard title="Investor introductions">
          {project.introductions.length === 0 ? (
            <EmptyNote>No introductions yet.</EmptyNote>
          ) : (
            <ul className="divide-y divide-line rounded-lg border border-line">
              {project.introductions.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-[14px]">
                  <span className="font-medium text-ink">{i.investor}</span>
                  {i.investmentConfirmed ? <span className="text-[13px] text-muted">Investment confirmed</span> : <StatusText status={i.status} />}
                </li>
              ))}
            </ul>
          )}
        </InfoCard>

        <HistorySection
          title="Decision history"
          count={project.history.length}
          latest={project.history[0] ? `${project.history[0].action.replace('project.', '').replace(/_/g, ' ')}, ${formatDate(project.history[0].at)}` : null}
        >
          {project.history.length === 0 ? (
            <p className="px-5 py-6 text-center text-[13px] text-muted">No decisions yet.</p>
          ) : (
            <ol className="divide-y divide-line">
              {project.history.map((h) => (
                <li key={h.id} className="px-4 py-3 sm:px-5">
                  <p className="text-[14px] text-ink">
                    <span className="font-semibold capitalize">{h.action.replace('project.', '').replace(/_/g, ' ')}</span>
                    <span className="text-muted"> · {h.actor}</span>
                  </p>
                  {h.reason && <p className="mt-0.5 text-[13px] text-muted">“{h.reason}”</p>}
                  <time className="text-[12px] text-muted" dateTime={h.at}>
                    {formatDate(h.at, true)}
                  </time>
                </li>
              ))}
            </ol>
          )}
        </HistorySection>
      </DetailLayout>

      <ReasonDialog
        open={Boolean(dialog)}
        title={dialog?.action.title}
        description={dialog?.key === 'archive' ? ARCHIVE_NOTICE : dialog?.action.description}
        warning={suspiciousApproval ? 'The RDB pre-check flagged this certificate as Suspicious. Record why you are approving.' : undefined}
        reason={suspiciousApproval ? 'required' : dialog?.action.reason}
        reasonLabel={dialog?.action.reasonLabel}
        confirmLabel={dialog?.action.label}
        tone={dialog?.action.tone}
        initialReason={reason}
        onClose={() => setDialog(null)}
        onConfirm={async (text) => {
          await api.post(`/admin/projects/${project.id}/${dialog.key}`, { reason: text });
          setNotice(`${dialog.action.label} recorded.`);
          setReason('');
          await load();
        }}
      />
      <ReasonDialog
        open={removingImage}
        title="Remove the background image?"
        description="The image is deleted and the graduate is emailed this reason. The project itself is not changed."
        reason="required"
        confirmLabel="Remove image"
        tone="danger"
        onClose={() => setRemovingImage(false)}
        onConfirm={async (text) => {
          await api.post(`/admin/projects/${project.id}/image/remove`, { reason: text });
          setNotice('Background image removed and the graduate emailed.');
          await load();
        }}
      />
      <DeleteDialog
        open={deleting}
        title={`Delete ${project.title} permanently?`}
        planUrl={`/admin/projects/${project.id}/delete-plan`}
        deleteUrl={`/admin/projects/${project.id}`}
        onClose={() => setDeleting(false)}
        onDeleted={() => navigate(`/app/admin/projects?status=${project.status}`)}
      />
    </div>
  );
}
