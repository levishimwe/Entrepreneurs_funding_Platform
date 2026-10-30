import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { relativeTime } from '../../components/kit';
import { Loading } from '../../components/admin';
import { initials } from '../../components/Avatar';
import { MemberCard, MemberColumns } from '../../layouts/MemberShell';
import { PostCard } from '../../components/member/Posts';
import { InvestorSummary } from '../../components/member/ActivitySummary';

// Investor / sponsor Activity: a profile banner while the account is
// incomplete, how things are going (period, KPI cards and charts with the
// recently listed ventures), a carousel of graduate founders, the feed and
// the most viewed ventures beside it. Real data only; no codes, emails, phones or
// documents appear here.

const FEED = [
  ['all', 'All ventures'],
  ['newest', 'Newest (last 30 days)'],
  ['sector', 'By sector'],
];
const INTRO_LABEL = { requested: 'Introduction requested', accepted: 'Introduced', declined: 'Declined' };
const DAY = 864e5;

// Founder photo (only when the founder consented to be shown) or initials.
function FounderThumb({ founder, size = 40, rounded = 'rounded-full' }) {
  const [failed, setFailed] = useState(false);
  const style = { width: size, height: size };
  if (founder?.photoUrl && !failed) {
    return (
      <img
        src={founder.photoUrl}
        alt=""
        loading="lazy"
        style={style}
        onError={() => setFailed(true)}
        className={`shrink-0 object-cover ring-1 ring-line ${rounded}`}
      />
    );
  }
  return (
    <span
      style={{ ...style, fontSize: Math.round(size * 0.34) }}
      className={`flex shrink-0 items-center justify-center bg-subtle font-semibold text-muted ring-1 ring-line ${rounded}`}
      aria-hidden="true"
    >
      {initials(founder?.name)}
    </span>
  );
}

function Spotlight({ tiles }) {
  const track = useRef(null);
  const [edges, setEdges] = useState({ start: true, end: false });
  const update = () => {
    const el = track.current;
    if (el) setEdges({ start: el.scrollLeft <= 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 });
  };
  useEffect(update, [tiles]);
  const move = (dir) =>
    track.current?.scrollBy({
      left: dir * track.current.clientWidth * 0.8,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  const arrow =
    'absolute top-1/2 z-10 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-surface text-muted shadow-sm transition-opacity hover:text-ink disabled:opacity-0 sm:flex';
  return (
    <section aria-label="Graduate founders" className="relative">
      <button type="button" className={`${arrow} -left-4`} onClick={() => move(-1)} disabled={edges.start} aria-label="Previous founders">
        <ChevronLeft className="h-5 w-5" strokeWidth={1.5} />
      </button>
      <ul
        ref={track}
        onScroll={update}
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {tiles.map((t, i) => (
          <li key={t.projectId} className="land-rise shrink-0 snap-start" style={{ '--d': `${Math.min(i, 6) * 50}ms` }}>
            <Link
              to={`/app/graduates/${t.graduateId}`}
              className="group block w-[140px] overflow-hidden rounded-xl border border-line bg-surface transition-[transform,border-color] duration-300 hover:-translate-y-1 hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              aria-label={`${t.name}, founder of ${t.title}`}
            >
              {t.photoUrl ? (
                <img
                  src={t.photoUrl}
                  alt=""
                  loading="lazy"
                  className="h-[180px] w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                />
              ) : (
                <span className="flex h-[180px] w-full items-center justify-center bg-subtle text-[34px] font-semibold text-muted" aria-hidden="true">
                  {initials(t.name)}
                </span>
              )}
              <span className="block truncate px-3 py-2.5 text-center text-[13px] font-semibold text-ink">{t.firstName}</span>
            </Link>
          </li>
        ))}
      </ul>
      <button type="button" className={`${arrow} -right-4`} onClick={() => move(1)} disabled={edges.end} aria-label="More founders">
        <ChevronRight className="h-5 w-5" strokeWidth={1.5} />
      </button>
    </section>
  );
}

// The venture's background image as a thumbnail; the founder photo or
// initials when it has none.
function VentureThumb({ p, size, rounded = 'rounded-lg' }) {
  const [failed, setFailed] = useState(false);
  if (!p.imageUrl || failed) return <FounderThumb founder={p.founder} size={size} rounded={rounded} />;
  return (
    <img
      src={p.imageUrl}
      alt={p.title}
      loading="lazy"
      onError={() => setFailed(true)}
      style={{ width: Math.round(size * 1.5), height: size }}
      className={`shrink-0 object-cover ring-1 ring-line ${rounded}`}
    />
  );
}

function VentureItem({ p, index }) {
  return (
    <li className="land-rise border-t border-line first:border-0" style={{ '--d': `${Math.min(index, 8) * 40}ms` }}>
      <Link to={`/app/discover/${p.id}`} className="flex gap-4 px-5 py-4 transition-colors hover:bg-subtle">
        <VentureThumb p={p} size={44} rounded={p.imageUrl ? 'rounded-lg' : 'rounded-full'} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <p className="text-[15px] font-semibold text-ink">{p.title}</p>
            <time className="text-[12px] text-muted" dateTime={p.approvedAt}>
              Listed {relativeTime(p.approvedAt)}
            </time>
          </div>
          <p className="mt-0.5 text-[13px] text-muted">{[p.founder?.name, p.sector, p.stage, p.country].filter(Boolean).join(' · ')}</p>
          <p className="mt-1.5 line-clamp-2 text-[14px] leading-[1.55] text-ink/80">{p.summary}</p>
          {p.myIntroduction && <p className="mt-2 text-[12px] font-semibold text-accent">{INTRO_LABEL[p.myIntroduction]}</p>}
        </div>
      </Link>
    </li>
  );
}

export default function InvestorActivity() {
  const { user, refresh } = useAuth();
  const [home, setHome] = useState(null);
  const [ventures, setVentures] = useState(null);
  const [error, setError] = useState('');
  const [mode, setMode] = useState('all');

  useEffect(() => {
    document.title = 'Activity · ALU Ventures';
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!user.approved) return;
    api
      .get('/investor/home')
      .then(setHome)
      .catch((e) => setError(e.message));
    api
      .get('/investor/projects?sort=recent&pageSize=25')
      .then((d) => setVentures(d.projects))
      .catch((e) => setError(e.message));
  }, [user.approved]);

  // The profile a founder sees on an introduction: photo and phone are set in Settings.
  const incomplete = !user.hasPhoto || !user.phone;

  // Ventures and graduate posts, newest first; "By sector" groups ventures only.
  const groups = useMemo(() => {
    if (!ventures) return null;
    const posts = (home?.posts || []).map((post) => ({ post, at: post.createdAt }));
    const merge = (list) => [...list.map((p) => ({ ...p, at: p.approvedAt })), ...posts].sort((a, b) => new Date(b.at) - new Date(a.at));
    if (mode === 'newest') {
      const since = Date.now() - 30 * DAY;
      return [[null, merge(ventures).filter((item) => new Date(item.at) >= since)]];
    }
    if (mode === 'sector') {
      const by = {};
      ventures.forEach((p) => (by[p.sector] = [...(by[p.sector] || []), p]));
      return Object.entries(by).sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
    }
    return [[null, merge(ventures)]];
  }, [ventures, home, mode]);

  const banner = incomplete && (
    <section className="rounded-xl border border-line bg-surface px-6 py-5">
      <h2 className="!m-0 text-[16px] font-semibold text-ink">Complete your investor account</h2>
      <p className="mt-1 text-[14px] text-muted">
        Add a profile photo and a phone number. Founders who accept your introduction requests see them with your contact details.
      </p>
      <Link to="/app/settings" className="mt-2 inline-block text-[14px] font-semibold text-accent hover:underline">
        Complete investor account
      </Link>
    </section>
  );

  if (!user.approved) {
    return (
      <MemberColumns>
        {banner}
        <p className="rounded-xl border border-line bg-surface px-5 py-4 text-[14px] text-ink">
          Your investor account is awaiting approval. An administrator reviews every investor before they can browse ventures; you will be emailed.
        </p>
      </MemberColumns>
    );
  }

  const aside = home && (
    <>
      {home.mostViewed.length > 0 && (
        <MemberCard title="Most viewed ventures">
          <ul className="px-2 pb-3 pt-2">
            {home.mostViewed.map((p) => (
              <li key={p.id}>
                <Link to={`/app/discover/${p.id}`} className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-subtle">
                  <VentureThumb p={p} size={40} />
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-semibold text-ink">{p.title}</span>
                    <span className="block text-[12px] text-muted">
                      Viewed by {p.views} {p.views === 1 ? 'investor' : 'investors'} in 30 days
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </MemberCard>
      )}
    </>
  );

  return (
    <MemberColumns aside={aside}>
      <InvestorSummary />
      {banner}
      {error && <p className="rounded-xl border border-line bg-surface px-5 py-4 text-[14px] text-[#b91c1c]">{error}</p>}
      {!home && !error && <Loading />}
      {home?.spotlight.length > 0 && <Spotlight tiles={home.spotlight} />}

      <section aria-label="Ventures for you">
        <div className="mb-3 flex items-center justify-between gap-3">
          <label>
            <span className="sr-only">Show</span>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              className="h-10 cursor-pointer rounded-lg border border-line bg-surface pl-3 pr-8 text-[14px] font-semibold text-ink outline-none focus:border-accent"
            >
              <option value="all">For you · All</option>
              {FEED.slice(1).map(([v, l]) => (
                <option key={v} value={v}>
                  For you · {l}
                </option>
              ))}
            </select>
          </label>
          <Link to="/app/discover" className="text-[13px] font-semibold text-accent hover:underline">
            Browse and filter
          </Link>
        </div>
        {!groups ? (
          !error && <Loading />
        ) : groups.every(([, rows]) => rows.length === 0) ? (
          <p className="rounded-xl border border-line bg-surface px-5 py-10 text-center text-[14px] text-muted">
            {mode === 'newest' ? 'No ventures were listed in the last 30 days.' : 'No ventures are seeking investment right now.'}
          </p>
        ) : (
          <div className="space-y-5">
            {groups.map(([sector, rows]) => (
              <div key={sector || 'all'}>
                {sector && (
                  <h3 className="mb-2 text-[13px] font-semibold text-muted">
                    {sector} · {rows.length}
                  </h3>
                )}
                <ul className="rounded-xl border border-line bg-surface">
                  {rows.map((item, i) =>
                    item.post ? (
                      <li key={`post-${item.post.id}`} className="border-t border-line first:border-0">
                        <PostCard post={item.post} showAuthor canReport />
                      </li>
                    ) : (
                      <VentureItem key={item.id} p={item} index={i} />
                    ),
                  )}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </MemberColumns>
  );
}
