import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Loading } from '../components/admin';
import ReasonDialog from '../components/ReasonDialog';
import { GraduateImage, PostCard } from '../components/member/Posts';

// A graduate's profile as investors, sponsors, administrators and staff see it
// (and the graduate, as a preview). Never an email, phone, document or code;
// introductions go through the existing consent-based request.

const card = 'rounded-xl border border-line bg-surface';

export default function GraduateProfile() {
  const { id } = useParams();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [requesting, setRequesting] = useState(null);
  const [requested, setRequested] = useState({});
  const investor = user.role === 'investor' && user.approved;

  useEffect(() => {
    setData(null);
    setError('');
    api
      .get(`/graduates/${encodeURIComponent(id)}`)
      .then((d) => {
        setData(d);
        document.title = `${d.graduate.name} · ALU Ventures`;
      })
      .catch((e) => setError(e.message));
  }, [id]);

  if (error) return <p className={`${card} mx-auto max-w-[760px] px-5 py-4 text-[14px]`}>{error}</p>;
  if (!data) return <Loading />;
  const g = data.graduate;
  // Investors open a venture in their workspace (with the introduction flow); others see the public page.
  const ventureLink = (p) => (investor && p.seekingInvestment ? `/app/discover/${p.id}` : `/ventures/${p.id}`);

  return (
    <div className="mx-auto max-w-[760px] space-y-6">
      {g.self && (
        <p className={`${card} px-5 py-3 text-[13px] text-muted`}>
          {g.shown
            ? 'This is how investors, sponsors and ALU staff see your profile.'
            : 'Only you can see this page. Turn on "Investors and sponsors may see this photo" in Settings → Profile to show it.'}{' '}
          <Link to="/app/settings" className="font-semibold text-accent hover:underline">
            Edit profile
          </Link>
        </p>
      )}

      <section className={`${card} flex flex-col gap-5 p-6 sm:flex-row sm:items-center`}>
        <GraduateImage graduate={{ name: g.name, imageUrl: g.imageUrl }} size={112} rounded="rounded-2xl" />
        <div className="min-w-0">
          <h1 className="!m-0 text-[24px] font-semibold text-ink">{g.name}</h1>
          <p className="mt-1 text-[14px] text-muted">
            {[g.university, g.program, g.cohortYear ? `Class of ${g.cohortYear}` : null].filter(Boolean).join(' · ')}
          </p>
          <p className="mt-2 text-[13px] font-medium text-ink">Verified ALU graduate</p>
        </div>
      </section>

      {g.bio && (
        <section className={`${card} p-6`}>
          <h2 className="!m-0 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">About</h2>
          <p className="mt-2 whitespace-pre-line text-[15px] leading-[1.6] text-ink">{g.bio}</p>
        </section>
      )}

      <section className={card} aria-label="Ventures">
        <h2 className="!m-0 px-6 pt-5 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">Ventures</h2>
        {data.projects.length === 0 ? (
          <p className="px-6 pb-5 pt-2 text-[14px] text-muted">No approved and listed ventures yet.</p>
        ) : (
          <ul className="mt-2">
            {data.projects.map((p) => (
              <li key={p.id} className="flex flex-col gap-3 border-t border-line px-6 py-4 first:border-0 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <Link to={ventureLink(p)} className="text-[15px] font-semibold text-ink hover:underline">
                    {p.title}
                  </Link>
                  <p className="text-[13px] text-muted">
                    {[p.sector, p.stage, p.type === 'company' ? 'Registered company' : 'Idea', p.country].filter(Boolean).join(' · ')}
                  </p>
                  {p.summary && <p className="mt-1 line-clamp-2 text-[14px] text-ink/80">{p.summary}</p>}
                </div>
                {investor &&
                  p.seekingInvestment &&
                  (requested[p.id] ? (
                    <span className="shrink-0 text-[13px] font-semibold text-accent">{requested[p.id]}</span>
                  ) : (
                    <button
                      type="button"
                      className="h-9 shrink-0 rounded-lg border border-accent px-4 text-[13px] font-semibold text-accent transition-colors hover:bg-accent-soft"
                      onClick={() => setRequesting(p)}
                    >
                      Request introduction
                    </button>
                  ))}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={card} aria-label="Posts">
        <h2 className="!m-0 px-6 pt-5 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">Recent posts</h2>
        {data.posts.length === 0 ? (
          <p className="px-6 pb-5 pt-2 text-[14px] text-muted">No posts yet.</p>
        ) : (
          <div className="mt-1">
            {data.posts.map((p) => (
              <PostCard key={p.id} post={p} canReport={investor} />
            ))}
          </div>
        )}
      </section>

      <ReasonDialog
        open={Boolean(requesting)}
        title={`Request an introduction to ${requesting?.title || ''}?`}
        description="The founder is emailed and accepts or declines. Contact details are shared only if they accept. An introduction is not an investment commitment."
        reasonLabel="Message to the founder"
        reasonHelp="For example your focus, ticket size or the support you offer."
        confirmLabel="Send request"
        onClose={() => setRequesting(null)}
        onConfirm={async (message) => {
          const res = await api.post(`/investor/projects/${requesting.id}/interest`, { message });
          setRequested((r) => ({ ...r, [requesting.id]: res.duplicate ? 'Already requested' : 'Introduction requested' }));
        }}
      />
    </div>
  );
}
