import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useAuth, homePathFor } from '../context/AuthContext';
import { Alert, Field } from '../components/ui';
import { PROGRAMS, SECTORS } from '../lib/constants';

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
export function SignIn() {
  const navigate = useNavigate();
  const location = useLocation();
  const { setUser } = useAuth();
  const f = useFormState({ email: '', password: '' });

  const submit = (e) => {
    e.preventDefault();
    f.run(async () => {
      try {
        const { user } = await api.post('/auth/login', f.values);
        setUser(user);
        navigate(location.state?.from || homePathFor(user), { replace: true });
      } catch (err) {
        if (err.details?.code === 'EMAIL_NOT_VERIFIED') {
          navigate(`/verify-email?email=${encodeURIComponent(err.details.email)}`, { state: { resent: true } });
          return;
        }
        throw err;
      }
    });
  };

  return (
    <AuthCard
      title="Sign in"
      subtitle="Graduates, investors, sponsors and ALU staff"
     
      footer={
        <>
          New here?{' '}
          <Link to="/register" className="adm-a font-medium">
            Create a free account
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {f.error && <Alert type="error">{f.error}</Alert>}
        {location.state?.message && <Alert type="success">{location.state.message}</Alert>}
        <DarkField id="email" label="Email address" error={f.errors.email}>
          <input id="email" type="email" autoComplete="email" className={darkInput} value={f.values.email} onChange={f.set('email')} required />
        </DarkField>
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label htmlFor="password" className="label !mb-0">
              Password
            </label>
            <Link to="/forgot-password" className="adm-a text-[12px]">
              Forgot password?
            </Link>
          </div>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            className={darkInput}
            value={f.values.password}
            onChange={f.set('password')}
            required
          />
          {f.errors.password && <p className="mt-1 text-xs text-red-600">{f.errors.password}</p>}
        </div>
        <button type="submit" className="btn-primary w-full" disabled={f.busy}>
          {f.busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </AuthCard>
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
    <div className="grid gap-4 sm:grid-cols-2">
      <DarkField id={`${prefix}-phone`} label="Phone number (optional)" error={f.errors.phone} help="e.g. +250 78 123 4567">
        <input id={`${prefix}-phone`} type="tel" autoComplete="tel" className={darkInput} value={f.values.phone} onChange={f.set('phone')} />
      </DarkField>
      <DarkField id={`${prefix}-photo`} label="Profile photo (optional)" error={photoError || f.errors.profilePhoto} help="JPEG or PNG, up to 5 MB.">
        <div className="flex items-center gap-3">
          {preview ? (
            <img src={preview} alt="Selected profile photo" className="h-10 w-10 shrink-0 rounded-full object-cover ring-1 ring-line" />
          ) : (
            <span className="h-10 w-10 shrink-0 rounded-full bg-subtle ring-1 ring-line" aria-hidden="true" />
          )}
          <label htmlFor={`${prefix}-photo`} className="btn-secondary cursor-pointer">
            {f.values.photo ? 'Change photo' : 'Choose photo'}
          </label>
          {f.values.photo && (
            <button
              type="button"
              className="adm-act adm-act-danger"
              onClick={() => {
                f.set('photo')(null);
                setPreview(null);
              }}
            >
              Remove
            </button>
          )}
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
        </div>
      </DarkField>
    </div>
  );
}

// ---------------------------------------------------------------------------
function GraduateForm() {
  const navigate = useNavigate();
  const f = useFormState({ fullName: '', email: '', password: '', phone: '', cohortYear: '', program: '', file: null, photo: null });

  const submit = (e) => {
    e.preventDefault();
    f.run(async () => {
      const data = new FormData();
      ['fullName', 'email', 'password', 'cohortYear', 'program'].forEach((k) => data.append(k, f.values[k]));
      if (f.values.file) data.append('degreeCertificate', f.values.file);
      const res = await api.upload('/auth/register/graduate', data);
      navigate(`/verify-email?email=${encodeURIComponent(res.email)}`);
    });
  };

  const years = Array.from({ length: 13 }, (_, i) => new Date().getFullYear() + 1 - i);

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {f.error && <Alert type="error">{f.error}</Alert>}
      <DarkField id="g-name" label="Full name" error={f.errors.fullName} help="Exactly as it appears on your degree certificate.">
        <input id="g-name" className={darkInput} autoComplete="name" value={f.values.fullName} onChange={f.set('fullName')} />
      </DarkField>
      <DarkField id="g-email" label="ALU alumni email" error={f.errors.email} help="Use your official @alueducation.com or @alustudent.com address.">
        <input id="g-email" type="email" className={darkInput} autoComplete="email" value={f.values.email} onChange={f.set('email')} />
      </DarkField>
      <DarkField id="g-password" label="Password" error={f.errors.password} help="At least 8 characters, including a letter and a number.">
        <input id="g-password" type="password" className={darkInput} autoComplete="new-password" value={f.values.password} onChange={f.set('password')} />
      </DarkField>
      <PhoneAndPhoto f={f} prefix="g" />
      <div className="grid gap-4 sm:grid-cols-2">
        <DarkField id="g-year" label="Graduation year" error={f.errors.cohortYear}>
          <select id="g-year" className={darkInput} value={f.values.cohortYear} onChange={f.set('cohortYear')}>
            <option value="">Select year</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </DarkField>
        <DarkField id="g-program" label="Degree programme" error={f.errors.program}>
          <select id="g-program" className={darkInput} value={f.values.program} onChange={f.set('program')}>
            <option value="">Select programme</option>
            {PROGRAMS.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </DarkField>
      </div>
      <DarkField id="g-file" label="ALU degree certificate" help="PDF, PNG or JPEG, up to 10 MB. Stored privately and reviewed by an administrator.">
        <label
          htmlFor="g-file"
          className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-line bg-subtle px-3 py-3 hover:border-accent"
        >
          <span className="truncate">{f.values.file ? f.values.file.name : 'Choose your degree certificate…'}</span>
        </label>
        <input
          id="g-file"
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
          className="sr-only"
          onChange={(e) => f.set('file')(e.target.files?.[0] || null)}
        />
      </DarkField>
      <p className="adm-hint">No access to your ALU alumni email? Ask ALU IT support to restore it first; graduate accounts need the official address.</p>
      <button type="submit" className="btn-primary w-full" disabled={f.busy}>
        {f.busy ? 'Creating account…' : 'Create graduate account'}
      </button>
    </form>
  );
}

function InvestorForm() {
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
  });
  const toggleSector = (s) =>
    f.setValues((v) => ({ ...v, sectors: v.sectors.includes(s) ? v.sectors.filter((x) => x !== s) : [...v.sectors, s] }));

  const submit = (e) => {
    e.preventDefault();
    f.run(async () => {
      const data = new FormData();
      Object.entries(f.values).forEach(([k, v]) => {
        if (k === 'photo') return;
        data.append(k, k === 'sectors' ? JSON.stringify(v) : v);
      });
      if (f.values.photo) data.append('profilePhoto', f.values.photo);
      const res = await api.upload('/auth/register/investor', data);
      navigate(`/verify-email?email=${encodeURIComponent(res.email)}`);
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {f.error && <Alert type="error">{f.error}</Alert>}
      <fieldset>
        <legend className={darkLabel}>I am joining as</legend>
        <div className="grid grid-cols-2 gap-2">
          {[
            ['investor', 'Investor'],
            ['sponsor', 'Sponsor / Funder'],
          ].map(([value, label]) => (
            <label
              key={value}
              className={`cursor-pointer rounded-md border px-3 py-1.5 text-center ${
                f.values.investorType === value ? 'border-accent bg-accent-soft font-semibold text-accent' : 'border-line text-muted'
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
      <div className="grid gap-4 sm:grid-cols-2">
        <DarkField id="i-name" label="Full name" error={f.errors.fullName}>
          <input id="i-name" className={darkInput} autoComplete="name" value={f.values.fullName} onChange={f.set('fullName')} />
        </DarkField>
        <DarkField id="i-org" label="Organisation" error={f.errors.organisation}>
          <input id="i-org" className={darkInput} autoComplete="organization" value={f.values.organisation} onChange={f.set('organisation')} />
        </DarkField>
      </div>
      <DarkField id="i-email" label="Work email" error={f.errors.email}>
        <input id="i-email" type="email" className={darkInput} autoComplete="email" value={f.values.email} onChange={f.set('email')} />
      </DarkField>
      <DarkField id="i-website" label="Website (optional)" error={f.errors.website}>
        <input id="i-website" type="url" placeholder="https://" className={darkInput} value={f.values.website} onChange={f.set('website')} />
      </DarkField>
      <DarkField id="i-password" label="Password" error={f.errors.password} help="At least 8 characters, including a letter and a number.">
        <input id="i-password" type="password" className={darkInput} autoComplete="new-password" value={f.values.password} onChange={f.set('password')} />
      </DarkField>
      <PhoneAndPhoto f={f} prefix="i" />
      <fieldset>
        <legend className={darkLabel}>Sectors of interest</legend>
        <div className="flex flex-wrap gap-2">
          {SECTORS.map((s) => {
            const on = f.values.sectors.includes(s);
            return (
              <button
                type="button"
                key={s}
                aria-pressed={on}
                onClick={() => toggleSector(s)}
                className={`rounded-full border px-3 py-1 text-[12px] ${on ? 'border-accent bg-accent-soft text-accent' : 'border-line text-muted hover:text-ink'}`}
              >
                {s}
              </button>
            );
          })}
        </div>
      </fieldset>
      <DarkField id="i-bio" label="About you (optional)" error={f.errors.bio}>
        <textarea id="i-bio" rows={3} className={darkInput} value={f.values.bio} onChange={f.set('bio')} />
      </DarkField>
      <button type="submit" className="btn-primary w-full" disabled={f.busy}>
        {f.busy ? 'Creating account…' : 'Request investor access'}
      </button>
    </form>
  );
}

export function Register() {
  const [params, setParams] = useSearchParams();
  const role = params.get('role') === 'investor' ? 'investor' : 'graduate';
  return (
    <AuthCard
      wide
      title="Create an account"
      subtitle="An administrator reviews every account before full access."
      footer={
        <>
          Already registered?{' '}
          <Link to="/signin" className="adm-a font-medium">
            Sign in
          </Link>
        </>
      }
    >
      <div role="tablist" aria-label="Account type" className="mb-6 flex gap-6 border-b border-line">
        {[
          ['graduate', 'ALU graduate'],
          ['investor', 'Investor / sponsor'],
        ].map(([value, label]) => (
          <button
            key={value}
            role="tab"
            type="button"
            aria-selected={role === value}
            onClick={() => setParams(value === 'investor' ? { role: 'investor' } : {})}
            className={`-mb-px border-b-2 py-2 text-[13px] ${role === value ? 'border-accent font-semibold text-ink' : 'border-transparent text-muted hover:text-ink'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {role === 'graduate' ? <GraduateForm /> : <InvestorForm />}
    </AuthCard>
  );
}

// ---------------------------------------------------------------------------
export function VerifyEmail() {
  const [params] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const email = params.get('email') || '';
  const f = useFormState({ code: '' });
  const [notice, setNotice] = useState(
    location.state?.resent ? 'Your email is not verified yet — we have sent you a new code.' : ''
  );

  const submit = (e) => {
    e.preventDefault();
    f.run(async () => {
      const { user } = await api.post('/auth/verify-email', { email, code: f.values.code });
      setUser(user);
      navigate(homePathFor(user), { replace: true });
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
          <input id="rp-confirm" type="password" autoComplete="new-password" className="input" value={f.values.confirmPassword} onChange={f.set('confirmPassword')} />
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
