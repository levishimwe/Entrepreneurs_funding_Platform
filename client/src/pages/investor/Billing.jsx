import { useEffect, useState } from 'react';
import { BadgeCheck, CheckCircle2, Clock, Gift, Landmark, Rocket, X } from 'lucide-react';
import { Breadcrumb } from '../../components/kit';

// Planned tiers (FR01): shown as a non-functional placeholder. Every plan
// button opens "Coming Soon". Nothing here collects or processes payment.
const PLANS = [
  {
    name: 'Community Partner',
    badge: ['Active tier', 'bg-green-50 text-green-700 ring-green-600/25 dark:bg-green-500/15 dark:text-green-300'],
    blurb: 'Diligence access for angel syndicates and ecosystem supporters during the ALU pilot.',
    price: 'Free',
    priceNote: 'Every feature is free during the pilot',
    features: ['Browse every approved ALU graduate venture', 'Request introductions to founders', 'Confirm follow-ups and investments', 'Email notifications for every decision'],
    cta: 'Current Plan',
    current: true,
  },
  {
    name: 'Syndicate Pro',
    badge: ['Planned', 'bg-slate-100 text-slate-700 ring-slate-500/25 dark:bg-slate-500/20 dark:text-slate-300'],
    blurb: 'Possible future tier for active investment teams.',
    price: '$120',
    unit: '/ month',
    priceNote: 'Planned price — not available',
    features: ['Saved searches and alerts', 'Early access to hackathon showcases', 'Advanced sector and cohort filters'],
    cta: 'Upgrade to Pro',
    icon: Rocket,
  },
  {
    name: 'Institutional Gateway',
    badge: ['Planned', 'bg-slate-100 text-slate-700 ring-slate-500/25 dark:bg-slate-500/20 dark:text-slate-300'],
    blurb: 'Possible future tier for multi-seat institutional funds.',
    price: '$450',
    unit: '/ month',
    priceNote: 'Planned price — not available',
    features: ['Multiple team seats', 'Dedicated ALU Ventures liaison', 'Portfolio reporting exports'],
    cta: 'Contact Enterprise',
    icon: Landmark,
  },
];

const FAQ = [
  ['Why is ALU Ventures free today?', 'During the capstone pilot every feature is free for graduates, investors, sponsors and ALU staff. The platform does not collect payment information, charge fees or process transactions.'],
  ['How might billing work in the future?', 'Paid tiers for investors and sponsors are a possible future direction only. They would need a payment provider, billing records, privacy and regulatory review and separate testing before launch.'],
  ['Does ALU Ventures take equity or introduction fees?', 'No. The platform records introductions and confirmed investment outcomes only. Investors and founders agree any investment directly between themselves.'],
];

function ComingSoon({ plan, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="soon-title" className="card w-full max-w-md p-6 text-center shadow-xl">
        <button type="button" onClick={onClose} className="float-right rounded p-1 text-muted hover:bg-subtle" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent">
          <Clock className="h-6 w-6" aria-hidden="true" />
        </div>
        <h2 id="soon-title" className="mt-3 text-xl font-semibold">
          Coming Soon
        </h2>
        <p className="mt-2 text-sm text-muted">
          {plan} is a planned tier and is not available yet. ALU Ventures is free during the pilot and does not take payments.
          You do not need to do anything.
        </p>
        <button type="button" className="btn-primary mt-5 w-full" onClick={onClose} autoFocus>
          Got it
        </button>
      </div>
    </div>
  );
}

// Investor Billing & Premium Plans (Figma) — non-functional placeholder.
export default function Billing() {
  const [soon, setSoon] = useState(null);
  useEffect(() => {
    document.title = 'Billing & premium plans · ALU Ventures';
  }, []);

  return (
    <>
      <div className="mb-5 flex flex-col gap-2 rounded-lg border border-blue-200 bg-accent-soft/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-blue-500/30">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent text-white">
            <Gift className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-semibold">Complimentary Access Pilot</p>
            <p className="text-xs text-muted">All introductions and venture discovery are free for approved investors and sponsors during the ALU pilot.</p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded bg-surface px-2 py-1 text-[11px] font-medium ring-1 ring-line">
          <span className="h-2 w-2 rounded-full bg-green-500" aria-hidden="true" /> Pilot active
        </span>
      </div>

      <Breadcrumb items={[['Investor portal', '/app/discover'], ['Billing & Access']]} />
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Investor Tier &amp; Platform Access</h1>
          <p className="mt-1 max-w-xl text-sm text-muted">ALU Ventures connects investors and sponsors with verified ALU graduate founders. Paid tiers below are planned for the future and are not available.</p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-surface px-2.5 py-1.5 text-xs ring-1 ring-line">
          <BadgeCheck className="h-3.5 w-3.5 text-green-600" aria-hidden="true" /> Approved investor account
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {PLANS.map((p) => (
          <article key={p.name} className={`card flex flex-col p-5 ${p.current ? 'ring-1 ring-green-500/40' : ''}`}>
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold">{p.name}</h2>
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ring-1 ring-inset ${p.badge[1]}`}>{p.badge[0]}</span>
            </div>
            <p className="mt-1 text-sm text-muted">{p.blurb}</p>
            <p className="mt-4 text-3xl font-semibold tabular-nums">
              {p.price}
              {p.unit && <span className="text-sm font-normal text-muted"> {p.unit}</span>}
            </p>
            <p className={`text-xs ${p.current ? 'text-green-700 dark:text-green-400' : 'text-muted'}`}>{p.priceNote}</p>
            <ul className="mt-4 flex-1 space-y-2">
              {p.features.map((f) => (
                <li key={f} className="flex gap-2 text-sm">
                  <CheckCircle2 className={`mt-0.5 h-4 w-4 shrink-0 ${p.current ? 'text-green-600' : 'text-accent'}`} aria-hidden="true" /> {f}
                </li>
              ))}
            </ul>
            <button
              type="button"
              className={`mt-5 w-full ${p.current ? 'btn-secondary' : p.name === 'Syndicate Pro' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setSoon(p.name)}
            >
              {p.current ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : p.icon && <p.icon className="h-4 w-4" aria-hidden="true" />} {p.cta}
            </button>
          </article>
        ))}
      </div>

      <section className="card mt-5 flex gap-3 p-5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-subtle ring-1 ring-line">
          <Landmark className="h-5 w-5 text-muted" aria-hidden="true" />
        </span>
        <div>
          <h2 className="flex flex-wrap items-center gap-2 font-semibold">
            Zero Platform Transaction Fees
            <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase text-accent">Free pilot</span>
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            ALU Ventures does not take payments, equity or introduction fees, and there are no payment fields anywhere on the
            platform. Introductions and investment outcomes are recorded for transparency only.
          </p>
        </div>
      </section>

      <section className="card mt-5 overflow-hidden">
        <h2 className="border-b border-line bg-subtle px-5 py-3 text-[11px] font-semibold uppercase tracking-wider">Frequently asked questions</h2>
        <dl className="divide-y divide-line">
          {FAQ.map(([q, a]) => (
            <div key={q} className="grid gap-2 px-5 py-4 md:grid-cols-[18rem_minmax(0,1fr)]">
              <dt className="font-semibold">{q}</dt>
              <dd className="text-sm text-muted">{a}</dd>
            </div>
          ))}
        </dl>
      </section>

      {soon && <ComingSoon plan={soon} onClose={() => setSoon(null)} />}
    </>
  );
}
