import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BadgeCheck, GraduationCap, Handshake, LayoutGrid, Mail, ShieldCheck } from 'lucide-react';
import { ARROW, GHOST, PRIMARY } from '../components/site/SiteChrome';

// About the platform. Only what is true of this project: no statistics,
// team members or testimonials.

const AUDIENCES = [
  {
    icon: GraduationCap,
    title: 'ALU graduates',
    body: 'Present a reviewed venture, apply to hackathons, grants and competitions, and decide which investors you meet.',
  },
  {
    icon: Handshake,
    title: 'Investors and sponsors',
    body: 'Browse administrator-approved ventures and request introductions. Founders choose whether to share their contact details.',
  },
  {
    icon: LayoutGrid,
    title: 'ALU staff and administrators',
    body: 'Publish opportunities, review accounts and ventures, select applicants and confirm results, with every decision recorded.',
  },
];

const TRUST = [
  {
    title: 'Graduate accounts',
    body: 'Graduates register with an ALU alumni email, confirm a six-digit code sent to that address, and are then approved by an administrator.',
  },
  {
    title: 'Registered companies',
    body: 'Companies upload their RDB certificate. Automated checks read it and flag anything unusual, but an administrator always makes the decision.',
  },
  {
    title: 'Consent-based introductions',
    body: 'An investor asks for an introduction; contact details are shared only after the founder accepts.',
  },
  {
    title: 'What a verified record means',
    body: 'It confirms an administrator-approved venture on this platform. It is not an investment recommendation.',
  },
];

export default function About() {
  useEffect(() => {
    document.title = 'About · ALU Ventures';
  }, []);

  return (
    <div className="flex-1 bg-s-bg text-s-ink">
      {/* Hero */}
      <section
        className="px-4 pb-14 pt-14 sm:px-8 lg:px-16 lg:pb-20 lg:pt-20"
        style={{ background: 'radial-gradient(60% 90% at 50% 0%, rgba(37,99,235,0.16), rgba(37,99,235,0) 70%), var(--s-bg)' }}
      >
        <div className="mx-auto max-w-[880px] text-center">
          <p className="land-rise text-[12px] font-semibold uppercase tracking-[1.6px] text-s-accent">About ALU Ventures</p>
          <h1
            className="land-rise mt-4 text-[34px] font-medium leading-[1.08] tracking-[-1px] sm:text-[44px] lg:text-[52px] lg:tracking-[-1.6px]"
            style={{ '--d': '80ms' }}
          >
            A trusted place for ALU graduate ventures
          </h1>
          <p className="land-rise mx-auto mt-5 max-w-[680px] text-[16px] leading-[1.65] text-s-soft sm:text-[18px]" style={{ '--d': '160ms' }}>
            The ALU Graduate Entrepreneurship and Funding Platform keeps verified records of ventures built by African Leadership University graduates, lists
            hackathons, grants and competitions, and connects founders with investors and sponsors through consent-based introductions.
          </p>
          <p
            className="land-rise mx-auto mt-6 inline-flex items-center gap-2 rounded-full border border-[#3b82f640] bg-[#3b82f61f] px-3 py-1.5 text-[13px] font-medium text-s-accent"
            style={{ '--d': '240ms' }}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-s-accent" aria-hidden="true" />
            All platform services are free
          </p>
        </div>
      </section>

      {/* Who it is for */}
      <section className="border-t border-s-line bg-s-raised px-4 py-14 sm:px-8 lg:px-16 lg:py-20" aria-labelledby="about-who">
        <div className="mx-auto max-w-[1120px]">
          <h2 id="about-who" className="text-[26px] font-medium tracking-[-0.6px] sm:text-[32px]">
            Who it is for
          </h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {AUDIENCES.map(({ icon: Icon, title, body }) => (
              <div key={title} className="rounded-2xl border border-s-line bg-s-card p-6">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-s-fill" aria-hidden="true">
                  <Icon className="h-5 w-5 text-s-faint" strokeWidth={1.75} />
                </span>
                <h3 className="mt-4 text-[17px] font-semibold">{title}</h3>
                <p className="mt-2 text-[14px] leading-[1.65] text-s-muted">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How trust works */}
      <section className="border-t border-s-line px-4 py-14 sm:px-8 lg:px-16 lg:py-20" aria-labelledby="about-trust">
        <div className="mx-auto grid max-w-[1120px] gap-10 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)] lg:gap-16">
          <div>
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-s-fill" aria-hidden="true">
              <ShieldCheck className="h-5 w-5 text-s-faint" strokeWidth={1.75} />
            </span>
            <h2 id="about-trust" className="mt-4 text-[26px] font-medium tracking-[-0.6px] sm:text-[32px]">
              How trust works
            </h2>
            <p className="mt-3 text-[15px] leading-[1.65] text-s-muted">
              Every graduate account and every public venture passes an administrator&apos;s review. People decide what is shared about them.
            </p>
          </div>
          <ol className="grid gap-4 sm:grid-cols-2">
            {TRUST.map(({ title, body }, i) => (
              <li key={title} className="rounded-2xl border border-s-line bg-s-card p-6">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-s-accent-soft text-[13px] font-semibold text-s-accent" aria-hidden="true">
                  {i + 1}
                </span>
                <h3 className="mt-4 text-[16px] font-semibold">{title}</h3>
                <p className="mt-2 text-[14px] leading-[1.65] text-s-muted">{body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Built at ALU */}
      <section className="border-t border-s-line bg-s-raised px-4 py-14 sm:px-8 lg:px-16 lg:py-20" aria-labelledby="about-built">
        <div className="mx-auto grid max-w-[1120px] gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-s-line bg-s-card p-6 sm:p-8">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-s-fill" aria-hidden="true">
              <BadgeCheck className="h-5 w-5 text-s-faint" strokeWidth={1.75} />
            </span>
            <h2 id="about-built" className="mt-4 text-[20px] font-semibold">
              Built at African Leadership University
            </h2>
            <p className="mt-2 text-[14px] leading-[1.65] text-s-muted">The platform was designed and built at ALU as a capstone project.</p>
          </div>
          <div className="rounded-2xl border border-s-line bg-s-card p-6 sm:p-8">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-s-fill" aria-hidden="true">
              <Mail className="h-5 w-5 text-s-faint" strokeWidth={1.75} />
            </span>
            <h2 className="mt-4 text-[20px] font-semibold">Questions?</h2>
            <p className="mt-2 text-[14px] leading-[1.65] text-s-muted">Graduates and investors can message the team from their account.</p>
            <Link to="/app/contact" className="mt-4 inline-flex min-h-11 items-center gap-1 text-[14px] font-semibold text-s-link hover:underline">
              Contact the team
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      {/* Call to action */}
      <section className="border-t border-s-line px-4 py-16 sm:px-8 lg:px-16 lg:py-20">
        <div className="mx-auto flex max-w-[880px] flex-col items-center gap-6 text-center">
          <h2 className="text-[26px] font-medium tracking-[-0.6px] sm:text-[32px]">Start with a verified venture</h2>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <Link to="/register" className={`${PRIMARY} h-12 px-6 text-[15px]`}>
              Create an account
              <ArrowRight className={ARROW} aria-hidden="true" />
            </Link>
            <Link to="/ventures" className={`${GHOST} h-12 px-6 text-[15px]`}>
              Browse ventures
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
