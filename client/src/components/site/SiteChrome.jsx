import { useEffect, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { ArrowRight, Menu, X } from 'lucide-react';
import { useAuth, homePathFor } from '../../context/AuthContext';

// Public site chrome shared by the landing page and the public pages: the
// dark top bar, the dark footer and the pill buttons. The signed-in app keeps
// its own shell.

export const PRIMARY =
  'land-shine group inline-flex items-center justify-center gap-2.5 rounded-full bg-[#2563eb] font-semibold text-white transition-[background-color,transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:bg-[#1d4ed8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#60a5fa]';
export const GHOST =
  'group inline-flex items-center justify-center gap-2 rounded-full border border-white/[0.16] bg-white/[0.06] font-semibold text-white transition-[background-color,border-color,transform] duration-300 hover:-translate-y-0.5 hover:border-white/30 hover:bg-white/[0.1] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#60a5fa]';
export const ARROW = 'h-4 w-4 transition-transform duration-300 group-hover:translate-x-1';

// Signed-in members go straight to their page; visitors create an account first.
export function useGated() {
  const { user } = useAuth();
  return (target) => (user ? target : `/register?next=${encodeURIComponent(target)}`);
}

export function Brand({ className = '' }) {
  return (
    <span className={`flex items-center gap-3 ${className}`}>
      <img src="/alu-logo.png" alt="African Leadership University" width="104" height="32" className="h-8 w-[104px] max-w-none rounded-[3px]" />
      <span className="h-5 w-px bg-white/[0.16]" aria-hidden="true" />
      <span className="text-[15px] font-semibold tracking-[-0.2px] text-white">Ventures</span>
    </span>
  );
}

const NAV = [
  ['/ventures', 'Browse ventures'],
  ['/opportunities', 'Opportunities'],
  ['/verify', 'Verify a project'],
];

export function SiteHeader() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const actions = user ? (
    <Link to={homePathFor(user)} className={`${PRIMARY} h-[38px] px-[18px] text-[14px]`} onClick={() => setOpen(false)}>
      Open dashboard
      <ArrowRight className="h-[15px] w-[15px] transition-transform duration-300 group-hover:translate-x-1" aria-hidden="true" />
    </Link>
  ) : (
    <>
      <Link to="/signin" className="text-[14px] font-medium text-white transition-colors hover:text-[#60a5fa]" onClick={() => setOpen(false)}>
        Sign in
      </Link>
      <Link to="/register" className={`${PRIMARY} h-[38px] px-[18px] text-[14px]`} onClick={() => setOpen(false)}>
        Get started
        <ArrowRight className="h-[15px] w-[15px] transition-transform duration-300 group-hover:translate-x-1" aria-hidden="true" />
      </Link>
    </>
  );

  return (
    <header
      className={`sticky top-0 z-40 border-b border-white/[0.08] font-sans transition-[background-color,backdrop-filter] duration-300 ${
        scrolled || open ? 'bg-[#070d18]/85 backdrop-blur-xl' : 'bg-[#070d18]'
      }`}
    >
      <div className="mx-auto flex h-[72px] max-w-[1440px] items-center justify-between px-4 sm:px-8 lg:px-16">
        <div className="flex items-center gap-10">
          <Link
            to="/"
            aria-label="ALU Ventures home"
            className="rounded focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#60a5fa]"
          >
            <Brand />
          </Link>
          <nav aria-label="Main" className="hidden items-center gap-7 md:flex">
            {NAV.map(([to, label]) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `group relative text-[14px] font-medium transition-colors hover:text-white ${isActive ? 'text-white' : 'text-white/70'}`
                }
              >
                {label}
                <span
                  className="absolute -bottom-1.5 left-0 h-px w-full origin-left scale-x-0 bg-[#60a5fa] transition-transform duration-300 group-hover:scale-x-100"
                  aria-hidden="true"
                />
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="hidden items-center gap-5 md:flex">{actions}</div>
        <button
          type="button"
          className="rounded-full p-2 text-white transition-colors hover:bg-white/10 md:hidden"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>
      {open && (
        <div className="land-rise border-t border-white/[0.08] px-4 pb-5 pt-2 md:hidden">
          <nav aria-label="Mobile" className="flex flex-col">
            {NAV.map(([to, label]) => (
              <Link key={to} to={to} onClick={() => setOpen(false)} className="border-b border-white/[0.06] py-3 text-[15px] text-white/80">
                {label}
              </Link>
            ))}
          </nav>
          <div className="mt-4 flex items-center gap-5">{actions}</div>
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
  ['Help', [['/app/contact', 'Contact the team']]],
];

export function SiteFooter() {
  return (
    <footer className="border-t border-white/[0.08] bg-[#070d18] px-4 pb-10 pt-[72px] font-sans text-white sm:px-8 lg:px-16">
      <div className="mx-auto flex max-w-[1312px] flex-col gap-12">
        <div className="flex flex-col gap-12 lg:flex-row lg:gap-16">
          <div className="flex flex-col gap-5 lg:w-[400px] lg:shrink-0">
            <Link to="/" aria-label="ALU Ventures home" className="w-fit">
              <Brand />
            </Link>
            <p className="text-[14px] leading-[1.6] text-white/50">
              Where verified ALU graduate ventures meet investors and sponsors, through consent-based introductions.
            </p>
            <p className="inline-flex w-fit items-center gap-2 rounded-full border border-[#3b82f640] bg-[#3b82f61f] px-3 py-1.5 text-[12px] font-medium text-[#60a5fa]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#60a5fa]" aria-hidden="true" />
              All platform services are free
            </p>
          </div>
          <div className="grid flex-1 grid-cols-2 gap-8 sm:grid-cols-3">
            {FOOTER_COLS.map(([title, links]) => (
              <nav key={title} aria-label={title} className="flex flex-col gap-3.5">
                <p className="text-[13px] font-semibold text-white">{title}</p>
                {links.map(([to, label]) => (
                  <Link key={to} to={to} className="w-fit text-[14px] text-white/50 transition-colors hover:text-white">
                    {label}
                  </Link>
                ))}
              </nav>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-5 border-t border-white/[0.08] pt-7 text-[12px] text-white/50">
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
