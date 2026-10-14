import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BadgeCheck, FileSearch, Handshake, ScanSearch, ShieldCheck, Trophy, UploadCloud } from 'lucide-react';
import { api } from '../lib/api';

const STEPS = [
  { icon: UploadCloud, title: '1. Submit & verify', body: 'Graduates submit their venture with RDB evidence or an idea declaration. OCR pre-checks support — never replace — administrator review.' },
  { icon: ScanSearch, title: '2. Review & publish', body: 'Administrators review flags, similarity matches and evidence, then publish an approved public profile with a unique project code.' },
  { icon: Handshake, title: '3. Connect', body: 'Approved investors request introductions. Contact details are only shared after the graduate accepts.' },
];

const CAPABILITIES = [
  { icon: ShieldCheck, title: 'RDB-verified projects', body: 'Company submissions are checked against Rwanda Development Board certificates with fuzzy name matching and human review.' },
  { icon: Handshake, title: 'Consent-based introductions', body: 'Investors request an introduction; graduates accept or decline before any contact details are exchanged.' },
  { icon: Trophy, title: 'Hackathons & funding calls', body: 'ALU staff publish hackathons, grants and competitions. Eligibility is checked automatically on application.' },
];

export default function Home() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    document.title = 'ALU Ventures — Where ALU graduate ventures meet global capital';
    api
      .get('/public/stats')
      .then(setStats)
      .catch(() => setStats(null));
  }, []);

  return (
    <>
      {/* Hero */}
      <section className="bg-black">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 md:grid-cols-2 md:py-24">
          <div>
            <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-[#9198a1]">
              <BadgeCheck className="h-3.5 w-3.5 text-[#3fb950]" aria-hidden="true" />
              Built for ALU graduate entrepreneurs in Kigali
            </p>
            <h1 className="text-4xl font-semibold leading-tight tracking-tight text-white sm:text-5xl">
              Where ALU graduate ventures meet global capital
            </h1>
            <p className="mt-5 max-w-xl text-base text-[#9198a1]">
              Present verified ventures, reach investors and sponsors through consent-based introductions, and apply to
              hackathons and funding calls — free for every graduate.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/register" className="btn-cta px-5 py-2.5 text-base">
                Get Started
              </Link>
              <Link to="/ventures" className="btn border-white/20 px-5 py-2.5 text-base text-white hover:bg-white/10">
                Browse Projects
              </Link>
            </div>
            <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-xs text-[#9198a1]">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-[#3fb950]" /> Free for graduates & investors
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-[#58a6ff]" /> Administrator-reviewed
              </span>
            </div>
          </div>

          {/* Verification console, as in the Figma hero */}
          <div className="rounded-lg border border-white/10 bg-[#0d1117] font-mono text-xs shadow-2xl">
            <div className="flex items-center gap-1.5 border-b border-white/10 px-4 py-2.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#27c93f]" />
              <span className="ml-3 text-[#6e7681]">verify-a-project</span>
            </div>
            <div className="space-y-3 p-5 text-[#c9d1d9]">
              <p className="text-[#6e7681]"># Anyone can confirm an approved venture by its code</p>
              <p>
                <span className="text-[#3fb950]">$</span> verify <span className="text-[#79c0ff]">ALU-2026-7KQ4M</span>
              </p>
              <div className="rounded-md border border-white/10 bg-black/40 p-4 leading-relaxed">
                <p>{'{'}</p>
                <p className="pl-4">
                  <span className="text-[#79c0ff]">"project"</span>: <span className="text-[#a5d6ff]">"AgriFlow Logistics Ltd"</span>,
                </p>
                <p className="pl-4">
                  <span className="text-[#79c0ff]">"sector"</span>: <span className="text-[#a5d6ff]">"Agriculture"</span>,
                </p>
                <p className="pl-4">
                  <span className="text-[#79c0ff]">"status"</span>: <span className="text-[#3fb950]">"Approved"</span>,
                </p>
                <p className="pl-4">
                  <span className="text-[#79c0ff]">"founder"</span>: <span className="text-[#a5d6ff]">"Verified ALU graduate"</span>
                </p>
                <p>{'}'}</p>
              </div>
              <p className="text-[#3fb950]">✓ Approved platform record found</p>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-white/10 bg-[#0d1117]">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="text-center text-3xl font-semibold tracking-tight text-white">Architecture built for the ALU ecosystem</h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-sm text-[#9198a1]">
            One shared record of submissions, evidence and decisions — so graduates see their status and staff can make
            traceable decisions.
          </p>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {STEPS.map(({ icon: Icon, title, body }) => (
              <div key={title} className="rounded-lg border border-white/10 bg-[#161b22] p-5">
                <Icon className="h-5 w-5 text-[#58a6ff]" aria-hidden="true" />
                <h3 className="mt-3 text-sm font-semibold text-white">{title}</h3>
                <p className="mt-1.5 text-sm text-[#9198a1]">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Capabilities */}
      <section className="border-t border-white/10 bg-black">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="text-2xl font-semibold tracking-tight text-white">Institutional-grade platform capabilities</h2>
          <p className="mt-2 text-sm text-[#9198a1]">Assisted review, clear consent and recorded decisions at every step.</p>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {CAPABILITIES.map(({ icon: Icon, title, body }) => (
              <div key={title} className="rounded-lg border border-white/10 bg-[#0d1117] p-5">
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[#1f6feb]/15 text-[#58a6ff]">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <h3 className="mt-4 font-semibold text-white">{title}</h3>
                <p className="mt-2 text-sm text-[#9198a1]">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Live numbers */}
      {stats && (
        <section className="border-t border-white/10 bg-[#0d1117]">
          <dl className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-12 md:grid-cols-4">
            {[
              ['Approved ventures', stats.approvedProjects],
              ['Verified graduates', stats.approvedGraduates],
              ['Open opportunities', stats.openOpportunities],
              ['Introductions made', stats.introductions],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-[#9198a1]">{label}</dt>
                <dd className="mt-1 text-3xl font-semibold tabular-nums text-white">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {/* Verify CTA + final CTA */}
      <section className="border-t border-white/10 bg-black">
        <div className="mx-auto max-w-6xl px-4 py-16 text-center">
          <FileSearch className="mx-auto h-8 w-8 text-[#58a6ff]" aria-hidden="true" />
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-white">Ready to get your venture verified?</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-[#9198a1]">
            Register with your ALU alumni email, upload your degree certificate and submit your venture for review.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link to="/register" className="btn-cta px-5 py-2.5 text-base">
              Get Started <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link to="/verify" className="btn border-white/20 px-5 py-2.5 text-base text-white hover:bg-white/10">
              Verify a Project
            </Link>
          </div>
          <p className="mt-4 text-xs text-[#6e7681]">
            Investor or sponsor?{' '}
            <Link to="/register?role=investor" className="text-[#58a6ff] hover:underline">
              Request investor access
            </Link>
          </p>
        </div>
      </section>
    </>
  );
}
