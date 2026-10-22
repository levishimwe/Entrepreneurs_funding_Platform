import AdminShell from './AdminShell';

// Every signed-in role uses the same shell (navy bar, text sidebar, light
// canvas); the navigation differs by role.
export default function AppShell() {
  return <AdminShell />;
}
