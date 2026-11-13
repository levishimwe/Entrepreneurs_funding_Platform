import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

// Scroll position on navigation, for every route:
// - a new page (link, redirect) opens at the top;
// - Back / Forward return to where that page was left;
// - a #hash scrolls to its element (below the sticky header, via
//   scroll-padding-top in index.css), also on a first visit to a #link.
// Changing only the query string (filters, pages of results) keeps the
// position. Pages load their content after rendering, so a restore or #hash
// is held for a moment while the layout settles, unless the visitor scrolls.
const positions = new Map();
const HOLD_MS = 1200;
const USER_SCROLL = ['wheel', 'touchstart', 'keydown', 'mousedown'];

function hold(apply) {
  const until = Date.now() + HOLD_MS;
  let frame;
  let stopped = false;
  const stop = () => {
    stopped = true;
    cancelAnimationFrame(frame);
    USER_SCROLL.forEach((e) => window.removeEventListener(e, stop));
  };
  USER_SCROLL.forEach((e) => window.addEventListener(e, stop, { passive: true }));
  const step = () => {
    if (stopped) return;
    apply();
    if (Date.now() > until) return stop();
    frame = requestAnimationFrame(step);
  };
  step();
  return stop;
}

function toHash(hash) {
  const id = decodeURIComponent(hash.slice(1));
  return hold(() => document.getElementById(id)?.scrollIntoView());
}

export default function ScrollToTop() {
  const { pathname, hash, key } = useLocation();
  const navType = useNavigationType();
  const lastKey = useRef(key);

  // The browser's own restoration fights ours on single-page navigations.
  useEffect(() => {
    if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';
  }, []);

  // Remember where each history entry was scrolled to before leaving it.
  useEffect(() => {
    const save = () => positions.set(lastKey.current, window.scrollY);
    window.addEventListener('scroll', save, { passive: true });
    return () => window.removeEventListener('scroll', save);
  }, []);

  useLayoutEffect(() => {
    lastKey.current = key;
    if (navType === 'POP') {
      const y = positions.get(key);
      if (y !== undefined) return hold(() => window.scrollTo(0, y));
      // First load of the page (also reported as POP).
      return hash ? toHash(hash) : undefined;
    }
    if (hash) return toHash(hash);
    window.scrollTo(0, 0);
    return undefined;
    // Only a new path or #hash moves the page; query-string changes do not.
  }, [pathname, hash]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
