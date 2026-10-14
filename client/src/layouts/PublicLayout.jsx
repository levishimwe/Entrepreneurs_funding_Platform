import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import Logo from '../components/Logo';
import { useAuth, homePathFor } from '../context/AuthContext';

const LINKS = [
  { to: '/ventures', label: 'Browse Ventures' },
  { to: '/verify', label: 'Verify a Project' },
  { to: '/opportunities', label: 'Opportunities' },
];

// Pages the Figma shows on a light canvas with a white header (e.g. Verify a
// Project); the home and sign-in screens use the dark frame.
const LIGHT_PATHS = ['/verify', '/ventures', '/opportunities'];

export default function PublicLayout() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const light = LIGHT_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  const t = light
    ? {
        page: 'bg-canvas text-ink',
        header: 'border-line bg-surface/95',
        link: 'text-muted hover:text-ink',
        linkActive: 'font-medium text-ink',
        product: 'text-ink',
        icon: 'text-muted hover:text-ink',
        mobileBorder: 'border-line',
        mobileLink: 'text-ink',
        secondary: 'btn-secondary flex-1',
        footer: 'border-line bg-surface text-muted',
      }
    : {
        page: 'bg-[#0d1117] text-[#e6edf3]',
        header: 'border-white/10 bg-[#0d1117]/95',
        link: 'text-[#9198a1] hover:text-white',
        linkActive: 'text-white',
        product: 'text-white',
        icon: 'text-[#9198a1] hover:text-white',
        mobileBorder: 'border-white/10',
        mobileLink: 'text-[#c9d1d9]',
        secondary: 'btn flex-1 border-white/20 text-white',
        footer: 'border-white/10 bg-[#010409] text-[#9198a1]',
      };

  return (
    <div className={`flex min-h-screen flex-col ${t.page}`}>
      <header className={`sticky top-0 z-30 border-b backdrop-blur ${t.header}`}>
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
          <div className="flex items-center gap-8">
            <Logo productClass={t.product} />
            <nav className="hidden items-center gap-6 md:flex" aria-label="Main">
              {LINKS.map((l) => (
                <NavLink key={l.to} to={l.to} className={({ isActive }) => `text-sm transition-colors ${isActive ? t.linkActive : t.link}`}>
                  {l.label}
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="hidden items-center gap-3 md:flex">
            {user ? (
              <Link to={homePathFor(user)} className="btn-cta">
                Open dashboard
              </Link>
            ) : (
              <>
                <Link to="/signin" className={`text-sm ${t.link}`}>
                  Sign in
                </Link>
                <Link to="/register" className="btn-cta">
                  Get Started
                </Link>
              </>
            )}
          </div>
          <button
            type="button"
            className={`rounded-md p-2 md:hidden ${t.icon}`}
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
        {open && (
          <nav className={`border-t px-4 py-3 md:hidden ${t.mobileBorder}`} aria-label="Mobile">
            {LINKS.map((l) => (
              <Link key={l.to} to={l.to} onClick={() => setOpen(false)} className={`block py-2 text-sm ${t.mobileLink}`}>
                {l.label}
              </Link>
            ))}
            <div className={`mt-2 flex gap-2 border-t pt-3 ${t.mobileBorder}`}>
              {user ? (
                <Link to={homePathFor(user)} className="btn-cta flex-1" onClick={() => setOpen(false)}>
                  Open dashboard
                </Link>
              ) : (
                <>
                  <Link to="/signin" className={t.secondary} onClick={() => setOpen(false)}>
                    Sign in
                  </Link>
                  <Link to="/register" className="btn-cta flex-1" onClick={() => setOpen(false)}>
                    Get Started
                  </Link>
                </>
              )}
            </div>
          </nav>
        )}
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className={`border-t ${t.footer}`}>
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-6 text-xs sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} African Leadership University · ALU Graduate Entrepreneurship &amp; Funding Platform</p>
          <p>Free for graduates, investors and sponsors. Verification status is not an investment guarantee.</p>
        </div>
      </footer>
    </div>
  );
}
