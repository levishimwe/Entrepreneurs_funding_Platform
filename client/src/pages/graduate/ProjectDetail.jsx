import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { Field, formatDate } from '../../components/ui';
import { DropZone } from '../../components/kit';
import { Messages, StatusPill } from '../../components/admin';
import { Avatar, DetailHeader, DetailSkeleton, FieldGrid, FileLink, FileList, InfoCard, LongText } from '../../components/detail';

const KIND_LABEL = {
  rdb_certificate: 'RDB certificate',
  revenue_document: 'Revenue document',
  rra_certificate: 'RRA certificate',
  supporting_document: 'Supporting document',
};

const STATUS_HELP = {
  pending_review: 'An administrator is reviewing your submission and evidence.',
  revision_required: 'An administrator asked for changes. Revise the project and resubmit.',
  similarity_flagged: 'Similar to an approved project. Explain the distinction below.',
  approved: 'Approved and visible to investors. Editing sends it back for review.',
  funded: 'Fully Funded. It no longer appears in investor discovery.',
  investor_limit_reached: 'Two investors confirmed investment; it has left investor discovery.',
  rejected: 'This submission was not approved.',
  archived: 'This project is archived.',
};

const STATEMENT_MAX = 4000;
const money = (amount, currency) => (amount === null || amount === undefined ? null : `${currency || ''} ${Number(amount).toLocaleString('en-GB')}`.trim());

function Documents({ documents }) {
  return (
    <FileList
      files={documents.map((d) => ({ id: d.id, name: d.originalName, mimeType: d.mimeType, sizeBytes: d.sizeBytes, label: KIND_LABEL[d.kind], date: d.uploadedAt }))}
      empty="No documents attached yet."
      actions={(f) => <FileLink href={`/api/documents/${f.id}/file`} />}
    />
  );
}

// Similarity clarification (FR16).
function ClarificationView({ project, onSaved }) {
  const [text, setText] = useState(project.clarificationText || '');
  const [file, setFile] = useState(null);
  const [kind, setKind] = useState('supporting_document');
  const [declared, setDeclared] = useState(false);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const supporting = project.documents.filter((d) => ['rra_certificate', 'supporting_document'].includes(d.kind));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setErrors({});
    try {
      const data = new FormData();
      data.append('clarification', text);
      data.append('documentKind', kind);
      data.append('declaration', String(declared));
      if (file) data.append('supportingDocument', file);
      const res = await api.upload(`/projects/${project.id}/clarification`, data);
      setFile(null);
      setDeclared(false);
      setNotice('Clarification sent to the administrator.');
      onSaved(res.project);
    } catch (err) {
      setErrors(err.fields || {});
      setError(err.fields ? '' : err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="adm">
      <DetailHeader
        back={{ to: '/app/projects', label: 'My projects', current: project.title }}
        title={`Clarification: ${project.title}`}
        avatar={<Avatar name={project.title} src={project.imageUrl} size={52} square />}
        status={<StatusPill status="similarity_flagged" />}
        meta="Similar to an approved project. Explain the distinction below."
      />
      <Messages notice={notice} error={error} />
      <p className="adm-message">
        Your project is similar to an approved project. This is a review signal, not a finding of copying. Explain what makes it distinct; it cannot be approved until an
        administrator reviews your answer.
      </p>

      <InfoCard title="Similar approved projects">
        <ul className="divide-y divide-line rounded-lg border border-line">
          {project.similarityMatches.map((m, i) => (
            <li key={i} className="px-3 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-ink">{m.title}</span>
                <span className="text-[13px] tabular-nums text-muted">
                  {m.sector} · {Math.round(m.score * 100)}%
                </span>
              </div>
              <p className="mt-1 text-[13px] leading-[1.55] text-muted">{m.summary || 'Not public.'}</p>
            </li>
          ))}
        </ul>
      </InfoCard>

      <form onSubmit={submit} className="card mt-4 max-w-3xl space-y-4 p-4 sm:p-5" noValidate>
        <Field label="Clarification" htmlFor="clarification" required error={errors.clarification} help={`${text.length} / ${STATEMENT_MAX} characters. How do your model, technology, location or customers differ?`}>
          <textarea id="clarification" rows={7} className="input" maxLength={STATEMENT_MAX} value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
        <Field label="Supporting document (optional)" htmlFor="docKind">
          <select id="docKind" className="input sm:max-w-xs" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="supporting_document">Supporting document</option>
            <option value="rra_certificate">RRA registration certificate</option>
          </select>
        </Field>
        <DropZone id="supportingDocument" files={file} onChange={setFile} title="Choose a file" hint="PDF, PNG or JPEG · 10 MB max · private" />
        <label className="flex items-start gap-2">
          <input type="checkbox" className="mt-1" checked={declared} onChange={(e) => setDeclared(e.target.checked)} />
          <span>I certify that this clarification and any documents are authentic and accurately represent the venture.</span>
        </label>
        {errors.declaration && <p className="adm-bad text-[12px]">{errors.declaration}</p>}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="adm-muted text-[12px]">{project.clarificationSubmittedAt ? `Last sent ${formatDate(project.clarificationSubmittedAt, true)}` : ''}</span>
          <button type="submit" className="adm-primary" disabled={busy}>
            {busy ? 'Sending…' : project.clarificationSubmittedAt ? 'Update clarification' : 'Send clarification'}
          </button>
        </div>
      </form>

      <div className="mt-4">
        <InfoCard title="Supporting documents">
          <Documents documents={supporting} />
        </InfoCard>
      </div>
    </div>
  );
}

function UploadEvidence({ project, onSaved }) {
  const [file, setFile] = useState(null);
  const [kind, setKind] = useState('supporting_document');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const data = new FormData();
      data.append('kind', kind);
      data.append('document', file);
      const res = await api.upload(`/projects/${project.id}/documents`, data);
      onSaved(res.project);
      setFile(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-4 max-w-xl space-y-3 border-t border-line pt-4">
      <p className="font-semibold">Add a document requested by an administrator</p>
      {error && <p className="adm-bad">{error}</p>}
      <select className="input" value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Document type">
        <option value="supporting_document">Supporting document</option>
        <option value="rra_certificate">RRA certificate</option>
        <option value="revenue_document">Revenue document</option>
      </select>
      <DropZone id="evidence" files={file} onChange={setFile} hint="PDF, PNG or JPEG · 10 MB max" />
      <button type="button" className="adm-secondary" disabled={!file || busy} onClick={submit}>
        {busy ? 'Uploading…' : 'Upload'}
      </button>
    </div>
  );
}

export default function ProjectDetail() {
  const { id } = useParams();
  const location = useLocation();
  const [project, setProject] = useState(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api
      .get(`/projects/${id}`)
      .then((d) => {
        setProject(d.project);
        document.title = `${d.project.title} · ALU Ventures`;
      })
      .catch((e) => setError(e.message));
  }, [id]);

  if (error) {
    return (
      <div className="adm">
        <DetailHeader back={{ to: '/app/projects', label: 'My projects' }} title="Project" />
        <Messages error={error} />
      </div>
    );
  }
  if (!project) return <DetailSkeleton />;
  if (project.status === 'similarity_flagged') {
    return <ClarificationView project={project} onSaved={(p) => setProject((old) => ({ ...p, similarityMatches: old.similarityMatches }))} />;
  }

  const editable = ['pending_review', 'revision_required', 'approved'].includes(project.status);
  const isPublic = ['approved', 'funded', 'investor_limit_reached'].includes(project.status) && project.publicationConsent;
  const copy = async () => {
    await navigator.clipboard?.writeText(project.projectCode).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const results = project.competitionResults || [];

  return (
    <div className="adm">
      <DetailHeader
        back={{ to: '/app/projects', label: 'My projects', current: project.title }}
        title={project.title}
        avatar={<Avatar name={project.title} src={project.imageUrl} size={52} square />}
        status={<StatusPill status={project.status} />}
        meta={STATUS_HELP[project.status]}
        actions={
          <>
            {editable && (
              <Link to={`/app/projects/${project.id}/edit`} className="adm-primary">
                Revise
              </Link>
            )}
            <button type="button" className="adm-act" onClick={copy}>
              {copied ? 'Copied' : 'Copy code'}
            </button>
            {isPublic && (
              <Link to={`/verify?code=${project.projectCode}`} className="adm-act">
                Public verification
              </Link>
            )}
          </>
        }
      />
      <Messages notice={location.state?.created ? `Submitted. Your verification code is ${project.projectCode}; it stays the same through revisions.` : ''} />
      {project.reviewNote && ['revision_required', 'rejected'].includes(project.status) && <p className="adm-message adm-message-error">Administrator note: “{project.reviewNote}”</p>}

      <div className="space-y-4">
        <InfoCard title="Project details">
          <FieldGrid
            fields={[
              ['Summary', project.summary, { wide: true }],
              ['Verification code', <span key="c" className="adm-mono">{project.projectCode}</span>],
              ['Type', project.type === 'company' ? 'Registered company' : 'Idea stage'],
              ['Sector', project.sector + (project.suggestedSector && project.suggestedSector !== project.sector ? ` (suggested ${project.suggestedSector})` : '')],
              ['Stage', project.stage],
              ['Operating country', project.country],
              ['Funding sought', project.fundingSought],
              ...(project.type === 'company'
                ? [
                    ['Company', project.companyName],
                    ['RDB code', project.companyNumber],
                    ['Your role', project.relationshipToCompany],
                  ]
                : []),
              ['Public listing', project.publicationConsent ? 'Consented' : 'Not published'],
              ...(project.funding ? [['Funding', [project.funding.name || (project.funding.source === 'competition' ? 'Competition' : 'Investors'), money(project.funding.amount, project.funding.currency)].filter(Boolean).join(' · ')]] : []),
              ['Submitted', formatDate(project.submittedAt, true)],
            ]}
          />
        </InfoCard>

        <InfoCard title="Problem and solution">
          <LongText>{project.description}</LongText>
        </InfoCard>

        {results.length > 0 && (
          <InfoCard title="Competition results">
            <ul className="divide-y divide-line rounded-lg border border-line">
              {results.map((r) => (
                <li key={r.id} className="px-3 py-2.5 text-[14px]">
                  <span className="block font-medium text-ink">{r.opportunity?.title}</span>
                  <span className="text-[13px] text-muted">
                    {[`${r.outcomeLabel}${r.awardTitle ? ` · ${r.awardTitle}` : ''}`, money(r.amount, r.currency), r.resultDate ? formatDate(r.resultDate) : null].filter(Boolean).join(' · ')}
                  </span>
                </li>
              ))}
            </ul>
          </InfoCard>
        )}

        <InfoCard title="Private documents" meta="Only you and administrators can open these">
          <Documents documents={project.documents} />
          {!['rejected', 'archived'].includes(project.status) && <UploadEvidence project={project} onSaved={setProject} />}
        </InfoCard>
      </div>
    </div>
  );
}
