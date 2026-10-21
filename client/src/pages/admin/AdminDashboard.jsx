import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { AdminPage, Loading, Messages, StatTile } from '../../components/admin';

// Where each total leads (the filtered list behind it).
const LINKS = {
  graduates: '/app/admin/graduates?status=approved',
  investors: '/app/admin/investors?status=approved',
  opportunities: '/app/admin/opportunities',
  submitted: '/app/admin/projects?status=pending_review',
  approved: '/app/admin/projects?status=approved',
  seeking: '/app/admin/projects?status=approved',
  similarity: '/app/admin/projects?status=similarity_flagged',
  funded: '/app/admin/projects?status=funded',
  fundedByCompetition: '/app/admin/results?status=approved',
  oneInvestor: '/app/admin/projects?status=approved',
  limit: '/app/admin/projects?status=investor_limit_reached',
  introductions: '/app/admin/introductions?status=all',
  rdbRate: '/app/admin/projects?status=pending_review',
};

// FR11: what needs attention, then the platform totals, computed live.
export default function AdminDashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    document.title = 'Dashboard · ALU Ventures';
    api.get('/admin/dashboard').then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <AdminPage title="Dashboard"><Messages error={error} /></AdminPage>;
  if (!data) return <AdminPage title="Dashboard"><Loading /></AdminPage>;
  const q = data.queues;
  const attention = [
    ['Graduates to review', q.pendingGraduates, '/app/admin/graduates?status=pending'],
    ['Investors to review', q.pendingInvestors, '/app/admin/investors?status=pending'],
    ['Projects to review', q.pendingProjects, '/app/admin/projects?status=pending_review'],
    ['Similarity flags', q.similarityFlagged, '/app/admin/projects?status=similarity_flagged'],
    ['Competition results to approve', q.pendingResults, '/app/admin/results?status=pending'],
    ['Open requests', q.openRequests, '/app/admin/requests?status=open'],
  ].filter(([, n]) => n > 0);

  return (
    <AdminPage title="Dashboard">
      <section className="adm-card mb-6" aria-label="Needs attention">
        <h2 className="!m-0 border-b border-[var(--adm-border)] px-4 py-3">Needs attention</h2>
        {attention.length === 0 ? (
          <p className="adm-muted px-4 py-3">Nothing is waiting for review.</p>
        ) : (
          <ul>
            {attention.map(([label, n, to]) => (
              <li key={label} className="border-b border-[var(--adm-border)] last:border-0">
                <Link to={to} className="flex items-center justify-between px-4 py-3 hover:bg-[var(--adm-accent-soft)]">
                  <span className="adm-a">{label}</span>
                  <span className="adm-pill adm-pill-warning">{n}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
        {data.cards.map((c) => (
          <StatTile key={c.key} label={c.label} value={c.value} to={LINKS[c.key]} />
        ))}
      </div>
    </AdminPage>
  );
}
