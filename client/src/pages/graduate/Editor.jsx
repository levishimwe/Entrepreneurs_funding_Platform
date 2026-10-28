import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Loading, Messages } from '../../components/admin';
import { useMyProjects } from './MyProjects';

// The sidebar's Editor: opens the most recently updated project in the
// project form when it can still be revised (the server allows edits while
// pending review, after a revision request or once approved), otherwise its
// detail page, where documents and clarifications are added. With no project
// yet it starts a new one.
const EDITABLE = ['pending_review', 'revision_required', 'approved'];

export default function Editor() {
  const { user } = useAuth();
  const { projects, error } = useMyProjects();
  if (error) return <Messages error={error} />;
  if (!projects) return <Loading />;
  const latest = [...projects].filter((p) => p.status !== 'archived').sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))[0];
  if (!latest) {
    return user.approved ? (
      <Navigate to="/app/projects/new" replace />
    ) : (
      <p className="rounded-xl border border-line bg-surface px-5 py-4 text-[14px]">You can create a project once an administrator approves your account.</p>
    );
  }
  return <Navigate to={EDITABLE.includes(latest.status) ? `/app/projects/${latest.id}/edit` : `/app/projects/${latest.id}`} replace />;
}
