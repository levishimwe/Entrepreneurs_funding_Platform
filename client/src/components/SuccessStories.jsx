import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { BadgeCheck, ChevronLeft, ChevronRight } from 'lucide-react';
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
      className="border-t border-white/10 bg-[#0d1117]"
      aria-roledescription="carousel"
      aria-label="Success stories"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setFocused(false)}
    >
      <div className="mx-auto max-w-6xl px-4 py-14">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-white">Success stories</h2>
            <p className="mt-1 text-sm text-[#9198a1]">ALU graduate ventures that reached full funding.</p>
          </div>
          {count > 1 && (
            <div className="flex shrink-0 gap-2">
              <button type="button" onClick={() => go(index - 1)} className="rounded-md border border-white/15 p-2 text-white hover:bg-white/10" aria-label="Previous story">
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </button>
              <button type="button" onClick={() => go(index + 1)} className="rounded-md border border-white/15 p-2 text-white hover:bg-white/10" aria-label="Next story">
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
                <article className="rounded-lg border border-white/10 bg-[#161b22] p-6 sm:p-8">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-full bg-[#238636]/20 px-2 py-0.5 font-medium text-[#3fb950]">Fully Funded</span>
                    {s.fundingSource && <span className="rounded-full border border-white/15 px-2 py-0.5 text-[#c9d1d9]">{s.fundingSource}</span>}
                    <span className="text-[#9198a1]">{s.sector}</span>
                  </div>
                  <h3 className="mt-4 text-xl font-semibold text-white">{s.title}</h3>
                  <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[#9198a1]">{s.summary}</p>
                  <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-[#9198a1]">
                    <span className="inline-flex items-center gap-1.5">
                      <BadgeCheck className="h-3.5 w-3.5 text-[#3fb950]" aria-hidden="true" /> {s.founder}
                    </span>
                    <Link to={`/verify?code=${s.projectCode}`} className="font-mono text-[#58a6ff] hover:underline">
                      {s.projectCode}
                    </Link>
                    {s.amount && <span className="font-semibold text-white">{money(s.amount)}</span>}
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
                className={`h-2 rounded-full ${reduced ? '' : 'transition-all'} ${i === index ? 'w-6 bg-[#58a6ff]' : 'w-2 bg-white/25 hover:bg-white/50'}`}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
