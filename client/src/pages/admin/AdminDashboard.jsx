import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardCheck, TriangleAlert, UserCheck, Users } from 'lucide-react';
import { api } from '../../lib/api';
import { Alert, PageHeader, PageLoader, StatCard } from '../../components/ui';

// FR11: the 12 platform-wide totals, computed live by the API.
export default function AdminDashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    document.title = 'Admin dashboard · ALU Ventures';
    api.get('/admin/dashboard').then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <Alert type="error">{error}</Alert>;
  if (!data) return <PageLoader />;
  const q = data.queues;

  return (
    <>
      <PageHeader
        title="Administrator Dashboard"
        description="Platform-wide totals and the review queues that need attention."
        actions={
          <Link to="/app/admin/projects" className="btn-primary">
            <ClipboardCheck className="h-4 w-4" aria-hidden="true" /> Open verification queue
          </Link>
        }
      />
      <div className="mb-6 grid gap-3 md:grid-cols-3">
        {[
          { to: '/app/admin/graduates', icon: UserCheck, label: 'Graduates awaiting approval', n: q.pendingGraduates },
          { to: '/app/admin/investors', icon: Users, label: 'Investors awaiting approval', n: q.pendingInvestors },
          { to: '/app/admin/projects?status=similarity_flagged', icon: TriangleAlert, label: 'Similarity flags to resolve', n: q.similarityFlagged },
        ].map(({ to, icon: Icon, label, n }) => (
          <Link key={to} to={to} className={`card flex items-center gap-3 p-4 hover:shadow-sm ${n ? 'border-amber-300 dark:border-amber-500/40' : ''}`}>
            <Icon className={`h-5 w-5 ${n ? 'text-amber-600' : 'text-muted'}`} aria-hidden="true" />
            <span className="flex-1 text-sm">{label}</span>
            <span className="text-lg font-semibold tabular-nums">{n}</span>
          </Link>
        ))}
      </div>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Platform analytics</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {data.cards.map((c) => (
          <StatCard key={c.key} label={c.label} value={c.value} hint={c.hint} tone={c.tone} />
        ))}
      </div>
    </>
  );
}
