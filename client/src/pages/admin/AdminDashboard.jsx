import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { AdminPage, Loading, Messages, TableWrap } from '../../components/admin';

// FR11: the review queues and the 12 platform-wide totals, computed live by the API.
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
  const queues = [
    ['Graduates awaiting approval', q.pendingGraduates, '/app/admin/graduates'],
    ['Investors awaiting approval', q.pendingInvestors, '/app/admin/investors'],
    ['Similarity flags to resolve', q.similarityFlagged, '/app/admin/projects?status=similarity_flagged'],
  ];

  return (
    <AdminPage title="Dashboard">
      <TableWrap>
        <table className="adm-table">
          <thead>
            <tr>
              <th>Item</th>
              <th className="adm-num">Number</th>
            </tr>
          </thead>
          <tbody>
            {queues.map(([label, n, to]) => (
              <tr key={label}>
                <td>
                  <Link className="adm-a" to={to}>
                    {label}
                  </Link>
                </td>
                <td className="adm-num">{n}</td>
              </tr>
            ))}
            {data.cards.map((c) => (
              <tr key={c.key}>
                <td title={c.hint || undefined}>{c.label}</td>
                <td className="adm-num">{c.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
    </AdminPage>
  );
}
