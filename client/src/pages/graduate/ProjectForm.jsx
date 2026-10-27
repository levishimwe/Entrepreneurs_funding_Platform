import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../../lib/api';
import { COUNTRIES, RELATIONSHIPS, SECTORS, STAGES } from '../../lib/constants';
import { Field } from '../../components/ui';
import { AdminPage, Loading, Messages, TableWrap } from '../../components/admin';
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

function FormSection({ title, children }) {
  return (
    <section className="adm-card">
      <h2 className="!m-0 border-b border-[var(--adm-border)] px-4 py-3">{title}</h2>
      <div className="space-y-4 p-4">{children}</div>
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
      <AdminPage title="New project">
        <p className="adm-message">
          You can submit projects once an administrator approves your graduate account.{' '}
          <Link to="/app" className="adm-a">
            View status
          </Link>
        </p>
      </AdminPage>
    );
  }
  if (loading) return <AdminPage title="Revise project"><Loading /></AdminPage>;

  return (
    <AdminPage title={editing ? 'Revise project' : 'New project'}>
      <Breadcrumb items={editing ? [['My projects', '/app/projects'], [existing?.projectCode, `/app/projects/${id}`], ['Revise']] : [['My projects', '/app/projects'], ['New']]} />
      <form onSubmit={submit} noValidate className="max-w-4xl space-y-4">
        <Messages error={error} />
        {editing && <p className="adm-hint">Saving sends the project back for administrator review. The project code stays the same.</p>}
        {existing?.reviewNote && existing.status === 'revision_required' && <p className="adm-message">Administrator’s revision request: {existing.reviewNote}</p>}

        <FormSection title="Project">
          <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
            <Field label="Title" htmlFor="title" required error={errors.title}>
              <input id="title" className="input" value={values.title} onChange={set('title')} maxLength={200} />
            </Field>
            <Field label="Sector" htmlFor="sector" required error={errors.sector} help={sectorOverridden ? 'Different from the suggestion — that is fine.' : undefined}>
              <select id="sector" className="input" value={values.sector} onChange={set('sector')}>
                <option value="">Select sector</option>
                {sectors.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
          </div>
          {suggestion?.sector && (
            <p className="adm-hint">
              Suggested sector: <strong>{suggestion.sector}</strong> (matched {suggestion.matched.join(', ')})
              {sectorOverridden && (
                <>
                  {' · '}
                  <button type="button" className="adm-act" onClick={() => set('sector')(suggestion.sector)}>
                    Use suggestion
                  </button>
                </>
              )}
            </p>
          )}
          <fieldset>
            <legend className="label">
              Registration <span className="text-red-600">*</span>
            </legend>
            {[
              ['company', 'Registered company (RDB)'],
              ['idea', 'Idea stage (not registered)'],
            ].map(([value, label]) => (
              <label key={value} className="mr-6 inline-flex items-center gap-2 py-1">
                <input type="radio" name="type" value={value} checked={values.type === value} onChange={set('type')} /> {label}
              </label>
            ))}
          </fieldset>
        </FormSection>

        <FormSection title="Description">
          <Field label="Short summary" htmlFor="summary" required error={errors.summary} help={`${values.summary.length} / ${SUMMARY_MAX}. Shown on the public profile and in investor search.`}>
            <textarea id="summary" rows={2} className="input" value={values.summary} onChange={set('summary')} maxLength={SUMMARY_MAX} />
          </Field>
          <Field label="Problem and solution" htmlFor="description" required error={errors.description} help="Problem, solution, customers, traction and team. At least 80 characters.">
            <textarea id="description" rows={6} className="input" value={values.description} onChange={set('description')} maxLength={6000} />
          </Field>
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Operating country" htmlFor="country" required error={errors.country}>
              <select id="country" className="input" value={values.country} onChange={set('country')}>
                {COUNTRIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
            <Field label="Stage" htmlFor="stage" required error={errors.stage}>
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

        <FormSection title="Documents">
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
                <p className="label">
                  RDB certificate <span className="text-red-600">*</span>
                </p>
                {existingRdb && !rdb && <p className="adm-hint">On file: {existingRdb.originalName}</p>}
                <DropZone id="rdbCertificate" files={rdb} onChange={setRdb} error={errors.rdbCertificate} title={existingRdb ? 'Replace file' : 'Choose a file'} hint="PDF, PNG or JPEG · 10 MB max · up to 10 pages" />
              </div>
            </>
          ) : (
            <label className="flex items-start gap-2">
              <input type="checkbox" className="mt-1" checked={values.ideaDeclaration} onChange={set('ideaDeclaration')} />
              <span>
                I declare this venture is at the idea stage and not yet a registered company. I will add RDB evidence once it is registered.
                {errors.ideaDeclaration && <span className="adm-bad block text-[12px]">{errors.ideaDeclaration}</span>}
              </span>
            </label>
          )}
          <div>
            <p className="label">Revenue or traction documents (optional, private)</p>
            <DropZone id="revenueDocuments" files={revenue} onChange={setRevenue} multiple title="Choose files" hint="PDF, PNG or JPEG · up to 3 files, 10 MB each" />
          </div>
        </FormSection>

        <section id="similarity">
          <FormSection title="Similarity check">
            {matches === null && (
              <button type="button" className="adm-secondary w-fit" onClick={() => runSimilarityCheck().catch((e) => setError(e.message))}>
                Run similarity check
              </button>
            )}
            {matches?.length === 0 && <p className="adm-muted">No similar approved projects found.</p>}
            {matches?.length > 0 && (
              <>
                <p>Similar approved projects found. If you continue, you will be asked to explain what makes yours distinct.</p>
                <TableWrap>
                  <table className="adm-table">
                    <thead>
                      <tr>
                        <th>Project</th>
                        <th>Sector</th>
                        <th className="adm-num">Similarity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {matches.map((m, i) => (
                        <tr key={i}>
                          <td>{m.title}</td>
                          <td>{m.sector}</td>
                          <td className="adm-num">{Math.round(m.score * 100)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableWrap>
                <label className="flex items-start gap-2">
                  <input type="checkbox" className="mt-1" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} />
                  <span>I have reviewed these matches and want to submit for administrator review.</span>
                </label>
              </>
            )}
          </FormSection>
        </section>

        <FormSection title="Publication">
          <label className="flex items-start gap-2">
            <input type="checkbox" className="mt-1" checked={values.publicationConsent} onChange={set('publicationConsent')} />
            <span>Once approved, publish a public summary (title, sector, stage, summary and my name), retrievable through Verify a project.</span>
          </label>
        </FormSection>

        <div className="flex justify-end gap-2">
          <Link to={editing ? `/app/projects/${id}` : '/app/projects'} className="adm-secondary">
            Cancel
          </Link>
          <button type="submit" className="adm-primary" disabled={busy}>
            {busy ? 'Submitting…' : editing ? 'Save and resubmit' : 'Submit for review'}
          </button>
        </div>
      </form>
    </AdminPage>
  );
}
