import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ChevronDown, Menu, X } from 'lucide-react';
import { useAuth, homePathFor } from '../context/AuthContext';
import { MemberAvatar } from './MemberShell';
import { ShellSearchBox, ShellSearchProvider } from '../components/shellSearch';

// The console shell for administrators and staff: a navy sidebar that opens
// with the signed-in person's profile and lists text links under small group
// headings (a slide-in menu on phones), a light top bar with the page's search
// and the account menu, and the page on a light canvas. Graduates and
// investors use MemberShell; their entries stay here for completeness.
const NAV = {
  admin: [
    ['Review', [['/app/admin/projects', 'Projects'], ['/app/admin/graduates', 'Graduates'], ['/app/admin/investors', 'Investors'], ['/app/admin/results', 'Competition results'], ['/app/admin/requests', 'Requests'], ['/app/admin/testimonials', 'Testimonies'], ['/app/admin/posts', 'Posts']]],
    ['Manage', [['/app/admin', 'Dashboard', true], ['/app/admin/introductions', 'Introductions & funding'], ['/app/admin/opportunities', 'Opportunities'], ['/app/admin/outbox', 'Email outbox']]],
    ['Settings', [['/app/admin/config', 'Rules & thresholds'], ['/app/settings', 'Account']]],
  ],
  staff: [
    ['Review', [['/app/staff', 'Dashboard', true], ['/app/staff/selection', 'Applications'], ['/app/staff/results', 'Results']]],
    ['Manage', [['/app/staff/opportunities', 'Opportunities'], ['/app/staff/new', 'Submit opportunity']]],
    ['Settings', [['/app/settings', 'Account']]],
  ],
  graduate: [
    ['Workspace', [['/app', 'Dashboard', true], ['/app/projects', 'My projects'], ['/app/opportunities', 'Opportunities'], ['/app/introductions', 'Introductions']]],
    ['Settings', [['/app/settings', 'Account'], ['/app/contact', 'Contact admin']]],
  ],
  investor: [
    ['Explore', [['/app/discover', 'Browse projects'], ['/app/introductions', 'Introductions']]],
    ['Account', [['/app/billing', 'Billing & plans']]],
    ['Settings', [['/app/settings', 'Account'], ['/app/contact', 'Contact admin']]],
  ],
};
const ROLE_LABEL = { admin: 'Administrator', staff: 'Staff', graduate: 'Graduate founder', investor: 'Investor / sponsor' };
const PRODUCT = { admin: 'Ventures Admin', staff: 'Ventures Staff' };

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
  const member = ['graduate', 'investor'].includes(user.role);
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="flex h-10 items-center gap-2 rounded-md px-1.5 text-[13px] hover:bg-[var(--adm-zebra)]"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${user.fullName}`}
        onClick={() => setOpen((o) => !o)}
      >
        <MemberAvatar user={user} size={32} />
        <span className="hidden max-w-[10rem] truncate text-left sm:block">
          <span className="block truncate font-medium leading-4">{user.fullName}</span>
          <span className="adm-muted block text-[11px] leading-4">{ROLE_LABEL[user.role]}</span>
        </span>
        <ChevronDown className="adm-muted h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-50 mt-1 w-52 overflow-hidden rounded-lg border border-[var(--adm-border)] bg-[var(--adm-card)] py-1 text-[13px] text-[var(--adm-text)] shadow-lg">
          <p className="adm-muted truncate px-4 py-2 text-[12px]">
            {ROLE_LABEL[user.role]}
            {member && !user.approved ? ' · pending review' : ''}
          </p>
          <Link role="menuitem" to="/app/settings" className="block px-4 py-2 hover:bg-[var(--adm-accent-soft)]" onClick={() => setOpen(false)}>
            Account
          </Link>
          {member && (
            <Link role="menuitem" to="/app/contact" className="block px-4 py-2 hover:bg-[var(--adm-accent-soft)]" onClick={() => setOpen(false)}>
              Contact admin
            </Link>
          )}
          <button role="menuitem" type="button" className="block w-full px-4 py-2 text-left hover:bg-[var(--adm-accent-soft)]" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

function Brand({ user }) {
  return (
    <Link to={homePathFor(user)} className="flex shrink-0 items-center gap-3 text-white" aria-label={`${PRODUCT[user.role] || 'ALU Ventures'} home`}>
      {/* The institutionally approved logo, used as-is. */}
      <img src="/alu-logo.png" alt="African Leadership University" className="h-8 w-auto max-w-none rounded-[3px]" />
      <span className="border-l border-white/20 pl-3 text-[14px] font-semibold">{PRODUCT[user.role] || 'Ventures'}</span>
    </Link>
  );
}

// The signed-in person at the top of the sidebar; opens Account.
function ProfileBlock({ user }) {
  return (
    <Link to="/app/settings" className="group mx-2 mb-2 flex flex-col items-center rounded-lg px-3 py-5 text-center hover:bg-white/5" aria-label={`${user.fullName}, account settings`}>
      <span className="rounded-full ring-2 ring-white/15">
        <MemberAvatar user={user} size={72} />
      </span>
      <span className="mt-3 max-w-full truncate text-[14px] font-semibold text-white">{user.fullName}</span>
      <span className="max-w-full truncate text-[12px] text-white/65">{user.email}</span>
      <span className="mt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/80">{ROLE_LABEL[user.role]}</span>
    </Link>
  );
}

function SideNav({ user }) {
  return (
    <nav aria-label="Main" className="px-2 pb-6">
      {(NAV[user.role] || []).map(([group, links]) => (
        <div key={group} className="mb-5">
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
}

export default function AdminShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [drawer, setDrawer] = useState(false);
  useEffect(() => setDrawer(false), [location.pathname]);
  useEffect(() => {
    if (!drawer) return undefined;
    const esc = (e) => e.key === 'Escape' && setDrawer(false);
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [drawer]);

  const signOut = async () => {
    await logout();
    navigate('/signin');
  };

  return (
    <ShellSearchProvider>
      <div className="adm-root flex">
        {/* The navy column runs the full page height; the menu inside stays in view. */}
        <div className="hidden w-64 shrink-0 bg-[var(--adm-navy)] lg:block">
          <aside className="sticky top-0 flex h-screen flex-col overflow-y-auto">
            <div className="flex h-16 shrink-0 items-center border-b border-white/10 px-4">
              <Brand user={user} />
            </div>
            <div className="pt-3">
              <ProfileBlock user={user} />
            </div>
            <SideNav user={user} />
          </aside>
        </div>

        {drawer && (
          <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
            <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close navigation" onClick={() => setDrawer(false)} />
            <aside className="member-drawer relative flex h-full w-72 max-w-[85vw] flex-col overflow-y-auto bg-[var(--adm-navy)]">
              <div className="flex h-16 shrink-0 items-center justify-between border-b border-white/10 px-4">
                <Brand user={user} />
                <button type="button" className="rounded-md p-2 text-white/90 hover:bg-white/10" aria-label="Close navigation" onClick={() => setDrawer(false)}>
                  <X className="h-5 w-5" strokeWidth={1.5} />
                </button>
              </div>
              <div className="pt-3">
                <ProfileBlock user={user} />
              </div>
              <SideNav user={user} />
            </aside>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-[var(--adm-border)] bg-[var(--adm-card)] px-4 sm:px-6">
            <button
              type="button"
              className="-ml-1 rounded-md p-2 hover:bg-[var(--adm-zebra)] lg:hidden"
              aria-label="Open navigation"
              aria-expanded={drawer}
              onClick={() => setDrawer(true)}
            >
              <Menu className="h-5 w-5" strokeWidth={1.5} />
            </button>
            {/* On phones the logo sits in the top bar; on wide screens it heads the sidebar. */}
            <Link to={homePathFor(user)} className="shrink-0 lg:hidden" aria-label={`${PRODUCT[user.role] || 'ALU Ventures'} home`}>
              <img src="/alu-logo.png" alt="African Leadership University" className="h-7 w-auto max-w-none rounded-[3px]" />
            </Link>
            <ShellSearchBox />
            <div className="ml-auto">
              <UserMenu user={user} onSignOut={signOut} />
            </div>
          </header>
          <main className="adm min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
            <Outlet />
          </main>
        </div>
      </div>
    </ShellSearchProvider>
  );
}
