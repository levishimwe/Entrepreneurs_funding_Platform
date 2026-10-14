import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Building2, FileText, Fingerprint, Lightbulb, Lock, ScanSearch, Send, Sparkles, TriangleAlert } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { COUNTRIES, RELATIONSHIPS, SECTORS, STAGES } from '../../lib/constants';
import { Alert, Field, PageLoader, Pill } from '../../components/ui';
import { Breadcrumb, DropZone } from '../../components/kit';
import { useAuth } from '../../context/AuthContext';

const EMPTY = {
  title: '',
  type: 'company',
  sector: '',
  stage: '',
  country: 'Rwanda',
  summary: '',
  description: '',
  fundingSought: '',
  companyName: '',
  companyNumber: '',
  relationshipToCompany: '',
  ideaDeclaration: false,
  publicationConsent: true,
};
const SUMMARY_MAX = 500;

function FormSection({ number, icon: Icon, title, children }) {
  return (
    <section className="card overflow-hidden">
      <header className="flex items-center gap-2 border-b border-line bg-subtle px-5 py-3">
        {Icon && <Icon className="h-4 w-4 text-accent" aria-hidden="true" />}
        <h2 className="text-sm font-semibold">
          {number}. {title}
        </h2>
      </header>
      <div className="space-y-4 p-5">{children}</div>
    </section>
  );
}

// Project submission and revision (FR04), laid out as the Figma form. Sector
// suggestions and similarity warnings are assistive: the graduate decides.
export default function ProjectForm() {
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();
  const { user } = useAuth();
  const [values, setValues] = useState(EMPTY);
  const [existing, setExisting] = useState(null);
  const [loading, setLoading] = useState(editing);
  const [sectors, setSectors] = useState(SECTORS);
  const [suggestion, setSuggestion] = useState(null);
  const [rdb, setRdb] = useState(null);
  const [revenue, setRevenue] = useState([]);
  const [matches, setMatches] = useState(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const sectorTouched = useRef(false);

  useEffect(() => {
    document.title = `${editing ? 'Revise' : 'Submit'} project · ALU Ventures`;
    api.get('/public/sectors').then((d) => d.sectors?.length && setSectors(d.sectors)).catch(() => {});
    if (!editing) return;
    api
      .get(`/projects/${id}`)
      .then(({ project }) => {
        setExisting(project);
        sectorTouched.current = true;
        setValues({ ...EMPTY, ...Object.fromEntries(Object.keys(EMPTY).map((k) => [k, project[k] ?? EMPTY[k]])) });
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [editing, id]);

  // Live rule-based sector suggestion (FR15), debounced.
  const text = `${values.title} ${values.summary} ${values.description}`;
  useEffect(() => {
    if (text.trim().length < 12) return undefined;
    const t = setTimeout(() => {
      api
        .post('/projects/suggest-sector', { title: values.title, summary: values.summary, description: values.description })
        .then((s) => {
          setSuggestion(s);
          if (s.sector && !sectorTouched.current) setValues((v) => ({ ...v, sector: s.sector }));
        })
        .catch(() => {});
    }, 500);
    return () => clearTimeout(t);
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setMatches(null);
    setAcknowledged(false);
  }, [values.title, values.description]);

  const set = (name) => (e) => {
    const value = e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e;
    if (name === 'sector') sectorTouched.current = true;
    setValues((v) => ({ ...v, [name]: value }));
    setErrors((errs) => ({ ...errs, [name]: undefined }));
  };

  const existingRdb = existing?.documents?.filter((d) => d.kind === 'rdb_certificate').at(-1);
  const sectorOverridden = suggestion?.sector && values.sector && suggestion.sector !== values.sector;

  const runSimilarityCheck = async () => {
    const res = await api.post('/projects/similarity-check', { title: values.title, description: values.description, projectId: editing ? Number(id) : undefined });
    setMatches(res.matches);
    return res.matches;
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setErrors({});
    try {
      // FR04: the graduate sees and responds to any similarity warning first.
      const found = matches ?? (await runSimilarityCheck());
      if (found.length && !acknowledged) {
        setError('Your project is similar to existing approved projects. Review the matches and confirm to continue.');
        document.getElementById('similarity')?.scrollIntoView({ behavior: 'smooth' });
        return;
      }
      const data = new FormData();
      Object.entries(values).forEach(([k, v]) => data.append(k, typeof v === 'boolean' ? String(v) : v ?? ''));
      data.append('similarityAcknowledged', String(acknowledged));
      if (rdb && values.type === 'company') data.append('rdbCertificate', rdb);
      revenue.forEach((f) => data.append('revenueDocuments', f));
      const { project } = editing ? await api.upload(`/projects/${id}`, data, 'PATCH') : await api.upload('/projects', data);
      navigate(`/app/projects/${project.id}`, { state: { created: !editing } });
    } catch (err) {
      if (err instanceof ApiError && err.details?.code === 'SIMILARITY_WARNING') setMatches(err.details.matches);
      setError(err.message);
      setErrors(err.fields || {});
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setBusy(false);
    }
  };

  if (!user.approved) {
    return (
      <Alert type="warning" title="Your account is still under review">
        You can submit projects once an administrator approves your graduate account.{' '}
        <Link to="/app" className="underline">
          View status
        </Link>
      </Alert>
    );
  }
  if (loading) return <PageLoader />;

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <div>
        <Breadcrumb items={editing ? [['Projects', '/app/projects'], [existing?.projectCode, `/app/projects/${id}`], ['Revise']] : [['Projects', '/app/projects'], ['New Project Submission']]} />
        <h1 className="text-2xl font-semibold tracking-tight">{editing ? 'Revise Graduate Project' : 'Submit a Graduate Project'}</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          {editing
            ? 'Saving sends the project back for administrator review. Your project code stays the same.'
            : 'Register your startup or concept with ALU Ventures to be reviewed, apply for hackathons and grants, and receive investor introductions.'}
        </p>
      </div>
      {error && <Alert type="error">{error}</Alert>}
      {existing?.reviewNote && existing.status === 'revision_required' && (
        <Alert type="info" title="Administrator's revision request">
          {existing.reviewNote}
        </Alert>
      )}

      <FormSection number={1} icon={Fingerprint} title="Project Identity & Entity Classification">
        <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
          <Field label="Project Title" htmlFor="title" required error={errors.title} help="Formal venture name recognised by your team.">
            <input id="title" className="input" value={values.title} onChange={set('title')} maxLength={200} />
          </Field>
          <Field label="Primary Sector" htmlFor="sector" required error={errors.sector} help={sectorOverridden ? 'You chose a different sector from the suggestion — that is fine.' : 'Sets evaluator matching.'}>
            <select id="sector" className="input" value={values.sector} onChange={set('sector')}>
              <option value="">Select sector</option>
              {sectors.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
        </div>
        {suggestion?.sector && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-blue-300 bg-accent-soft p-2.5 text-sm dark:border-blue-500/40">
            <Sparkles className="h-4 w-4 text-accent" aria-hidden="true" />
            Suggested sector: <strong>{suggestion.sector}</strong>
            <span className="text-muted">matched</span>
            {suggestion.matched.map((m) => (
              <Pill key={m} tone="blue">
                {m}
              </Pill>
            ))}
            {sectorOverridden && (
              <button type="button" className="ml-auto text-xs font-medium text-accent hover:underline" onClick={() => set('sector')(suggestion.sector)}>
                Use suggestion
              </button>
            )}
          </div>
        )}
        <fieldset>
          <legend className="label">
            Entity Stage &amp; Legal Registration <span className="text-red-600">*</span>
          </legend>
          <div className="inline-flex flex-wrap gap-1 rounded-md bg-subtle p-1 ring-1 ring-line" role="radiogroup">
            {[
              ['company', Building2, 'Registered Company', 'RDB'],
              ['idea', Lightbulb, 'Early Concept / Idea', 'Unregistered'],
            ].map(([value, Icon, label, tag]) => (
              <label key={value} className={`flex cursor-pointer items-center gap-2 rounded px-3 py-1.5 text-sm ${values.type === value ? 'bg-surface font-medium text-accent shadow-sm ring-1 ring-line' : 'text-muted hover:text-ink'}`}>
                <input type="radio" name="type" value={value} checked={values.type === value} onChange={set('type')} className="sr-only" />
                <Icon className="h-4 w-4" aria-hidden="true" /> {label}
                <span className="rounded bg-subtle px-1 text-[10px] uppercase text-muted ring-1 ring-line">{tag}</span>
              </label>
            ))}
          </div>
          <p className="help">Companies registered with the Rwanda Development Board upload their certificate; ideas submit a declaration instead.</p>
        </fieldset>
      </FormSection>

      <FormSection number={2} icon={ScanSearch} title="Problem Space, Solution & Geography">
        <Field label="Short Summary" htmlFor="summary" required error={errors.summary} help="Shown on your public profile and in investor search results.">
          <div className="relative">
            <textarea id="summary" rows={2} className="input pr-16" value={values.summary} onChange={set('summary')} maxLength={SUMMARY_MAX} />
            <span className="pointer-events-none absolute right-2 top-2 text-[11px] tabular-nums text-muted">
              {values.summary.length} / {SUMMARY_MAX}
            </span>
          </div>
        </Field>
        <Field label="Problem & Solution Framework" htmlFor="description" required error={errors.description} help="The problem, your solution, customers, traction and team. At least 80 characters.">
          <textarea id="description" rows={6} className="input" value={values.description} onChange={set('description')} maxLength={6000} />
        </Field>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Primary Operating Jurisdiction" htmlFor="country" required error={errors.country}>
            <select id="country" className="input" value={values.country} onChange={set('country')}>
              {COUNTRIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Venture Stage" htmlFor="stage" required error={errors.stage}>
            <select id="stage" className="input" value={values.stage} onChange={set('stage')}>
              <option value="">Select stage</option>
              {STAGES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field label="Funding sought (optional)" htmlFor="fundingSought" error={errors.fundingSought} help="e.g. RWF 15,000,000 seed">
            <input id="fundingSought" className="input" value={values.fundingSought || ''} onChange={set('fundingSought')} maxLength={120} />
          </Field>
        </div>
      </FormSection>

      <FormSection number={3} icon={FileText} title="Official Documentation & Verification Assets">
        {values.type === 'company' ? (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Registered company name" htmlFor="companyName" required error={errors.companyName}>
                <input id="companyName" className="input" value={values.companyName || ''} onChange={set('companyName')} />
              </Field>
              <Field label="RDB company code" htmlFor="companyNumber" required error={errors.companyNumber}>
                <input id="companyNumber" className="input font-mono" value={values.companyNumber || ''} onChange={set('companyNumber')} />
              </Field>
              <Field label="Your relationship to the company" htmlFor="relationshipToCompany" required error={errors.relationshipToCompany}>
                <select id="relationshipToCompany" className="input" value={values.relationshipToCompany || ''} onChange={set('relationshipToCompany')}>
                  <option value="">Select relationship</option>
                  {RELATIONSHIPS.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </Field>
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="label mb-0 flex items-center gap-2">
                  RDB Incorporation Certificate
                  <span className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-red-700 ring-1 ring-inset ring-red-600/20 dark:bg-red-500/15 dark:text-red-300">
                    {existingRdb ? 'On file' : 'Mandatory'}
                  </span>
                </p>
              </div>
              <p className="mb-2 text-xs text-muted">Issued by the Rwanda Development Board. We read it to pre-check the registration details and director name; an administrator always makes the final decision.</p>
              {existingRdb && !rdb && (
                <p className="mb-2 flex items-center gap-2 rounded-md border border-line bg-surface px-3 py-2 text-sm">
                  <FileText className="h-4 w-4 text-red-600" aria-hidden="true" />
                  <span className="truncate font-medium">{existingRdb.originalName}</span>
                  <span className="text-xs text-muted">current certificate</span>
                </p>
              )}
              <DropZone id="rdbCertificate" files={rdb} onChange={setRdb} error={errors.rdbCertificate} title={existingRdb ? 'Click to replace file' : 'Click to upload'} hint="PDF, PNG or JPEG · 10 MB max · up to 10 pages" />
            </div>
          </>
        ) : (
          <label className="flex gap-3 rounded-md border border-line bg-subtle p-3 text-sm">
            <input type="checkbox" className="mt-0.5 h-4 w-4" checked={values.ideaDeclaration} onChange={set('ideaDeclaration')} />
            <span>
              <span className="font-medium">Idea-stage declaration</span>
              <span className="block text-muted">
                This venture is at the idea stage and is not yet a registered company. I will update the project with RDB
                evidence once it is registered.
              </span>
              {errors.ideaDeclaration && <span className="mt-1 block text-xs text-red-600">{errors.ideaDeclaration}</span>}
            </span>
          </label>
        )}
        <div>
          <p className="label mb-0 flex items-center gap-2">
            Revenue, Traction &amp; Pilot Metrics
            <span className="rounded bg-subtle px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted ring-1 ring-line">Optional</span>
          </p>
          <p className="mb-2 text-xs text-muted">Bank statement excerpts, pilot results or financial reports. Private to administrators.</p>
          <DropZone id="revenueDocuments" files={revenue} onChange={setRevenue} multiple title="Browse files" hint="PDF, PNG or JPEG · up to 3 files, 10 MB each" />
        </div>
      </FormSection>

      <section id="similarity" className="card p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <ScanSearch className="h-4 w-4 text-accent" aria-hidden="true" /> Similarity check
        </h2>
        <p className="mt-1 text-xs text-muted">We compare your title and description with approved projects before you submit.</p>
        <div className="mt-3">
          {matches === null && (
            <button type="button" className="btn-secondary" onClick={() => runSimilarityCheck().catch((e) => setError(e.message))}>
              Run similarity check
            </button>
          )}
          {matches?.length === 0 && <Alert type="success">No similar approved projects found.</Alert>}
          {matches?.length > 0 && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-500/40 dark:bg-amber-500/10">
              <p className="flex items-center gap-2 font-semibold text-amber-900 dark:text-amber-200">
                <TriangleAlert className="h-4 w-4" aria-hidden="true" /> Similar approved projects found
              </p>
              <p className="mt-1 text-amber-900/80 dark:text-amber-200/80">
                A review signal, not an accusation. If you continue, the project is marked “Similarity Flagged” and you will be
                asked to explain what makes it distinct.
              </p>
              <ul className="mt-3 space-y-1.5">
                {matches.map((m) => (
                  <li key={m.projectCode} className="flex items-center justify-between gap-3 rounded border border-amber-200 bg-surface px-3 py-2 dark:border-amber-500/30">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{m.title}</span>
                      <span className="font-mono text-xs text-muted">
                        {m.projectCode} · {m.sector}
                      </span>
                    </span>
                    <Pill tone="amber">{Math.round(m.score * 100)}% similar</Pill>
                  </li>
                ))}
              </ul>
              <label className="mt-3 flex gap-2">
                <input type="checkbox" className="mt-0.5 h-4 w-4" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} />
                <span>I have reviewed these matches and want to submit for administrator review.</span>
              </label>
            </div>
          )}
        </div>
      </section>

      <section className="card border-blue-200 bg-accent-soft/50 p-5 dark:border-blue-500/30">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Lock className="h-4 w-4 text-accent" aria-hidden="true" /> Privacy &amp; Publication
        </h2>
        <p className="mt-1 text-sm text-muted">
          Your documents and personal details stay private to ALU Ventures administrators. Approved investors see your
          project summary; contact details are shared only when you accept an introduction.
        </p>
        <label className="mt-3 flex gap-2 text-sm">
          <input type="checkbox" className="mt-0.5 h-4 w-4" checked={values.publicationConsent} onChange={set('publicationConsent')} />
          <span>
            Once approved, publish a public summary of this project (title, sector, stage, summary and my name) and make it
            retrievable through Verify a Project.
          </span>
        </label>
      </section>

      <div className="card sticky bottom-3 z-10 flex flex-col-reverse gap-2 p-3 shadow-lg sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted">An administrator reviews every submission. Nothing is approved automatically.</p>
        <div className="flex gap-2">
          <Link to={editing ? `/app/projects/${id}` : '/app/projects'} className="btn-secondary">
            Cancel
          </Link>
          <button type="submit" className="btn-primary" disabled={busy}>
            <Send className="h-4 w-4" aria-hidden="true" />
            {busy ? 'Submitting…' : editing ? 'Save and Resubmit for Verification' : 'Submit Project for Verification'}
          </button>
        </div>
      </div>
    </form>
  );
}
