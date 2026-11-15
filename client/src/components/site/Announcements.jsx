import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { formatDate } from '../ui';
import { FormattedText } from '../messaging';

// Public announcements from ALU staff: title, text and date only. The API
// returns published public announcements and nothing else.

const CARD = 'flex min-w-0 flex-col gap-3 rounded-2xl border border-s-line bg-s-card p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] sm:p-6';

export function AnnouncementCard({ a, clamp = false }) {
  return (
    <article className={CARD}>
      <p className="text-[12px] text-s-muted">
        <time dateTime={a.publishedAt}>{formatDate(a.publishedAt)}</time>
      </p>
      <h3 className="break-words text-[18px] font-semibold leading-snug tracking-[-0.2px] text-s-ink">{a.title}</h3>
      <div className={`break-words text-[14px] leading-[1.6] text-s-soft ${clamp ? 'line-clamp-4' : ''}`}>
        <FormattedText text={a.body} />
      </div>
    </article>
  );
}

/** Home page: the latest three, or nothing at all when there are none. */
export function HomeAnnouncements() {
  const [items, setItems] = useState(null);
  useEffect(() => {
    api
      .get('/announcements/public?limit=3')
      .then((d) => setItems(d.announcements))
      .catch(() => setItems([]));
  }, []);
  if (!items?.length) return null;
  return (
    <section id="announcements" aria-labelledby="announcements-title" className="scroll-mt-20 bg-s-bg px-4 py-16 sm:px-8 lg:px-16 lg:py-24">
      <div className="mx-auto flex max-w-[1120px] flex-col gap-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[1.6px] text-s-accent">From the ALU team</p>
            <h2 id="announcements-title" className="mt-3 text-[30px] font-medium leading-[1.1] tracking-[-0.8px] text-s-ink sm:text-[36px]">
              Announcements
            </h2>
          </div>
          <Link to="/announcements" className="inline-flex min-h-11 items-center rounded-lg border border-s-line-2 px-4 text-[14px] font-semibold text-s-ink transition-colors hover:bg-s-fill">
            See all
          </Link>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {items.map((a) => (
            <AnnouncementCard key={a.id} a={a} clamp />
          ))}
        </div>
      </div>
    </section>
  );
}

/** /announcements: every public announcement, newest first, ten at a time. */
export function PublicAnnouncements() {
  const [items, setItems] = useState(null);
  const [page, setPage] = useState(1);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async (n) => {
    setBusy(true);
    try {
      const d = await api.get(`/announcements/public?page=${n}`);
      setItems((old) => (n === 1 ? d.announcements : [...(old || []), ...d.announcements]));
      setMore(d.hasMore);
      setPage(n);
    } catch (e) {
      setError(e.message);
      setItems((old) => old || []);
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    document.title = 'Announcements · ALU Ventures';
    load(1);
  }, [load]);

  return (
    <div className="bg-s-bg px-4 pb-20 pt-14 text-s-ink sm:px-8 lg:px-16 lg:pt-[72px]">
      <div className="mx-auto max-w-[760px]">
        <p className="text-[12px] font-semibold uppercase tracking-[1.6px] text-s-accent">From the ALU team</p>
        <h1 className="mt-3 text-[34px] font-medium leading-[1.08] tracking-[-1px] sm:text-[44px]">Announcements</h1>
        <p className="mt-4 text-[16px] leading-[1.6] text-s-soft">News and notices from ALU Ventures staff.</p>
        <div className="mt-10 flex flex-col gap-4">
          {error && <p className="text-[14px] text-s-muted">{error}</p>}
          {!items &&
            [0, 1, 2].map((i) => (
              <div key={i} className={`${CARD} animate-pulse motion-reduce:animate-none`} aria-hidden="true">
                <div className="h-3 w-24 rounded bg-s-fill" />
                <div className="h-5 w-2/3 rounded bg-s-fill" />
                <div className="h-3 w-full rounded bg-s-fill" />
              </div>
            ))}
          {items && items.length === 0 && !error && <p className="rounded-2xl border border-s-line bg-s-card p-6 text-[15px] text-s-soft">There are no announcements right now.</p>}
          {items?.map((a) => (
            <AnnouncementCard key={a.id} a={a} />
          ))}
          {more && (
            <button type="button" disabled={busy} onClick={() => load(page + 1)} className="mx-auto mt-2 inline-flex min-h-11 items-center rounded-lg border border-s-line-2 px-5 text-[14px] font-semibold text-s-ink hover:bg-s-fill">
              {busy ? 'Loading…' : 'Load more'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
