import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { CheckCircle2, Copy, ExternalLink, FileText, GitCompareArrows, Info, Pencil, ShieldAlert, ShieldCheck, Upload } from 'lucide-react';
import { api } from '../../lib/api';
import { Alert, Field, PageLoader, Pill, StatusPill, formatDate } from '../../components/ui';
import { Breadcrumb, DropZone, InitialsBox, SectionCard } from '../../components/kit';
import { useAuth } from '../../context/AuthContext';

const KIND_LABEL = {
  rdb_certificate: 'RDB certificate',
  revenue_document: 'Revenue document',
  rra_certificate: 'RRA certificate',
  supporting_document: 'Supporting document',
};

const STATUS_HELP = {
  pending_review: 'An administrator is reviewing your submission and evidence.',
  revision_required: 'An administrator asked for changes. Revise the project and resubmit.',
  similarity_flagged: 'Your project is similar to an approved project. Explain the distinction — it stays unavailable for approval until an administrator reviews it.',
  approved: 'Approved and visible to investors. Editing sends it back for review.',
  funded: 'Marked as fully funded. It no longer appears in active investor discovery.',
  investor_limit_reached: 'Two investors have confirmed investment, so the project has left active discovery.',
  rejected: 'This submission was not approved.',
  archived: 'This project is archived.',
};

const STATEMENT_MAX = 4000;

function DocList({ documents }) {
  if (!documents.length) return <p className="text-sm text-muted">No documents attached yet.</p>;
  return (
    <ul className="space-y-2">
      {documents.map((d) => (
        <li key={d.id} className="flex items-center gap-3 rounded-md border border-line bg-surface px-3 py-2 text-sm">
          <FileText className="h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{d.originalName}</span>
            <span className="text-xs text-muted">
              {KIND_LABEL[d.kind]} · {(d.sizeBytes / 1024 / 1024).toFixed(1)} MB · uploaded {formatDate(d.uploadedAt, true)}
            </span>
          </span>
          <a href={`/api/documents/${d.id}/file`} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 text-xs text-accent hover:underline">
            View <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>
        </li>
      ))}
    </ul>
  );
}

function Timeline({ project }) {
  const steps = [
    { title: 'Project submitted', at: project.submittedAt, done: true },
    { title: 'Similarity flag raised', at: project.clarificationRequestedAt, done: true },
    { title: 'Founder clarification', at: project.clarificationSubmittedAt, done: Boolean(project.clarificationSubmittedAt), current: !project.clarificationSubmittedAt },
    { title: 'Administrator review', current: Boolean(project.clarificationSubmittedAt) },
    { title: 'Decision recorded' },
  ];
  const step = steps.findIndex((s) => s.current) + 1;
  return (
    <section className="card p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted">Resolution timeline</h2>
        <span className="text-xs font-medium text-accent">Step {step} of {steps.length}</span>
      </div>
      <ol className="relative mt-3 space-y-3 border-l border-line pl-4">
        {steps.map((s) => (
          <li key={s.title} className="relative text-sm">
            <span
              className={`absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full ring-2 ring-surface ${s.done ? 'bg-green-500' : s.current ? 'bg-accent' : 'bg-line'}`}
              aria-hidden="true"
            />
            <p className={s.current ? 'font-semibold text-accent' : s.done ? 'font-medium' : 'text-muted'}>
              {s.title}
              {s.current && ' (current)'}
            </p>
            <p className="text-xs text-muted">{s.at ? formatDate(s.at, true) : s.current ? 'In progress' : 'Pending'}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

// Project Clarification Request (Figma) — FR16.
function ClarificationView({ project, onSaved }) {
  const { user } = useAuth();
  const [text, setText] = useState(project.clarificationText || '');
  const [file, setFile] = useState(null);
  const [kind, setKind] = useState('supporting_document');
  const [declared, setDeclared] = useState(false);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const top = project.similarityMatches[0];
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
      setNotice('Clarification sent to the administrator queue.');
      onSaved(res.project);
    } catch (err) {
      setErrors(err.fields || {});
      setError(err.fields ? '' : err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-line bg-surface px-3 py-2 text-xs text-muted">
        <span className="rounded bg-amber-50 px-1.5 py-0.5 font-semibold uppercase text-amber-800 ring-1 ring-inset ring-amber-600/25 dark:bg-amber-500/15 dark:text-amber-300">
          Status: {project.clarificationSubmittedAt ? 'Awaiting administrator' : 'Action required'}
        </span>
        <span>Requested {formatDate(project.clarificationRequestedAt, true)}</span>
        <span>Reviewed by: ALU Ventures administrators</span>
      </div>
      <Breadcrumb items={[['Projects', '/app/projects'], [project.projectCode, null], ['Clarification']]} />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Project Clarification Request</h1>
          <p className="mt-1 text-sm text-muted">Similarity review for your submission to ALU Ventures.</p>
        </div>
        <dl className="text-right text-xs text-muted">
          <div>
            Cohort: <span className="font-medium text-ink">{user.graduateProfile?.cohortYear ? `Class of ${user.graduateProfile.cohortYear}` : '—'}</span>
          </div>
          <div>
            Venture: <span className="font-medium text-ink">{project.title}</span>
          </div>
        </dl>
      </div>

      <div className="mb-5 flex gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-500/40 dark:bg-amber-500/10">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden="true" />
        <p>
          <span className="font-semibold">Notice: clarification requested by ALU Ventures.</span> Your submission{' '}
          <span className="rounded bg-surface px-1 font-mono text-xs ring-1 ring-line">
            {project.title} · {project.projectCode}
          </span>{' '}
          requires clarification because it is similar to one or more approved projects. This is a review signal, not a
          finding of copying or fraud.
        </p>
      </div>
      {notice && <Alert type="success" className="mb-4">{notice}</Alert>}
      {error && <Alert type="error" className="mb-4">{error}</Alert>}

      <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]" noValidate>
        <div className="min-w-0 space-y-5">
          <SectionCard
            title={
              <span className="flex items-center gap-2">
                <span className="rounded bg-accent px-1.5 text-[11px] font-semibold text-white">01</span> Review Similarity Flag
              </span>
            }
            meta={<span className="rounded bg-red-50 px-2 py-0.5 font-semibold text-red-700 ring-1 ring-inset ring-red-600/20 dark:bg-red-500/15 dark:text-red-300">Similarity index: {Math.round((top?.score || 0) * 100)}%</span>}
          >
            <div className="rounded-md border border-line p-3">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <GitCompareArrows className="h-4 w-4 text-accent" aria-hidden="true" /> Flagged Overlap Reference
              </p>
              <p className="mt-1 text-sm">
                Similarity detected with{' '}
                {project.similarityMatches.map((m, i) => (
                  <span key={m.projectCode}>
                    {i > 0 && (i === project.similarityMatches.length - 1 ? ' & ' : ', ')}
                    <span className="font-medium text-accent">{m.title}</span>
                  </span>
                ))}
                .
              </p>
              {top && (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-md bg-subtle p-3 ring-1 ring-line">
                    <p className="flex justify-between text-[11px] font-semibold uppercase tracking-wide text-muted">
                      Matched approved project <span className="font-mono normal-case">{top.projectCode}</span>
                    </p>
                    <p className="mt-1 text-sm font-semibold">{top.title}</p>
                    <p className="mt-0.5 text-xs text-muted">{top.summary || 'This project’s summary is not public.'}</p>
                  </div>
                  <div className="rounded-md bg-accent-soft/60 p-3 ring-1 ring-line">
                    <p className="flex justify-between text-[11px] font-semibold uppercase tracking-wide text-muted">
                      Your submission <span className="font-mono normal-case">{project.projectCode}</span>
                    </p>
                    <p className="mt-1 text-sm font-semibold">{project.title}</p>
                    <p className="mt-0.5 text-xs text-muted">{project.summary}</p>
                  </div>
                </div>
              )}
            </div>
            <div className="mt-4">
              <div className="flex items-baseline justify-between">
                <label htmlFor="clarification" className="text-sm font-semibold">
                  Detailed Clarification Statement <span className="text-red-600">*</span>
                </label>
                <span className="text-[11px] tabular-nums text-muted">
                  {text.length} / {STATEMENT_MAX} chars
                </span>
              </div>
              <p className="mb-1.5 text-xs text-muted">Explain how your business model, technology, location or target customers differ from the approved project(s).</p>
              <textarea id="clarification" rows={7} className="input" maxLength={STATEMENT_MAX} value={text} onChange={(e) => setText(e.target.value)} />
              {errors.clarification && <p className="mt-1 text-xs text-red-600">{errors.clarification}</p>}
            </div>
          </SectionCard>

          <SectionCard
            title={
              <span className="flex items-center gap-2">
                <span className="rounded bg-accent px-1.5 text-[11px] font-semibold text-white">02</span> Supplementary Documentation &amp; Registration
              </span>
            }
            meta="RRA / RDB evidence"
          >
            <p className="mb-3 text-sm text-muted">
              Upload documents that support your clarification, such as a Rwanda Revenue Authority (RRA) registration
              certificate for an NGO or trust, or partnership agreements. Optional.
            </p>
            <Field label="Document type" htmlFor="docKind" className="mb-3 sm:w-72">
              <select id="docKind" className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
                <option value="supporting_document">Supporting document</option>
                <option value="rra_certificate">RRA registration certificate</option>
              </select>
            </Field>
            <DropZone id="supportingDocument" files={file} onChange={setFile} title="Click to select" hint="PDF, PNG or JPEG · 10 MB max · stored privately" />
            <p className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-wide text-muted">Attached supporting documents ({supporting.length})</p>
            <DocList documents={supporting} />
          </SectionCard>

          <SectionCard
            title={
              <span className="flex items-center gap-2">
                <span className="rounded bg-accent px-1.5 text-[11px] font-semibold text-white">03</span> Founder Declaration &amp; Attestation
              </span>
            }
          >
            <label className="flex gap-3 text-sm">
              <input type="checkbox" className="mt-0.5 h-4 w-4" checked={declared} onChange={(e) => setDeclared(e.target.checked)} />
              <span>
                <span className="font-medium">I certify that this clarification and any documents provided are authentic and accurately represent the venture.</span>
                <span className="block text-xs text-muted">Your clarification and documents are recorded in the platform audit log with the time of submission.</span>
              </span>
            </label>
            {errors.declaration && <p className="mt-1 text-xs text-red-600">{errors.declaration}</p>}
          </SectionCard>

          <div className="card flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted">
              {project.clarificationSubmittedAt ? `Last sent ${formatDate(project.clarificationSubmittedAt, true)} — you can update it until an administrator decides.` : 'An administrator reviews your clarification before any decision.'}
            </p>
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? 'Sending…' : project.clarificationSubmittedAt ? 'Update Clarification' : 'Submit Clarification to Admin Queue'}
            </button>
          </div>
        </div>

        <aside className="space-y-5">
          <section className="card p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted">Venture dossier</h2>
              <Pill tone="slate">{project.country}</Pill>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <InitialsBox name={project.title} className="h-10 w-10 text-sm" />
              <div className="min-w-0">
                <p className="font-semibold">{project.title}</p>
                <p className="font-mono text-[11px] text-muted">{project.projectCode}</p>
              </div>
            </div>
            <dl className="mt-3 space-y-1.5 text-xs">
              {[
                ['Lead founder', user.fullName],
                ['Venture sector', project.sector],
                ['Stage', project.stage],
                ['Type', project.type === 'company' ? 'Registered company' : 'Idea stage'],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-2">
                  <dt className="text-muted">{k}</dt>
                  <dd className="text-right font-medium">{v}</dd>
                </div>
              ))}
            </dl>
          </section>
          <Timeline project={project} />
          <section className="card bg-accent-soft/50 p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Info className="h-4 w-4 text-accent" aria-hidden="true" /> What the administrator checks
            </h2>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-muted">
              <li>How your market, customers, location or model differ from the matched project.</li>
              <li>Evidence that the venture is your own independent work.</li>
              <li>Registration evidence where a project type requires it, such as an RRA certificate for an NGO.</li>
            </ul>
            <p className="mt-2 text-xs text-muted">The administrator then clears the flag, requests a revision or rejects the submission.</p>
          </section>
        </aside>
      </form>
    </>
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
    <div className="mt-4 space-y-2 border-t border-line pt-4">
      <p className="text-sm font-medium">Add a document requested by an administrator</p>
      {error && <Alert type="error">{error}</Alert>}
      <select className="input" value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Document type">
        <option value="supporting_document">Supporting document</option>
        <option value="rra_certificate">RRA certificate</option>
        <option value="revenue_document">Revenue document</option>
      </select>
      <DropZone id="evidence" files={file} onChange={setFile} hint="PDF, PNG or JPEG · 10 MB max" />
      <button type="button" className="btn-secondary w-full" disabled={!file || busy} onClick={submit}>
        <Upload className="h-4 w-4" aria-hidden="true" /> {busy ? 'Uploading…' : 'Upload'}
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

  if (error) return <Alert type="error">{error}</Alert>;
  if (!project) return <PageLoader />;
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

  return (
    <>
      <Breadcrumb items={[['Projects', '/app/projects'], [project.projectCode]]} />
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{project.title}</h1>
            <StatusPill status={project.status} />
          </div>
          <p className="mt-1 text-sm text-muted">{project.summary}</p>
          <p className="mt-2 inline-flex items-center gap-2 font-mono text-xs text-muted">
            {project.projectCode}
            <button type="button" onClick={copy} className="rounded p-0.5 hover:text-ink" aria-label="Copy project code">
              <Copy className="h-3.5 w-3.5" />
            </button>
            {copied && <span className="font-sans text-green-600">Copied</span>}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {isPublic && (
            <Link to={`/verify?code=${project.projectCode}`} className="btn-secondary">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" /> Public verification
            </Link>
          )}
          {editable && (
            <Link to={`/app/projects/${project.id}/edit`} className="btn-primary">
              <Pencil className="h-4 w-4" aria-hidden="true" /> Revise
            </Link>
          )}
        </div>
      </div>

      {location.state?.created && (
        <Alert type="success" className="mb-4" title="Project submitted">
          Your verification code is <strong className="font-mono">{project.projectCode}</strong>. It stays the same through revisions. We emailed you a copy.
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-5">
          <div className="card flex gap-3 p-4">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
            <div>
              <p className="text-sm font-medium">{STATUS_HELP[project.status]}</p>
              {project.reviewNote && ['revision_required', 'rejected'].includes(project.status) && (
                <p className="mt-1 text-sm text-muted">Administrator note: “{project.reviewNote}”</p>
              )}
            </div>
          </div>
          <SectionCard title="Problem & Solution">
            <p className="whitespace-pre-line text-sm leading-relaxed">{project.description}</p>
          </SectionCard>
        </div>

        <aside className="space-y-5">
          <section className="card p-4">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted">Venture details</h2>
            <dl className="mt-3 space-y-2 text-sm">
              {[
                ['Sector', project.sector + (project.suggestedSector && project.suggestedSector !== project.sector ? ` (suggested ${project.suggestedSector})` : '')],
                ['Stage', project.stage],
                ['Operating country', project.country],
                ['Funding sought', project.fundingSought || '—'],
                ...(project.type === 'company'
                  ? [
                      ['Company', project.companyName],
                      ['RDB code', project.companyNumber],
                      ['Your role', project.relationshipToCompany],
                    ]
                  : [['Type', 'Idea stage']]),
                ['Public listing', project.publicationConsent ? 'Consented' : 'Not published'],
                ['Submitted', formatDate(project.submittedAt, true)],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3">
                  <dt className="text-muted">{k}</dt>
                  <dd className="text-right">{v}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section className="card p-4">
            <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted">Private documents</h2>
            <DocList documents={project.documents} />
            {!['rejected', 'archived'].includes(project.status) && <UploadEvidence project={project} onSaved={setProject} />}
          </section>
        </aside>
      </div>
    </>
  );
}
