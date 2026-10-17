import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// Plain admin/staff shell, in the spirit of Django admin: a header bar, a
// text-only sidebar in three short groups, and the page. On a narrow screen
// the sidebar folds behind a "Menu" button.
const NAV = {
  admin: [
    ['Review', [['/app/admin/projects', 'Projects'], ['/app/admin/graduates', 'Graduates'], ['/app/admin/investors', 'Investors']]],
    ['Manage', [['/app/admin', 'Dashboard', true], ['/app/admin/introductions', 'Introductions & funding'], ['/app/admin/opportunities', 'Opportunities'], ['/app/admin/outbox', 'Email outbox']]],
    ['Settings', [['/app/admin/config', 'Rules & thresholds'], ['/app/settings', 'Account']]],
  ],
  staff: [
    ['Review', [['/app/staff/selection', 'Applicant selection']]],
    ['Manage', [['/app/staff', 'Opportunities', true], ['/app/staff/new', 'Submit opportunity']]],
    ['Settings', [['/app/settings', 'Account']]],
  ],
};

export default function AdminShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [location.pathname]);

  const signOut = async () => {
    await logout();
    navigate('/signin');
  };

  return (
    <div className="flex min-h-screen flex-col bg-canvas text-[13px]">
      <header className="flex items-center gap-3 border-b border-line bg-surface px-4 py-2">
        <button type="button" className="adm-btn lg:hidden" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          Menu
        </button>
        <span className="font-semibold">ALU Ventures {user.role === 'admin' ? 'administration' : 'staff'}</span>
        <span className="ml-auto hidden text-muted sm:inline">{user.fullName}</span>
        <button type="button" className="adm-a bg-transparent" onClick={signOut}>
          Sign out
        </button>
      </header>
      <div className="flex flex-1">
        <nav aria-label="Administration" className={`${open ? 'block' : 'hidden'} w-full shrink-0 border-r border-line bg-surface px-4 py-3 lg:block lg:w-52`}>
          {NAV[user.role].map(([group, links]) => (
            <div key={group} className="mb-4">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{group}</p>
              <ul>
                {links.map(([to, label, end]) => (
                  <li key={to}>
                    <NavLink
                      to={to}
                      end={end}
                      className={({ isActive }) => `block py-0.5 ${isActive ? 'font-semibold text-ink' : 'text-accent hover:underline'}`}
                    >
                      {label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <main className={`${open ? 'hidden' : 'block'} min-w-0 flex-1 px-4 py-4 lg:block lg:px-6`}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
