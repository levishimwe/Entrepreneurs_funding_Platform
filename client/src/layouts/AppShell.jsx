import { useEffect } from 'react';
import AdminShell from './AdminShell';
import MemberShell from './MemberShell';
import { applyTheme, useAuth } from '../context/AuthContext';

// Graduates and investors use the member shell (light sidebar, search top
// bar); administrators and staff keep the admin console shell.
export default function AppShell() {
  const { user } = useAuth();
  // The account's saved theme (Settings → Appearance), also when arriving from a public page.
  useEffect(() => applyTheme(user?.theme || 'light'), [user?.theme]);
  return ['graduate', 'investor'].includes(user?.role) ? <MemberShell /> : <AdminShell />;
}
