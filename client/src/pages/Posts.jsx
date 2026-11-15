import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Loading } from '../components/admin';
import { EmptyNote } from '../components/detail';
import { PostCard } from '../components/member/Posts';
import PostComposer from '../components/member/PostComposer';
import { MemberAvatar } from '../layouts/MemberShell';
import { SECTORS } from '../lib/constants';
import FundingCalls from './investor/FundingCalls';

// Posts for graduates, investors and staff.
// - Graduates write, edit (15 minutes) and delete their own posts. Other
//   graduates' posts are not shown to them: a graduate consents to be seen by
//   investors, sponsors and ALU staff only.
// - Approved investors and sponsors and staff read the feed (newest first, ten
//   at a time) and can report a post to the administrator.
// - Administrators moderate from Posts in the admin console.

function Feed({ canReport }) {
  const [sector, setSector] = useState('');
  const [sectors, setSectors] = useState(SECTORS);
  const [posts, setPosts] = useState(null);
  const [page, setPage] = useState(1);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (n) => {
    setBusy(true);
    setError('');
    try {
      const d = await api.get(`/posts?page=${n}${sector ? `&sector=${encodeURIComponent(sector)}` : ''}`);
      setPosts((old) => (n === 1 ? d.posts : [...(old || []), ...d.posts]));
      setMore(d.hasMore);
      setPage(n);
    } catch (e) {
      setError(e.message);
      setPosts((old) => old || []);
    } finally {
      setBusy(false);
    }
  }, [sector]);
  useEffect(() => {
    setPosts(null);
    load(1);
  }, [load]);
  useEffect(() => {
    api
      .get('/public/sectors')
      .then((d) => d.sectors?.length && setSectors(d.sectors))
      .catch(() => {});
  }, []);

  return (
    <section className="rounded-xl border border-line bg-surface" aria-label="Posts feed">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
        <label htmlFor="feed-sector" className="text-[13px] text-muted">
          {sector ? 'Graduates seeking an investor in' : 'Filter by sector'}
        </label>
        <select id="feed-sector" className="input h-11 w-full sm:w-auto lg:h-8" value={sector} onChange={(e) => setSector(e.target.value)}>
          <option value="">All posts</option>
          {sectors.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      {!posts && <Loading />}
      {error && <p className="px-5 pt-4 text-[13px] text-[#b91c1c] dark:text-[#f87171]">{error}</p>}
      {!posts ? null : posts.length === 0 ? (
        <div className="p-5">
          <EmptyNote>{sector ? `No graduates are seeking an investor in ${sector} right now.` : 'No posts yet. Updates from verified ALU graduates appear here.'}</EmptyNote>
        </div>
      ) : (
        <div>
          {posts.map((p) => (
            <PostCard key={p.id} post={p} showAuthor canReport={canReport} />
          ))}
        </div>
      )}
      {more && (
        <div className="border-t border-line p-4 text-center">
          <button type="button" className="adm-secondary min-h-11" disabled={busy} onClick={() => load(page + 1)}>
            {busy ? 'Loading…' : 'Load more posts'}
          </button>
        </div>
      )}
    </section>
  );
}

// Investors: graduate posts, and their own funding calls (?tab=calls).
function InvestorTabs() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'calls' ? 'calls' : 'posts';
  const tabs = [
    ['posts', 'Graduate posts'],
    ['calls', 'My funding calls'],
  ];
  return (
    <>
      <div className="flex gap-1 border-b border-line" role="tablist" aria-label="Posts">
        {tabs.map(([k, l]) => (
          <button
            key={k}
            type="button"
            role="tab"
            id={`tab-${k}`}
            aria-selected={tab === k}
            aria-controls={`panel-${k}`}
            onClick={() => setParams(k === 'posts' ? {} : { tab: k })}
            className={`-mb-px min-h-11 border-b-2 px-3 text-[14px] ${tab === k ? 'border-accent font-semibold text-ink' : 'border-transparent text-muted hover:text-ink'}`}
          >
            {l}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'calls' ? <FundingCalls /> : <Feed canReport />}
      </div>
    </>
  );
}

export default function Posts() {
  const { user } = useAuth();
  useEffect(() => {
    document.title = 'Posts · ALU Ventures';
  }, []);

  let body;
  if (user.role === 'graduate') {
    body = <PostComposer avatar={<MemberAvatar user={user} size={44} />} />;
  } else if (user.role === 'investor' && !user.approved) {
    body = (
      <p className="rounded-xl border border-line bg-surface px-5 py-4 text-[14px] text-ink">
        Posts from graduates are shown once an administrator approves your investor account.
      </p>
    );
  } else {
    body = user.role === 'investor' ? <InvestorTabs /> : <Feed canReport={user.role === 'staff'} />;
  }

  return (
    <div className="mx-auto max-w-[760px] space-y-5">
      <div>
        <h1 className="!m-0 text-[22px] font-semibold text-ink">Posts</h1>
        <p className="mt-1 text-[14px] text-muted">
          {user.role === 'graduate'
            ? 'Short updates about your venture. Investors, sponsors and ALU staff can read them.'
            : 'Short updates from verified ALU graduates, newest first.'}
          {user.role === 'admin' && (
            <>
              {' '}
              <Link to="/app/admin/posts" className="font-semibold text-accent hover:underline">
                Moderate posts
              </Link>
            </>
          )}
        </p>
      </div>
      {body}
    </div>
  );
}
