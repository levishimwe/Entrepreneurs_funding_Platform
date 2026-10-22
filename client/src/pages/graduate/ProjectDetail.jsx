import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { Field, formatDate } from '../../components/ui';
import { Breadcrumb, DropZone } from '../../components/kit';
import { AdminPage, DataTable, KeyValue, Loading, Messages, StatusPill, TableWrap } from '../../components/admin';

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
    <DataTable
      columns={[
        { key: 'name', label: 'File', render: (d) => <span className="break-all">{d.originalName}</span> },
        { key: 'kind', label: 'Kind', render: (d) => KIND_LABEL[d.kind] },
        { key: 'size', label: 'Size', num: true, render: (d) => `${(d.sizeBytes / 1024 / 1024).toFixed(1)} MB` },
        { key: 'uploaded', label: 'Uploaded', render: (d) => formatDate(d.uploadedAt, true) },
      ]}
      rows={documents}
      actions={(d) => (
        <a href={`/api/documents/${d.id}/file`} target="_blank" rel="noreferrer" className="adm-act">
          View
        </a>
      )}
      empty="No documents attached yet."
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
    <AdminPage title={`Clarification: ${project.title}`} meta={<StatusPill status="similarity_flagged" />}>
      <Breadcrumb items={[['My projects', '/app/projects'], [project.projectCode]]} />
      <Messages notice={notice} error={error} />
      <p className="adm-message">
        Your project is similar to an approved project. This is a review signal, not a finding of copying. Explain what makes it distinct; it cannot be approved until an
        administrator reviews your answer.
      </p>

      <h2>Similar approved projects</h2>
      <TableWrap>
        <table className="adm-table">
          <thead>
            <tr>
              <th>Project</th>
              <th>Code</th>
              <th>Summary</th>
              <th className="adm-num">Score</th>
            </tr>
          </thead>
          <tbody>
            {project.similarityMatches.map((m) => (
              <tr key={m.projectCode}>
                <td className="font-medium">{m.title}</td>
                <td className="adm-mono">{m.projectCode}</td>
                <td className="adm-muted">{m.summary || 'Not public.'}</td>
                <td className="adm-num">{Math.round(m.score * 100)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>

      <form onSubmit={submit} className="adm-card mt-6 max-w-3xl space-y-4 p-4" noValidate>
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

      <h2>Supporting documents</h2>
      <Documents documents={supporting} />
    </AdminPage>
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
    <div className="adm-card mt-3 max-w-xl space-y-3 p-4">
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

  if (error) return <AdminPage title="Project"><Messages error={error} /></AdminPage>;
  if (!project) return <AdminPage title="Project"><Loading /></AdminPage>;
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
    <AdminPage title={project.title} meta={<StatusPill status={project.status} />}>
      <Breadcrumb items={[['My projects', '/app/projects'], [project.projectCode]]} />
      <Messages notice={location.state?.created ? `Submitted. Your verification code is ${project.projectCode}; it stays the same through revisions.` : ''} />

      <div className="adm-card mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <span className="adm-muted">{STATUS_HELP[project.status]}</span>
        <span className="ml-auto flex flex-wrap items-center gap-4">
          <button type="button" className="adm-act" onClick={copy}>
            {copied ? 'Copied' : 'Copy code'}
          </button>
          {isPublic && (
            <Link to={`/verify?code=${project.projectCode}`} className="adm-act">
              Public verification
            </Link>
          )}
          {editable && (
            <Link to={`/app/projects/${project.id}/edit`} className="adm-primary">
              Revise
            </Link>
          )}
        </span>
      </div>
      {project.reviewNote && ['revision_required', 'rejected'].includes(project.status) && <p className="adm-message adm-message-error">Administrator note: “{project.reviewNote}”</p>}

      <KeyValue
        rows={[
          ['Code', <span key="c" className="adm-mono">{project.projectCode}</span>],
          ['Summary', project.summary],
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
            : [['Type', 'Idea stage']]),
          ['Public listing', project.publicationConsent ? 'Consented' : 'Not published'],
          ...(project.funding ? [['Funding', [project.funding.name || (project.funding.source === 'competition' ? 'Competition' : 'Investors'), money(project.funding.amount, project.funding.currency)].filter(Boolean).join(' · ')]] : []),
          ['Submitted', formatDate(project.submittedAt, true)],
        ]}
      />

      <h2>Problem and solution</h2>
      <p className="adm-card whitespace-pre-line p-4">{project.description}</p>

      {results.length > 0 && (
        <>
          <h2>Competition results</h2>
          <DataTable
            columns={[
              { key: 'opp', label: 'Opportunity', render: (r) => r.opportunity?.title },
              { key: 'outcome', label: 'Outcome', render: (r) => `${r.outcomeLabel}${r.awardTitle ? ` · ${r.awardTitle}` : ''}` },
              { key: 'amount', label: 'Amount', num: true, render: (r) => money(r.amount, r.currency) || '—' },
              { key: 'date', label: 'Date', render: (r) => (r.resultDate ? formatDate(r.resultDate) : '—') },
            ]}
            rows={results}
          />
        </>
      )}

      <h2>Private documents</h2>
      <Documents documents={project.documents} />
      {!['rejected', 'archived'].includes(project.status) && <UploadEvidence project={project} onSaved={setProject} />}
    </AdminPage>
  );
}
