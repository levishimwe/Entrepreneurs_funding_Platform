import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../lib/api';

// Home-page slider of Fully Funded ventures the administrator chose to show.
// Public-safe fields only (the API never sends names, emails or documents).
// Rotates on its own unless the visitor hovers, focuses it, or prefers reduced
// motion; swipe, arrows and dots move it by hand. Renders nothing when empty.
const INTERVAL = 6000;

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

const money = (a) => `${a.currency || ''} ${Number(a.value).toLocaleString('en-GB')}`.trim();

export default function SuccessStories() {
  const [stories, setStories] = useState([]);
  const [index, setIndex] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const reduced = useReducedMotion();
  const touch = useRef(null);

  useEffect(() => {
    api
      .get('/public/success-stories')
      .then((d) => setStories(d.stories || []))
      .catch(() => setStories([]));
  }, []);

  const count = stories.length;
  const rotating = count > 1 && !reduced && !hovered && !focused;
  useEffect(() => {
    if (!rotating) return undefined;
    const t = setInterval(() => setIndex((i) => (i + 1) % count), INTERVAL);
    return () => clearInterval(t);
  }, [rotating, count]);

  if (!count) return null;
  const go = (i) => setIndex((i + count) % count);

  return (
    <section
      className="border-b border-line bg-canvas"
      aria-roledescription="carousel"
      aria-label="Success stories"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setFocused(false)}
    >
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="!m-0 text-[20px] font-semibold">Success stories</h2>
          </div>
          {count > 1 && (
            <div className="flex shrink-0 gap-2">
              <button type="button" onClick={() => go(index - 1)} className="btn-secondary px-2" aria-label="Previous story">
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </button>
              <button type="button" onClick={() => go(index + 1)} className="btn-secondary px-2" aria-label="Next story">
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          )}
        </div>

        <div
          className="mt-6 overflow-hidden"
          onTouchStart={(e) => {
            touch.current = e.touches[0].clientX;
          }}
          onTouchEnd={(e) => {
            if (touch.current === null) return;
            const dx = e.changedTouches[0].clientX - touch.current;
            touch.current = null;
            if (Math.abs(dx) > 40) go(index + (dx < 0 ? 1 : -1));
          }}
        >
          <ul
            className={`flex ${reduced ? '' : 'transition-transform duration-500 ease-out'}`}
            style={{ transform: `translateX(-${index * 100}%)` }}
            aria-live={rotating ? 'off' : 'polite'}
          >
            {stories.map((s, i) => (
              <li
                key={s.projectCode}
                className="w-full shrink-0"
                aria-roledescription="slide"
                aria-label={`${i + 1} of ${count}`}
                aria-hidden={i !== index}
                inert={i !== index ? true : undefined}
              >
                <article className="adm-card p-6">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="adm-pill adm-pill-success">Fully Funded</span>
                    {s.fundingSource && <span className="adm-pill adm-pill-info">{s.fundingSource}</span>}
                    <span className="adm-muted">{s.sector}</span>
                  </div>
                  <h3 className="mt-3 text-[18px] font-semibold">{s.title}</h3>
                  <p className="adm-muted mt-1 max-w-3xl">{s.summary}</p>
                  <div className="adm-muted mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-[12px]">
                    <span>{s.founder}</span>
                    <Link to={`/verify?code=${s.projectCode}`} className="adm-a adm-mono">
                      {s.projectCode}
                    </Link>
                    {s.amount && <span className="font-semibold text-ink">{money(s.amount)}</span>}
                  </div>
                </article>
              </li>
            ))}
          </ul>
        </div>

        {count > 1 && (
          <div className="mt-4 flex justify-center gap-2">
            {stories.map((s, i) => (
              <button
                key={s.projectCode}
                type="button"
                onClick={() => go(i)}
                aria-label={`Show story ${i + 1}`}
                aria-current={i === index ? 'true' : undefined}
                className={`h-2 rounded-full ${reduced ? '' : 'transition-all'} ${i === index ? 'w-6 bg-accent' : 'w-2 bg-line hover:bg-muted'}`}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
