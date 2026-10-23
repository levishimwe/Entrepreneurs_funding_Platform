import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { useAuth, homePathFor } from '../context/AuthContext';

const LINKS = [
  { to: '/ventures', label: 'Browse' },
  { to: '/verify', label: 'Verify a project' },
  { to: '/opportunities', label: 'Opportunities' },
];

// Public pages share the app's navy top bar (ALU logo at left) and the light
// canvas; only the home hero sits on navy.
export default function PublicLayout() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();

  const actions = (mobile) =>
    user ? (
      <Link to={homePathFor(user)} className={`btn-primary ${mobile ? 'flex-1' : ''}`} onClick={() => setOpen(false)}>
        Open dashboard
      </Link>
    ) : (
      <>
        <Link to="/signin" className={mobile ? 'btn flex-1 border-white/25 text-white' : 'text-[13px] text-white/80 hover:text-white'} onClick={() => setOpen(false)}>
          Sign in
        </Link>
        <Link to="/register" className={`btn-primary ${mobile ? 'flex-1' : ''}`} onClick={() => setOpen(false)}>
          Get started
        </Link>
      </>
    );

  // The home page draws its own dark top bar and footer.
  if (pathname === '/') return <Outlet />;

  return (
    <div className="adm-root flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 bg-navy text-white shadow-[0_1px_0_rgba(255,255,255,0.08)]">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
          <div className="flex items-center gap-8">
            <Link to="/" className="flex shrink-0 items-center gap-3" aria-label="ALU Ventures home">
              <img src="/alu-logo.png" alt="African Leadership University" className="h-8 w-auto max-w-none rounded-[3px]" />
              <span className="hidden border-l border-white/20 pl-3 text-[14px] font-semibold sm:inline">Ventures</span>
            </Link>
            <nav className="hidden items-center gap-6 md:flex" aria-label="Main">
              {LINKS.map((l) => (
                <NavLink key={l.to} to={l.to} className={({ isActive }) => `text-[13px] ${isActive ? 'font-semibold text-white' : 'text-white/75 hover:text-white'}`}>
                  {l.label}
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="hidden items-center gap-4 md:flex">{actions(false)}</div>
          <button
            type="button"
            className="rounded-md p-2 text-white/90 hover:bg-white/10 md:hidden"
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
        {open && (
          <nav className="border-t border-white/10 px-4 py-3 md:hidden" aria-label="Mobile">
            {LINKS.map((l) => (
              <Link key={l.to} to={l.to} onClick={() => setOpen(false)} className="block py-2 text-[13px] text-white/85">
                {l.label}
              </Link>
            ))}
            <div className="mt-2 flex gap-2 border-t border-white/10 pt-3">{actions(true)}</div>
          </nav>
        )}
      </header>

      <main className="adm flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-line bg-surface">
        <p className="adm-muted mx-auto max-w-6xl px-4 py-4 text-[12px]">© {new Date().getFullYear()} African Leadership University · ALU Ventures</p>
      </footer>
    </div>
  );
}
