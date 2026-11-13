import { useCallback, useEffect, useSyncExternalStore } from 'react';

// Light or dark for the public site. A visitor's choice is kept in this
// browser; without one the system setting is followed. It drives the same
// mechanism as the account theme (data-theme on <html>), but only while a
// public page is open: the signed-in app applies the account's own theme.
const KEY = 'alu.site.theme';
const media = () => window.matchMedia('(prefers-color-scheme: dark)');
const listeners = new Set();

function stored() {
  let v = null;
  try {
    v = localStorage.getItem(KEY);
  } catch {
    // Storage blocked: fall back to this page's in-memory choice below.
  }
  v = v || window.__aluSiteTheme;
  return v === 'light' || v === 'dark' ? v : null;
}

export function siteTheme() {
  if (typeof window === 'undefined') return 'light';
  return stored() || (media().matches ? 'dark' : 'light');
}

function subscribe(fn) {
  listeners.add(fn);
  const mq = media();
  mq.addEventListener('change', fn);
  return () => {
    listeners.delete(fn);
    mq.removeEventListener('change', fn);
  };
}

// The current site theme, applied to <html> while the calling page is mounted.
export function useSiteTheme() {
  const theme = useSyncExternalStore(subscribe, siteTheme, () => 'light');
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  const setTheme = useCallback((next) => {
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // Private mode or blocked storage: the choice lasts until the page reloads.
      window.__aluSiteTheme = next;
    }
    listeners.forEach((l) => l());
  }, []);
  const toggle = useCallback(() => setTheme(siteTheme() === 'dark' ? 'light' : 'dark'), [setTheme]);
  return { theme, setTheme, toggle };
}
