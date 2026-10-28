import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { formatDate } from '../../components/ui';
import { Breadcrumb } from '../../components/kit';
import { AdminPage, KeyValue, Loading, Messages, StatusPill } from '../../components/admin';
import { ExpressInterestDialog } from './Discover';

const INTRO_TEXT = {
  requested: 'Introduction requested. Waiting for the founder to accept or decline.',
  accepted: 'Introduced. Contact details are in Introductions.',
  declined: 'The founder declined this introduction. No contact details were shared.',
};

// Project detail for investors: one key-value table and the description.
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
      <AdminPage title="Project">
        <Breadcrumb items={[['Browse projects', '/app/discover'], ['Venture']]} />
        <Messages error={error} />
      </AdminPage>
    );
  }
  if (!data) return <AdminPage title="Project"><Loading /></AdminPage>;
  const { project: p, introduction } = data;
  const f = p.founder || {};

  return (
    <AdminPage title={p.title} meta={p.status !== 'approved' ? <StatusPill status={p.status} /> : null}>
      <Breadcrumb items={[['Browse projects', '/app/discover'], [p.title]]} />
      <Messages notice={notice} />
      <div className="adm-card mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <span className="adm-muted">{introduction ? INTRO_TEXT[introduction.status] : p.acceptingIntroductions ? 'Open to introductions.' : 'No longer accepting introductions.'}</span>
        <span className="ml-auto">
          {introduction ? (
            <Link to="/app/introductions" className="adm-secondary">
              View introduction
            </Link>
          ) : (
            p.acceptingIntroductions && (
              <button type="button" className="adm-primary" onClick={() => setExpressing(true)}>
                Request introduction
              </button>
            )
          )}
        </span>
      </div>

      <KeyValue
        rows={[
          ['Summary', p.summary],
          ['Sector', p.sector],
          ['Stage', p.stage],
          ['Country', p.country],
          ['Seeking', p.fundingSought],
          ['Entity', p.rdbRegistered ? `${p.companyName} · RDB ${p.companyNumber}` : 'Idea stage, not yet registered'],
          [
            'Founder',
            <span key="f">
              {`${f.name || '—'}${f.cohortYear ? ` · Class of ${f.cohortYear}` : ''}${f.program ? ` · ${f.program}` : ''}`}
              {f.profileId && (
                <>
                  {' · '}
                  <Link to={`/app/graduates/${f.profileId}`} className="adm-a">
                    View profile
                  </Link>
                </>
              )}
            </span>,
          ],
          ['Founder contact', introduction?.status === 'accepted' ? 'Shared with you' : 'After the founder accepts an introduction'],
          ['Confirmed investors', `${p.confirmedInvestors} of ${p.investorLimit}`],
          ['Approved', formatDate(p.approvedAt)],
        ]}
      />

      <h2>Description</h2>
      <p className="adm-card whitespace-pre-line p-4">{p.description}</p>
      <p className="adm-hint mt-3">Approved by an ALU Ventures administrator after reviewing the founder’s degree and, for companies, the RDB certificate. Not an investment recommendation.</p>

      <ExpressInterestDialog
        project={expressing ? p : null}
        onClose={() => setExpressing(false)}
        onDone={(res) => {
          setNotice(res.duplicate ? 'You already requested an introduction to this project.' : 'Introduction requested. The founder accepts or declines before contact details are shared.');
          load();
        }}
      />
    </AdminPage>
  );
}
