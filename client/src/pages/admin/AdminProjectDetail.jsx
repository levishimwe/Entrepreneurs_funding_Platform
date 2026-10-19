import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { formatDate } from '../../components/ui';
import VerificationChecks, { adminFileUrl } from '../../components/VerificationChecks';
import DocumentViewer from '../../components/DocumentViewer';
import ReasonDialog from '../../components/ReasonDialog';
import { ARCHIVE_NOTICE, availableActions } from '../../lib/projectActions';
import { statusLabel } from '../../lib/status';
import { AdminPage, DeleteDialog, EmptyRow, KeyValue, Loading, Messages, StatusPill, StatusText, TableWrap } from '../../components/admin';

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
  const [deleting, setDeleting] = useState(false);
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

  if (error && !project) return <AdminPage title="Project"><Messages error={error} /></AdminPage>;
  if (!project) return <AdminPage title="Project"><Loading /></AdminPage>;

  const rdbDocs = project.documents.filter((d) => d.kind === 'rdb_certificate');
  const latestRdb = rdbDocs.at(-1);
  const rraDocs = project.documents.filter((d) => d.kind === 'rra_certificate');
  const otherDocs = project.documents.filter((d) => !['rdb_certificate', 'rra_certificate'].includes(d.kind));
  const actions = availableActions(project);
  const suspiciousApproval = dialog?.key === 'approve' && latestRdb?.flag === 'suspicious';
  const fundedHint = actions.some(([k, , d]) => k === 'mark_funded' && d);

  const deletable = project.status === 'rejected' || (project.status === 'archived' && project.statusBeforeArchive === 'rejected');
  return (
    <AdminPage title={project.title} meta={<StatusPill status={project.status} />}>
      <p className="adm-hint -mt-2">
        <Link className="adm-a" to="/app/admin/projects">
          Projects
        </Link>
        {' / '}
        <span className="adm-mono">{project.projectCode}</span>
      </p>
      <Messages notice={notice} error={error} />

      <div className="adm-card mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        {actions.length === 0 && !deletable && <span className="adm-muted">No actions in this state.</span>}
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
            Delete
          </button>
        )}
        {fundedHint && <span className="adm-muted w-full text-[12px]">Mark as Funded needs an investment confirmed by both sides.</span>}
      </div>

      <KeyValue
        rows={[
          ['Status', <StatusText key="s" status={project.status} />],
          ...(project.status === 'archived' && project.statusBeforeArchive ? [['Archived from', statusLabel(project.statusBeforeArchive)]] : []),
          ['Type', statusLabel(project.type)],
          ['Summary', project.summary],
          ['Sector', project.sector],
          ['Suggested sector', project.suggestedSector],
          ['Stage', project.stage],
          ['Funding sought', project.fundingSought],
          ...(project.type === 'company'
            ? [
                ['Company', project.companyName],
                ['RDB code', project.companyNumber],
                ['Relationship to company', project.relationshipToCompany],
              ]
            : [['Idea declaration', project.ideaDeclaration ? 'Confirmed' : 'Missing']]),
          ['Publication consent', project.publicationConsent ? 'Yes' : 'No'],
          ['Submitted', formatDate(project.submittedAt, true)],
          ['Graduate', `${project.owner.name} · ${project.owner.email}`],
          ['Programme', `${project.owner.program} · Class of ${project.owner.cohortYear}`],
          ['Graduate degree check', <StatusText key="d" status={project.owner.degreeFlag || 'processing'} />],
          ['Confirmed investors', `${project.confirmedInvestors} of 2`],
        ]}
      />

      <h2>Description</h2>
      <p className="adm-card whitespace-pre-line p-4">{project.description}</p>

      {project.status === 'similarity_flagged' && (
        <>
          <h2>Similarity flag ({Math.round((project.similarityScore || 0) * 100)}%)</h2>
          <TableWrap>
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Similar approved project</th>
                  <th>Code</th>
                  <th className="adm-num">Score</th>
                </tr>
              </thead>
              <tbody>
                {project.similarityMatches.map((m) => (
                  <tr key={m.projectCode}>
                    <td>{m.title}</td>
                    <td className="adm-mono">{m.projectCode}</td>
                    <td className="adm-num">{Math.round(m.score * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
          <p className="mt-2">
            <span className="font-semibold">Graduate’s clarification: </span>
            {project.clarificationText ? (
              <>
                <span className="whitespace-pre-line">{project.clarificationText}</span>
                <span className="adm-muted"> (sent {formatDate(project.clarificationSubmittedAt, true)})</span>
              </>
            ) : (
              <span className="adm-muted">not submitted yet. A clarification request was emailed.</span>
            )}
          </p>
        </>
      )}

      <h2>RDB certificate</h2>
      {project.type === 'company' ? (
        <>
          <VerificationChecks document={latestRdb} title="Latest RDB certificate" />
          {rdbDocs.length > 1 && <p className="adm-hint mt-1">{rdbDocs.length - 1} earlier certificate(s) on file.</p>}
        </>
      ) : (
        <p className="adm-muted">Idea-stage project: the graduate declared it is not yet registered, so no RDB certificate is required.</p>
      )}

      {rraDocs.length > 0 && (
        <>
          <h2>RRA document (optional)</h2>
          <VerificationChecks document={rraDocs.at(-1)} title="Latest RRA document" />
          {rraDocs.length > 1 && <p className="adm-hint mt-1">{rraDocs.length - 1} earlier RRA document(s) on file.</p>}
        </>
      )}

      <h2>Other evidence</h2>
      <TableWrap>
        <table className="adm-table">
          <thead>
            <tr>
              <th>File</th>
              <th>Kind</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {otherDocs.length === 0 && <EmptyRow colSpan={3}>None.</EmptyRow>}
            {otherDocs.map((d) => (
              <tr key={d.id}>
                <td className="break-all">{d.originalName}</td>
                <td>{KIND_LABEL[d.kind]}</td>
                <td className="adm-actions">
                  <button type="button" className="adm-btn" aria-expanded={preview === d.id} onClick={() => setPreview(preview === d.id ? null : d.id)}>
                    {preview === d.id ? 'Hide' : 'View'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      {preview && (
        <div className="mt-2">
          {otherDocs
            .filter((d) => d.id === preview)
            .map((d) => (
              <DocumentViewer key={d.id} src={adminFileUrl(d.id)} mimeType={d.mimeType} name={d.originalName} height="h-96" />
            ))}
        </div>
      )}

      <h2>Investor introductions</h2>
      <TableWrap>
        <table className="adm-table">
          <thead>
            <tr>
              <th>Investor</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {project.introductions.length === 0 && <EmptyRow colSpan={2}>No introductions yet.</EmptyRow>}
            {project.introductions.map((i) => (
              <tr key={i.id}>
                <td>{i.investor}</td>
                <td>{i.investmentConfirmed ? 'Investment confirmed' : <StatusText status={i.status} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>

      <h2>Decision history</h2>
      <TableWrap>
        <table className="adm-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Action</th>
              <th>By</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {project.history.length === 0 && <EmptyRow colSpan={4}>No decisions yet.</EmptyRow>}
            {project.history.map((h) => (
              <tr key={h.id}>
                <td className="whitespace-nowrap">{formatDate(h.at, true)}</td>
                <td>{h.action.replace('project.', '').replace(/_/g, ' ')}</td>
                <td>{h.actor}</td>
                <td className="adm-muted">{h.reason || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>

      <ReasonDialog
        open={Boolean(dialog)}
        title={dialog?.action.title}
        description={dialog?.key === 'archive' ? ARCHIVE_NOTICE : dialog?.action.description}
        warning={suspiciousApproval ? 'The RDB pre-check flagged this certificate as Suspicious. Record why you are approving.' : undefined}
        reason={suspiciousApproval ? 'required' : dialog?.action.reason}
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
      <DeleteDialog
        open={deleting}
        title={`Delete ${project.title}?`}
        planUrl={`/admin/projects/${project.id}/delete-plan`}
        deleteUrl={`/admin/projects/${project.id}`}
        onClose={() => setDeleting(false)}
        onDeleted={() => navigate('/app/admin/projects?status=rejected')}
      />
    </AdminPage>
  );
}
