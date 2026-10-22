import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import SuccessStories from '../components/SuccessStories';
import { StatTile } from '../components/admin';

const LINKS = [
  ['/ventures', 'Browse ventures', 'Approved ALU graduate projects.'],
  ['/verify', 'Verify a project', 'Check a project code.'],
  ['/opportunities', 'Opportunities', 'Hackathons, grants and competitions.'],
];

export default function Home() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    document.title = 'ALU Ventures';
    api
      .get('/public/stats')
      .then(setStats)
      .catch(() => setStats(null));
  }, []);

  return (
    <>
      <section className="bg-navy text-white">
        <div className="mx-auto max-w-6xl px-4 py-16 md:py-20">
          <h1 className="max-w-2xl text-[32px] font-semibold leading-tight tracking-tight sm:text-[40px]">Where ALU graduate ventures meet investors</h1>
          <p className="mt-4 max-w-xl text-[15px] text-white/75">Verified ventures, consent-based introductions and funding calls for ALU graduates.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/register" className="btn-primary h-10 px-5 text-[14px]">
              Get started
            </Link>
            <Link to="/signin" className="btn h-10 border-white/30 px-5 text-[14px] text-white hover:bg-white/10">
              Sign in
            </Link>
          </div>
          <p className="mt-6 text-[12px] text-white/60">Free for graduates, investors and sponsors.</p>
        </div>
      </section>

      <SuccessStories />

      <section className="mx-auto max-w-6xl px-4 py-10">
        <div className="grid gap-4 md:grid-cols-3">
          {LINKS.map(([to, title, body]) => (
            <Link key={to} to={to} className="adm-card block p-4 hover:border-[var(--adm-accent)]">
              <span className="adm-a block font-semibold">{title}</span>
              <span className="adm-muted block text-[12px]">{body}</span>
            </Link>
          ))}
        </div>
        {stats && (
          <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatTile label="Approved ventures" value={stats.approvedProjects} />
            <StatTile label="Verified graduates" value={stats.approvedGraduates} />
            <StatTile label="Open opportunities" value={stats.openOpportunities} />
            <StatTile label="Introductions made" value={stats.introductions} />
          </div>
        )}
        <p className="adm-hint mt-6">
          Investor or sponsor?{' '}
          <Link to="/register?role=investor" className="adm-a">
            Request investor access
          </Link>
        </p>
      </section>
    </>
  );
}
