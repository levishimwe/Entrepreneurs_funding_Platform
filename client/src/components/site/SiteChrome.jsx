import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { ArrowRight, Menu, Moon, Sun, X } from 'lucide-react';
import { useAuth, homePathFor } from '../../context/AuthContext';
import { useSiteTheme } from '../../lib/siteTheme';
import Logo from './Logo';

// Public site chrome shared by the landing page and the public pages: the
// top bar, the footer and the pill buttons, in the visitor's light or dark
// theme (--s-* tokens in index.css). The signed-in app keeps its own shell.

export const PRIMARY =
  'land-shine group inline-flex items-center justify-center gap-2.5 rounded-full bg-[#2563eb] font-semibold text-white transition-[background-color,transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:bg-[#1d4ed8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#60a5fa]';
export const GHOST =
  'group inline-flex items-center justify-center gap-2 rounded-full border border-s-line-2 bg-s-fill font-semibold text-s-ink transition-[background-color,border-color,transform] duration-300 hover:-translate-y-0.5 hover:border-s-line-3 hover:bg-s-fill-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#60a5fa]';
export const ARROW = 'h-4 w-4 transition-transform duration-300 group-hover:translate-x-1';

// Signed-in members go straight to their page; visitors create an account first.
export function useGated() {
  const { user } = useAuth();
  return (target) => (user ? target : `/register?next=${encodeURIComponent(target)}`);
}

// Small grey sun/moon button that switches the public site between light and dark.
export function ThemeToggle({ className = '' }) {
  const { theme, toggle } = useSiteTheme();
  const dark = theme === 'dark';
  const Icon = dark ? Sun : Moon;
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={dark ? 'Light mode' : 'Dark mode'}
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-s-faint transition-colors hover:bg-s-fill-2 hover:text-s-ink ${className}`}
    >
      <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden="true" />
    </button>
  );
}

const NAV = [
  ['/ventures', 'Browse ventures'],
  ['/opportunities', 'Opportunities'],
  ['/verify', 'Verify a project'],
  ['/about', 'About'],
];

export function SiteHeader() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  // The phone menu closes on any navigation, and on Escape.
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return undefined;
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [open]);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const actions = user ? (
    <Link to={homePathFor(user)} className={`${PRIMARY} h-11 px-[18px] text-[14px] xl:h-[38px]`} onClick={() => setOpen(false)}>
      Open dashboard
      <ArrowRight className="h-[15px] w-[15px] transition-transform duration-300 group-hover:translate-x-1" aria-hidden="true" />
    </Link>
  ) : (
    <>
      <Link
        to="/signin"
        className="inline-flex min-h-11 items-center text-[14px] font-medium text-s-ink transition-colors hover:text-s-link"
        onClick={() => setOpen(false)}
      >
        Sign in
      </Link>
      <Link to="/register" className={`${PRIMARY} h-11 px-[18px] text-[14px] xl:h-[38px]`} onClick={() => setOpen(false)}>
        Get started
        <ArrowRight className="h-[15px] w-[15px] transition-transform duration-300 group-hover:translate-x-1" aria-hidden="true" />
      </Link>
    </>
  );

  return (
    <header
      className={`sticky top-0 z-40 border-b border-s-line font-sans text-s-ink transition-[background-color,backdrop-filter] duration-300 ${
        scrolled || open ? 'bg-[var(--s-header)] backdrop-blur-xl' : 'bg-s-bg'
      }`}
    >
      <div className="mx-auto flex h-[72px] max-w-[1440px] items-center justify-between gap-3 px-4 sm:px-8 lg:px-16">
        <div className="flex min-w-0 items-center gap-10">
          <Logo label="ALU Ventures home" />
          <nav aria-label="Main" className="hidden items-center gap-7 xl:flex">
            {NAV.map(([to, label]) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `group relative whitespace-nowrap text-[14px] font-medium transition-colors hover:text-s-ink ${isActive ? 'text-s-ink' : 'text-s-soft'}`
                }
              >
                {label}
                <span
                  className="absolute -bottom-1.5 left-0 h-px w-full origin-left scale-x-0 bg-s-accent transition-transform duration-300 group-hover:scale-x-100"
                  aria-hidden="true"
                />
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="flex shrink-0 items-center gap-2 xl:gap-4">
          <ThemeToggle />
          <div className="hidden items-center gap-5 xl:flex">{actions}</div>
          <button
            type="button"
            className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full text-s-ink transition-colors hover:bg-s-fill-2 xl:hidden"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            aria-controls="site-menu"
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
          </button>
        </div>
      </div>
      {open && (
        <div id="site-menu" className="land-rise max-h-[calc(100dvh-72px)] overflow-y-auto border-t border-s-line px-4 pb-5 pt-2 sm:px-8 xl:hidden">
          <nav aria-label="Mobile" className="flex flex-col">
            {NAV.map(([to, label]) => (
              <NavLink
                key={to}
                to={to}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  `flex min-h-12 items-center border-b border-s-line text-[15px] ${isActive ? 'font-semibold text-s-ink' : 'text-s-soft'}`
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="mt-4 flex flex-wrap items-center gap-5">{actions}</div>
        </div>
      )}
    </header>
  );
}

const FOOTER_COLS = [
  [
    'Explore',
    [
      ['/ventures', 'Browse ventures'],
      ['/opportunities', 'Opportunities'],
      ['/verify', 'Verify a project'],
    ],
  ],
  [
    'Account',
    [
      ['/signin', 'Sign in'],
      ['/register', 'Create an account'],
      ['/register?role=investor', 'Investor access'],
    ],
  ],
  [
    'About',
    [
      ['/about', 'About the platform'],
      ['/app/contact', 'Contact the team'],
    ],
  ],
];

export function SiteFooter() {
  return (
    <footer className="border-t border-s-line bg-s-bg px-4 pb-10 pt-16 font-sans text-s-ink sm:px-8 lg:px-16 lg:pt-[72px]">
      <div className="mx-auto flex max-w-[1312px] flex-col gap-12">
        <div className="flex flex-col gap-12 lg:flex-row lg:gap-16">
          <div className="flex flex-col gap-5 lg:w-[400px] lg:shrink-0">
            <Logo label="ALU Ventures home" className="w-fit" />
            <p className="text-[14px] leading-[1.6] text-s-muted">
              Where verified ALU graduate ventures meet investors and sponsors, through consent-based introductions.
            </p>
            <p className="inline-flex w-fit items-center gap-2 rounded-full border border-[#3b82f640] bg-[#3b82f61f] px-3 py-1.5 text-[12px] font-medium text-s-accent">
              <span className="h-1.5 w-1.5 rounded-full bg-s-accent" aria-hidden="true" />
              All platform services are free
            </p>
          </div>
          <div className="grid flex-1 grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-3">
            {FOOTER_COLS.map(([title, links]) => (
              <nav key={title} aria-label={title} className="flex flex-col gap-3.5">
                <p className="text-[13px] font-semibold text-s-ink">{title}</p>
                {links.map(([to, label]) => (
                  <Link key={to} to={to} className="-my-2 inline-flex min-h-11 w-fit items-center text-[14px] text-s-muted transition-colors hover:text-s-ink">
                    {label}
                  </Link>
                ))}
              </nav>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-5 border-t border-s-line pt-7 text-[12px] text-s-muted">
          <p className="leading-[1.6]">
            ALU Graduate Entrepreneurship &amp; Funding Platform. A verified record confirms an administrator-approved venture on this platform; it is not an
            investment recommendation.
          </p>
          <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
            <p>© {new Date().getFullYear()} African Leadership University</p>
            <p>Built at African Leadership University</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
