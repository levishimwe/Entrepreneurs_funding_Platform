import AdminShell from './AdminShell';
import MemberShell from './MemberShell';
import { useAuth } from '../context/AuthContext';

// Graduates and investors use the member shell (light sidebar, search top
// bar); administrators and staff keep the admin console shell.
export default function AppShell() {
  const { user } = useAuth();
  return ['graduate', 'investor'].includes(user?.role) ? <MemberShell /> : <AdminShell />;
}
