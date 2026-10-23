import { Navigate, useParams } from 'react-router-dom';
import { useAuth, homePathFor } from '../context/AuthContext';

// Home-page tiles link to /app/go/<target>; after sign-in this sends each
// role to its own page for that topic. The server still checks every role.
const TARGETS = {
  projects: { graduate: '/app/projects', investor: '/app/discover', admin: '/app/admin/projects', staff: '/app/staff' },
  opportunities: { graduate: '/app/opportunities', investor: '/opportunities', admin: '/app/admin/opportunities', staff: '/app/staff' },
  investors: { graduate: '/app/introductions', investor: '/app/introductions', admin: '/app/admin/investors', staff: '/app/staff' },
  graduates: { graduate: '/app', investor: '/app/discover', admin: '/app/admin/graduates', staff: '/app/staff/selection' },
};

export default function GoTo() {
  const { target } = useParams();
  const { user } = useAuth();
  return <Navigate to={TARGETS[target]?.[user.role] || homePathFor(user)} replace />;
}
