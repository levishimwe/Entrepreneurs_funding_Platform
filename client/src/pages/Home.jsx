import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BadgeCheck, FolderKanban, GraduationCap, Handshake, Mail, Medal, Menu, MessageSquareQuote, Pause, Play, Search, Trophy, X } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth, homePathFor } from '../context/AuthContext';
import Marquee from '../components/home/Marquee';

// Public home page. Layout follows the supervisor's reference (dark, centred
// hero, moving rows, large rounded panels); every word and number is about
// ALU Ventures and comes from the platform. Project codes never appear here.

const GREEN = 'inline-flex h-10 items-center justify-center rounded-md bg-[#1f883d] px-5 text-[14px] font-semibold text-white hover:bg-[#1a7f37] disabled:cursor-not-allowed disabled:opacity-50';
const GREEN_OUTLINE = 'inline-flex h-10 items-center justify-center rounded-md border border-[#2ea043] px-5 text-[14px] font-semibold text-[#3fb950] hover:bg-[#2ea043]/10 disabled:cursor-not-allowed disabled:opacity-50';
const PANEL = 'rounded-2xl border border-white/10 bg-[#111a2b]';
const MUTED = 'text-[#a3adbd]';

const initials = (name = '') =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');
const money = (a) => `${a.currency || ''} ${Number(a.value).toLocaleString('en-GB')}`.trim();

function useHomeData() {
  const [data, setData] = useState({ stats: null, stories: [], investors: [], testimonials: [] });
  useEffect(() => {
    const get = (url, key) =>
      api
        .get(url)
        .then((d) => setData((s) => ({ ...s, [key]: key === 'stats' ? d : d[key] || [] })))
        .catch(() => {});
    get('/public/stats', 'stats');
    get('/public/success-stories', 'stories');
    get('/public/investors', 'investors');
    get('/public/testimonials', 'testimonials');
  }, []);
  return data;
}

function SectionTitle({ eyebrow, title, children }) {
  return (
    <div className="mx-auto mb-10 max-w-2xl text-center">
      {eyebrow && <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-[#3fb950]">{eyebrow}</p>}
      <h2 className="text-[28px] font-semibold leading-tight tracking-tight text-white sm:text-[34px]">{title}</h2>
      {children && <p className={`mt-3 text-[15px] ${MUTED}`}>{children}</p>}
    </div>
  );
}

// ---- 1. Hero with the top bar ------------------------------------------------------

function TopBar() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const links = [
    ['/ventures', 'Browse'],
    ['/verify', 'Verify a project'],
    ['/opportunities', 'Opportunities'],
  ];
  const search = (
    <form
      role="search"
      className="relative w-full"
      onSubmit={(e) => {
        e.preventDefault();
        navigate(`/ventures${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`);
      }}
    >
      <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[#7d8899]" aria-hidden="true" />
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search ventures, sectors or countries"
        aria-label="Search ventures"
        className="h-9 w-full rounded-lg border border-white/10 bg-white/5 pl-9 pr-3 text-[13px] text-white placeholder:text-[#7d8899] focus:border-[#2ea043] focus:outline-none"
      />
    </form>
  );
  const account = user ? (
    <Link to={homePathFor(user)} className={`${GREEN} h-9 px-4 text-[13px]`}>
      Open dashboard
    </Link>
  ) : (
    <>
      <Link to="/signin" className="text-[13px] font-semibold text-white hover:text-[#3fb950]">
        Sign in
      </Link>
      <Link to="/register" className={`${GREEN} h-9 px-4 text-[13px]`}>
        Get started
      </Link>
    </>
  );
  return (
    <header className="relative z-20">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4">
        <Link to="/" className="shrink-0" aria-label="ALU Ventures home">
          <img src="/alu-logo.png" alt="African Leadership University" className="h-8 w-auto max-w-none rounded-[3px]" />
        </Link>
        <div className="hidden w-72 lg:block">{search}</div>
        <nav aria-label="Main" className="mx-auto hidden items-center gap-1 rounded-lg border border-white/10 bg-white/5 p-1 md:flex">
          {links.map(([to, label]) => (
            <Link key={to} to={to} className="rounded-md px-3 py-1.5 text-[13px] text-[#c9d1d9] hover:bg-white/10 hover:text-white">
              {label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto hidden items-center gap-4 md:flex">{account}</div>
        <button type="button" className="ml-auto rounded-md p-2 text-white hover:bg-white/10 md:hidden" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>
      {open && (
        <div className="space-y-3 border-t border-white/10 bg-[#0a1220] px-4 py-4 md:hidden">
          {search}
          <nav aria-label="Mobile" className="flex flex-col">
            {links.map(([to, label]) => (
              <Link key={to} to={to} className="py-2 text-[14px] text-[#c9d1d9]" onClick={() => setOpen(false)}>
                {label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-4">{account}</div>
        </div>
      )}
    </header>
  );
}

function Hero({ stats }) {
  return (
    <section className="relative overflow-hidden bg-[#0B1F3A]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(46,160,67,0.18),transparent_60%)]" aria-hidden="true" />
      <TopBar />
      <div className="relative mx-auto max-w-4xl px-4 pb-20 pt-14 text-center sm:pt-20">
        <p className="mx-auto inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[12px] text-[#c9d1d9]">
          <BadgeCheck className="h-3.5 w-3.5 text-[#3fb950]" aria-hidden="true" />
          {stats ? `${stats.approvedGraduates} verified graduates · ${stats.approvedProjects} approved ventures` : 'Built for ALU graduate entrepreneurs in Kigali'}
        </p>
        <h1 className="mt-6 text-[36px] font-semibold leading-[1.1] tracking-tight text-white sm:text-[52px]">Where verified ALU graduate ventures meet investors</h1>
        <p className={`mx-auto mt-5 max-w-2xl text-[16px] ${MUTED}`}>
          Present reviewed ventures, reach investors and sponsors through consent-based introductions, and apply to hackathons and funding calls.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link to="/register" className={GREEN}>
            Get started
          </Link>
          <Link to="/ventures" className={GREEN_OUTLINE}>
            Browse ventures
          </Link>
        </div>
      </div>
    </section>
  );
}

// ---- 2. Moving icon strip ------------------------------------------------------------------

const TILES = [
  { label: 'Email', icon: Mail, color: '#2563eb', to: '/app/contact' },
  { label: 'Projects', icon: FolderKanban, color: '#1f883d', go: 'projects' },
  { label: 'Opportunities', icon: Trophy, color: '#b45309', go: 'opportunities' },
  { label: 'Investors', icon: Handshake, color: '#7c3aed', go: 'investors' },
  { label: 'Graduate Entrepreneurs', icon: GraduationCap, color: '#0e7490', go: 'graduates' },
  { label: 'Success Projects', icon: BadgeCheck, color: '#15803d', scroll: 'success' },
  { label: 'Testimonies', icon: MessageSquareQuote, color: '#be185d', scroll: 'testimonies' },
  { label: 'Competition Winners', icon: Medal, color: '#ca8a04', scroll: 'success' },
];

function IconStrip({ paused }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const open = (t) => {
    if (t.scroll) {
      const el = document.getElementById(t.scroll) || document.getElementById('community');
      el?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      return;
    }
    if (t.to) return navigate(t.to);
    // Sign-in first; a visitor without an account creates one, then continues here.
    const target = `/app/go/${t.go}`;
    navigate(user ? target : `/register?next=${encodeURIComponent(target)}`);
  };
  const tile = (t) => (
    <li key={t.label}>
      <button type="button" onClick={() => open(t)} className="group flex w-28 flex-col items-center gap-2 text-center focus:outline-none">
        <span
          className="flex h-20 w-20 items-center justify-center rounded-[22px] text-white shadow-lg ring-1 ring-white/10 transition-transform group-hover:scale-105 group-focus-visible:ring-2 group-focus-visible:ring-[#3fb950]"
          style={{ background: `linear-gradient(145deg, ${t.color}, ${t.color}cc)` }}
        >
          <t.icon className="h-9 w-9" aria-hidden="true" />
        </span>
        <span className="text-[12px] font-medium leading-tight text-[#c9d1d9]">{t.label}</span>
      </button>
    </li>
  );
  return (
    <section aria-label="Explore the platform" className="space-y-5 bg-[#070d18] py-10">
      <Marquee label="Explore the platform" paused={paused} seconds={60} minItems={24}>
        {TILES.map(tile)}
      </Marquee>
      <Marquee label="Explore the platform, second row" paused={paused} reverse seconds={70} minItems={24}>
        {[...TILES.slice(4), ...TILES.slice(0, 4)].map(tile)}
      </Marquee>
    </section>
  );
}

// ---- 3. Why choose ----------------------------------------------------------------------

const REASONS = [
  {
    title: 'Verified ALU graduates',
    body: 'Every founder registers with an ALU alumni email and a degree certificate. An administrator reviews each account before it can submit ventures.',
    visual: ['Alumni email confirmed', 'Degree certificate received', 'Administrator approved'],
  },
  {
    title: 'Document checks with admin approval',
    body: 'RDB certificates and supporting documents are pre-checked automatically, then an administrator approves, requests a revision or rejects with a reason.',
    visual: ['RDB certificate · Likely valid', 'Similarity check · Clear', 'Decision recorded'],
  },
  {
    title: 'Consent-based introductions',
    body: 'Investors request an introduction. Contact details are shared only after the founder accepts, and every step is recorded.',
    visual: ['Introduction requested', 'Founder accepted', 'Contact details shared'],
  },
  {
    title: 'Free for graduates and investors',
    body: 'Submitting ventures, applying to opportunities, browsing approved projects and requesting introductions cost nothing.',
    visual: ['Graduates · Free', 'Investors · Free', 'Sponsors · Free'],
  },
];

function Steps({ items }) {
  return (
    <ol className="w-full max-w-xs space-y-2" aria-hidden="true">
      {items.map((s, i) => (
        <li key={s} className="flex items-center gap-3 rounded-lg border border-white/10 bg-[#0B1F3A] px-3 py-2 text-[12px] text-[#c9d1d9]">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#1f883d] text-[10px] font-bold text-white">{i + 1}</span>
          {s}
        </li>
      ))}
    </ol>
  );
}

function WhyChoose() {
  return (
    <section className="bg-[#070d18] px-4 py-20">
      <SectionTitle title="Why choose ALU Ventures?" />
      <div className="mx-auto max-w-5xl space-y-5">
        {REASONS.map((r, i) => (
          <article key={r.title} className={`${PANEL} grid items-center gap-8 p-8 md:grid-cols-2 md:p-10`}>
            <div className={i % 2 ? 'md:order-2' : ''}>
              <h3 className="text-[20px] font-semibold text-white">{r.title}</h3>
              <p className={`mt-3 text-[14px] leading-relaxed ${MUTED}`}>{r.body}</p>
            </div>
            <div className="flex justify-center">
              <Steps items={r.visual} />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

// ---- 4. Developer -------------------------------------------------------------------------

function Developer() {
  const [photo, setPhoto] = useState(true);
  return (
    <section className="bg-[#070d18] px-4 pb-20">
      <article className={`${PANEL} mx-auto grid max-w-5xl items-center gap-8 p-8 md:grid-cols-2 md:p-10`}>
        <div className="flex justify-center">
          {photo ? (
            <img src="/images/developer.jpeg" alt="Levis Ishimwe" onError={() => setPhoto(false)} className="aspect-[4/5] w-full max-w-[260px] rounded-xl object-cover ring-1 ring-white/10" />
          ) : (
            <div className="flex aspect-[4/5] w-full max-w-[260px] items-center justify-center rounded-xl bg-[#0B1F3A] text-[40px] font-semibold text-white/60 ring-1 ring-white/10" aria-hidden="true">
              LI
            </div>
          )}
        </div>
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#3fb950]">The developer</p>
          <h3 className="mt-2 text-[22px] font-semibold text-white">Levis Ishimwe</h3>
          <p className={`text-[13px] ${MUTED}`}>BSc Software Engineering · African Leadership University</p>
          <p className={`mt-4 text-[14px] leading-relaxed ${MUTED}`}>
            Levis designed and built ALU Ventures: graduate and investor registration with administrator review, project submission with document checks, investor
            introductions, and the hackathon, grant and competition workflow.
          </p>
        </div>
      </article>
    </section>
  );
}

// ---- 5. Feature cards ----------------------------------------------------------------------

function Features() {
  const mini = ['Sector', 'Stage', 'Country', 'Registered or idea'];
  return (
    <section className="bg-[#070d18] px-4 pb-20">
      <SectionTitle title="Everything in one place" />
      <div className="mx-auto max-w-5xl space-y-5">
        <article className={`${PANEL} grid items-center gap-8 p-8 md:grid-cols-2 md:p-10`}>
          <div>
            <h3 className="text-[20px] font-semibold text-white">Search and filter ventures</h3>
            <p className={`mt-3 text-[14px] leading-relaxed ${MUTED}`}>Approved investors find ventures by keyword, sector, stage, country and registration, then request an introduction.</p>
          </div>
          <div className="flex flex-wrap justify-center gap-2" aria-hidden="true">
            {mini.map((m) => (
              <span key={m} className="rounded-full border border-white/10 bg-[#0B1F3A] px-3 py-1.5 text-[12px] text-[#c9d1d9]">
                {m}
              </span>
            ))}
          </div>
        </article>
        <article className={`${PANEL} grid items-center gap-8 p-8 md:grid-cols-2 md:p-10`}>
          <div className="md:order-2">
            <h3 className="text-[20px] font-semibold text-white">Hackathons, grants and competitions</h3>
            <p className={`mt-3 text-[14px] leading-relaxed ${MUTED}`}>
              ALU staff publish opportunities, eligibility is checked when graduates apply, and competition results are confirmed by an administrator.
            </p>
          </div>
          <div className="flex justify-center">
            <Steps items={['Open', 'Selection', 'In progress', 'Completed']} />
          </div>
        </article>
        <div className="grid gap-5 md:grid-cols-3">
          {[
            ['Verify a project', 'Anyone can confirm an approved venture on the Verify page.'],
            ['Every decision recorded', 'Approvals, rejections and introductions are logged with a reason.'],
            ['Emails at each step', 'Founders and investors are emailed every decision and reply.'],
          ].map(([t, b]) => (
            <article key={t} className={`${PANEL} p-6`}>
              <h3 className="text-[16px] font-semibold text-white">{t}</h3>
              <p className={`mt-2 text-[13px] leading-relaxed ${MUTED}`}>{b}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---- 6. Success stories and investors -----------------------------------------------------------

function Avatar({ name }) {
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#1f883d] text-[13px] font-semibold text-white" aria-hidden="true">
      {initials(name)}
    </span>
  );
}

function StoryCard({ s }) {
  const f = s.founder || {};
  return (
    <li className={`${PANEL} w-[300px] shrink-0 p-5`}>
      <div className="flex items-center gap-3">
        <Avatar name={f.name} />
        <div className="min-w-0">
          <p className="truncate text-[14px] font-semibold text-white">{f.name}</p>
          <p className={`truncate text-[12px] ${MUTED}`}>{[f.label, f.cohortYear ? `Class of ${f.cohortYear}` : null].filter(Boolean).join(' · ')}</p>
        </div>
      </div>
      <div className="mt-4 border-t border-white/10 pt-4">
        <p className="flex flex-wrap gap-1.5 text-[11px]">
          <span className="rounded-full bg-[#1f883d]/20 px-2 py-0.5 font-medium text-[#3fb950]">Fully funded</span>
          {s.fundingSource && <span className="rounded-full border border-white/15 px-2 py-0.5 text-[#c9d1d9]">{s.fundingSource}</span>}
          <span className="px-1 py-0.5 text-[#a3adbd]">{s.sector}</span>
        </p>
        <h3 className="mt-2 text-[15px] font-semibold text-white">{s.title}</h3>
        <p className={`mt-1 line-clamp-3 text-[13px] ${MUTED}`}>{s.summary}</p>
        {s.amount && <p className="mt-2 text-[13px] font-semibold text-white">{money(s.amount)}</p>}
      </div>
    </li>
  );
}

function InvestorCard({ i }) {
  return (
    <li className={`${PANEL} w-[300px] shrink-0 p-5`}>
      <div className="flex items-center gap-3">
        <Avatar name={i.name} />
        <div className="min-w-0">
          <p className="truncate text-[14px] font-semibold text-white">{i.name}</p>
          <p className={`truncate text-[12px] ${MUTED}`}>
            {i.type} · {i.organisation}
          </p>
        </div>
      </div>
      <div className="mt-4 border-t border-white/10 pt-4">
        {i.sectors?.length > 0 && <p className="text-[12px] text-[#3fb950]">{i.sectors.join(' · ')}</p>}
        <p className={`mt-1 line-clamp-4 text-[13px] ${MUTED}`}>{i.bio || 'Approved investor on ALU Ventures.'}</p>
      </div>
    </li>
  );
}

function PeopleRows({ stories, investors, paused }) {
  if (!stories.length && !investors.length) return null;
  return (
    <section id="success" className="scroll-mt-4 bg-[#0B1F3A] py-20">
      <SectionTitle title="Funded ventures and the investors behind them" />
      <div className="space-y-6">
        {stories.length > 0 && (
          <Marquee label="Success stories" paused={paused} seconds={Math.max(30, stories.length * 10)}>
            {stories.map((s) => (
              <StoryCard key={s.id} s={s} />
            ))}
          </Marquee>
        )}
        {investors.length > 0 && (
          <Marquee label="Investors" paused={paused} reverse seconds={Math.max(30, investors.length * 10)}>
            {investors.map((i) => (
              <InvestorCard key={i.id} i={i} />
            ))}
          </Marquee>
        )}
      </div>
    </section>
  );
}

// ---- 7. Testimonies ---------------------------------------------------------------------------

function Testimonies({ items, paused }) {
  if (!items.length) return null;
  return (
    <section id="testimonies" className="scroll-mt-4 bg-[#070d18] py-20">
      <SectionTitle title="Trusted by graduates and investors" />
      <Marquee label="Testimonies" paused={paused} seconds={Math.max(35, items.length * 9)}>
        {items.map((t) => (
          <li key={t.id} className={`${PANEL} flex w-[320px] shrink-0 flex-col justify-between p-5`}>
            <p className="text-[14px] leading-relaxed text-white">“{t.body}”</p>
            <div className="mt-4 flex items-center gap-3">
              <Avatar name={t.name} />
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold text-white">{t.name}</p>
                <p className={`truncate text-[12px] ${MUTED}`}>{[t.role, t.detail].filter(Boolean).join(' · ')}</p>
              </div>
            </div>
          </li>
        ))}
      </Marquee>
    </section>
  );
}

// ---- 8. Graduates and investors ---------------------------------------------------------------

function TwoWays() {
  const cols = [
    {
      eyebrow: 'For graduates',
      title: 'Turn your venture into a verified record.',
      items: [
        ['Submit and verify projects', 'reviewed by an administrator'],
        ['Apply for opportunities', 'hackathons, grants and competitions'],
        ['Get introduced to investors', 'only when you accept'],
      ],
      cta: ['/register', 'Join as a graduate'],
    },
    {
      eyebrow: 'For investors',
      title: 'Back ALU graduate founders with confidence.',
      items: [
        ['Browse verified projects', 'filter by sector, stage and country'],
        ['Invest', 'record confirmed investments with the founder'],
        ['Track introductions', 'from request to meeting'],
      ],
      cta: ['/register?role=investor', 'Request investor access'],
    },
  ];
  return (
    <section id="community" className="scroll-mt-4 bg-[#070d18] px-4 py-20">
      <SectionTitle eyebrow="Graduates and investors" title="Two ways to take part" />
      <div className={`${PANEL} mx-auto grid max-w-4xl overflow-hidden md:grid-cols-2`}>
        {cols.map((c, i) => (
          <div key={c.eyebrow} className={`p-8 ${i ? 'border-t border-white/10 md:border-l md:border-t-0' : ''}`}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#3fb950]">{c.eyebrow}</p>
            <h3 className="mt-3 text-[18px] font-semibold leading-snug text-white">{c.title}</h3>
            <ul className="mt-5 space-y-2.5 text-[13px]">
              {c.items.map(([strong, rest]) => (
                <li key={strong} className={MUTED}>
                  <span className="mr-2 text-[#3fb950]">—</span>
                  <span className="font-semibold text-white">{strong}</span> · {rest}
                </li>
              ))}
            </ul>
            <Link to={c.cta[0]} className={`${GREEN_OUTLINE} mt-6 h-9 rounded-full px-4 text-[13px]`}>
              {c.cta[1]}
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---- 9. Plans (investors) --------------------------------------------------------------------

function Plans() {
  const plans = [
    { name: 'Community', price: 'Free', note: 'Every feature, during the pilot', items: ['Browse approved ventures', 'Request introductions', 'Confirm meetings and investments', 'Email updates'], current: true },
    { name: 'Syndicate Pro', price: 'Coming soon', note: 'Future work', items: ['Saved searches and alerts', 'Early access to showcases', 'Advanced filters'] },
    { name: 'Institutional', price: 'Coming soon', note: 'Future work', items: ['Team seats', 'Dedicated liaison', 'Portfolio exports'] },
  ];
  return (
    <section className="bg-[#070d18] px-4 pb-20">
      <SectionTitle eyebrow="For investors" title="Choose the plan that fits">
        All services are free today. Paid plans are future work and take no payments.
      </SectionTitle>
      <div className="mx-auto grid max-w-5xl gap-5 md:grid-cols-3">
        {plans.map((p) => (
          <article key={p.name} className={`${PANEL} flex flex-col p-6 ${p.current ? 'border-[#2ea043]' : ''}`}>
            <p className="flex items-center gap-2 text-[14px] font-semibold text-white">
              {p.name}
              {p.current && <span className="rounded bg-[#1f883d] px-1.5 py-0.5 text-[10px] font-semibold text-white">Available</span>}
            </p>
            <p className="mt-3 text-[28px] font-semibold text-white">{p.price}</p>
            <p className={`text-[12px] ${MUTED}`}>{p.note}</p>
            {p.current ? (
              <Link to="/register?role=investor" className={`${GREEN} mt-5 h-9 text-[13px]`}>
                Request investor access
              </Link>
            ) : (
              <button type="button" className={`${GREEN} mt-5 h-9 text-[13px]`} disabled>
                Coming soon
              </button>
            )}
            <ul className={`mt-5 space-y-2 text-[13px] ${MUTED}`}>
              {p.items.map((i) => (
                <li key={i}>
                  <span className="mr-2 text-[#3fb950]">✓</span>
                  {i}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}

// ---- 10. Founder and mission ----------------------------------------------------------------

function Mission() {
  const [photo, setPhoto] = useState(true);
  return (
    <section className="relative overflow-hidden bg-[#0B1F3A] px-4 py-24 text-center">
      <img src="/images/alu-background.jpeg" alt="" className="absolute inset-0 h-full w-full object-cover" onError={(e) => (e.currentTarget.style.display = 'none')} />
      <div className="absolute inset-0 bg-gradient-to-b from-[#070d18]/90 via-[#0B1F3A]/85 to-[#070d18]/95" aria-hidden="true" />
      <div className="relative mx-auto max-w-2xl">
        <figure>
          {photo ? (
            <img
              src="/images/fred-swaniker.jpeg"
              alt="Fred Swaniker"
              onError={() => setPhoto(false)}
              className="mx-auto h-20 w-20 rounded-full object-cover ring-2 ring-white/20"
            />
          ) : (
            <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-white/10 text-[20px] font-semibold text-white" aria-hidden="true">
              FS
            </span>
          )}
          <figcaption className="mt-3 text-[13px] text-[#c9d1d9]">Fred Swaniker, Co-founder, African Leadership University</figcaption>
        </figure>
        <p className="mt-12 text-[12px] font-semibold uppercase tracking-[0.12em] text-[#3fb950]">Our mission</p>
        <h2 className="mt-3 text-[30px] font-bold leading-tight text-white sm:text-[40px]">Let&apos;s Help Graduates Navigate Real-World Solutions</h2>
        <p className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-[#d0d7e2]">
          ALU Ventures turns graduate ideas into verified ventures that investors can trust, connects them with funding, and helps them grow into businesses that
          create jobs across Africa.
        </p>
        <Link to="/register" className={`${GREEN} mt-8 rounded-full`}>
          Start your venture
        </Link>
      </div>
    </section>
  );
}

// ---- 11. Footer -------------------------------------------------------------------------------

function Footer() {
  const cols = [
    ['Explore', [['/ventures', 'Browse'], ['/verify', 'Verify a project'], ['/opportunities', 'Opportunities']]],
    ['Account', [['/signin', 'Sign in'], ['/register', 'Create an account'], ['/register?role=investor', 'Investor access']]],
    ['Help', [['/app/contact', 'Contact']]],
  ];
  return (
    <footer className="border-t border-white/10 bg-[#050a13] px-4 pt-14 text-[13px]">
      <div className="mx-auto grid max-w-5xl gap-10 md:grid-cols-[1fr_3fr]">
        <Link to="/" aria-label="ALU Ventures home" className="h-fit w-fit">
          <img src="/alu-logo.png" alt="African Leadership University" className="h-9 w-auto max-w-none rounded-[3px]" />
        </Link>
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
          {cols.map(([title, links]) => (
            <div key={title}>
              <p className="font-semibold text-white">{title}</p>
              <ul className="mt-3 space-y-2">
                {links.map(([to, label]) => (
                  <li key={to}>
                    <Link to={to} className={`${MUTED} hover:text-white`}>
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <div className={`mx-auto mt-12 max-w-5xl space-y-2 border-t border-white/10 py-8 text-[12px] ${MUTED}`}>
        <p className="font-semibold text-white">All platform services are free.</p>
        <p>ALU Graduate Entrepreneurship &amp; Funding Platform. A verified record confirms an administrator-approved venture on this platform; it is not an investment recommendation.</p>
        <p>© {new Date().getFullYear()} African Leadership University</p>
      </div>
    </footer>
  );
}

export default function Home() {
  const { user } = useAuth();
  const { stats, stories, investors, testimonials } = useHomeData();
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    document.title = 'ALU Ventures';
  }, []);

  // Plans are for investors: shown to visitors and investors, not to other signed-in roles.
  const showPlans = !user || user.role === 'investor';
  return (
    <div className="bg-[#070d18] text-white">
      <Hero stats={stats} />
      <div className="sticky top-0 z-10 flex justify-end bg-transparent px-4">
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          aria-pressed={paused}
          className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-[#070d18]/80 px-3 py-1 text-[12px] text-[#c9d1d9] backdrop-blur hover:text-white"
        >
          {paused ? <Play className="h-3.5 w-3.5" aria-hidden="true" /> : <Pause className="h-3.5 w-3.5" aria-hidden="true" />}
          {paused ? 'Play motion' : 'Pause motion'}
        </button>
      </div>
      <IconStrip paused={paused} />
      <WhyChoose />
      <Developer />
      <Features />
      <PeopleRows stories={stories} investors={investors} paused={paused} />
      <Testimonies items={testimonials} paused={paused} />
      <TwoWays />
      {showPlans && <Plans />}
      <Mission />
      <Footer />
    </div>
  );
}
