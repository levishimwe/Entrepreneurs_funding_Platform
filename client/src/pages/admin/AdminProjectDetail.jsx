import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, FileText, History, TriangleAlert, Users } from 'lucide-react';
import { api } from '../../lib/api';
import { Alert, PageHeader, PageLoader, Pill, StatusPill, formatDate } from '../../components/ui';
import VerificationChecks, { adminFileUrl } from '../../components/VerificationChecks';
import DocumentViewer from '../../components/DocumentViewer';
import ReasonDialog from '../../components/ReasonDialog';
import { ARCHIVE_NOTICE, availableActions } from '../../lib/projectActions';

const KIND_LABEL = {
  rdb_certificate: 'RDB certificate',
  revenue_document: 'Revenue document',
  rra_certificate: 'RRA certificate',
  supporting_document: 'Supporting document',
};

export default function AdminProjectDetail() {
  const { id } = useParams();
  const [project, setProject] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [dialog, setDialog] = useState(null);
  const [preview, setPreview] = useState(null);

  const load = useCallback(
    () =>
      api
        .get(`/admin/projects/${id}`)
        .then((d) => {
          setProject(d.project);
          document.title = `Review: ${d.project.title} · ALU Ventures`;
        })
        .catch((e) => setError(e.message)),
    [id]
  );
  useEffect(() => {
    load();
  }, [load]);

  if (error) return <Alert type="error">{error}</Alert>;
  if (!project) return <PageLoader />;

  const rdbDocs = project.documents.filter((d) => d.kind === 'rdb_certificate');
  const latestRdb = rdbDocs.at(-1);
  const otherDocs = project.documents.filter((d) => d.kind !== 'rdb_certificate');
  const actions = availableActions(project);

  return (
    <>
      <Link to="/app/admin/projects" className="mb-3 inline-flex items-center gap-1 text-sm text-accent hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Verification queue
      </Link>
      <PageHeader eyebrow={project.projectCode} title={project.title} description={project.summary} />
      {notice && <Alert type="success" className="mb-4">{notice}</Alert>}

      {/* Decision bar */}
      <div className="card mb-6 flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <StatusPill status={project.status} />
          <StatusPill status={project.type} />
          {project.status === 'approved' && project.confirmedInvestors === 1 && (
            <Pill tone="blue">
              <Users className="h-3 w-3" aria-hidden="true" /> One Investor
            </Pill>
          )}
          {project.status === 'archived' && project.statusBeforeArchive && (
            <span className="text-xs text-muted">Archived from: {project.statusBeforeArchive.replace(/_/g, ' ')}</span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {actions.length === 0 && <span className="text-sm text-muted">No actions available in this state.</span>}
          {actions.map(([key, a, disabled]) => (
            <button
              key={key}
              type="button"
              disabled={Boolean(disabled)}
              title={disabled || undefined}
              onClick={() => setDialog({ key, action: a })}
              className={a.tone === 'danger' ? 'btn-danger' : a.tone === 'success' ? 'btn-cta' : 'btn-secondary'}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>
      {actions.some(([k, , d]) => k === 'mark_funded' && d) && (
        <p className="-mt-4 mb-6 text-xs text-muted">Mark as Funded becomes available once a graduate and an investor both confirm an investment.</p>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {project.status === 'similarity_flagged' && (
            <div className="card border-purple-300 p-5 dark:border-purple-500/40">
              <h2 className="flex items-center gap-2 font-semibold">
                <TriangleAlert className="h-4 w-4 text-purple-600" aria-hidden="true" /> Similarity flag
              </h2>
              <p className="mt-1 text-sm text-muted">Highest score {Math.round((project.similarityScore || 0) * 100)}% against approved projects:</p>
              <ul className="mt-3 space-y-1.5">
                {project.similarityMatches.map((m) => (
                  <li key={m.projectCode} className="flex items-center justify-between rounded-md border border-line px-3 py-2 text-sm">
                    <span>
                      <span className="font-medium">{m.title}</span> <span className="font-mono text-xs text-muted">{m.projectCode}</span>
                    </span>
                    <Pill tone="purple">{Math.round(m.score * 100)}%</Pill>
                  </li>
                ))}
              </ul>
              <div className="mt-4 rounded-md bg-subtle p-3 text-sm">
                <p className="font-medium">Graduate’s clarification</p>
                {project.clarificationText ? (
                  <>
                    <p className="mt-1 whitespace-pre-line">{project.clarificationText}</p>
                    <p className="mt-1 text-xs text-muted">Sent {formatDate(project.clarificationSubmittedAt, true)}</p>
                  </>
                ) : (
                  <p className="mt-1 text-muted">Not submitted yet. A clarification request email was sent to the graduate.</p>
                )}
              </div>
            </div>
          )}

          {project.type === 'company' ? (
            <div className="card p-5">
              <h2 className="mb-3 font-semibold">RDB certificate pre-check</h2>
              <VerificationChecks document={latestRdb} title="Latest RDB certificate" />
              {rdbDocs.length > 1 && <p className="mt-2 text-xs text-muted">{rdbDocs.length - 1} earlier certificate(s) on file.</p>}
            </div>
          ) : (
            <Alert type="info" title="Idea-stage project">
              The graduate declared that this venture is not yet registered, so no RDB certificate is required.
            </Alert>
          )}

          <div className="card p-5">
            <h2 className="font-semibold">Description</h2>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed">{project.description}</p>
          </div>

          <div className="card p-5">
            <h2 className="flex items-center gap-2 font-semibold">
              <History className="h-4 w-4" aria-hidden="true" /> Decision history
            </h2>
            <ol className="mt-3 space-y-3 border-l border-line pl-4">
              {project.history.map((h) => (
                <li key={h.id} className="text-sm">
                  <p>
                    <span className="font-medium">{h.action.replace('project.', '').replace(/_/g, ' ')}</span>{' '}
                    <span className="text-muted">by {h.actor} · {formatDate(h.at, true)}</span>
                  </p>
                  {h.reason && <p className="text-muted">“{h.reason}”</p>}
                </li>
              ))}
            </ol>
          </div>
        </div>

        <div className="space-y-6">
          <div className="card p-5">
            <h2 className="font-semibold">Graduate</h2>
            <p className="mt-2 text-sm font-medium">{project.owner.name}</p>
            <p className="text-xs text-muted">{project.owner.email}</p>
            <p className="mt-1 text-xs text-muted">
              {project.owner.program} · {project.owner.cohortYear}
            </p>
            <div className="mt-2 flex items-center gap-2 text-xs">
              Degree pre-check: <StatusPill status={project.owner.degreeFlag || 'processing'} />
            </div>
          </div>

          <div className="card p-5">
            <h2 className="font-semibold">Submission</h2>
            <dl className="mt-3 space-y-2 text-sm">
              {[
                ['Sector', project.sector],
                ['Suggested sector', project.suggestedSector || '—'],
                ['Stage', project.stage],
                ['Funding sought', project.fundingSought || '—'],
                ...(project.type === 'company'
                  ? [
                      ['Company', project.companyName],
                      ['RDB code', project.companyNumber],
                      ['Relationship', project.relationshipToCompany],
                    ]
                  : [['Idea declaration', project.ideaDeclaration ? 'Confirmed' : 'Missing']]),
                ['Publication consent', project.publicationConsent ? 'Yes' : 'No'],
                ['Submitted', formatDate(project.submittedAt, true)],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3">
                  <dt className="text-muted">{k}</dt>
                  <dd className="text-right">{v}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="card p-5">
            <h2 className="font-semibold">Other evidence</h2>
            {otherDocs.length === 0 ? (
              <p className="mt-2 text-sm text-muted">None.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {otherDocs.map((d) => (
                  <li key={d.id} className="text-sm">
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 text-left"
                      onClick={() => setPreview(preview === d.id ? null : d.id)}
                      aria-expanded={preview === d.id}
                    >
                      <FileText className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                      <span className="min-w-0 truncate text-accent hover:underline">{d.originalName}</span>
                      <span className="ml-auto shrink-0 text-xs text-muted">{KIND_LABEL[d.kind]}</span>
                    </button>
                    {preview === d.id && (
                      <div className="mt-2">
                        <DocumentViewer src={adminFileUrl(d.id)} mimeType={d.mimeType} name={d.originalName} height="h-80" />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card p-5">
            <h2 className="font-semibold">Investor activity</h2>
            <p className="mt-1 text-xs text-muted">{project.confirmedInvestors} confirmed investor(s) · limit 2</p>
            {project.introductions.length === 0 ? (
              <p className="mt-2 text-sm text-muted">No introductions yet.</p>
            ) : (
              <ul className="mt-2 space-y-1 text-sm">
                {project.introductions.map((i) => (
                  <li key={i.id} className="flex justify-between gap-2">
                    <span>{i.investor}</span>
                    <StatusPill status={i.status} label={i.investmentConfirmed ? 'Investment confirmed' : undefined} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <ReasonDialog
        open={Boolean(dialog)}
        title={dialog?.action.title}
        description={dialog?.key === 'archive' ? ARCHIVE_NOTICE : dialog?.action.description}
        warning={dialog?.key === 'approve' && latestRdb?.flag === 'suspicious' ? 'The RDB pre-check flagged this certificate as Suspicious. Record why you are approving.' : undefined}
        reason={dialog?.key === 'approve' && latestRdb?.flag === 'suspicious' ? 'required' : dialog?.action.reason}
        reasonLabel={dialog?.action.reasonLabel}
        confirmLabel={dialog?.action.label}
        tone={dialog?.action.tone}
        onClose={() => setDialog(null)}
        onConfirm={async (reason) => {
          await api.post(`/admin/projects/${project.id}/${dialog.key}`, { reason });
          setNotice(`${dialog.action.label} recorded.`);
          await load();
        }}
      />
    </>
  );
}
