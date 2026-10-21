import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ChevronDown, Menu, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

// Admin and staff console: a navy top bar with the ALU logo and the user menu,
// a navy sidebar grouped Review / Manage / Settings (a drawer on narrow
// screens), and the page on a light canvas.
const NAV = {
  admin: [
    ['Review', [['/app/admin/projects', 'Projects'], ['/app/admin/graduates', 'Graduates'], ['/app/admin/investors', 'Investors'], ['/app/admin/results', 'Competition results'], ['/app/admin/requests', 'Requests']]],
    ['Manage', [['/app/admin', 'Dashboard', true], ['/app/admin/introductions', 'Introductions & funding'], ['/app/admin/opportunities', 'Opportunities'], ['/app/admin/outbox', 'Email outbox']]],
    ['Settings', [['/app/admin/config', 'Rules & thresholds'], ['/app/settings', 'Account']]],
  ],
  staff: [
    ['Review', [['/app/staff/selection', 'Applicant selection']]],
    ['Manage', [['/app/staff', 'Opportunities', true], ['/app/staff/new', 'Submit opportunity']]],
    ['Settings', [['/app/settings', 'Account']]],
  ],
};

function UserMenu({ user, onSignOut }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="flex h-8 items-center gap-1 rounded-md px-2 text-[13px] text-white/90 hover:bg-white/10"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="max-w-[10rem] truncate">{user.fullName}</span>
        <ChevronDown className="h-4 w-4" aria-hidden="true" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-50 mt-1 w-48 overflow-hidden rounded-lg border border-[var(--adm-border)] bg-[var(--adm-card)] py-1 text-[13px] text-[var(--adm-text)] shadow-lg">
          <p className="adm-muted truncate px-4 py-2 text-[12px]">{user.role === 'admin' ? 'Administrator' : 'ALU staff'}</p>
          <Link role="menuitem" to="/app/settings" className="block px-4 py-2 hover:bg-[var(--adm-accent-soft)]" onClick={() => setOpen(false)}>
            Account settings
          </Link>
          <button role="menuitem" type="button" className="block w-full px-4 py-2 text-left hover:bg-[var(--adm-accent-soft)]" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export default function AdminShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [drawer, setDrawer] = useState(false);
  useEffect(() => setDrawer(false), [location.pathname]);

  const signOut = async () => {
    await logout();
    navigate('/signin');
  };

  const nav = (
    <nav aria-label="Administration" className="px-2 py-4">
      {NAV[user.role].map(([group, links]) => (
        <div key={group} className="mb-6">
          <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/50">{group}</p>
          <ul>
            {links.map(([to, label, end]) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    `relative block rounded-md px-3 py-2 text-[13px] ${
                      isActive
                        ? 'bg-white/10 font-semibold text-white before:absolute before:inset-y-1 before:left-0 before:w-[3px] before:rounded-full before:bg-[#4f8cff]'
                        : 'text-white/75 hover:bg-white/5 hover:text-white'
                    }`
                  }
                >
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <div className="adm-root flex flex-col">
      <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 bg-[var(--adm-navy)] px-4 text-white shadow-[0_1px_0_rgba(255,255,255,0.08)]">
        <button
          type="button"
          className="-ml-1 rounded-md p-2 text-white/90 hover:bg-white/10 lg:hidden"
          aria-label={drawer ? 'Close navigation' : 'Open navigation'}
          aria-expanded={drawer}
          onClick={() => setDrawer((d) => !d)}
        >
          {drawer ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
        <Link to={user.role === 'admin' ? '/app/admin' : '/app/staff'} className="flex shrink-0 items-center gap-3" aria-label="ALU Ventures console home">
          {/* The institutionally approved logo, used as-is. */}
          <img src="/alu-logo.png" alt="African Leadership University" className="h-8 w-auto max-w-none rounded-[3px]" />
          <span className="hidden border-l border-white/20 pl-3 text-[14px] font-semibold sm:inline">Ventures {user.role === 'admin' ? 'Admin' : 'Staff'}</span>
        </Link>
        <div className="ml-auto">
          <UserMenu user={user} onSignOut={signOut} />
        </div>
      </header>
      <div className="flex flex-1">
        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-56 shrink-0 overflow-y-auto bg-[var(--adm-navy)] lg:block">{nav}</aside>
        {drawer && (
          <div className="fixed inset-0 top-14 z-20 lg:hidden">
            <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close navigation" onClick={() => setDrawer(false)} />
            <aside className="relative h-full w-64 overflow-y-auto bg-[var(--adm-navy)]">{nav}</aside>
          </div>
        )}
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
