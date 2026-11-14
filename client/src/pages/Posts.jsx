import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Loading } from '../components/admin';
import { EmptyNote } from '../components/detail';
import { PostCard } from '../components/member/Posts';
import PostComposer from '../components/member/PostComposer';
import { MemberAvatar } from '../layouts/MemberShell';

// Posts for graduates, investors and staff.
// - Graduates write, edit (15 minutes) and delete their own posts. Other
//   graduates' posts are not shown to them: a graduate consents to be seen by
//   investors, sponsors and ALU staff only.
// - Approved investors and sponsors and staff read the feed (newest first, ten
//   at a time) and can report a post to the administrator.
// - Administrators moderate from Posts in the admin console.

function Feed({ canReport }) {
  const [posts, setPosts] = useState(null);
  const [page, setPage] = useState(1);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (n) => {
    setBusy(true);
    setError('');
    try {
      const d = await api.get(`/posts?page=${n}`);
      setPosts((old) => (n === 1 ? d.posts : [...(old || []), ...d.posts]));
      setMore(d.hasMore);
      setPage(n);
    } catch (e) {
      setError(e.message);
      setPosts((old) => old || []);
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    load(1);
  }, [load]);

  if (!posts) return <Loading />;
  return (
    <section className="rounded-xl border border-line bg-surface" aria-label="Posts feed">
      {error && <p className="px-5 pt-4 text-[13px] text-[#b91c1c] dark:text-[#f87171]">{error}</p>}
      {posts.length === 0 ? (
        <div className="p-5">
          <EmptyNote>No posts yet. Updates from verified ALU graduates appear here.</EmptyNote>
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
    body = <Feed canReport={user.role === 'investor' || user.role === 'staff'} />;
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
