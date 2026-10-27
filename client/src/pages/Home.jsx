import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BadgeCheck,
  Briefcase,
  CalendarCheck,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Compass,
  DoorOpen,
  FileSearch,
  Gift,
  GraduationCap,
  Handshake,
  Hourglass,
  ListChecks,
  Mail,
  MailCheck,
  Pause,
  Play,
  Rocket,
  ScrollText,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Timer,
  Trophy,
  UserCheck,
  X,
  Zap,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { ARROW, GHOST, PRIMARY, SiteFooter, SiteHeader, useGated } from '../components/site/SiteChrome';

// Public landing page, built from the "Landing — polished" design (dark
// theme). Live numbers come from /public/banner-stats; the product panels
// (venture list, opportunity card, introduction) are labelled examples.
// Motion is decoration only and switches off with reduced motion.

const CARD = 'rounded-2xl border border-white/[0.08] bg-white/[0.03]';
const EYEBROW = 'text-[12px] font-semibold uppercase tracking-[1.6px] text-[#60a5fa]';
const H2 = 'text-[36px] font-medium leading-[1.08] tracking-[-1.2px] text-white sm:text-[44px] lg:text-[52px] lg:tracking-[-1.6px]';

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// ---- Motion helpers -------------------------------------------------------------------------

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

// True once the element has scrolled into view (and stays true).
function useInView(threshold = 0.15) {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    if (!('IntersectionObserver' in window)) {
      setInView(true);
      return undefined;
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setInView(true);
          io.disconnect();
        }
      },
      { threshold, rootMargin: '0px 0px -6% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return [ref, inView];
}

// Like useInView, but also turns false again when the element leaves the screen.
function useOnScreen() {
  const ref = useRef(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || !('IntersectionObserver' in window)) {
      setOn(true);
      return undefined;
    }
    const io = new IntersectionObserver(([e]) => setOn(e.isIntersecting), { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return [ref, on];
}

function Reveal({ as: Tag = 'div', from = 'up', delay = 0, className = '', style, children, ...rest }) {
  const [ref, inView] = useInView();
  const dir = from === 'up' ? '' : `reveal-${from}`;
  return (
    <Tag ref={ref} className={`reveal ${dir} ${inView ? 'is-in' : ''} ${className}`} style={{ '--reveal-delay': `${delay}ms`, ...style }} {...rest}>
      {children}
    </Tag>
  );
}

// Counts up from 0 when it first scrolls into view.
function CountUp({ value, prefix = '', suffix = '' }) {
  const reduced = useReducedMotion();
  const [ref, inView] = useInView(0.4);
  const [shown, setShown] = useState(reduced ? value : 0);
  useEffect(() => {
    if (!inView || reduced || !value) {
      setShown(value);
      return undefined;
    }
    let raf;
    const start = performance.now();
    const tick = (t) => {
      const p = Math.min(1, (t - start) / 1400);
      setShown(Math.round(value * (1 - (1 - p) ** 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, reduced, value]);
  return (
    <span ref={ref} className="tabular-nums">
      {prefix}
      {shown.toLocaleString('en-GB')}
      {suffix}
    </span>
  );
}

function useBannerStats() {
  const [stats, setStats] = useState(null);
  useEffect(() => {
    api
      .get('/public/banner-stats')
      .then((d) => setStats(['verifiedGraduates', 'approvedProjects', 'investors', 'introductions'].every((k) => Number.isFinite(d?.[k])) ? d : null))
      .catch(() => setStats(null));
  }, []);
  return stats;
}

// ---- Hero -------------------------------------------------------------------------------------

const QUICK_PATHS = [
  { label: 'Submit a venture', icon: Rocket, gated: '/app/go/projects' },
  { label: 'Apply to a hackathon', icon: Trophy, to: '/opportunities' },
  { label: 'Find ventures to back', icon: Search, to: '/ventures' },
  { label: 'Verify a project', icon: BadgeCheck, to: '/verify' },
];

const PROOF = [
  { value: 100, suffix: '%', label: 'Ventures reviewed by an administrator' },
  { value: 0, prefix: '$', label: 'Fees for graduates, investors and sponsors' },
  { value: 3, suffix: ' checks', label: 'Before a graduate can submit a venture' },
  { text: 'Opt-in', label: 'Contact shared only when founders accept' },
];

function LiveDot({ size = 8 }) {
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }} aria-hidden="true">
      <span className="land-ping absolute inset-0 rounded-full bg-[#4ade80]" />
      <span className="relative inline-flex h-full w-full rounded-full bg-[#4ade80] shadow-[0_0_8px_#4ade8099]" />
    </span>
  );
}

const HEADLINE = 'Where verified ALU graduate ventures meet investors';

function Hero({ stats }) {
  const gated = useGated();
  return (
    <section className="relative overflow-hidden bg-[#070d18] px-4 pb-24 pt-20 sm:px-8 lg:px-16 lg:pb-24 lg:pt-28">
      <div
        className="land-glow pointer-events-none absolute left-1/2 top-0 h-[120%] w-[130%] -translate-x-1/2"
        style={{ background: 'radial-gradient(50% 50% at 50% 0%, rgba(37,99,235,0.22), rgba(37,99,235,0) 100%)' }}
        aria-hidden="true"
      />
      <div className="relative mx-auto flex max-w-[1120px] flex-col items-center text-center">
        <p
          className={`inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] py-1.5 pl-2.5 pr-3.5 text-[13px] font-medium text-white/70 transition-opacity duration-700 ${
            stats ? 'opacity-100' : 'opacity-0'
          }`}
          aria-hidden={!stats}
        >
          <LiveDot />
          {stats ? `${plural(stats.verifiedGraduates, 'verified graduate')} · ${plural(stats.approvedProjects, 'approved venture')}` : 'Loading'}
        </p>
        <h1 className="mt-7 max-w-[1000px] text-[44px] font-medium leading-[1.04] tracking-[-1.4px] text-white sm:text-[60px] sm:tracking-[-2px] lg:text-[76px] lg:tracking-[-2.6px]">
          {HEADLINE.split(' ').map((w, i) => (
            <span key={i}>
              <span className="land-word" style={{ '--d': `${120 + i * 70}ms` }}>
                {w}
              </span>{' '}
            </span>
          ))}
        </h1>
        <p className="land-rise mt-6 max-w-[700px] text-[17px] leading-[1.55] text-white/70 sm:text-[19px]" style={{ '--d': '650ms' }}>
          Present reviewed ventures, reach investors and sponsors through consent-based introductions, and apply to hackathons and funding calls.
        </p>
        <div className="land-rise mt-10 flex w-full flex-col items-stretch gap-3 sm:w-auto sm:flex-row sm:items-center" style={{ '--d': '800ms' }}>
          <Link to="/register" className={`${PRIMARY} h-[50px] px-[26px] text-[15px] shadow-[0_8px_24px_#2563eb55] hover:shadow-[0_12px_32px_#2563eb77]`}>
            Get started — it&apos;s free
            <ArrowRight className={ARROW} aria-hidden="true" />
          </Link>
          <Link to="/ventures" className={`${GHOST} h-[50px] px-6 text-[15px]`}>
            Browse ventures
          </Link>
        </div>
        <div className="land-rise mt-7 flex flex-wrap items-center justify-center gap-2.5" style={{ '--d': '950ms' }}>
          <span className="text-[13px] text-white/50">I want to</span>
          {QUICK_PATHS.map((q) => (
            <Link
              key={q.label}
              to={q.gated ? gated(q.gated) : q.to}
              className="group inline-flex h-[34px] items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-3.5 text-[13px] font-medium text-white/70 transition-all duration-300 hover:-translate-y-0.5 hover:border-[#3b82f655] hover:bg-[#3b82f61f] hover:text-white"
            >
              <q.icon className="h-3.5 w-3.5 text-[#60a5fa] transition-transform duration-300 group-hover:scale-110" aria-hidden="true" />
              {q.label}
            </Link>
          ))}
        </div>

        <dl className="mt-16 grid w-full grid-cols-2 border-t border-white/[0.08] py-7 text-left lg:mt-[88px] lg:grid-cols-4">
          {PROOF.map((p, i) => (
            <Reveal
              key={p.label}
              delay={i * 90}
              className={`flex flex-col-reverse gap-2 px-4 py-3 sm:px-7 lg:py-0 ${i % 2 ? 'border-l border-white/[0.08]' : ''} ${i === 2 ? 'lg:border-l lg:border-white/[0.08]' : ''}`}
            >
              <dt className="text-[13px] leading-[1.45] text-white/50">{p.label}</dt>
              <dd className="text-[32px] font-medium tracking-[-1.2px] text-white sm:text-[40px]">
                {p.text || <CountUp value={p.value} prefix={p.prefix} suffix={p.suffix} />}
              </dd>
            </Reveal>
          ))}
        </dl>
      </div>
    </section>
  );
}

// ---- Why ALU Ventures -------------------------------------------------------------------------

const TRUST = [
  {
    icon: UserCheck,
    eyebrow: 'Verified graduates',
    title: 'Every founder is a real ALU graduate',
    body: 'Each founder registers with an ALU alumni email and a degree certificate, and an administrator reviews the account.',
    steps: ['Alumni email confirmed', 'Degree certificate received', 'Administrator approved'],
  },
  {
    icon: FileSearch,
    eyebrow: 'Document checks',
    title: 'Documents checked before approval',
    body: 'RDB certificates are pre-checked automatically, then an administrator approves, asks for a revision or rejects with a reason.',
    steps: ['RDB certificate · Likely valid', 'Similarity check · Clear', 'Decision recorded'],
  },
  {
    icon: Handshake,
    eyebrow: 'Consent-based introductions',
    title: 'Founders decide who gets their contact',
    body: 'Investors request an introduction. Contact details are shared only after the founder accepts.',
    steps: ['Introduction requested', 'Founder accepted', 'Contact details shared'],
  },
  {
    icon: Gift,
    eyebrow: 'Free for everyone',
    title: 'No fees for graduates, investors or sponsors',
    body: 'Submitting ventures, applying to opportunities, browsing projects and requesting introductions cost nothing.',
    steps: ['Graduates · Free', 'Investors · Free', 'Sponsors · Free'],
  },
];

function SectionHeading({ eyebrow, title, children, width = 620 }) {
  return (
    <Reveal className="flex flex-col items-center gap-4 text-center">
      <p className={EYEBROW}>{eyebrow}</p>
      <h2 className={H2}>{title}</h2>
      {children && (
        <p className="text-[17px] leading-[1.55] text-white/70" style={{ maxWidth: width }}>
          {children}
        </p>
      )}
    </Reveal>
  );
}

function TrustCard({ c, index }) {
  const [ref, inView] = useInView(0.3);
  return (
    <Reveal delay={index * 110} className="h-full">
      <article
        ref={ref}
        className={`${CARD} group flex h-full flex-col justify-between gap-5 p-7 transition-[transform,border-color,box-shadow] duration-500 hover:-translate-y-1.5 hover:border-[#3b82f655] hover:shadow-[0_24px_60px_-20px_#2563eb55] lg:min-h-[410px]`}
        style={{ backgroundImage: 'linear-gradient(180deg, #3b82f60f 0%, #3b82f600 60%)' }}
      >
        <div className="flex flex-col gap-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-[10px] border border-[#3b82f633] bg-[#3b82f61f] transition-transform duration-500 group-hover:rotate-[-6deg] group-hover:scale-110">
            <c.icon className="h-5 w-5 text-[#60a5fa]" aria-hidden="true" />
          </span>
          <p className="text-[11px] font-semibold uppercase tracking-[1.2px] text-[#60a5fa]">{c.eyebrow}</p>
          <h3 className="text-[21px] font-medium leading-[1.25] tracking-[-0.4px] text-white">{c.title}</h3>
          <p className="text-[14px] leading-[1.55] text-white/70">{c.body}</p>
        </div>
        <ul className="flex flex-col gap-2.5 border-t border-white/[0.08] pt-4">
          {c.steps.map((s, i) => (
            <li
              key={s}
              className={`flex items-center gap-2.5 text-[13px] text-white/70 transition-all duration-500 motion-reduce:transition-none ${inView ? 'translate-x-0 opacity-100' : '-translate-x-2 opacity-0'}`}
              style={{ transitionDelay: `${index * 110 + 300 + i * 160}ms` }}
            >
              <CircleCheck className="h-[15px] w-[15px] shrink-0 text-[#4ade80]" aria-hidden="true" />
              {s}
            </li>
          ))}
        </ul>
      </article>
    </Reveal>
  );
}

function WhyAluVentures() {
  return (
    <section id="why" className="scroll-mt-20 bg-[#070d18] px-4 py-20 sm:px-8 lg:px-16 lg:py-[120px]">
      <div className="mx-auto flex max-w-[1312px] flex-col gap-14">
        <SectionHeading eyebrow="Why ALU Ventures" title="Trust is built into every step">
          Founders are verified, documents are checked and contact is shared only with consent, so investors can act with confidence.
        </SectionHeading>
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {TRUST.map((c, i) => (
            <TrustCard key={c.eyebrow} c={c} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}

// ---- For investors ----------------------------------------------------------------------------

const INVESTOR_POINTS = [
  ['Search and filter', 'By sector, stage, country and registration.'],
  ['Verified records', 'Every venture approved by an administrator.'],
  ['One-click introductions', 'Founders accept before contact is shared.'],
  ['Track every step', 'From request to meeting to investment.'],
];

const EXAMPLE_VENTURES = [
  {
    initials: 'AC',
    color: '#16a34a',
    name: 'Apple crops developed',
    line: 'Affordable apples for every Rwandan household.',
    tags: ['Agriculture', 'Idea'],
    primary: true,
  },
  { initials: 'KC', color: '#0ea5e9', name: 'Kigali Cold Chain', line: 'Solar cold rooms for smallholder farmers.', tags: ['Logistics', 'Prototype / MVP'] },
  { initials: 'LL', color: '#a855f7', name: 'LearnLoop', line: 'Offline-first lessons for rural schools.', tags: ['Education', 'Early revenue'] },
];

function Chip({ label, active }) {
  return (
    <span
      className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-medium ${
        active ? 'border-[#3b82f655] bg-[#3b82f61f] text-[#60a5fa]' : 'border-white/[0.08] bg-white/[0.03] text-white/70'
      }`}
    >
      {label}
      {active ? <X className="h-3 w-3" aria-hidden="true" /> : <ChevronDown className="h-3 w-3 text-white/50" aria-hidden="true" />}
    </span>
  );
}

function BrowseMockup() {
  const [ref, inView] = useInView(0.25);
  const [hovered, setHovered] = useState(0);
  return (
    <figure
      ref={ref}
      aria-label="Example: how investors browse verified ventures"
      className="w-full overflow-hidden rounded-2xl border border-white/[0.16] bg-[#0b1424] shadow-[0_30px_80px_#00000080]"
    >
      <div className="flex items-center gap-3 border-b border-white/[0.08] px-5 py-4">
        <span className="text-[14px] font-semibold text-white">Ventures</span>
        <span className="rounded-full bg-[#3b82f61f] px-2 py-0.5 text-[11px] font-semibold text-[#60a5fa]">Verified</span>
        <span className="flex h-[34px] min-w-0 flex-1 items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3">
          <Search className="h-3.5 w-3.5 shrink-0 text-white/50" aria-hidden="true" />
          <span className="truncate text-[13px] text-white/50">Search ventures, sectors or countries</span>
        </span>
      </div>
      <div className="flex flex-wrap gap-2 border-b border-white/[0.08] px-5 py-3.5">
        {[
          ['Agriculture', true],
          ['Any stage', false],
          ['Rwanda', true],
          ['Registered or idea', false],
        ].map(([l, a], i) => (
          <span
            key={l}
            className={`transition-all duration-500 motion-reduce:transition-none ${inView ? 'scale-100 opacity-100' : 'scale-90 opacity-0'}`}
            style={{ transitionDelay: `${200 + i * 80}ms` }}
          >
            <Chip label={l} active={a} />
          </span>
        ))}
      </div>
      <ul className="flex flex-col p-2" onMouseLeave={() => setHovered(0)}>
        {EXAMPLE_VENTURES.map((v, i) => (
          <li
            key={v.name}
            onMouseEnter={() => setHovered(i)}
            className={`flex items-center gap-3.5 rounded-[10px] border p-3.5 transition-colors duration-300 ${
              hovered === i ? 'border-white/[0.08] bg-white/[0.06]' : 'border-transparent'
            } ${inView ? 'land-rise' : 'opacity-0'}`}
            style={{ '--d': `${i * 120 + 450}ms` }}
          >
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border text-[13px] font-bold"
              style={{ color: v.color, background: `${v.color}26`, borderColor: `${v.color}55` }}
              aria-hidden="true"
            >
              {v.initials}
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
              <span className="flex items-center gap-2 text-[14px] font-semibold text-white">
                <span className="truncate">{v.name}</span>
                <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-[#60a5fa]" aria-label="Verified" />
              </span>
              <span className="truncate text-[13px] text-white/50">{v.line}</span>
            </span>
            <span className="hidden items-center gap-1.5 sm:flex">
              {v.tags.map((t) => (
                <span key={t} className="whitespace-nowrap rounded-md bg-white/[0.06] px-2 py-[3px] text-[12px] text-white/70">
                  {t}
                </span>
              ))}
            </span>
            <span
              className={`inline-flex h-[30px] shrink-0 items-center rounded-full border px-3 text-[12px] font-semibold transition-colors duration-300 ${
                hovered === i ? 'border-[#2563eb] bg-[#2563eb] text-white' : 'border-white/[0.08] bg-white/[0.03] text-white/70'
              }`}
            >
              {v.primary || hovered === i ? 'Request intro' : 'View'}
            </span>
          </li>
        ))}
      </ul>
      <figcaption className="flex items-center gap-2 border-t border-white/[0.08] px-5 py-3.5 text-[12px] text-white/50">
        <ShieldCheck className="h-3.5 w-3.5 text-[#4ade80]" aria-hidden="true" />
        Contact details stay private until the founder accepts.
      </figcaption>
    </figure>
  );
}

function ForInvestors() {
  return (
    <section id="investors" className="scroll-mt-20 bg-[#070d18] px-4 py-20 sm:px-8 lg:px-16 lg:py-[120px]">
      <div className="mx-auto flex max-w-[1312px] flex-col items-center gap-14 lg:flex-row lg:gap-20">
        <Reveal from="left" className="flex w-full flex-col gap-6 lg:w-[480px] lg:shrink-0">
          <p className={EYEBROW}>For investors and sponsors</p>
          <h2 className={H2}>Find ventures worth backing</h2>
          <p className="text-[17px] leading-[1.55] text-white/70">
            Approved investors find ventures by keyword, sector, stage, country and registration, then request an introduction.
          </p>
          <ul className="flex flex-col gap-[18px] py-2">
            {INVESTOR_POINTS.map(([b, r], i) => (
              <Reveal as="li" key={b} delay={150 + i * 90} className="flex gap-3">
                <span className="mt-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-[#3b82f61f]">
                  <Check className="h-[13px] w-[13px] text-[#60a5fa]" aria-hidden="true" />
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="text-[15px] font-semibold text-white">{b}</span>
                  <span className="text-[14px] text-white/50">{r}</span>
                </span>
              </Reveal>
            ))}
          </ul>
          <Link to="/register?role=investor" className={`${GHOST} h-[46px] w-fit px-[22px] text-[15px]`}>
            Request investor access
            <ArrowRight className={ARROW} aria-hidden="true" />
          </Link>
        </Reveal>
        <Reveal from="right" delay={150} className="w-full min-w-0 flex-1">
          <BrowseMockup />
        </Reveal>
      </div>
    </section>
  );
}

// ---- Opportunities ----------------------------------------------------------------------------

const STAGES = [
  { icon: DoorOpen, title: 'Open', badge: 'Applications open', body: 'Graduates apply with an approved venture before the deadline.' },
  { icon: ListChecks, title: 'Selection', body: 'Applications close and eligible entries are reviewed.' },
  { icon: Timer, title: 'In progress', body: 'Selected teams take part in the hackathon, grant or competition.' },
  { icon: Trophy, title: 'Completed', body: 'An administrator confirms results and winners are announced.' },
];

function OpportunityStages() {
  const reduced = useReducedMotion();
  const [ref, inView] = useInView(0.3);
  const [active, setActive] = useState(0);
  const [hold, setHold] = useState(false);
  // Walks through the stages once the panel is on screen; hovering a stage holds it.
  useEffect(() => {
    if (reduced || !inView || hold) return undefined;
    const t = setInterval(() => setActive((a) => (a + 1) % STAGES.length), 2600);
    return () => clearInterval(t);
  }, [reduced, inView, hold]);

  return (
    <div ref={ref} className={`${CARD} flex w-full flex-col gap-2.5 p-5`} onMouseLeave={() => setHold(false)}>
      <p className="text-[11px] font-semibold uppercase tracking-[1.2px] text-white/50">Opportunity stages</p>
      <ol className="flex flex-col gap-2.5">
        {STAGES.map((s, i) => {
          const on = i === active;
          return (
            <li
              key={s.title}
              onMouseEnter={() => {
                setHold(true);
                setActive(i);
              }}
              aria-current={on ? 'step' : undefined}
              className={`flex items-center gap-4 rounded-xl p-4 transition-all duration-500 ${
                on ? 'border-[1.5px] border-[#2563eb] bg-[#3b82f61a] shadow-[0_0_24px_#2563eb40]' : 'border-[1.5px] border-white/[0.08] bg-white/[0.03]'
              }`}
            >
              <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors duration-500 ${on ? 'bg-[#2563eb]' : 'bg-white/[0.06]'}`}
              >
                <s.icon className={`h-[18px] w-[18px] transition-colors duration-500 ${on ? 'text-white' : 'text-white/70'}`} aria-hidden="true" />
              </span>
              <span className="flex min-w-0 flex-col gap-[3px]">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-[15px] font-semibold text-white">{s.title}</span>
                  {s.badge && <span className="rounded-full bg-[#2563eb] px-2 py-0.5 text-[11px] font-semibold text-white">{s.badge}</span>}
                </span>
                <span className="text-[13px] text-white/50">{s.body}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function OpportunityCard() {
  return (
    <figure
      aria-label="Example opportunity"
      className="flex w-full flex-col gap-5 rounded-2xl border border-white/[0.16] bg-[#0b1424] p-7 shadow-[0_24px_60px_#00000066] transition-transform duration-500 hover:-translate-y-1.5 lg:w-[400px] lg:shrink-0"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#f59e0b40] bg-[#f59e0b1f] px-2.5 py-1 text-[12px] font-semibold text-[#fbbf24]">
          <Zap className="h-3 w-3" aria-hidden="true" />
          Hackathon
        </span>
        <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#f87171]">
          <Hourglass className="land-flip h-[13px] w-[13px]" aria-hidden="true" />
          Closes in 3 days
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        <p className="text-[24px] font-medium tracking-[-0.5px] text-white">Seed prize</p>
        <p className="text-[14px] text-white/50">UK sponsorship program</p>
      </div>
      <p className="text-[14px] leading-[1.55] text-white/70">Sponsorship for a graduate-led agriculture business with a strong community impact in Rwanda.</p>
      <dl className="grid grid-cols-2 border-y border-white/[0.08] py-4">
        {[
          ['Prize', 'To be announced'],
          ['Closes', '30 Oct 2026, 17:44'],
        ].map(([l, v]) => (
          <div key={l} className="flex flex-col-reverse gap-1">
            <dd className="text-[14px] font-medium text-white">{v}</dd>
            <dt className="text-[11px] font-semibold uppercase tracking-[1px] text-white/50">{l}</dt>
          </div>
        ))}
      </dl>
      <Link to="/opportunities" className={`${PRIMARY} h-11 w-full text-[14px]`}>
        Apply with your venture
        <ArrowRight className="h-[15px] w-[15px] transition-transform duration-300 group-hover:translate-x-1" aria-hidden="true" />
      </Link>
      <figcaption className="text-[12px] text-white/50">Eligibility is checked when you apply.</figcaption>
    </figure>
  );
}

function Opportunities() {
  return (
    <section
      id="opportunities"
      className="scroll-mt-20 px-4 py-20 sm:px-8 lg:px-16 lg:py-[120px]"
      style={{ background: 'radial-gradient(45% 40% at 50% 75%, rgba(37,99,235,0.12), rgba(37,99,235,0) 100%), #070d18' }}
    >
      <div className="mx-auto flex max-w-[1120px] flex-col gap-14">
        <SectionHeading eyebrow="Hackathons, grants and competitions" title="From open call to confirmed result" width={640}>
          ALU staff publish opportunities, eligibility is checked when graduates apply, and competition results are confirmed by an administrator.
        </SectionHeading>
        <div className="flex flex-col gap-6 lg:flex-row">
          <Reveal from="left" className="min-w-0 flex-1">
            <OpportunityStages />
          </Reveal>
          <Reveal from="right" delay={150}>
            <OpportunityCard />
          </Reveal>
        </div>
      </div>
    </section>
  );
}

// ---- Introductions ----------------------------------------------------------------------------

const TIMELINE = [
  { icon: Send, title: 'Introduction requested', body: 'Investor sent a request · 9 Oct 2026', done: true },
  { icon: UserCheck, title: 'Founder accepted', body: 'Aziza reviewed the request and accepted · 9 Oct', done: true },
  { icon: Mail, title: 'Contact details shared', body: "Both sides were emailed each other's details", done: true },
  { icon: CalendarCheck, title: 'Meeting confirmed', body: 'Recorded by both sides after they meet' },
];

const RECORD_FEATURES = [
  { icon: ScrollText, title: 'Every decision recorded', body: 'Approvals, rejections and introductions are logged with a reason.' },
  { icon: MailCheck, title: 'Emails at each step', body: 'Founders and investors are emailed every decision and reply.' },
  { icon: BadgeCheck, title: 'Verify a project', body: 'Anyone can confirm an approved venture on the Verify page.', to: '/verify' },
];

function IntroductionMockup() {
  const [ref, inView] = useInView(0.3);
  return (
    <figure
      ref={ref}
      aria-label="Example: an introduction from request to meeting"
      className="w-full overflow-hidden rounded-2xl border border-white/[0.16] bg-[#0b1424] shadow-[0_30px_80px_#00000080]"
    >
      <div className="flex items-center gap-3.5 border-b border-white/[0.08] p-5">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#f472b655] bg-[#f472b626] text-[14px] font-bold text-[#f472b6]"
          aria-hidden="true"
        >
          IM
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <span className="text-[15px] font-semibold text-white">Ingabire Marie Claire</span>
          <span className="truncate text-[13px] text-white/50">Investor · Rwanda Agriculture Board</span>
        </span>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border border-[#4ade8040] bg-[#4ade801a] px-2.5 py-1 text-[12px] font-semibold text-[#4ade80] transition-all delay-[1400ms] duration-500 ${
            inView ? 'scale-100 opacity-100' : 'scale-75 opacity-0'
          }`}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-[#4ade80]" aria-hidden="true" />
          Introduced
        </span>
      </div>
      <div className="flex flex-col gap-2 border-b border-white/[0.08] p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[1px] text-white/50">Introduction request · Apple crops developed</p>
        <blockquote className="text-[15px] leading-[1.55] text-white/70">
          “We fund agriculture ventures that lower food costs in Rwanda. I&apos;d like to learn about your pilot and funding needs.”
        </blockquote>
      </div>
      <ol className="flex flex-col px-5 pb-2 pt-5">
        {TIMELINE.map((s, i) => {
          const lit = s.done && inView;
          const last = i === TIMELINE.length - 1;
          return (
            <li key={s.title} className="flex gap-3.5">
              <span className="flex flex-col items-center gap-1">
                <span
                  className={`flex h-[30px] w-[30px] items-center justify-center rounded-full border transition-colors duration-500 ${
                    lit ? 'border-[#4ade8055] bg-[#4ade801f]' : 'border-white/[0.16] bg-white/[0.03]'
                  }`}
                  style={{ transitionDelay: `${300 + i * 350}ms` }}
                >
                  <s.icon
                    className={`h-3.5 w-3.5 transition-colors duration-500 ${lit ? 'text-[#4ade80]' : 'text-white/50'}`}
                    style={{ transitionDelay: `${300 + i * 350}ms` }}
                    aria-hidden="true"
                  />
                </span>
                {!last && (
                  <span className="relative h-[26px] w-[1.5px] overflow-hidden bg-white/[0.08]" aria-hidden="true">
                    <span
                      className={`absolute inset-0 origin-top bg-[#4ade8055] transition-transform duration-500 ${lit ? 'scale-y-100' : 'scale-y-0'}`}
                      style={{ transitionDelay: `${450 + i * 350}ms` }}
                    />
                  </span>
                )}
              </span>
              <span className="flex flex-col gap-0.5 pb-2 pt-[5px]">
                <span className={`text-[14px] font-semibold ${s.done ? 'text-white' : 'text-white/50'}`}>{s.title}</span>
                <span className="text-[13px] text-white/50">{s.body}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </figure>
  );
}

function Introductions() {
  return (
    <section id="introductions" className="scroll-mt-20 bg-[#070d18] px-4 py-20 sm:px-8 lg:px-16 lg:py-[120px]">
      <div className="mx-auto flex max-w-[1312px] flex-col gap-[72px]">
        <div className="flex flex-col-reverse items-center gap-14 lg:flex-row lg:gap-20">
          <Reveal from="left" className="w-full min-w-0 flex-1">
            <IntroductionMockup />
          </Reveal>
          <Reveal from="right" delay={120} className="flex w-full flex-col gap-6 lg:w-[480px] lg:shrink-0">
            <p className={EYEBROW}>Consent-based introductions</p>
            <h2 className={H2}>Introductions happen on the founder&apos;s terms</h2>
            <p className="text-[17px] leading-[1.55] text-white/70">
              Investors request an introduction. Contact details are shared only after the founder accepts, and every step is recorded.
            </p>
          </Reveal>
        </div>
        <div className="grid gap-8 border-t border-white/[0.08] pt-10 md:grid-cols-3 md:gap-5">
          {RECORD_FEATURES.map((f, i) => {
            const inner = (
              <>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border border-white/[0.08] bg-white/[0.06] transition-[transform,border-color] duration-500 group-hover:-translate-y-0.5 group-hover:border-[#3b82f655]">
                  <f.icon className="h-[18px] w-[18px] text-[#60a5fa]" aria-hidden="true" />
                </span>
                <span className="flex flex-col gap-1.5">
                  <span className="text-[16px] font-semibold text-white">{f.title}</span>
                  <span className="text-[14px] leading-[1.55] text-white/50">{f.body}</span>
                </span>
              </>
            );
            return (
              <Reveal key={f.title} delay={i * 100}>
                {f.to ? (
                  <Link
                    to={f.to}
                    className="group flex gap-4 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#60a5fa]"
                  >
                    {inner}
                  </Link>
                ) : (
                  <div className="group flex gap-4">{inner}</div>
                )}
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ---- Two ways to take part ---------------------------------------------------------------------

function WayRow({ a, b }) {
  return (
    <li className="flex items-start gap-3 border-t border-white/[0.08] py-3.5 text-[15px] sm:items-center">
      <Check className="mt-1 h-4 w-4 shrink-0 text-[#60a5fa] sm:mt-0" aria-hidden="true" />
      <span>
        <span className="font-semibold text-white">{a}</span> <span className="text-white/50">· {b}</span>
      </span>
    </li>
  );
}

function TwoWays() {
  return (
    <section id="two-ways" className="scroll-mt-20 bg-[#070d18] px-4 py-20 sm:px-8 lg:px-16 lg:py-[120px]">
      <div className="mx-auto flex max-w-[1120px] flex-col gap-14">
        <SectionHeading eyebrow="Graduates and investors" title="Two ways to take part" />
        <div className="grid gap-5 md:grid-cols-2">
          <Reveal from="left">
            <article
              className="group flex h-full flex-col gap-7 rounded-[20px] border border-[#3b82f655] p-7 transition-[transform,box-shadow] duration-500 hover:-translate-y-1.5 hover:shadow-[0_30px_70px_-25px_#2563eb88] sm:p-9"
              style={{ background: 'radial-gradient(80% 70% at 0% 0%, rgba(37,99,235,0.18), rgba(37,99,235,0) 100%), rgba(255,255,255,0.03)' }}
            >
              <div className="flex items-center gap-3.5">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#2563eb] transition-transform duration-500 group-hover:rotate-[-8deg]">
                  <GraduationCap className="h-5 w-5 text-white" aria-hidden="true" />
                </span>
                <p className="text-[11px] font-semibold uppercase tracking-[1.2px] text-[#60a5fa]">For graduates</p>
              </div>
              <h3 className="text-[28px] font-medium leading-[1.15] tracking-[-0.9px] text-white sm:text-[32px]">Turn your venture into a verified record.</h3>
              <ul className="flex flex-col">
                <WayRow a="Submit and verify projects" b="reviewed by an administrator" />
                <WayRow a="Apply for opportunities" b="hackathons, grants and competitions" />
                <WayRow a="Get introduced to investors" b="only when you accept" />
              </ul>
              <Link to="/register" className={`${PRIMARY} mt-auto h-[46px] w-fit px-[22px] text-[15px]`}>
                Join as a graduate
                <ArrowRight className={ARROW} aria-hidden="true" />
              </Link>
            </article>
          </Reveal>
          <Reveal from="right" delay={120}>
            <article
              className={`${CARD} group flex h-full flex-col gap-7 rounded-[20px] p-7 transition-[transform,border-color] duration-500 hover:-translate-y-1.5 hover:border-white/[0.16] sm:p-9`}
            >
              <div className="flex items-center gap-3.5">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.06] transition-transform duration-500 group-hover:rotate-[-8deg]">
                  <Briefcase className="h-5 w-5 text-[#60a5fa]" aria-hidden="true" />
                </span>
                <p className="text-[11px] font-semibold uppercase tracking-[1.2px] text-[#60a5fa]">For investors and sponsors</p>
              </div>
              <h3 className="text-[28px] font-medium leading-[1.15] tracking-[-0.9px] text-white sm:text-[32px]">
                Back ALU graduate founders with confidence.
              </h3>
              <ul className="flex flex-col">
                <WayRow a="Browse verified projects" b="filter by sector, stage and country" />
                <WayRow a="Record investments" b="confirmed with the founder" />
                <WayRow a="Track introductions" b="from request to meeting" />
              </ul>
              <Link to="/register?role=investor" className={`${GHOST} mt-auto h-[46px] w-fit px-[22px] text-[15px]`}>
                Request investor access
                <ArrowRight className={ARROW} aria-hidden="true" />
              </Link>
            </article>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

// ---- Mission ----------------------------------------------------------------------------------

function Mission() {
  const [ref, inView] = useInView(0.2);
  return (
    <section
      ref={ref}
      id="mission"
      className="relative isolate flex min-h-[560px] items-center justify-center overflow-hidden px-4 py-24 sm:px-8 lg:h-[640px] lg:px-16"
    >
      <img
        src="/images/alu-background.jpeg"
        alt=""
        loading="lazy"
        decoding="async"
        className={`absolute inset-0 -z-20 h-full w-full object-cover transition-transform duration-[2400ms] ease-out ${inView ? 'scale-100' : 'scale-110'}`}
      />
      <div
        className="absolute inset-0 -z-10"
        style={{ background: 'linear-gradient(180deg, #070d18 0%, #070d18cc 30%, #070d18e0 75%, #070d18 100%)' }}
        aria-hidden="true"
      />
      <Reveal className="flex max-w-[860px] flex-col items-center gap-6 text-center">
        <p className={EYEBROW}>Our mission</p>
        <h2 className="text-[38px] font-medium leading-[1.08] tracking-[-1.2px] text-white sm:text-[48px] lg:text-[56px] lg:tracking-[-1.8px]">
          Let&apos;s help graduates navigate real-world solutions
        </h2>
        <p className="max-w-[660px] text-[17px] leading-[1.6] text-white/85 sm:text-[18px]">
          ALU Ventures turns graduate ideas into verified ventures that investors can trust, connects them with funding, and helps them grow into businesses
          that create jobs across Africa.
        </p>
        <Link
          to="/register"
          className="group inline-flex h-[46px] items-center gap-2 rounded-full border border-white/25 bg-white/10 px-[22px] text-[15px] font-semibold text-white backdrop-blur-md transition-all duration-300 hover:-translate-y-0.5 hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          Start your venture
          <ArrowRight className={ARROW} aria-hidden="true" />
        </Link>
      </Reveal>
    </section>
  );
}

// ---- Plans ------------------------------------------------------------------------------------

const PLANS = [
  {
    name: 'Community',
    available: true,
    price: 'Free',
    note: 'Every feature, during the pilot',
    items: ['Browse approved ventures', 'Request introductions', 'Confirm meetings and investments', 'Email updates'],
  },
  {
    name: 'Syndicate Pro',
    price: 'Future plan',
    note: 'No payments are taken today.',
    items: ['Saved searches and alerts', 'Early access to showcases', 'Advanced filters'],
  },
  { name: 'Institutional', price: 'Future plan', note: 'No payments are taken today.', items: ['Team seats', 'Dedicated liaison', 'Portfolio exports'] },
];

function Plans() {
  return (
    <section id="plans" className="scroll-mt-20 bg-[#070d18] px-4 py-20 sm:px-8 lg:px-16 lg:py-[120px]">
      <div className="mx-auto flex max-w-[1120px] flex-col gap-14">
        <SectionHeading eyebrow="For investors" title="Free during the pilot" width={720}>
          All services are free today. Paid plans are future work and take no payments.
        </SectionHeading>
        <div className="grid gap-5 md:grid-cols-3">
          {PLANS.map((p, i) => (
            <Reveal key={p.name} delay={i * 110} className="h-full">
              <article
                className={`flex h-full flex-col gap-6 rounded-[20px] p-8 transition-[transform,box-shadow] duration-500 hover:-translate-y-1.5 md:min-h-[440px] ${
                  p.available ? 'border-[1.5px] border-[#2563eb] hover:shadow-[0_30px_70px_-25px_#2563eb88]' : 'border border-white/[0.08] bg-white/[0.03]'
                }`}
                style={p.available ? { background: 'linear-gradient(180deg, #2563eb24 0%, #2563eb00 70%), rgba(255,255,255,0.03)' } : undefined}
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-[16px] font-semibold text-white">{p.name}</h3>
                  {p.available ? (
                    <span className="rounded-full border border-[#4ade8040] bg-[#4ade801a] px-2.5 py-[3px] text-[12px] font-semibold text-[#4ade80]">
                      Available
                    </span>
                  ) : (
                    <span className="rounded-full border border-white/[0.08] bg-white/[0.06] px-2.5 py-[3px] text-[12px] font-semibold text-white/50">
                      Coming soon
                    </span>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <p
                    className={p.available ? 'text-[48px] font-medium tracking-[-1.4px] text-white' : 'text-[30px] font-medium tracking-[-1.4px] text-white/70'}
                  >
                    {p.price}
                  </p>
                  <p className="text-[14px] text-white/50">{p.note}</p>
                </div>
                <ul className="flex flex-col gap-3 border-t border-white/[0.08] pt-5">
                  {p.items.map((it) => (
                    <li key={it} className={`flex items-center gap-2.5 text-[14px] ${p.available ? 'text-white/70' : 'text-white/50'}`}>
                      <Check className={`h-[15px] w-[15px] shrink-0 ${p.available ? 'text-[#60a5fa]' : 'text-white/50'}`} aria-hidden="true" />
                      {it}
                    </li>
                  ))}
                </ul>
                <div className="mt-auto">
                  {p.available ? (
                    <Link to="/register?role=investor" className={`${PRIMARY} h-11 w-full text-[14px]`}>
                      Request investor access
                    </Link>
                  ) : (
                    <button
                      type="button"
                      disabled
                      className="h-11 w-full cursor-not-allowed rounded-full border border-white/[0.08] bg-white/[0.03] text-[14px] font-semibold text-white/50"
                    >
                      Not yet available
                    </button>
                  )}
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---- Built by ---------------------------------------------------------------------------------

function BuiltBy() {
  return (
    <section className="bg-[#070d18] px-4 pb-20 sm:px-8 lg:px-16 lg:pb-[120px]">
      <Reveal className="mx-auto max-w-[1120px]">
        <figure className={`${CARD} group flex flex-col items-center gap-8 rounded-[20px] p-7 sm:flex-row sm:gap-12 sm:p-10`}>
          <div className="h-[200px] w-[160px] shrink-0 overflow-hidden rounded-[14px]">
            <img
              src="/images/developer.jpeg"
              alt="Levis Ishimwe"
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
            />
          </div>
          <div className="flex flex-col gap-5">
            <p className="text-[11px] font-semibold uppercase tracking-[1.4px] text-[#60a5fa]">Built by an ALU graduate</p>
            <blockquote className="text-[19px] leading-[1.5] tracking-[-0.3px] text-white sm:text-[22px]">
              Levis designed and built ALU Ventures: graduate and investor registration with administrator review, project submission with document checks,
              investor introductions, and the hackathon, grant and competition workflow.
            </blockquote>
            <figcaption className="flex flex-col gap-1">
              <span className="text-[15px] font-semibold text-white">Levis Ishimwe</span>
              <span className="text-[14px] text-white/50">BSc Software Engineering · African Leadership University</span>
            </figcaption>
          </div>
        </figure>
      </Reveal>
    </section>
  );
}

// ---- Hero slider ------------------------------------------------------------------------------
// Two slides that cross-fade (1.2 s) with a slow zoom. The progress bar under
// the active tab drives the timing: when it fills, the next slide shows. It
// pauses off screen, on hover, keyboard focus or the pause button; with reduced motion
// there is no autoplay and no zoom. WebP copies are served first.

const SLIDE_MS = 7000;
const SLIDES = [
  {
    tab: 'Shine',
    image: '/images/Shinning',
    original: '/images/Shinning.jpg',
    alt: 'A laptop glowing with golden light on a rooftop above a city at night.',
    tagIcon: Sparkles,
    tagColor: '#fcd34d',
    tag: 'For ALU graduate founders',
    title: 'Let your ideas and projects shine in Africa and all over the world.',
    body: 'Turn your venture into a verified public record that investors and sponsors can trust.',
    primary: ['Get started — it’s free', '/register'],
    secondary: ['Browse ventures', '/ventures'],
    next: 'Let your ideas shine',
  },
  {
    tab: 'Navigate',
    image: '/images/Navigate',
    original: '/images/Navigate.png',
    alt: 'A desk and laptop on a grassy hilltop above a misty valley at sunrise, with a river winding into the distance.',
    tagIcon: Compass,
    tagColor: '#fda4af',
    tag: 'From idea to investment',
    title: 'Navigate from idea to verified venture.',
    body: 'Submit your project, pass document checks and reach investors and sponsors who back ALU graduates.',
    primary: ['Submit your venture', null],
    secondary: ['See how verification works', '#why'],
    next: 'Navigate from idea to venture',
  },
];

const SLIDER_STATS = [
  ['verifiedGraduates', 'Verified graduates'],
  ['approvedProjects', 'Approved projects'],
  ['investors', 'Investors'],
  ['introductions', 'Introductions made'],
];

const GLASS_BTN =
  'flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-white/[0.08] text-white backdrop-blur-lg transition-all duration-300 hover:scale-105 hover:bg-white/[0.16] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white';

function HeroSlider({ stats }) {
  const reduced = useReducedMotion();
  const gated = useGated();
  const [index, setIndex] = useState(0);
  const [hold, setHold] = useState(false); // hover or keyboard focus
  const [stopped, setStopped] = useState(false); // pause button
  const [seen, setSeen] = useState([true, false]); // second image loads when first needed
  const [sectionRef, onScreen] = useOnScreen();

  const go = (i) => {
    const n = (i + SLIDES.length) % SLIDES.length;
    setSeen((s) => s.map((v, k) => v || k === n));
    setIndex(n);
  };
  const autoplay = !reduced && !stopped;
  const running = autoplay && !hold && onScreen;
  const slide = SLIDES[index];
  const nextSlide = SLIDES[(index + 1) % SLIDES.length];

  // Fetch the next image a little before it is needed.
  useEffect(() => {
    if (!autoplay || !onScreen) return undefined;
    const t = setTimeout(() => setSeen([true, true]), 3000);
    return () => clearTimeout(t);
  }, [autoplay, onScreen]);

  const fade = reduced ? '' : 'transition-opacity duration-[1200ms] ease-in-out';
  return (
    <section
      ref={sectionRef}
      aria-roledescription="carousel"
      aria-label="Messages for graduate founders"
      className="relative isolate flex min-h-[720px] flex-col justify-between overflow-hidden border-t border-white/[0.08] bg-[#070d18] lg:h-[760px]"
      onMouseEnter={() => setHold(true)}
      onMouseLeave={() => setHold(false)}
      onFocus={() => setHold(true)}
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setHold(false)}
    >
      {SLIDES.map((s, i) => (
        <picture
          key={s.image}
          className={`absolute inset-0 -z-20 overflow-hidden ${fade} ${i === index ? 'opacity-100' : 'opacity-0'}`}
          aria-hidden={i !== index}
        >
          {seen[i] && (
            <>
              <source srcSet={`${s.image}.webp`} type="image/webp" />
              <img
                key={i === index ? `on-${index}` : 'off'}
                src={s.original}
                alt={s.alt}
                decoding="async"
                className={`h-full w-full object-cover ${i === index && !reduced ? 'land-kenburns' : ''}`}
              />
            </>
          )}
        </picture>
      ))}
      <div
        className="absolute inset-0 -z-10"
        style={{
          background: 'linear-gradient(90deg, #070d18f2 0%, #070d18b3 42%, #070d1800 75%), linear-gradient(180deg, #070d1800 55%, #070d18e6 100%)',
        }}
        aria-hidden="true"
      />

      <div className="w-full max-w-[816px] px-4 pt-20 sm:px-8 lg:pl-24 lg:pr-0 lg:pt-[120px]" aria-live={running ? 'off' : 'polite'}>
        <div key={index} className="flex flex-col gap-6" aria-roledescription="slide" aria-label={`${index + 1} of ${SLIDES.length}: ${slide.tab}`}>
          <span
            className="land-rise inline-flex w-fit items-center gap-2 rounded-full border border-white/[0.18] bg-white/[0.08] px-3 py-1.5 text-[13px] font-semibold text-white backdrop-blur-lg"
            style={{ '--d': '100ms' }}
          >
            <slide.tagIcon className="h-3.5 w-3.5" style={{ color: slide.tagColor }} aria-hidden="true" />
            {slide.tag}
          </span>
          <h2
            className="land-rise text-[38px] font-medium leading-[1.06] tracking-[-1.2px] text-white sm:text-[48px] lg:text-[60px] lg:tracking-[-2px]"
            style={{ '--d': '200ms' }}
          >
            {slide.title}
          </h2>
          <p className="land-rise max-w-[520px] text-[17px] leading-[1.55] text-white/85 sm:text-[18px]" style={{ '--d': '320ms' }}>
            {slide.body}
          </p>
          <div className="land-rise flex flex-col gap-3 pt-3 sm:flex-row" style={{ '--d': '440ms' }}>
            <Link to={slide.primary[1] || gated('/app/go/projects')} className={`${PRIMARY} h-[50px] px-[26px] text-[15px] shadow-[0_8px_24px_#2563eb66]`}>
              {slide.primary[0]}
              <ArrowRight className={ARROW} aria-hidden="true" />
            </Link>
            {slide.secondary[1].startsWith('#') ? (
              <a
                href={slide.secondary[1]}
                className="inline-flex h-[50px] items-center justify-center rounded-full border border-white/25 bg-white/[0.08] px-6 text-[15px] font-semibold text-white backdrop-blur-lg transition-all duration-300 hover:-translate-y-0.5 hover:bg-white/[0.16] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                {slide.secondary[0]}
              </a>
            ) : (
              <Link
                to={slide.secondary[1]}
                className="inline-flex h-[50px] items-center justify-center rounded-full border border-white/25 bg-white/[0.08] px-6 text-[15px] font-semibold text-white backdrop-blur-lg transition-all duration-300 hover:-translate-y-0.5 hover:bg-white/[0.16] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                {slide.secondary[0]}
              </Link>
            )}
          </div>
        </div>
      </div>

      <div className="mt-12 flex flex-col gap-7 lg:mt-0">
        <div className="flex flex-col gap-6 px-4 sm:flex-row sm:items-end sm:justify-between sm:px-8 lg:px-24">
          <div className="flex gap-5" role="group" aria-label="Choose a slide">
            {SLIDES.map((s, i) => {
              const on = i === index;
              return (
                <button
                  key={s.tab}
                  type="button"
                  onClick={() => go(i)}
                  aria-label={`Show slide ${i + 1}: ${s.tab}`}
                  aria-current={on ? 'true' : undefined}
                  className="group flex w-[140px] flex-col gap-2.5 text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white sm:w-[180px]"
                >
                  <span
                    className="relative h-[3px] w-full overflow-hidden rounded-full bg-white/20 transition-colors group-hover:bg-white/35"
                    aria-hidden="true"
                  >
                    {on && (
                      <span
                        key={`p-${index}`}
                        className={`absolute inset-0 rounded-full bg-white ${reduced ? '' : 'land-progress'}`}
                        style={{ '--slide-ms': `${SLIDE_MS}ms`, animationPlayState: running ? 'running' : 'paused' }}
                        onAnimationEnd={() => go(index + 1)}
                      />
                    )}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className={`font-['JetBrains_Mono',ui-monospace,monospace] text-[12px] font-semibold ${on ? 'text-white' : 'text-white/50'}`}>
                      0{i + 1}
                    </span>
                    <span
                      className={`text-[14px] transition-colors ${on ? 'font-semibold text-white' : 'font-medium text-white/60 group-hover:text-white/90'}`}
                    >
                      {s.tab}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => go(index + 1)}
              className="group hidden items-center gap-3 rounded-xl border border-white/15 bg-[#070d18]/60 py-1.5 pl-1.5 pr-3.5 text-left backdrop-blur-xl transition-colors hover:border-white/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white md:flex"
              aria-label={`Up next: ${nextSlide.next}`}
            >
              <span className="h-12 w-[72px] overflow-hidden rounded-lg">
                <picture>
                  <source srcSet={`${nextSlide.image}.webp`} type="image/webp" />
                  <img
                    src={nextSlide.original}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                  />
                </picture>
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="text-[11px] font-semibold uppercase tracking-[1px] text-white/50">Up next</span>
                <span className="text-[13px] font-semibold text-white">{nextSlide.next}</span>
              </span>
            </button>
            {!reduced && (
              <button
                type="button"
                className={GLASS_BTN}
                onClick={() => setStopped((s) => !s)}
                aria-label={stopped ? 'Play slides' : 'Pause slides'}
                aria-pressed={stopped}
              >
                {stopped ? <Play className="h-[18px] w-[18px]" aria-hidden="true" /> : <Pause className="h-[18px] w-[18px]" aria-hidden="true" />}
              </button>
            )}
            <button type="button" className={GLASS_BTN} onClick={() => go(index - 1)} aria-label="Previous slide">
              <ChevronLeft className="h-[18px] w-[18px]" aria-hidden="true" />
            </button>
            <button type="button" className={GLASS_BTN} onClick={() => go(index + 1)} aria-label="Next slide">
              <ChevronRight className="h-[18px] w-[18px]" aria-hidden="true" />
            </button>
          </div>
        </div>

        {stats && (
          <div className="border-t border-white/[0.12] bg-[#070d18]/70 backdrop-blur-2xl">
            <div className="flex flex-col px-4 py-6 sm:px-8 lg:flex-row lg:items-center lg:px-24">
              <dl className="grid flex-1 grid-cols-2 items-center lg:flex">
                {SLIDER_STATS.map(([key, label], i) => (
                  <div
                    key={key}
                    className={`flex flex-col-reverse items-start gap-1 px-4 py-2 sm:flex-row-reverse sm:items-center sm:justify-end sm:gap-3.5 lg:flex-1 lg:px-7 lg:py-0 ${
                      i === 0 ? 'lg:pl-0' : 'lg:border-l lg:border-white/[0.12]'
                    } ${i % 2 ? 'border-l border-white/[0.12]' : ''}`}
                  >
                    <dt className="text-[11px] font-semibold uppercase tracking-[1.2px] text-white/60">{label}</dt>
                    <dd className="text-[30px] font-medium tracking-[-1px] text-white sm:text-[36px]">
                      <CountUp value={stats[key]} />
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 flex items-center gap-2 px-4 text-[12px] font-semibold text-[#4ade80] lg:mt-0 lg:px-0">
                <LiveDot />
                Live
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

export default function Home() {
  const { user } = useAuth();
  const stats = useBannerStats();

  useEffect(() => {
    document.title = 'ALU Ventures';
  }, []);

  // Plans are for investors: shown to visitors and investors, not to other signed-in roles.
  const showPlans = !user || user.role === 'investor';
  return (
    <div className="min-h-screen bg-[#070d18] font-sans text-white antialiased">
      <SiteHeader />
      <main>
        <Hero stats={stats} />
        <WhyAluVentures />
        <ForInvestors />
        <Opportunities />
        <Introductions />
        <TwoWays />
        <Mission />
        {showPlans && <Plans />}
        <BuiltBy />
        <HeroSlider stats={stats} />
      </main>
      <SiteFooter />
    </div>
  );
}
