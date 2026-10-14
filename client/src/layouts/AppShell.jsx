import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  BadgeCheck,
  Briefcase,
  ClipboardCheck,
  CreditCard,
  FolderKanban,
  Gauge,
  Handshake,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  Search,
  Settings,
  SlidersHorizontal,
  Trophy,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import Logo from '../components/Logo';
import { useAuth } from '../context/AuthContext';
import { Pill } from '../components/ui';
import Avatar from '../components/Avatar';

// Only real features for the signed-in role (no Figma placeholders such as
// Admin Operations for graduates, Disbursements, Cap Table or tokens).
const NAV = {
  graduate: [
    {
      section: 'Workspace',
      items: [
        { to: '/app', label: 'Graduate Dashboard', icon: LayoutDashboard, end: true },
        { to: '/app/projects', label: 'My Projects', icon: FolderKanban },
        { to: '/app/opportunities', label: 'Hackathons & Grants', icon: Trophy },
        { to: '/app/introductions', label: 'Investor Introductions', icon: Handshake },
      ],
    },
  ],
  investor: [
    {
      section: 'Explore',
      items: [
        { to: '/app/discover', label: 'Browse Projects', icon: Search },
        { to: '/app/introductions', label: 'My Introductions', icon: Handshake },
      ],
    },
    {
      section: 'Account',
      items: [{ to: '/app/billing', label: 'Billing & Premium Plans', icon: CreditCard }],
    },
  ],
  admin: [
    {
      section: 'Workspace',
      items: [
        { to: '/app/admin', label: 'Dashboard', icon: Gauge, end: true },
        { to: '/app/admin/projects', label: 'Project Verification', icon: ClipboardCheck },
        { to: '/app/admin/graduates', label: 'Graduate Approvals', icon: UserCheck },
        { to: '/app/admin/investors', label: 'Investor Approvals', icon: Users },
        { to: '/app/admin/introductions', label: 'Introductions & Funding', icon: Handshake },
        { to: '/app/admin/opportunities', label: 'Hackathons & Grants', icon: Trophy },
      ],
    },
    {
      section: 'Management',
      items: [
        { to: '/app/admin/outbox', label: 'Email Outbox', icon: Mail },
        { to: '/app/admin/config', label: 'Rules & Thresholds', icon: SlidersHorizontal },
      ],
    },
  ],
  staff: [
    {
      section: 'Workspace console',
      items: [
        { to: '/app/staff', label: 'Hackathons & Opportunities', icon: Trophy, end: true },
        { to: '/app/staff/selection', label: 'Staff Selection', icon: Briefcase },
      ],
    },
  ],
};

const ROLE_LABEL = { graduate: 'Graduate Founder', investor: 'Investor / Sponsor', admin: 'Administrator', staff: 'ALU Staff' };

function NavItem({ to, label, icon: Icon, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `relative flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors ${
          isActive
            ? 'bg-accent-soft font-semibold text-accent before:absolute before:inset-y-1 before:left-0 before:w-0.5 before:rounded-full before:bg-accent'
            : 'text-ink hover:bg-subtle'
        }`
      }
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="truncate">{label}</span>
    </NavLink>
  );
}

export default function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [location.pathname]);

  const sections = [...(NAV[user.role] || []), { section: 'Settings', items: [{ to: '/app/settings', label: 'Account Settings', icon: Settings }] }];
  const signOut = async () => {
    await logout();
    navigate('/signin');
  };

  const sidebar = (
    <nav className="flex h-full flex-col gap-5 px-3 py-4" aria-label="Dashboard">
      {sections.map((section) => (
        <div key={section.section}>
          <p className="mb-1.5 px-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted">{section.section}</p>
          <ul className="space-y-0.5">
            {section.items.map((item) => (
              <li key={item.to}>
                <NavItem {...item} />
              </li>
            ))}
          </ul>
        </div>
      ))}
      <div className="mt-auto rounded-md border border-line bg-subtle px-2.5 py-2 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-green-500" aria-hidden="true" />
          All platform services are free
        </span>
      </div>
    </nav>
  );

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center border-b border-line bg-surface">
        <div className="flex h-full items-center gap-2 px-3 lg:w-60 lg:border-r lg:border-line">
          <button
            type="button"
            className="rounded-md p-2 text-muted hover:bg-subtle lg:hidden"
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? 'Close navigation' : 'Open navigation'}
            aria-expanded={open}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <Logo to="/" />
        </div>
        <div className="flex flex-1 items-center justify-end gap-3 px-3 sm:px-4">
          <span className="hidden sm:block">
            {user.approved ? (
              <Pill tone="green">
                <BadgeCheck className="h-3 w-3" aria-hidden="true" /> Verified {ROLE_LABEL[user.role]}
              </Pill>
            ) : (
              <Pill tone="amber">Pending review</Pill>
            )}
          </span>
          <span className="hidden h-6 w-px bg-line sm:block" aria-hidden="true" />
          <div className="flex items-center gap-2">
            <Avatar name={user.fullName} src={user.hasPhoto ? '/api/account/photo' : null} />
            <div className="hidden leading-tight md:block">
              <p className="text-sm font-medium">{user.fullName}</p>
              <p className="text-xs text-muted">{ROLE_LABEL[user.role]}</p>
            </div>
          </div>
          <button type="button" onClick={signOut} className="btn-secondary" aria-label="Sign out">
            <LogOut className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </header>

      <div className="flex flex-1">
        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-60 shrink-0 overflow-y-auto border-r border-line bg-surface lg:block">{sidebar}</aside>
        {open && (
          <div className="fixed inset-0 top-14 z-20 lg:hidden">
            <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close navigation" onClick={() => setOpen(false)} />
            <aside className="relative h-full w-64 overflow-y-auto border-r border-line bg-surface">{sidebar}</aside>
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-6xl">
              <Outlet />
            </div>
          </main>
          <footer className="border-t border-line bg-surface px-4 py-3 text-xs text-muted sm:px-6 lg:px-8">
            <div className="mx-auto max-w-6xl">© {new Date().getFullYear()} African Leadership University (ALU). All rights reserved.</div>
          </footer>
        </div>
      </div>
    </div>
  );
}
