import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { POLICY_UPDATED_LABEL, PRIVACY_EMAIL } from '../lib/policies';

// Privacy Policy and Terms of Use. Every statement here describes what the code
// does today (models, routes, services and client forms); change the text when
// the behaviour changes, and update the version in lib/policies.js and
// server/src/config/policies.js together.

const A = 'font-semibold text-s-link hover:underline';

function Mail() {
  return (
    <a href={`mailto:${PRIVACY_EMAIL}`} className={`${A} break-all`}>
      {PRIVACY_EMAIL}
    </a>
  );
}

function ContactPage() {
  return (
    <Link to="/app/contact" className={A}>
      Contact page
    </Link>
  );
}

function LegalPage({ eyebrow, title, intro, sections }) {
  return (
    <div className="flex-1 bg-s-bg text-s-ink">
      <header className="border-b border-s-line px-4 pb-10 pt-12 sm:px-8 lg:px-16 lg:pb-14 lg:pt-16">
        <div className="mx-auto max-w-[760px]">
          <p className="text-[12px] font-semibold uppercase tracking-[1.6px] text-s-accent">{eyebrow}</p>
          <h1 className="mt-3 text-[32px] font-medium leading-[1.1] tracking-[-0.8px] sm:text-[40px]">{title}</h1>
          <p className="mt-3 text-[14px] text-s-muted">Last updated: {POLICY_UPDATED_LABEL}</p>
          <p className="mt-5 text-[16px] leading-[1.65] text-s-soft">{intro}</p>
        </div>
      </header>
      <div className="px-4 py-10 sm:px-8 lg:px-16 lg:py-14">
        <div className="mx-auto grid max-w-[760px] gap-10">
          <nav aria-label="On this page" className="border-b border-s-line pb-8">
            <p className="text-[13px] font-semibold text-s-ink">On this page</p>
            <ol className="mt-3 grid gap-x-8 gap-y-1 sm:grid-cols-2">
              {sections.map((s, i) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="inline-flex min-h-11 items-center text-[14px] text-s-muted hover:text-s-ink lg:min-h-9">
                    {i + 1}. {s.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
          {sections.map((s, i) => (
            <section key={s.id} id={s.id} className="scroll-mt-24" aria-labelledby={`${s.id}-h`}>
              <h2 id={`${s.id}-h`} className="text-[21px] font-semibold tracking-[-0.3px]">
                {i + 1}. {s.title}
              </h2>
              <div className="legal-body mt-3 grid gap-3 text-[15px] leading-[1.7] text-s-soft">{s.body}</div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

function List({ items }) {
  return (
    <ul className="grid list-disc gap-1.5 pl-5 marker:text-s-faint">
      {items.map((t, i) => (
        <li key={i}>{t}</li>
      ))}
    </ul>
  );
}

function Sub({ children }) {
  return <h3 className="mt-2 text-[15px] font-semibold text-s-ink">{children}</h3>;
}

// ---------------------------------------------------------------------------
// Shared lists (also used in short form on the home page).

export const NEVER_COLLECTED = [
  'Payment or card details. The platform takes no payments.',
  'Your GPS or precise location. A project only records the country you type in.',
  'Advertising or analytics trackers.',
  'Third-party cookies. The only cookie is the platform’s own sign-in cookie.',
  'National ID numbers, date of birth or gender.',
  'IP addresses in our database. Your address is used only in memory to limit repeated sign-in and code attempts.',
];

const PRIVACY_SECTIONS = [
  {
    id: 'who-we-are',
    title: 'Who we are',
    body: (
      <>
        <p>
          ALU Ventures (the ALU Graduate Entrepreneurship &amp; Funding Platform) is a capstone project at African Leadership University, built by Levis Ishimwe and
          supervised by David Neza Tuyishimire. It connects ALU graduates who build ventures with investors and sponsors, and lets ALU staff run hackathons, grants
          and competitions.
        </p>
        <p>
          For privacy questions and data requests, write to <Mail />.
        </p>
      </>
    ),
  },
  {
    id: 'what-we-collect',
    title: 'What we collect',
    body: (
      <>
        <Sub>Everyone with an account</Sub>
        <List
          items={[
            'Full name and email address.',
            'Your password, stored only as a one-way hash (we never see or store the password itself).',
            'An optional phone number.',
            'An optional profile photo, which only you and administrators can see.',
            'Your theme choice (light, dark or system).',
            'The emails the platform sends you (address, subject and text), kept in its email outbox.',
            'A record of actions on your account and projects (for example registered, approved, submitted), kept in an audit log.',
            'When you registered, your agreement to this Privacy Policy and the Terms of Use, with the version and time.',
          ]}
        />
        <Sub>Graduates</Sub>
        <List
          items={[
            'Your ALU alumni email, graduation year and degree programme.',
            'An optional public profile: a short bio and a public image, shown only if you turn on public-profile consent.',
            'Your projects: title, sector, stage, country, summary, description and funding sought; for a registered company, the company name, registration number and your relationship to it; whether you consent to public listing; and an optional background image.',
            'Documents you upload for a project (for example an RDB certificate or an RRA document), and the text that automated checks read from them.',
            'Your posts (with an optional image), applications to opportunities, testimony, and messages to the administrator (with an optional attachment).',
          ]}
        />
        <p>
          Degree certificates are no longer requested at registration. Certificates uploaded before that change are kept but no longer used.
        </p>
        <Sub>Investors and sponsors</Sub>
        <List
          items={[
            'Your organisation, whether you are an investor or a sponsor, an optional website, the sectors you are interested in and an optional bio.',
            'Introduction requests, meeting and investment confirmations, funding calls (sector, amount, currency and message), post reports, testimony, and messages to the administrator.',
          ]}
        />
        <Sub>ALU staff and administrators</Sub>
        <List
          items={[
            'Name, email and password hash. These accounts are created by the platform’s setup, never by self-registration.',
            'The decisions they make and the reasons they give, kept in the audit log.',
          ]}
        />
        <Sub>Sign-in codes</Sub>
        <p>
          The six-digit codes for email verification and password reset are stored only as a keyed hash. They expire after 10 minutes and work once.
        </p>
      </>
    ),
  },
  {
    id: 'never-collect',
    title: 'What we never collect',
    body: <List items={NEVER_COLLECTED} />,
  },
  {
    id: 'why',
    title: 'Why we collect it',
    body: (
      <List
        items={[
          'To create your account, confirm your email and let you sign in.',
          'To check that graduate accounts and ventures are genuine before they are listed. An administrator reviews every account and project.',
          'To connect investors and founders through introductions, and to record meetings and investments that both sides confirm.',
          'To run hackathons, grants and competitions: applications, selection decisions and results.',
          'To send you the emails the platform needs to send (codes, decisions, introductions, and messages from ALU staff).',
          'To keep a record of decisions so that they can be checked later.',
        ]}
      />
    ),
  },
  {
    id: 'who-sees-it',
    title: 'Who sees it',
    body: (
      <>
        <List
          items={[
            'Public visitors see an approved project only if its founder consented to public listing, with the founder’s name, graduation year and programme. They also see approved testimonies (with the author’s name and organisation or class year), investors the administrator chose to show on the home page, and public announcements.',
            'Approved investors and sponsors see approved projects and the founder’s name, graduation year and programme. They see a graduate’s public profile, public image and posts only if the graduate turned on public-profile consent.',
            'Contact details (email and phone number) are shared between a graduate and an investor only after the graduate accepts that investor’s introduction request. Until then, neither side sees the other’s contact details.',
            'ALU staff see the details they need to review applications and funding calls, including applicants’ names, emails, graduation years and programmes.',
            'Administrators see account and project data, including uploaded documents, to review accounts, projects and reports.',
          ]}
        />
        <p>Email addresses, phone numbers and uploaded documents are never shown on the public site. Project codes are never listed publicly.</p>
      </>
    ),
  },
  {
    id: 'services',
    title: 'Services that process data on our behalf',
    body: (
      <>
        <List
          items={[
            'Aiven (MySQL database): stores the platform’s records, reached over an encrypted, certificate-checked connection.',
            'Cloudflare R2: stores uploaded files (documents and images) in a private bucket.',
            'Brevo: delivers the platform’s emails, so it receives each recipient’s email address and the email’s subject and text.',
            'Google Gemini API: when this option is enabled, uploaded company documents may be sent to Gemini to read them. Only the document is sent, never your name, email or the numbers you typed. An administrator always makes the final decision.',
            'Render: hosts the platform’s server, so every request to it passes through Render.',
            'Vercel: hosts the website and passes its requests on to the server.',
            'Google Fonts: the site loads its fonts from Google, so your browser contacts Google when you visit.',
          ]}
        />
      </>
    ),
  },
  {
    id: 'protection',
    title: 'How we protect it',
    body: (
      <List
        items={[
          'Passwords are stored only as bcrypt hashes; administrators never see or set them.',
          'Sign-in codes are stored only as hashes, expire after 10 minutes, allow at most five attempts and work once.',
          'Your session is kept in an HttpOnly cookie that page scripts cannot read.',
          'Uploaded files are kept in private storage and sent only to people allowed to see them.',
          'Role checks run on the server for every action that needs an account, not only in the browser.',
          'Decisions are recorded in an audit log with who made them, when and why.',
          'Images that other people can see (public images, project background images and post images) are re-encoded, which removes hidden photo data such as location.',
        ]}
      />
    ),
  },
  {
    id: 'retention',
    title: 'How long we keep it, and how to correct or delete it',
    body: (
      <>
        <p>
          There is no automatic deletion schedule. Data is kept until an administrator archives or deletes it.
        </p>
        <Sub>Correcting your data</Sub>
        <p>
          In Settings you can change your phone number and photo, and graduates can edit their public profile and image. Graduates can revise their projects (a
          revised project is reviewed again) and edit recent posts. To correct anything else, such as your name, send a request through the <ContactPage /> or
          write to <Mail />.
        </p>
        <Sub>Deleting your data</Sub>
        <List
          items={[
            'You can delete your own posts and withdraw your own testimony at any time.',
            'Graduates can turn off public-profile consent in Settings, and can turn off public listing of a project by editing it (an edited project goes back for review).',
            <>
              To have your account deleted, ask through the <ContactPage /> or write to <Mail />. An administrator archives the account and can then delete it
              permanently, together with your projects, documents and files, unless records others rely on stand in the way (for example a recorded investment).
            </>,
            'After an account is deleted, the audit log keeps its entries about past decisions, but without the deleted person’s id.',
          ]}
        />
      </>
    ),
  },
  {
    id: 'cookies',
    title: 'Cookies and browser storage',
    body: (
      <>
        <List
          items={[
            'alu_session: the platform’s own sign-in cookie. It is HttpOnly, sent only to this site, and expires after the session length (12 hours by default) or when you sign out.',
            'Your light or dark choice for the public site, saved in your browser’s local storage.',
            'For administrators and staff, the choice between table and card views, saved in local storage.',
          ]}
        />
        <p>There are no advertising, analytics or third-party cookies.</p>
      </>
    ),
  },
  {
    id: 'audience',
    title: 'Who the platform is for',
    body: <p>The platform is built for ALU graduates, investors, sponsors and ALU staff. We do not ask for your age.</p>,
  },
  {
    id: 'rights',
    title: 'Your rights',
    body: (
      <>
        <p>You can ask to:</p>
        <List
          items={[
            'see the personal data we hold about you;',
            'correct data that is wrong;',
            'have your data deleted, as described above;',
            'withdraw a consent you gave, such as public-profile consent or public listing of a project.',
          ]}
        />
        <p>
          To ask, use the <ContactPage /> (graduates and investors, after signing in) or write to <Mail />. These rights are in line with Rwanda’s law on the
          protection of personal data and privacy (Law No. 058/2021).
        </p>
      </>
    ),
  },
  {
    id: 'changes',
    title: 'Changes to this policy',
    body: (
      <p>
        When this policy changes, the &ldquo;Last updated&rdquo; date at the top changes too. New accounts agree to the version shown when they register.
      </p>
    ),
  },
  {
    id: 'contact',
    title: 'Contact',
    body: (
      <p>
        Privacy questions and data requests: <Mail />. Signed-in graduates and investors can also use the <ContactPage />.
      </p>
    ),
  },
];

const TERMS_SECTIONS = [
  {
    id: 'who-may-use',
    title: 'Who may use the platform',
    body: (
      <>
        <p>
          ALU Ventures is for ALU graduates, investors and sponsors, and ALU staff. Anyone can view the public pages. By creating an account you agree to these Terms
          of Use and to the <Link to="/privacy" className={A}>Privacy Policy</Link>.
        </p>
      </>
    ),
  },
  {
    id: 'accounts',
    title: 'Accounts and approval',
    body: (
      <List
        items={[
          'Graduate accounts need an ALU alumni email, confirmed with a one-time code, and are then approved by an administrator.',
          'Investor and sponsor accounts are approved by an administrator.',
          'Staff and administrator accounts are created by the platform’s setup and cannot be requested.',
          'Keep your password to yourself. You are responsible for what is done with your account.',
        ]}
      />
    ),
  },
  {
    id: 'accurate',
    title: 'Accurate information',
    body: <p>Give true and current information about yourself, your organisation and your ventures, and correct it when it changes.</p>,
  },
  {
    id: 'acceptable-use',
    title: 'Acceptable use',
    body: (
      <>
        <p>You must not:</p>
        <List
          items={[
            'upload fake, altered or someone else’s documents;',
            'pretend to be another person or organisation;',
            'harass, threaten or abuse anyone;',
            'post contact details or other people’s private information in posts;',
            'try to get around access rules or interfere with the platform.',
          ]}
        />
        <p>Investors and sponsors can report a post, and an administrator can remove it with a reason.</p>
      </>
    ),
  },
  {
    id: 'content',
    title: 'Content you submit and consent to publication',
    body: (
      <List
        items={[
          'You keep ownership of the projects, posts, images and documents you submit.',
          'You allow the platform to store and show them as described in the Privacy Policy, so that administrators, staff, investors and sponsors can review them.',
          'A project appears on the public site only if you consent to public listing. Your public profile is shown only if you turn on public-profile consent. You can withdraw either consent.',
        ]}
      />
    ),
  },
  {
    id: 'investments',
    title: 'Introductions and investments',
    body: (
      <p>
        The platform records introductions, and records an investment after both the investor and the founder confirm it. The platform processes no payments: any
        money moves directly between the people involved, outside the platform.
      </p>
    ),
  },
  {
    id: 'no-guarantee',
    title: 'No guarantee of funding',
    body: (
      <p>
        Listing a project, an introduction or an application does not guarantee funding, selection or an award. A verified record confirms an
        administrator-approved venture on this platform; it is not an investment recommendation. Investors and sponsors make their own decisions.
      </p>
    ),
  },
  {
    id: 'suspension',
    title: 'Suspension and archiving',
    body: (
      <p>
        An administrator can reject or archive an account, project or opportunity, and remove a post or announcement, when it breaks these terms or is no longer
        active. Archived records can later be permanently deleted under the rules in the Privacy Policy.
      </p>
    ),
  },
  {
    id: 'ip',
    title: 'Intellectual property',
    body: (
      <List
        items={[
          'Your content stays yours.',
          'The platform’s code belongs to its author, Levis Ishimwe. No licence to reuse it is granted.',
          'The ALU logo is used with the institution’s approval for this project only.',
        ]}
      />
    ),
  },
  {
    id: 'open-source',
    title: 'Open-source libraries',
    body: <p>The platform is built with open-source libraries (for example React, Express and Tesseract.js), each used under its own licence.</p>,
  },
  {
    id: 'liability',
    title: 'Limitation of liability',
    body: (
      <p>
        ALU Ventures is an academic capstone project and is provided &ldquo;as is&rdquo;, without warranties. Automated document checks are a review aid and can be
        wrong. The free hosting can be slow to wake up or briefly unavailable. To the extent the law allows, the author is not liable for losses arising from use of
        the platform, including investment decisions.
      </p>
    ),
  },
  {
    id: 'law',
    title: 'Governing law',
    body: <p>These terms are governed by the laws of Rwanda.</p>,
  },
  {
    id: 'changes',
    title: 'Changes to these terms',
    body: <p>When these terms change, the &ldquo;Last updated&rdquo; date at the top changes too. New accounts agree to the version shown when they register.</p>,
  },
  {
    id: 'contact',
    title: 'Contact',
    body: (
      <p>
        Questions about these terms: <Mail />. Signed-in graduates and investors can also use the <ContactPage />.
      </p>
    ),
  },
];

export function Privacy() {
  useEffect(() => {
    document.title = 'Privacy Policy · ALU Ventures';
  }, []);
  return (
    <LegalPage
      eyebrow="Privacy Policy"
      title="Your data on ALU Ventures"
      intro="What the platform collects, what it never collects, who can see your data, and how to have it corrected or deleted. Written in plain English."
      sections={PRIVACY_SECTIONS}
    />
  );
}

export function Terms() {
  useEffect(() => {
    document.title = 'Terms of Use · ALU Ventures';
  }, []);
  return (
    <LegalPage
      eyebrow="Terms of Use"
      title="Using ALU Ventures"
      intro="The rules for using the platform, what you agree to when you create an account, and what the platform does and does not do."
      sections={TERMS_SECTIONS}
    />
  );
}
