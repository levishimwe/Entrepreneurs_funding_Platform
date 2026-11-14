import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { formatDate } from '../../components/ui';
import { Messages, StatusPill } from '../../components/admin';
import { Avatar, DecisionPanel, DetailHeader, DetailLayout, DetailSkeleton, FieldGrid, InfoCard, LongText } from '../../components/detail';
import { ExpressInterestDialog } from './Discover';

const INTRO_TEXT = {
  requested: 'Introduction requested. Waiting for the founder to accept or decline.',
  accepted: 'Introduced. Contact details are in Introductions.',
  declined: 'The founder declined this introduction. No contact details were shared.',
};

// Project detail for investors: header, venture and founder cards, and the introduction panel.
export default function InvestorProject() {
  const { code } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [expressing, setExpressing] = useState(false);

  const load = useCallback(
    () =>
      api
        .get(`/investor/projects/${code}`)
        .then((d) => {
          setData(d);
          document.title = `${d.project.title} · ALU Ventures`;
        })
        .catch((e) => setError(e.message)),
    [code]
  );
  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return (
      <div className="adm">
        <DetailHeader back={{ to: '/app/discover', label: 'Browse projects' }} title="Venture" />
        <Messages error={error} />
      </div>
    );
  }
  if (!data) return <DetailSkeleton aside />;
  const { project: p, introduction } = data;
  const f = p.founder || {};
  const cta = introduction ? (
    <Link to="/app/introductions" className="adm-secondary">
      View introduction
    </Link>
  ) : (
    p.acceptingIntroductions && (
      <button type="button" className="adm-primary" onClick={() => setExpressing(true)}>
        Request introduction
      </button>
    )
  );

  return (
    <div className="adm">
      <DetailHeader
        back={{ to: '/app/discover', label: 'Browse projects', current: p.title }}
        title={p.title}
        avatar={<Avatar name={p.title} src={p.imageUrl} size={52} square />}
        status={p.status !== 'approved' ? <StatusPill status={p.status} /> : <StatusPill status="approved" label="Seeking investment" />}
        meta={[p.sector, p.stage, p.country].filter(Boolean).join(' · ')}
        actions={cta || <span className="text-[13px] text-muted">No longer accepting introductions.</span>}
      />
      <Messages notice={notice} />

      <DetailLayout
        aside={
          <DecisionPanel title="Introduction" help={introduction ? INTRO_TEXT[introduction.status] : p.acceptingIntroductions ? 'Open to introductions. The founder accepts or declines before contact details are shared.' : 'No longer accepting introductions.'}>
            <FieldGrid
              columns={1}
              fields={[
                ['Founder contact', introduction?.status === 'accepted' ? 'Shared with you' : 'After the founder accepts an introduction'],
                ['Confirmed investors', `${p.confirmedInvestors} of ${p.investorLimit}`],
              ]}
            />
            {cta && <div className="flex flex-wrap gap-2">{cta}</div>}
          </DecisionPanel>
        }
      >
        {p.imageUrl && <img src={p.imageUrl} alt={p.title} className="aspect-[16/5] w-full rounded-xl border border-line object-cover" />}
        <InfoCard title="Venture">
          <FieldGrid
            fields={[
              ['Summary', p.summary, { wide: true }],
              ['Sector', p.sector],
              ['Stage', p.stage],
              ['Country', p.country],
              ['Seeking', p.fundingSought],
              ['Entity', p.rdbRegistered ? `${p.companyName} · RDB ${p.companyNumber}` : 'Idea stage, not yet registered'],
              ['Approved', formatDate(p.approvedAt)],
            ]}
          />
        </InfoCard>
        <InfoCard title="Founder">
          <div className="flex flex-wrap items-center gap-3">
            <Avatar name={f.name} src={f.photoUrl} size={44} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-semibold text-ink">{f.name || 'Founder'}</p>
              <p className="text-[13px] text-muted">{[f.cohortYear && `Class of ${f.cohortYear}`, f.program].filter(Boolean).join(' · ') || 'Verified ALU graduate'}</p>
            </div>
            {f.profileId && (
              <Link to={`/app/graduates/${f.profileId}`} className="adm-act inline-flex min-h-11 items-center lg:min-h-9">
                View profile
              </Link>
            )}
          </div>
        </InfoCard>
        <InfoCard title="Description">
          <LongText>{p.description}</LongText>
        </InfoCard>
        <p className="adm-hint">
          Approved by an ALU Ventures administrator, who approved the founder’s account after an alumni-email check and reviewed the venture and, for companies, the RDB certificate. Not
          an investment recommendation.
        </p>
      </DetailLayout>

      <ExpressInterestDialog
        project={expressing ? p : null}
        onClose={() => setExpressing(false)}
        onDone={(res) => {
          setNotice(res.duplicate ? 'You already requested an introduction to this project.' : 'Introduction requested. The founder accepts or declines before contact details are shared.');
          load();
        }}
      />
    </div>
  );
}
