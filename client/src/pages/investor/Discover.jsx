import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, qs } from '../../lib/api';
import { Field } from '../../components/ui';
import ReasonDialog from '../../components/ReasonDialog';
import { AdminPage, DataTable, ListLayout, Loading, Messages, Pager, Pill, SearchInput, StatusSelect } from '../../components/admin';

const INTRO_LABEL = { requested: 'Intro requested', accepted: 'Introduced', declined: 'Declined' };
const SORTS = [
  ['recent', 'Most recently approved'],
  ['oldest', 'Oldest approved'],
  ['title', 'Title A–Z'],
];
const founderLine = (f) => (f ? `${f.name} · ALU${f.cohortYear ? ` '${String(f.cohortYear).slice(-2)}` : ''}${f.program ? ` ${f.program}` : ''}` : '');
const facetOptions = (list, label = (o) => o.label || o.value) => [['', 'All'], ...list.map((o) => [o.value, label(o), o.count])];

// Browse approved projects (investors). The API returns only projects that
// are Approved and Seeking Investment.
export default function Discover() {
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState(params.get('q') || '');
  const [expressing, setExpressing] = useState(null);
  const f = useMemo(
    () => ({
      q: params.get('q') || '',
      sector: params.get('sector') || '',
      stage: params.get('stage') || '',
      country: params.get('country') || '',
      type: params.get('type') || '',
      sort: params.get('sort') || 'recent',
      page: Number(params.get('page') || 1),
      pageSize: 25,
    }),
    [params]
  );
  const update = (changes) => {
    const next = { ...f, page: 1, ...changes };
    delete next.pageSize;
    setParams(Object.fromEntries(Object.entries(next).filter(([k, v]) => v && !(k === 'sort' && v === 'recent') && !(k === 'page' && v === 1))));
  };

  const load = useCallback(() => {
    api
      .get(`/investor/projects${qs(f)}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [f]);
  useEffect(() => {
    document.title = 'Browse projects · ALU Ventures';
    load();
  }, [load]);

  if (error) {
    return (
      <AdminPage title="Browse projects">
        <Messages
          error={error.includes('pending') ? 'Your investor account is awaiting approval. An administrator reviews every investor before they can browse ventures; you will be emailed.' : error}
        />
      </AdminPage>
    );
  }

  const facets = data?.facets || { sectors: [], stages: [], countries: [], types: [] };
  const columns = [
    {
      key: 'title',
      label: 'Project',
      render: (p) => (
        <>
          <Link to={`/app/discover/${p.projectCode}`} className="adm-a font-medium">
            {p.title}
          </Link>
          <div className="adm-mono adm-muted">{p.projectCode}</div>
        </>
      ),
    },
    { key: 'founder', label: 'Founder', render: (p) => founderLine(p.founder) },
    { key: 'sector', label: 'Sector', render: (p) => `${p.sector} · ${p.stage}` },
    { key: 'country', label: 'Country', render: (p) => p.country },
    {
      key: 'tier',
      label: 'Tier',
      render: (p) => (
        <>
          <Pill tone={p.rdbRegistered ? 'info' : 'neutral'}>{p.rdbRegistered ? 'RDB registered' : 'Verified idea'}</Pill>
          {p.confirmedInvestors === 1 && <div className="adm-muted mt-1 text-[12px]">1 investor confirmed</div>}
        </>
      ),
    },
    { key: 'seeking', label: 'Seeking', render: (p) => p.fundingSought || '—' },
  ];

  return (
    <AdminPage title="Browse projects" meta={data ? `${data.total} approved` : null}>
      <Messages notice={notice} />
      <ListLayout
        toolbar={
          <>
            <SearchInput value={search} onChange={setSearch} onSubmit={() => update({ q: search.trim() })} placeholder="Keyword, sector or country" />
            <StatusSelect value={f.sort} options={SORTS} onChange={(v) => update({ sort: v })} label="Sort" />
          </>
        }
        filters={[
          { title: 'Sector', value: f.sector, onChange: (v) => update({ sector: v }), options: facetOptions(facets.sectors) },
          { title: 'Stage', value: f.stage, onChange: (v) => update({ stage: v }), options: facetOptions(facets.stages) },
          { title: 'Country', value: f.country, onChange: (v) => update({ country: v }), options: facetOptions(facets.countries) },
          { title: 'Tier', value: f.type, onChange: (v) => update({ type: v }), options: facetOptions(facets.types, (o) => (o.value === 'company' ? 'RDB registered' : 'Verified idea')) },
        ]}
        footer={data && <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={(page) => update({ page })} />}
      >
        {!data ? (
          <Loading />
        ) : (
          <DataTable
            columns={columns}
            rows={data.projects}
            rowKey={(p) => p.projectCode}
            actions={(p) => (
              <>
                <Link to={`/app/discover/${p.projectCode}`} className="adm-act">
                  View
                </Link>
                {p.myIntroduction ? (
                  <Link to="/app/introductions" className="adm-act">
                    {INTRO_LABEL[p.myIntroduction]}
                  </Link>
                ) : (
                  <button type="button" className="adm-act" onClick={() => setExpressing(p)}>
                    Request intro
                  </button>
                )}
              </>
            )}
            empty={f.q || f.sector || f.stage || f.country || f.type ? 'No approved projects match these filters.' : 'No approved projects yet.'}
          />
        )}
      </ListLayout>

      <ExpressInterestDialog
        project={expressing}
        onClose={() => setExpressing(null)}
        onDone={(res, p) => {
          setNotice(res.duplicate ? `You already requested an introduction to ${p.title}.` : `Introduction requested for ${p.title}. The founder accepts or declines before contact details are shared.`);
          load();
        }}
      />
    </AdminPage>
  );
}

// FR07: an introduction request with an optional note to the founder.
export function ExpressInterestDialog({ project, onClose, onDone }) {
  return (
    <ReasonDialog
      open={Boolean(project)}
      title={`Request an introduction to ${project?.title}`}
      description="The founder is emailed and accepts or declines. Contact details are shared only if they accept. An introduction is not an investment commitment."
      reason="optional"
      reasonLabel="Message to the founder"
      reasonHelp="For example your focus, ticket size or the support you offer."
      confirmLabel="Send request"
      onClose={onClose}
      onConfirm={async (message) => {
        const res = await api.post(`/investor/projects/${project.projectCode}/interest`, { message });
        onDone(res, project);
      }}
    >
      <Field label="Project" htmlFor="interest-project">
        <input id="interest-project" className="input bg-subtle" readOnly value={`${project?.title || ''} · ${project?.projectCode || ''}`} />
      </Field>
    </ReasonDialog>
  );
}
