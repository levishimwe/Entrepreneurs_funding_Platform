import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api, qs } from '../lib/api';
import { SECTORS, STAGES } from '../lib/constants';
import { formatDate } from '../components/ui';
import { AdminPage, DataTable, KeyValue, ListLayout, Loading, Messages, Pager, Pill, SearchInput, StatusPill } from '../components/admin';

// Public pages use the same page structure as the app, centred on the canvas.
function PublicPage({ children }) {
  return <div className="mx-auto max-w-6xl px-4 py-8">{children}</div>;
}

function ProjectRecord({ project: p, disclaimer }) {
  return (
    <>
      <KeyValue
        rows={[
          ['Status', <span key="s" className="inline-flex gap-2"><Pill tone="success">Approved record</Pill>{p.status !== 'approved' && <StatusPill status={p.status} />}</span>],
          ['Code', <span key="c" className="adm-mono">{p.projectCode}</span>],
          ['Summary', p.summary],
          ['Sector', p.sector],
          ['Stage', p.stage],
          ...(p.country ? [['Country', p.country]] : []),
          ['Type', p.type === 'company' ? 'Registered company' : 'Idea stage'],
          ...(p.companyName ? [['Company', p.companyName]] : []),
          ...(p.fundingSought ? [['Funding sought', p.fundingSought]] : []),
          ...(p.founder ? [['Founder', `${p.founder.name} · Verified ALU graduate${p.founder.cohortYear ? `, Class of ${p.founder.cohortYear}` : ''}`]] : []),
          ['Approved', formatDate(p.approvedAt)],
        ]}
      />
      {p.description && (
        <>
          <h2>About the venture</h2>
          <p className="adm-card whitespace-pre-line p-4">{p.description}</p>
        </>
      )}
      {disclaimer && <p className="adm-hint mt-3">{disclaimer}</p>}
    </>
  );
}

// FR14: exact project-code lookup.
export function VerifyProject() {
  const [params, setParams] = useSearchParams();
  const [code, setCode] = useState(params.get('code') || '');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [recent, setRecent] = useState([]);
  const [copied, setCopied] = useState(false);

  const lookup = async (value) => {
    const c = value.trim();
    if (!c) return;
    setBusy(true);
    setError('');
    setResult(null);
    try {
      setResult(await api.get(`/public/verify/${encodeURIComponent(c)}`));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    document.title = 'Verify a project · ALU Ventures';
    if (params.get('code')) lookup(params.get('code'));
    api
      .get('/public/projects')
      .then((d) => setRecent(d.projects.slice(0, 3)))
      .catch(() => setRecent([]));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const run = (value) => {
    setCode(value);
    setParams(value ? { code: value.trim() } : {});
    lookup(value);
  };
  const p = result?.project;
  const copyLink = async () => {
    await navigator.clipboard?.writeText(`${window.location.origin}/verify?code=${p.projectCode}`).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <PublicPage>
      <AdminPage title="Verify a project">
        <form
          className="adm-card mb-4 flex max-w-2xl flex-col gap-2 p-4 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            run(code);
          }}
        >
          <label className="flex-1">
            <span className="sr-only">Project code</span>
            <input className="input font-mono uppercase" placeholder="ALU-2026-XXXXX" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" />
          </label>
          <button type="submit" className="adm-primary" disabled={busy}>
            {busy ? 'Checking…' : 'Verify'}
          </button>
        </form>
        {recent.length > 0 && (
          <p className="adm-hint">
            Recently approved:{' '}
            {recent.map((r, i) => (
              <span key={r.projectCode}>
                {i > 0 && ' · '}
                <button type="button" className="adm-act adm-mono" onClick={() => run(r.projectCode)}>
                  {r.projectCode}
                </button>
              </span>
            ))}
          </p>
        )}
        <Messages error={error} />
        {busy && <Loading />}
        {p && (
          <>
            <div className="mb-2 mt-6 flex flex-wrap items-center justify-between gap-2">
              <h2 className="!m-0">{p.title}</h2>
              <span className="flex gap-4">
                <button type="button" className="adm-act" onClick={copyLink}>
                  {copied ? 'Link copied' : 'Copy link'}
                </button>
                <Link to={`/ventures/${p.projectCode}`} className="adm-act">
                  Full profile
                </Link>
              </span>
            </div>
            <ProjectRecord project={{ ...p, description: null }} disclaimer={result.disclaimer} />
          </>
        )}
        <p className="adm-hint mt-6">Only administrator-approved records whose founders consented to publication are returned. Documents are never public.</p>
      </AdminPage>
    </PublicPage>
  );
}

const TYPES = [
  ['', 'All'],
  ['company', 'Registered companies'],
  ['idea', 'Ideas'],
];

// FR06: public catalogue of approved, consented projects.
export function Ventures() {
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const filters = { sector: params.get('sector') || '', type: params.get('type') || '', stage: params.get('stage') || '', q: params.get('q') || '' };
  const [search, setSearch] = useState(filters.q);

  useEffect(() => {
    document.title = 'Browse ventures · ALU Ventures';
    setData(null);
    api
      .get(`/public/projects${qs({ ...filters, page: params.get('page') || 1 })}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [params]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (k, v) => {
    const next = { ...filters, page: '', [k]: v };
    setParams(Object.fromEntries(Object.entries(next).filter(([, val]) => val)));
  };

  return (
    <PublicPage>
      <AdminPage title="Browse ventures" meta={data ? `${data.total} approved` : null}>
        <Messages error={error} />
        <ListLayout
          toolbar={<SearchInput value={search} onChange={setSearch} onSubmit={() => update('q', search.trim())} placeholder="Search ventures" />}
          filters={[
            { title: 'Sector', value: filters.sector, onChange: (v) => update('sector', v), options: [['', 'All'], ...SECTORS.map((s) => [s, s])] },
            { title: 'Stage', value: filters.stage, onChange: (v) => update('stage', v), options: [['', 'All'], ...STAGES.map((s) => [s, s])] },
            { title: 'Type', value: filters.type, onChange: (v) => update('type', v), options: TYPES },
          ]}
          footer={data && <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={(page) => update('page', String(page))} />}
        >
          {!data ? (
            !error && <Loading />
          ) : (
            <DataTable
              columns={[
                {
                  key: 'title',
                  label: 'Venture',
                  render: (p) => (
                    <>
                      <Link to={`/ventures/${p.projectCode}`} className="adm-a font-medium">
                        {p.title}
                      </Link>
                      <div className="adm-mono adm-muted">{p.projectCode}</div>
                    </>
                  ),
                },
                { key: 'summary', label: 'Summary', render: (p) => <span className="line-clamp-2">{p.summary}</span> },
                { key: 'sector', label: 'Sector', render: (p) => p.sector },
                { key: 'stage', label: 'Stage', render: (p) => p.stage },
                { key: 'type', label: 'Type', render: (p) => (p.type === 'company' ? 'Company' : 'Idea') },
              ]}
              rows={data.projects}
              rowKey={(p) => p.projectCode}
              empty="No ventures match these filters."
            />
          )}
        </ListLayout>
      </AdminPage>
    </PublicPage>
  );
}

const TYPE_LABEL = { grant: 'Grant', hackathon: 'Hackathon', competition: 'Competition', other: 'Other' };

// Public list of open opportunities; applying requires an approved account.
export function PublicOpportunities() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    document.title = 'Opportunities · ALU Ventures';
    api
      .get('/public/opportunities')
      .then((d) => setRows(d.opportunities))
      .catch((e) => setError(e.message));
  }, []);
  return (
    <PublicPage>
      <AdminPage title="Opportunities" meta={rows ? `${rows.length} open` : null}>
        <Messages error={error} />
        {!rows ? (
          !error && <Loading />
        ) : (
          <DataTable
            columns={[
              {
                key: 'title',
                label: 'Opportunity',
                render: (o) => (
                  <>
                    <span className="font-medium">{o.title}</span>
                    <div className="adm-muted text-[12px]">{o.organiser || 'ALU Ventures'}</div>
                  </>
                ),
              },
              { key: 'type', label: 'Type', render: (o) => <Pill>{TYPE_LABEL[o.type] || o.type}</Pill> },
              { key: 'prize', label: 'Prize', render: (o) => o.prize || '—' },
              { key: 'description', label: 'Description', render: (o) => <span className="line-clamp-2">{o.description}</span> },
              { key: 'deadline', label: 'Closes', render: (o) => formatDate(o.deadline, true) },
            ]}
            rows={rows}
            empty="No open opportunities right now."
          />
        )}
        <p className="adm-hint mt-3">
          ALU graduate?{' '}
          <Link to="/register" className="adm-a">
            Create an account
          </Link>{' '}
          to apply with an approved project.
        </p>
      </AdminPage>
    </PublicPage>
  );
}

export function PublicProject() {
  const { code } = useParams();
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api
      .get(`/public/verify/${encodeURIComponent(code)}`)
      .then((r) => {
        setResult(r);
        document.title = `${r.project.title} · ALU Ventures`;
      })
      .catch((e) => setError(e.message));
  }, [code]);
  return (
    <PublicPage>
      <AdminPage title={result?.project.title || 'Venture'}>
        <p className="adm-hint">
          <Link to="/ventures" className="adm-a">
            Browse ventures
          </Link>
          {' / '}
          <span className="adm-mono">{code}</span>
        </p>
        <Messages error={error} />
        {!result && !error && <Loading />}
        {result && <ProjectRecord project={result.project} disclaimer={result.disclaimer} />}
        {result && (
          <p className="adm-hint mt-3">
            Investor or sponsor?{' '}
            <Link to="/register?role=investor" className="adm-a">
              Request investor access
            </Link>{' '}
            to ask the founder for an introduction.
          </p>
        )}
      </AdminPage>
    </PublicPage>
  );
}
