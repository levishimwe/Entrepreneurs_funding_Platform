import { useEffect, useRef, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ChevronRight, CircleHelp, FileText, Handshake, House, Mail, Menu, PenLine, Search, Settings, Trophy, User, Medal, X } from 'lucide-react';
import { useAuth, homePathFor } from '../context/AuthContext';
import { initials } from '../components/Avatar';

// Shell for graduates and investors: a light sidebar of text links (one thin
// grey outline icon each), a top bar with search, Explore, one outlined
// action, messages and the account menu. Colours come from the theme tokens,
// so Settings -> Appearance (light / dark) applies here too. Admin and staff
// keep AdminShell.

// [path, label, icon, match] — match decides the active item when the path alone is not enough.
const NAV = {
  graduate: [
    ['/app', 'Activity', House, (l) => l.pathname === '/app'],
    ['/app/projects', 'My project', FileText, (l) => /^\/app\/projects(\/\d+)?$/.test(l.pathname)],
    ['/app/editor', 'Editor', PenLine, (l) => l.pathname === '/app/editor' || /^\/app\/projects\/(new|\d+\/edit)$/.test(l.pathname)],
    ['/app/opportunities', 'Opportunities', Trophy, (l) => l.pathname === '/app/opportunities' && !l.search.includes('view=applied')],
    ['/app/opportunities?view=applied', 'Results', Medal, (l) => l.pathname === '/app/opportunities' && l.search.includes('view=applied')],
    ['/app/introductions', 'Introductions', Handshake],
    ['/app/contact', 'Help', CircleHelp],
  ],
  investor: [
    ['/app/activity', 'Activity', House],
    ['/app/discover', 'Ventures', Search],
    ['/app/introductions', 'Introductions', Handshake],
    ['/app/settings', 'Profile', User, (l) => l.pathname === '/app/settings'],
    ['/app/contact', 'Help', CircleHelp],
  ],
};
const SETTINGS = ['/app/settings/appearance', 'Settings', Settings, (l) => l.pathname.startsWith('/app/settings/')];

const TOP = {
  graduate: {
    search: (q) => `/ventures${q ? `?q=${encodeURIComponent(q)}` : ''}`,
    placeholder: 'Search ventures',
    explore: '/ventures',
    action: ['Submit a project', '/app/projects/new'],
  },
  investor: {
    search: (q) => `/app/discover${q ? `?q=${encodeURIComponent(q)}` : ''}`,
    placeholder: 'Search ventures',
    explore: '/opportunities',
    action: ['Find ventures', '/app/discover'],
  },
};

const ROLE_LABEL = { graduate: 'Graduate founder', investor: 'Investor / sponsor' };

// The member's own photo (served only to them), or initials on a neutral tile.
export function MemberAvatar({ user, size = 36 }) {
  const [failed, setFailed] = useState(false);
  const style = { width: size, height: size, fontSize: Math.round(size * 0.36) };
  if (user?.hasPhoto && !failed) {
    return (
      <img src="/api/account/photo" alt="" style={style} className="shrink-0 rounded-full object-cover ring-1 ring-line" onError={() => setFailed(true)} />
    );
  }
  return (
    <span
      style={style}
      className="flex shrink-0 items-center justify-center rounded-full bg-subtle font-semibold text-muted ring-1 ring-line"
      aria-hidden="true"
    >
      {initials(user?.fullName)}
    </span>
  );
}

function NavItem({ item, location, onNavigate }) {
  const [to, label, Icon, match] = item;
  const active = match ? match(location) : location.pathname === to || location.pathname.startsWith(`${to}/`);
  return (
    <li>
      <Link
        to={to}
        onClick={onNavigate}
        aria-current={active ? 'page' : undefined}
        className={`flex h-10 items-center gap-3 rounded-lg px-3 text-[14px] transition-colors ${active ? 'bg-accent-soft font-semibold text-ink' : 'text-muted hover:bg-subtle hover:text-ink'}`}
      >
        <Icon className="h-[18px] w-[18px] shrink-0 text-muted" strokeWidth={1.5} aria-hidden="true" />
        {label}
      </Link>
    </li>
  );
}

function Sidebar({ user, location, onNavigate, drawer = false }) {
  return (
    <div className="flex h-full flex-col">
      <Link to="/app/settings" onClick={onNavigate} className={`mx-3 mt-4 flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-subtle ${drawer ? 'mr-14' : ''}`}>
        <MemberAvatar user={user} />
        <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-ink">{user.fullName}</span>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted" strokeWidth={1.5} aria-hidden="true" />
      </Link>
      <div className="mx-5 my-3 border-t border-line" />
      <nav aria-label="Main" className="flex-1 overflow-y-auto px-3">
        <ul className="space-y-0.5">
          {(NAV[user.role] || []).map((item) => (
            <NavItem key={item[1]} item={item} location={location} onNavigate={onNavigate} />
          ))}
        </ul>
      </nav>
      <div className="border-t border-line px-3 py-3">
        <ul>
          <NavItem item={SETTINGS} location={location} onNavigate={onNavigate} />
        </ul>
      </div>
    </div>
  );
}

function AccountMenu({ user, onSignOut }) {
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
  const item = 'block px-4 py-2 text-left text-[13px] text-ink hover:bg-subtle';
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="flex rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        onClick={() => setOpen((o) => !o)}
      >
        <MemberAvatar user={user} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-[0_8px_24px_rgba(16,24,40,0.12)]"
        >
          <div className="border-b border-line px-4 py-2.5">
            <p className="truncate text-[13px] font-semibold text-ink">{user.fullName}</p>
            <p className="text-[12px] text-muted">
              {ROLE_LABEL[user.role]}
              {!user.approved ? ' · pending review' : ''}
            </p>
          </div>
          <Link role="menuitem" to="/app/settings" className={item} onClick={() => setOpen(false)}>
            Account settings
          </Link>
          {user.role === 'investor' && (
            <Link role="menuitem" to="/app/billing" className={item} onClick={() => setOpen(false)}>
              Billing &amp; plans
            </Link>
          )}
          <Link role="menuitem" to="/app/contact" className={item} onClick={() => setOpen(false)}>
            Contact admin
          </Link>
          <button role="menuitem" type="button" className={`${item} w-full border-t border-line`} onClick={onSignOut}>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export default function MemberShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [drawer, setDrawer] = useState(false);
  const [q, setQ] = useState('');
  useEffect(() => setDrawer(false), [location.pathname, location.search]);
  const top = TOP[user.role];
  // Only approved graduates can submit; the action is hidden until then.
  const showAction = user.role !== 'graduate' || user.approved;

  const signOut = async () => {
    await logout();
    navigate('/signin');
  };

  return (
    <div className="flex min-h-screen bg-canvas font-sans text-ink">
      <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 border-r border-line bg-surface lg:block">
        <Sidebar user={user} location={location} />
      </aside>
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close menu" onClick={() => setDrawer(false)} />
          <aside className="member-drawer relative h-full w-[280px] max-w-[85vw] border-r border-line bg-surface">
            <button
              type="button"
              className="absolute right-3 top-4 rounded-md p-1.5 text-muted hover:bg-subtle"
              aria-label="Close menu"
              onClick={() => setDrawer(false)}
            >
              <X className="h-5 w-5" strokeWidth={1.5} />
            </button>
            <Sidebar user={user} location={location} onNavigate={() => setDrawer(false)} drawer />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-line bg-surface">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-10">
            <button
              type="button"
              className="-ml-1 rounded-md p-2 text-muted hover:bg-subtle lg:hidden"
              aria-label="Open menu"
              aria-expanded={drawer}
              onClick={() => setDrawer(true)}
            >
              <Menu className="h-5 w-5" strokeWidth={1.5} />
            </button>
            <Link to={homePathFor(user)} className="shrink-0 lg:hidden" aria-label="ALU Ventures home">
              <img src="/alu-logo.png" alt="African Leadership University" className="h-7 w-auto max-w-none rounded-[3px]" />
            </Link>
            <form
              role="search"
              className="relative hidden w-full max-w-[300px] sm:block"
              onSubmit={(e) => {
                e.preventDefault();
                navigate(top.search(q.trim()));
              }}
            >
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" strokeWidth={1.5} aria-hidden="true" />
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={top.placeholder}
                aria-label={top.placeholder}
                className="h-10 w-full rounded-lg border border-line bg-surface pl-9 pr-3 text-[14px] text-ink outline-none placeholder:text-muted focus:border-accent focus:ring-[3px] focus:ring-accent/15"
              />
            </form>
            <Link to={top.explore} className="hidden text-[14px] font-medium text-muted hover:text-ink md:inline">
              Explore
            </Link>
            <div className="ml-auto flex items-center gap-2 sm:gap-4">
              {showAction && (
                <Link
                  to={top.action[1]}
                  className="hidden h-9 items-center rounded-lg border border-accent px-4 text-[14px] font-semibold text-accent transition-colors hover:bg-accent-soft sm:inline-flex"
                >
                  {top.action[0]}
                </Link>
              )}
              {/* Messages with the ALU Ventures team (Contact admin threads). There is no in-app notification feed yet, so no bell. */}
              <Link to="/app/contact" className="rounded-md p-2 text-muted hover:bg-subtle hover:text-ink" aria-label="Messages">
                <Mail className="h-5 w-5" strokeWidth={1.5} />
              </Link>
              <AccountMenu user={user} onSignOut={signOut} />
            </div>
          </div>
        </header>
        <main className="adm min-w-0 flex-1 px-4 py-8 sm:px-6 lg:px-10">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

// Page body: a centre column (about 760px) and a right column (about 320px)
// that moves below the centre on narrow screens.
export function MemberColumns({ children, aside }) {
  return (
    <div className="mx-auto grid max-w-[1112px] gap-8 lg:grid-cols-[minmax(0,760px)_320px]">
      <div className="min-w-0 space-y-6">{children}</div>
      {aside && <aside className="min-w-0 space-y-6">{aside}</aside>}
    </div>
  );
}

export function MemberCard({ title, action, children, className = '' }) {
  return (
    <section className={`rounded-xl border border-line bg-surface ${className}`}>
      {title && (
        <div className="flex items-center justify-between gap-3 px-5 pt-5">
          <h2 className="!m-0 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
