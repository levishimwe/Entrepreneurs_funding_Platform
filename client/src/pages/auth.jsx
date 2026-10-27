import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronDown, Eye, EyeOff, Lock, Mail, Phone } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useAuth, homePathFor } from '../context/AuthContext';
import { Alert, Field } from '../components/ui';
import { PROGRAMS, SECTORS } from '../lib/constants';

// Where to go after signing in or verifying: an internal path from ?next=
// (home-page tiles send visitors here), never an external URL.
export const safeNext = (value) => (typeof value === 'string' && /^\/(?!\/)[\w\-/?=&.]*$/.test(value) ? value : null);
const withNext = (path, next) => (next ? `${path}${path.includes('?') ? '&' : '?'}next=${encodeURIComponent(next)}` : path);

// Shared form state + server-side validation errors.
export function useFormState(initial) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (name) => (e) => {
    const value = e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e;
    setValues((v) => ({ ...v, [name]: value }));
    setErrors((errs) => ({ ...errs, [name]: undefined }));
  };
  const run = async (fn) => {
    setBusy(true);
    setError('');
    setErrors({});
    try {
      return await fn();
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fields || {});
        setError(err.message);
      } else {
        setError('Something went wrong. Please try again.');
      }
      return undefined;
    } finally {
      setBusy(false);
    }
  };
  return { values, set, setValues, errors, error, setError, busy, run };
}

// Every sign-in, register, code and password screen: one white card on the
// light canvas, with the same labels and inputs as the admin forms.
function AuthCard({ title, subtitle, children, footer, wide = false }) {
  return (
    <div className="flex min-h-[calc(100vh-8rem)] items-start justify-center px-4 py-10 sm:items-center">
      <div className={`w-full ${wide ? 'max-w-2xl' : 'max-w-md'}`}>
        <div className="adm-card p-6 sm:p-8">
          <div className="mb-6">
            <h1 className="text-[20px] font-semibold">{title}</h1>
            {subtitle && <p className="adm-muted mt-1">{subtitle}</p>}
          </div>
          {children}
        </div>
        {footer && <div className="adm-muted mt-4 text-center">{footer}</div>}
      </div>
    </div>
  );
}

const darkInput = 'input';
const darkLabel = 'label';

function DarkField({ id, label, error, help, children }) {
  return (
    <Field label={label} htmlFor={id} error={error} help={help}>
      {children}
    </Field>
  );
}

// ---------------------------------------------------------------------------
// Sign in and register: a navy side panel and a light form column, drawn to
// the public site design. Field icons are limited to email, lock, eye and
// phone; everything else is text.

const INPUT =
  'h-10 w-full rounded-md border bg-white px-3 text-[14px] text-[#111827] outline-none transition-[border-color,box-shadow] placeholder:text-[#8a94a3] focus:border-[#2563eb] focus:ring-[3px] focus:ring-[#2563eb]/15';
const inputTone = (error) => (error ? 'border-[#dc2626]' : 'border-[#d9dfe7] hover:border-[#c3ccd8]');
const SUBMIT =
  'inline-flex h-11 w-full items-center justify-center rounded-md bg-[#2563eb] text-[14px] font-semibold text-white transition-colors hover:bg-[#1d4ed8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb] disabled:cursor-not-allowed disabled:opacity-60';
const LINK = 'font-semibold text-[#2563eb] hover:underline';

function FormAlert({ tone = 'error', children }) {
  if (!children) return null;
  const tones = {
    error: 'border-[#f5c2c2] bg-[#fdeaea] text-[#991b1b]',
    success: 'border-[#bfe5cb] bg-[#e7f6ec] text-[#166534]',
    info: 'border-[#c7d7fe] bg-[#e8efff] text-[#1e40af]',
  };
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`rounded-md border px-3 py-2.5 text-[13px] ${tones[tone]}`}>
      {children}
    </div>
  );
}

// Label, control, then help or the server's error for that field.
function LightField({ id, label, error, help, aside, children }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <label htmlFor={id} className="text-[13px] font-semibold text-[#111827]">
          {label}
        </label>
        {aside}
      </div>
      {children}
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-[12px] text-[#b91c1c]">
          {error}
        </p>
      ) : (
        help && <p className="mt-1.5 text-[12px] leading-[1.5] text-[#5b6676]">{help}</p>
      )}
    </div>
  );
}

// Text input with an optional leading icon and trailing control.
function IconInput({ icon: Icon, error, trailing, className = '', ...props }) {
  return (
    <div className="relative">
      {Icon && <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a94a3]" aria-hidden="true" />}
      <input
        className={`${INPUT} ${inputTone(error)} ${Icon ? 'pl-9' : ''} ${trailing ? 'pr-10' : ''} ${className}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${props.id}-error` : undefined}
        {...props}
      />
      {trailing}
    </div>
  );
}

function PasswordInput({ id, value, onChange, error, autoComplete, placeholder }) {
  const [shown, setShown] = useState(false);
  return (
    <IconInput
      id={id}
      icon={Lock}
      type={shown ? 'text' : 'password'}
      autoComplete={autoComplete}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      error={error}
      trailing={
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded text-[#5b6676] hover:text-[#111827] focus-visible:outline-2 focus-visible:outline-[#2563eb]"
          aria-label={shown ? 'Hide password' : 'Show password'}
          aria-pressed={shown}
        >
          {shown ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
        </button>
      }
    />
  );
}

// The same three rules the server enforces, ticked off while typing.
const PASSWORD_RULES = [
  ['At least 8 characters', (v) => v.length >= 8],
  ['One letter', (v) => /[A-Za-z]/.test(v)],
  ['One number', (v) => /[0-9]/.test(v)],
];
function PasswordRules({ value }) {
  return (
    <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px]" aria-label="Password rules">
      {PASSWORD_RULES.map(([label, test]) => {
        const ok = test(value);
        return (
          <li key={label} className={`flex items-center gap-1.5 ${ok ? 'text-[#15803d]' : 'text-[#5b6676]'}`}>
            <span className={`h-3 w-3 rounded-full border transition-colors ${ok ? 'border-[#15803d] bg-[#15803d]' : 'border-[#8a94a3]'}`} aria-hidden="true" />
            {label}
            <span className="sr-only">{ok ? ' (met)' : ' (not met yet)'}</span>
          </li>
        );
      })}
    </ul>
  );
}

function SelectInput({ id, value, onChange, error, children }) {
  return (
    <div className="relative">
      <select id={id} value={value} onChange={onChange} className={`${INPUT} ${inputTone(error)} appearance-none pr-9`} aria-invalid={error ? true : undefined}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5b6676]" aria-hidden="true" />
    </div>
  );
}

function FormSection({ title, subtitle, optional, children }) {
  return (
    <section className="border-t border-[#e3e8ef] pt-6 first:border-t-0 first:pt-0">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[16px] font-semibold text-[#111827]">{title}</h2>
          {subtitle && <p className="mt-0.5 text-[13px] text-[#5b6676]">{subtitle}</p>}
        </div>
        {optional && <span className="rounded-full bg-[#eef1f5] px-2 py-0.5 text-[11px] font-medium text-[#5b6676]">Optional</span>}
      </div>
      <div className="space-y-5">{children}</div>
    </section>
  );
}

// Navy column on the left (stacks above the form on narrow screens).
function SidePanel({ eyebrow, title, lede, children, note }) {
  return (
    <aside
      className="relative overflow-hidden px-6 py-12 text-white sm:px-10 lg:w-[520px] lg:shrink-0 lg:px-14 lg:py-[72px]"
      style={{
        background:
          'radial-gradient(90% 60% at 0% 0%, rgba(37,99,235,0.28), rgba(37,99,235,0) 70%), linear-gradient(180deg, #0c2245 0%, #0b1f3a 55%, #0a1a33 100%)',
      }}
    >
      <div className="flex h-full flex-col justify-between gap-10">
        <div className="land-rise">
          <p className="text-[12px] font-semibold uppercase tracking-[1.6px] text-[#60a5fa]">{eyebrow}</p>
          <h1 className="mt-4 text-[30px] font-semibold leading-[1.15] tracking-[-0.6px] sm:text-[36px]">{title}</h1>
          <p className="mt-4 max-w-[420px] text-[15px] leading-[1.6] text-white/75">{lede}</p>
          {children}
        </div>
        {note && <p className="rounded-lg border border-white/[0.12] bg-white/[0.05] px-5 py-4 text-[13px] leading-[1.55] text-white/75">{note}</p>}
      </div>
    </aside>
  );
}

function SplitPage({ panel, children }) {
  return (
    <div className="flex flex-1 flex-col lg:flex-row">
      {panel}
      <div className="flex flex-1 justify-center bg-[#f4f6f9] px-4 py-12 sm:px-8 lg:py-[72px]">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
const SIGN_IN_ROLES = [
  ['Graduates', 'Track your ventures, applications and introductions.'],
  ['Investors and sponsors', 'Browse verified ventures and follow up on introductions.'],
  ['ALU staff and administrators', 'Publish opportunities, review accounts and projects, and confirm results.'],
];

export function SignIn() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const next = safeNext(searchParams.get('next'));
  const { setUser } = useAuth();
  const f = useFormState({ email: '', password: '' });

  useEffect(() => {
    document.title = 'Sign in · ALU Ventures';
  }, []);

  const submit = (e) => {
    e.preventDefault();
    f.run(async () => {
      try {
        const { user } = await api.post('/auth/login', f.values);
        setUser(user);
        navigate(location.state?.from || next || homePathFor(user), { replace: true });
      } catch (err) {
        if (err.details?.code === 'EMAIL_NOT_VERIFIED') {
          navigate(withNext(`/verify-email?email=${encodeURIComponent(err.details.email)}`, next), { state: { resent: true } });
          return;
        }
        throw err;
      }
    });
  };

  return (
    <SplitPage
      panel={
        <SidePanel
          eyebrow="Welcome back"
          title="Pick up where you left off."
          lede="One sign-in for every role. We'll take you straight to your workspace."
          note="Sign-in is protected. After several failed attempts, sign-in pauses for a few minutes to keep your account safe."
        >
          <ul className="mt-10 space-y-3">
            {SIGN_IN_ROLES.map(([title, body], i) => (
              <li key={title} className="land-rise rounded-lg border border-white/[0.1] bg-white/[0.04] px-5 py-4" style={{ '--d': `${150 + i * 90}ms` }}>
                <p className="text-[15px] font-semibold">{title}</p>
                <p className="mt-0.5 text-[13px] leading-[1.5] text-white/70">{body}</p>
              </li>
            ))}
          </ul>
        </SidePanel>
      }
    >
      <div className="w-full max-w-[440px] self-center">
        <h1 className="text-[30px] font-semibold tracking-[-0.6px] text-[#111827]">Sign in</h1>
        <p className="mt-1.5 text-[14px] text-[#5b6676]">For graduates, investors, sponsors and ALU staff.</p>
        <div className="mt-7 rounded-lg border border-[#e3e8ef] bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)] sm:p-8">
          <form onSubmit={submit} className="space-y-5" noValidate>
            <FormAlert>{f.error}</FormAlert>
            {location.state?.message && <FormAlert tone="success">{location.state.message}</FormAlert>}
            <LightField id="email" label="Email address" error={f.errors.email}>
              <IconInput
                id="email"
                icon={Mail}
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={f.values.email}
                onChange={f.set('email')}
                error={f.errors.email}
                required
              />
            </LightField>
            <LightField
              id="password"
              label="Password"
              error={f.errors.password}
              aside={
                <Link to="/forgot-password" className="text-[12px] font-semibold text-[#2563eb] hover:underline">
                  Forgot password?
                </Link>
              }
            >
              <PasswordInput
                id="password"
                autoComplete="current-password"
                placeholder="Enter your password"
                value={f.values.password}
                onChange={f.set('password')}
                error={f.errors.password}
              />
            </LightField>
            <button type="submit" className={SUBMIT} disabled={f.busy}>
              {f.busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
          <div className="my-6 flex items-center gap-3 text-[12px] text-[#5b6676]">
            <span className="h-px flex-1 bg-[#e3e8ef]" />
            New to ALU Ventures?
            <span className="h-px flex-1 bg-[#e3e8ef]" />
          </div>
          <Link
            to={withNext('/register', next)}
            className="inline-flex h-11 w-full items-center justify-center rounded-md border border-[#d9dfe7] bg-white text-[14px] font-semibold text-[#111827] transition-colors hover:border-[#c3ccd8] hover:bg-[#f9fafb]"
          >
            Create a free account
          </Link>
        </div>
        <p className="mt-6 text-[13px] leading-[1.55] text-[#5b6676]">
          Haven&apos;t verified your email yet? Sign in as usual and we&apos;ll send you a new 6-digit code.
        </p>
      </div>
    </SplitPage>
  );
}

// Optional phone (FR02 allows SMS codes) and optional profile photo
// (JPEG or PNG, 5 MB; the server checks the actual file content).
const PHOTO_MAX = 5 * 1024 * 1024;
function PhoneAndPhoto({ f, prefix }) {
  const [preview, setPreview] = useState(null);
  const [photoError, setPhotoError] = useState('');
  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview]);

  const pick = (file) => {
    setPhotoError('');
    if (!file) return;
    if (!['image/jpeg', 'image/png'].includes(file.type)) return setPhotoError('Choose a JPEG or PNG image.');
    if (file.size > PHOTO_MAX) return setPhotoError('The photo must be 5 MB or smaller.');
    f.set('photo')(file);
    setPreview(URL.createObjectURL(file));
  };

  return (
    <FormSection title="Contact and photo" subtitle="Helps administrators and introduced contacts recognise and reach you." optional>
      <div className="grid gap-5 sm:grid-cols-2">
        <LightField id={`${prefix}-phone`} label="Phone number" error={f.errors.phone} help="Include your country code, e.g. +250 78 123 4567.">
          <IconInput
            id={`${prefix}-phone`}
            icon={Phone}
            type="tel"
            autoComplete="tel"
            placeholder="+250 78 123 4567"
            value={f.values.phone || ''}
            onChange={f.set('phone')}
            error={f.errors.phone}
          />
        </LightField>
        <div>
          <p className="mb-1.5 text-[13px] font-semibold text-[#111827]">Profile photo</p>
          <div className="flex items-center gap-3">
            {preview ? (
              <img src={preview} alt="Selected profile photo" className="h-10 w-10 shrink-0 rounded-full object-cover ring-1 ring-[#e3e8ef]" />
            ) : (
              <span className="h-10 w-10 shrink-0 rounded-full bg-[#eef1f5] ring-1 ring-[#e3e8ef]" aria-hidden="true" />
            )}
            <label
              htmlFor={`${prefix}-photo`}
              className="inline-flex h-9 cursor-pointer items-center rounded-md border border-[#d9dfe7] bg-white px-3 text-[13px] font-semibold text-[#111827] transition-colors hover:bg-[#f9fafb] focus-within:outline-2 focus-within:outline-[#2563eb]"
            >
              {f.values.photo ? 'Change photo' : 'Upload photo'}
              <input
                id={`${prefix}-photo`}
                type="file"
                accept="image/jpeg,image/png"
                className="sr-only"
                onChange={(e) => {
                  pick(e.target.files?.[0] || null);
                  e.target.value = '';
                }}
              />
            </label>
            {f.values.photo && (
              <button
                type="button"
                className="text-[13px] font-semibold text-[#b91c1c] hover:underline"
                onClick={() => {
                  f.set('photo')(null);
                  setPreview(null);
                }}
              >
                Remove
              </button>
            )}
          </div>
          {photoError || f.errors.profilePhoto ? (
            <p className="mt-1.5 text-[12px] text-[#b91c1c]">{photoError || f.errors.profilePhoto}</p>
          ) : (
            <p className="mt-1.5 text-[12px] text-[#5b6676]">JPEG or PNG, up to 5 MB.</p>
          )}
        </div>
      </div>
    </FormSection>
  );
}

// Degree certificate: click to browse or drop a file. The server checks the
// real file type and size again.
const CERT_MAX = 10 * 1024 * 1024;
const CERT_TYPES = ['application/pdf', 'image/png', 'image/jpeg'];
function CertificateDrop({ file, onFile, error }) {
  const [over, setOver] = useState(false);
  const [local, setLocal] = useState('');
  const take = (f) => {
    setLocal('');
    if (!f) return;
    if (!CERT_TYPES.includes(f.type)) return setLocal('Choose a PDF, PNG or JPEG file.');
    if (f.size > CERT_MAX) return setLocal('The certificate must be 10 MB or smaller.');
    onFile(f);
  };
  const message = local || error;
  return (
    <div>
      <label
        htmlFor="g-file"
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          take(e.dataTransfer.files?.[0] || null);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-[1.5px] border-dashed px-6 py-9 text-center transition-colors focus-within:outline-2 focus-within:outline-[#2563eb] ${
          over ? 'border-[#2563eb] bg-[#e8efff]' : message ? 'border-[#dc2626] bg-[#fdf6f6]' : 'border-[#c3ccd8] bg-[#f9fafb] hover:border-[#2563eb]'
        }`}
      >
        {file ? (
          <>
            <span className="max-w-full truncate text-[14px] font-semibold text-[#111827]">{file.name}</span>
            <span className="mt-1 text-[12px] text-[#5b6676]">{(file.size / 1024 / 1024).toFixed(1)} MB · Click or drop to replace</span>
          </>
        ) : (
          <>
            <span className="text-[14px] text-[#111827]">
              <span className="font-semibold text-[#2563eb]">Browse files</span> or drag and drop your certificate
            </span>
            <span className="mt-1 text-[12px] text-[#5b6676]">PDF, PNG or JPEG · up to 10 MB</span>
          </>
        )}
        <input
          id="g-file"
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
          className="sr-only"
          onChange={(e) => {
            take(e.target.files?.[0] || null);
            e.target.value = '';
          }}
        />
      </label>
      {message && <p className="mt-1.5 text-[12px] text-[#b91c1c]">{message}</p>}
      <p className="mt-3 text-[12px] text-[#5b6676]">Stored privately. Only ALU Ventures administrators can view it.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
function GraduateForm({ next }) {
  const navigate = useNavigate();
  const f = useFormState({ fullName: '', email: '', password: '', phone: '', cohortYear: '', program: '', file: null, photo: null });
  const [helpOpen, setHelpOpen] = useState(false);

  const submit = (e) => {
    e.preventDefault();
    f.run(async () => {
      const data = new FormData();
      ['fullName', 'email', 'password', 'cohortYear', 'program'].forEach((k) => data.append(k, f.values[k]));
      // Optional fields go only when filled in.
      if (f.values.phone.trim()) data.append('phone', f.values.phone.trim());
      if (f.values.file) data.append('degreeCertificate', f.values.file);
      if (f.values.photo) data.append('profilePhoto', f.values.photo);
      const res = await api.upload('/auth/register/graduate', data);
      navigate(withNext(`/verify-email?email=${encodeURIComponent(res.email)}`, next));
    });
  };

  const years = Array.from({ length: 13 }, (_, i) => new Date().getFullYear() + 1 - i);

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      <FormAlert>{f.error}</FormAlert>
      <FormSection title="Account details" subtitle="You'll use these to sign in.">
        <LightField id="g-name" label="Full name" error={f.errors.fullName} help="Exactly as it appears on your degree certificate.">
          <IconInput
            id="g-name"
            autoComplete="name"
            placeholder="e.g. Aziza Solace"
            value={f.values.fullName}
            onChange={f.set('fullName')}
            error={f.errors.fullName}
          />
        </LightField>
        <div>
          <LightField id="g-email" label="ALU alumni email" error={f.errors.email} help="Use your official @alueducation.com or @alustudent.com address.">
            <IconInput
              id="g-email"
              icon={Mail}
              type="email"
              autoComplete="email"
              placeholder="you@alueducation.com"
              value={f.values.email}
              onChange={f.set('email')}
              error={f.errors.email}
            />
          </LightField>
          <button
            type="button"
            className="mt-1.5 text-[12px] font-semibold text-[#2563eb] hover:underline"
            aria-expanded={helpOpen}
            onClick={() => setHelpOpen((o) => !o)}
          >
            No access to your alumni email?
          </button>
          {helpOpen && (
            <p className="mt-1.5 rounded-md bg-[#e8efff] px-3 py-2 text-[12px] leading-[1.5] text-[#1e3a8a]">
              Ask ALU IT support to restore it first; graduate accounts need the official address.
            </p>
          )}
        </div>
        <LightField id="g-password" label="Password" error={f.errors.password}>
          <PasswordInput
            id="g-password"
            autoComplete="new-password"
            placeholder="Create a password"
            value={f.values.password}
            onChange={f.set('password')}
            error={f.errors.password}
          />
          <PasswordRules value={f.values.password} />
        </LightField>
      </FormSection>

      <FormSection title="Your ALU studies" subtitle="Must match what's on your degree certificate.">
        <div className="grid gap-5 sm:grid-cols-2">
          <LightField id="g-year" label="Graduation year" error={f.errors.cohortYear}>
            <SelectInput id="g-year" value={f.values.cohortYear} onChange={f.set('cohortYear')} error={f.errors.cohortYear}>
              <option value="">Select year</option>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </SelectInput>
          </LightField>
          <LightField id="g-program" label="Degree programme" error={f.errors.program}>
            <SelectInput id="g-program" value={f.values.program} onChange={f.set('program')} error={f.errors.program}>
              <option value="">Select programme</option>
              {PROGRAMS.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </SelectInput>
          </LightField>
        </div>
      </FormSection>

      <FormSection title="Degree certificate" subtitle="We use it to confirm you graduated from ALU.">
        <CertificateDrop file={f.values.file} onFile={(file) => f.set('file')(file)} error={f.errors.degreeCertificate} />
      </FormSection>

      <PhoneAndPhoto f={f} prefix="g" />

      <div className="border-t border-[#e3e8ef] pt-6">
        <button type="submit" className={SUBMIT} disabled={f.busy}>
          {f.busy ? 'Creating account…' : 'Create graduate account'}
        </button>
        <p className="mt-3 text-center text-[12px] text-[#5b6676]">Next, we&apos;ll email you a 6-digit code to verify your address.</p>
      </div>
    </form>
  );
}

function InvestorForm({ next }) {
  const navigate = useNavigate();
  const f = useFormState({
    fullName: '',
    email: '',
    password: '',
    investorType: 'investor',
    organisation: '',
    website: '',
    sectors: [],
    bio: '',
    phone: '',
  });
  const toggleSector = (s) => f.setValues((v) => ({ ...v, sectors: v.sectors.includes(s) ? v.sectors.filter((x) => x !== s) : [...v.sectors, s] }));

  const submit = (e) => {
    e.preventDefault();
    f.run(async () => {
      const data = new FormData();
      Object.entries(f.values).forEach(([k, v]) => {
        if (k === 'photo') return;
        if (k === 'phone' && !String(v).trim()) return;
        data.append(k, k === 'sectors' ? JSON.stringify(v) : v);
      });
      if (f.values.photo) data.append('profilePhoto', f.values.photo);
      const res = await api.upload('/auth/register/investor', data);
      navigate(withNext(`/verify-email?email=${encodeURIComponent(res.email)}`, next));
    });
  };

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      <FormAlert>{f.error}</FormAlert>
      <FormSection title="Account details" subtitle="You'll use these to sign in.">
        <LightField id="i-name" label="Full name" error={f.errors.fullName}>
          <IconInput
            id="i-name"
            autoComplete="name"
            placeholder="e.g. Grace Mutoni"
            value={f.values.fullName}
            onChange={f.set('fullName')}
            error={f.errors.fullName}
          />
        </LightField>
        <LightField id="i-email" label="Work email" error={f.errors.email}>
          <IconInput
            id="i-email"
            icon={Mail}
            type="email"
            autoComplete="email"
            placeholder="you@organisation.com"
            value={f.values.email}
            onChange={f.set('email')}
            error={f.errors.email}
          />
        </LightField>
        <LightField id="i-password" label="Password" error={f.errors.password}>
          <PasswordInput
            id="i-password"
            autoComplete="new-password"
            placeholder="Create a password"
            value={f.values.password}
            onChange={f.set('password')}
            error={f.errors.password}
          />
          <PasswordRules value={f.values.password} />
        </LightField>
      </FormSection>

      <FormSection title="Your organisation" subtitle="An administrator reviews these details before approving access.">
        <fieldset>
          <legend className="mb-1.5 text-[13px] font-semibold text-[#111827]">I am joining as</legend>
          <div className="grid grid-cols-2 gap-2">
            {[
              ['investor', 'Investor'],
              ['sponsor', 'Sponsor / Funder'],
            ].map(([value, label]) => (
              <label
                key={value}
                className={`flex h-10 cursor-pointer items-center justify-center rounded-md border text-[13px] transition-colors focus-within:outline-2 focus-within:outline-[#2563eb] ${
                  f.values.investorType === value
                    ? 'border-[#2563eb] bg-[#e8efff] font-semibold text-[#1d4ed8]'
                    : 'border-[#d9dfe7] bg-white text-[#5b6676] hover:border-[#c3ccd8]'
                }`}
              >
                <input
                  type="radio"
                  name="investorType"
                  value={value}
                  className="sr-only"
                  checked={f.values.investorType === value}
                  onChange={f.set('investorType')}
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="grid gap-5 sm:grid-cols-2">
          <LightField id="i-org" label="Organisation" error={f.errors.organisation}>
            <IconInput id="i-org" autoComplete="organization" value={f.values.organisation} onChange={f.set('organisation')} error={f.errors.organisation} />
          </LightField>
          <LightField id="i-website" label="Website (optional)" error={f.errors.website}>
            <IconInput id="i-website" type="url" placeholder="https://" value={f.values.website} onChange={f.set('website')} error={f.errors.website} />
          </LightField>
        </div>
      </FormSection>

      <FormSection title="Interests" subtitle="Helps you find ventures that fit.">
        <fieldset>
          <legend className="mb-1.5 text-[13px] font-semibold text-[#111827]">Sectors of interest</legend>
          <div className="flex flex-wrap gap-2">
            {SECTORS.map((s) => {
              const on = f.values.sectors.includes(s);
              return (
                <button
                  type="button"
                  key={s}
                  aria-pressed={on}
                  onClick={() => toggleSector(s)}
                  className={`rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors ${
                    on ? 'border-[#2563eb] bg-[#e8efff] text-[#1d4ed8]' : 'border-[#d9dfe7] bg-white text-[#5b6676] hover:text-[#111827]'
                  }`}
                >
                  {s}
                </button>
              );
            })}
          </div>
          {f.errors.sectors && <p className="mt-1.5 text-[12px] text-[#b91c1c]">{f.errors.sectors}</p>}
        </fieldset>
        <LightField id="i-bio" label="About you (optional)" error={f.errors.bio}>
          <textarea
            id="i-bio"
            rows={3}
            className={`${INPUT} ${inputTone(f.errors.bio)} h-auto py-2.5`}
            value={f.values.bio}
            onChange={f.set('bio')}
            placeholder="What kinds of ventures you back, and how you support founders."
          />
        </LightField>
      </FormSection>

      <PhoneAndPhoto f={f} prefix="i" />

      <div className="border-t border-[#e3e8ef] pt-6">
        <button type="submit" className={SUBMIT} disabled={f.busy}>
          {f.busy ? 'Creating account…' : 'Request investor access'}
        </button>
        <p className="mt-3 text-center text-[12px] text-[#5b6676]">Next, we&apos;ll email you a 6-digit code to verify your address.</p>
      </div>
    </form>
  );
}

const JOIN = {
  graduate: {
    title: 'Turn your venture into a verified record.',
    lede: 'Verified ALU graduates submit ventures for administrator review, apply to hackathons, grants and competitions, and meet investors through consent-based introductions.',
    steps: [
      ['Create your account', 'Have your degree certificate ready as a PDF or image.'],
      ['Verify your email', 'We send a 6-digit code to your ALU address. It expires after 10 minutes.'],
      ['Administrator review', 'An administrator checks your certificate, then unlocks full access.'],
    ],
    ready: [
      ['Your ALU alumni email', '@alueducation.com or @alustudent.com'],
      ['Your degree certificate', 'PDF, PNG or JPEG, up to 10 MB'],
      ['A profile photo (optional)', 'JPEG or PNG, up to 5 MB'],
    ],
    note: 'Your certificate is stored privately and only seen by ALU Ventures administrators.',
  },
  investor: {
    title: 'Back verified ALU graduate ventures.',
    lede: 'Approved investors and sponsors browse administrator-reviewed ventures and request introductions. Founders decide whether to share their contact details.',
    steps: [
      ['Create your account', 'Tell us about you and your organisation.'],
      ['Verify your email', 'We send a 6-digit code to your work address. It expires after 10 minutes.'],
      ['Administrator review', 'An administrator reviews your details, then you can browse ventures and request introductions.'],
    ],
    ready: [
      ['Your work email', 'The address you use at your organisation'],
      ['Your organisation details', 'Name, and a website if you have one'],
      ['A profile photo (optional)', 'JPEG or PNG, up to 5 MB'],
    ],
    note: 'Contact details are shared only after a founder accepts your introduction request.',
  },
};

export function Register() {
  const [params, setParams] = useSearchParams();
  const next = safeNext(params.get('next'));
  const role = params.get('role') === 'investor' ? 'investor' : 'graduate';
  const copy = JOIN[role];

  useEffect(() => {
    document.title = 'Create your account · ALU Ventures';
  }, []);

  const choose = (value) => setParams({ ...(value === 'investor' ? { role: 'investor' } : {}), ...(next ? { next } : {}) });

  return (
    <SplitPage
      panel={
        <SidePanel key={role} eyebrow="Join ALU Ventures" title={copy.title} lede={copy.lede} note={copy.note}>
          <p className="mt-10 text-[13px] font-semibold text-white/80">How it works</p>
          <ol className="mt-4">
            {copy.steps.map(([title, body], i) => (
              <li key={title} className="land-rise flex gap-4" style={{ '--d': `${150 + i * 100}ms` }}>
                <span className="flex flex-col items-center">
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold ${
                      i === 0 ? 'bg-[#2563eb] text-white' : 'border border-white/25 text-white/85'
                    }`}
                  >
                    {i + 1}
                  </span>
                  {i < copy.steps.length - 1 && <span className="my-1.5 w-px flex-1 bg-white/15" aria-hidden="true" />}
                </span>
                <span className={i < copy.steps.length - 1 ? 'pb-7' : ''}>
                  <span className="block text-[15px] font-semibold">{title}</span>
                  <span className="mt-0.5 block text-[13px] leading-[1.5] text-white/70">{body}</span>
                </span>
              </li>
            ))}
          </ol>
          <div className="mt-8 rounded-lg border border-white/[0.12] bg-white/[0.05] p-5">
            <p className="text-[13px] font-semibold text-white/85">Before you start, have ready</p>
            <ul className="mt-3 space-y-3">
              {copy.ready.map(([title, body]) => (
                <li key={title}>
                  <span className="block text-[14px] font-semibold">{title}</span>
                  <span className="block text-[12px] text-white/65">{body}</span>
                </li>
              ))}
            </ul>
          </div>
        </SidePanel>
      }
    >
      <div className="w-full max-w-[600px]">
        <h1 className="text-[30px] font-semibold tracking-[-0.6px] text-[#111827]">Create your account</h1>
        <p className="mt-1.5 text-[14px] text-[#5b6676]">An administrator reviews every account before granting full access.</p>

        <fieldset className="mt-7">
          <legend className="mb-2 text-[13px] font-semibold text-[#111827]">I&apos;m joining as</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              ['graduate', 'ALU graduate', 'Showcase a venture and apply to opportunities.'],
              ['investor', 'Investor / sponsor', 'Discover and back ALU-built ventures.'],
            ].map(([value, label, body]) => {
              const on = role === value;
              return (
                <label
                  key={value}
                  className={`flex cursor-pointer items-start justify-between gap-3 rounded-lg border-[1.5px] bg-white p-4 transition-[border-color,box-shadow] focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[#2563eb] ${
                    on ? 'border-[#2563eb] bg-[#f5f8ff] shadow-[0_0_0_3px_rgba(37,99,235,0.12)]' : 'border-[#e3e8ef] hover:border-[#c3ccd8]'
                  }`}
                >
                  <span>
                    <span className="block text-[14px] font-semibold text-[#111827]">{label}</span>
                    <span className="mt-0.5 block text-[12px] leading-[1.5] text-[#5b6676]">{body}</span>
                  </span>
                  <input
                    type="radio"
                    name="role"
                    value={value}
                    checked={on}
                    onChange={() => choose(value)}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-[#2563eb]"
                  />
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="mt-6 rounded-lg border border-[#e3e8ef] bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)] sm:p-8">
          {role === 'graduate' ? <GraduateForm key="g" next={next} /> : <InvestorForm key="i" next={next} />}
        </div>
        <p className="mt-6 text-center text-[13px] text-[#5b6676]">
          Already have an account?{' '}
          <Link to={withNext('/signin', next)} className={LINK}>
            Sign in
          </Link>
        </p>
      </div>
    </SplitPage>
  );
}

// ---------------------------------------------------------------------------
export function VerifyEmail() {
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const location = useLocation();
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const email = params.get('email') || '';
  const f = useFormState({ code: '' });
  const [notice, setNotice] = useState(location.state?.resent ? 'Your email is not verified yet — we have sent you a new code.' : '');

  const submit = (e) => {
    e.preventDefault();
    f.run(async () => {
      const { user } = await api.post('/auth/verify-email', { email, code: f.values.code });
      setUser(user);
      navigate(next || homePathFor(user), { replace: true });
    });
  };
  const resend = () =>
    f.run(async () => {
      const res = await api.post('/auth/resend-code', { email });
      setNotice(res.message);
    });

  return (
    <AuthCard title="Check your email" subtitle={`We sent a 6-digit code to ${email || 'your email address'}.`}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {f.error && <Alert type="error">{f.error}</Alert>}
        {notice && !f.error && <Alert type="info">{notice}</Alert>}
        <DarkField id="code" label="Verification code" error={f.errors.code} help="The code expires after 10 minutes.">
          <input
            id="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            className="input text-center font-mono text-lg tracking-[0.5em]"
            value={f.values.code}
            onChange={(e) => f.set('code')(e.target.value.replace(/\D/g, ''))}
          />
        </DarkField>
        <button type="submit" className="btn-primary w-full" disabled={f.busy || f.values.code.length !== 6}>
          Verify email
        </button>
        <button type="button" onClick={resend} className="adm-a w-full text-center" disabled={f.busy}>
          Send a new code
        </button>
      </form>
    </AuthCard>
  );
}

// ---------------------------------------------------------------------------
export function ForgotPassword() {
  const navigate = useNavigate();
  const f = useFormState({ email: '' });
  const [sent, setSent] = useState('');

  const submit = (e) => {
    e.preventDefault();
    f.run(async () => {
      const res = await api.post('/auth/forgot-password', f.values);
      setSent(res.message);
    });
  };

  return (
    <AuthCard
      title="Reset your password"
      subtitle="Enter the email address on your account and we will send you a one-time reset code."
      footer={
        <Link to="/signin" className="adm-a">
          Back to sign in
        </Link>
      }
    >
      {sent ? (
        <div className="space-y-4">
          <Alert type="success">{sent}</Alert>
          <button type="button" className="btn-primary w-full" onClick={() => navigate(`/reset-password?email=${encodeURIComponent(f.values.email)}`)}>
            I have a code
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          {f.error && <Alert type="error">{f.error}</Alert>}
          <Field label="Email address" htmlFor="fp-email" error={f.errors.email}>
            <input id="fp-email" type="email" autoComplete="email" className="input" value={f.values.email} onChange={f.set('email')} />
          </Field>
          <button type="submit" className="btn-primary w-full" disabled={f.busy}>
            {f.busy ? 'Sending…' : 'Send reset code'}
          </button>
          <p className="adm-hint text-center">Codes expire after 10 minutes and allow five attempts.</p>
        </form>
      )}
    </AuthCard>
  );
}

export function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const f = useFormState({
    email: params.get('email') || '',
    code: params.get('code') || '',
    password: '',
    confirmPassword: '',
  });

  const submit = (e) => {
    e.preventDefault();
    f.run(async () => {
      await api.post('/auth/reset-password', f.values);
      setUser(null);
      navigate('/password-updated', { replace: true });
    });
  };

  return (
    <AuthCard title="Set a new password" subtitle="Choose a password you have not used on this account before.">
      <form onSubmit={submit} className="space-y-4" noValidate>
        {f.error && <Alert type="error">{f.error}</Alert>}
        <Field label="Email address" htmlFor="rp-email" error={f.errors.email}>
          <input id="rp-email" type="email" className="input" value={f.values.email} onChange={f.set('email')} />
        </Field>
        <Field label="Reset code" htmlFor="rp-code" error={f.errors.code}>
          <input
            id="rp-code"
            inputMode="numeric"
            maxLength={6}
            autoComplete="one-time-code"
            className="input font-mono tracking-widest"
            value={f.values.code}
            onChange={(e) => f.set('code')(e.target.value.replace(/\D/g, ''))}
          />
        </Field>
        <Field label="New password" htmlFor="rp-password" error={f.errors.password} help="At least 8 characters, including a letter and a number.">
          <input id="rp-password" type="password" autoComplete="new-password" className="input" value={f.values.password} onChange={f.set('password')} />
        </Field>
        <Field label="Confirm new password" htmlFor="rp-confirm" error={f.errors.confirmPassword}>
          <input
            id="rp-confirm"
            type="password"
            autoComplete="new-password"
            className="input"
            value={f.values.confirmPassword}
            onChange={f.set('confirmPassword')}
          />
        </Field>
        <button type="submit" className="btn-primary w-full" disabled={f.busy}>
          {f.busy ? 'Updating…' : 'Update password'}
        </button>
        <p className="adm-hint text-center">Updating your password signs you out on every device.</p>
      </form>
    </AuthCard>
  );
}

export function PasswordUpdated() {
  useEffect(() => {
    document.title = 'Password updated · ALU Ventures';
  }, []);
  return (
    <AuthCard title="Password updated successfully" subtitle="For your security, all existing sessions have been signed out.">
      <Link to="/signin" className="btn-primary w-full">
        Sign in with your new password
      </Link>
    </AuthCard>
  );
}
