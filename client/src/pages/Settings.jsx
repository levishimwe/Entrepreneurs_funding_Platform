import { useEffect, useState } from 'react';
import { NavLink, useParams } from 'react-router-dom';
import { BadgeCheck, CheckCircle2, Info, Monitor, Palette, RefreshCw, User } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Alert, Field, formatDate } from '../components/ui';
import Avatar from '../components/Avatar';
import { Breadcrumb } from '../components/kit';

const ROLE = { graduate: 'Graduate Founder', investor: 'Investor / Sponsor', admin: 'Administrator', staff: 'ALU Staff' };

// Mini window previews drawn with Tailwind, as on the Figma theme cards.
function Preview({ mode }) {
  const light = (
    <div className="h-full w-full bg-white p-2">
      <div className="mb-2 flex items-center gap-1">
        <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
        <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
        <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
        <span className="ml-auto h-1.5 w-8 rounded-full bg-blue-500" />
      </div>
      <div className="mb-1 h-1.5 w-3/4 rounded bg-slate-200" />
      <div className="mb-2 h-1.5 w-1/2 rounded bg-slate-200" />
      <div className="h-2.5 w-8 rounded bg-blue-600" />
    </div>
  );
  const dark = (
    <div className="h-full w-full bg-[#0d1117] p-2">
      <div className="mb-2 flex items-center gap-1">
        <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
        <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
        <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
        <span className="ml-auto h-1.5 w-8 rounded-full bg-blue-400" />
      </div>
      <div className="mb-1 h-1.5 w-3/4 rounded bg-slate-700" />
      <div className="mb-2 h-1.5 w-1/2 rounded bg-slate-700" />
      <div className="h-2.5 w-8 rounded bg-green-600" />
    </div>
  );
  return (
    <div className="flex h-24 overflow-hidden rounded-md ring-1 ring-line" aria-hidden="true">
      {mode === 'light' && light}
      {mode === 'dark' && dark}
      {mode === 'system' && (
        <>
          <div className="w-1/2 overflow-hidden">{light}</div>
          <div className="w-1/2 overflow-hidden">{dark}</div>
        </>
      )}
    </div>
  );
}

const THEMES = [
  ['light', 'Light default', 'Optimised for bright rooms, daytime review and presentations.'],
  ['dark', 'Dark default', 'Easier on the eyes in low light and for long review sessions.'],
  ['system', 'Sync with system', 'Switches between light and dark automatically with your device settings.'],
];

function applyPreview(theme) {
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

function Appearance() {
  const { user, setUser } = useAuth();
  const [choice, setChoice] = useState(user.theme || 'light');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    applyPreview(choice);
  }, [choice]);
  // Leaving without saving restores the saved theme.
  useEffect(() => () => applyPreview(user.theme || 'light'), [user.theme]);

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await api.patch('/account/preferences', { theme: choice });
      setUser({ ...user, theme: res.theme });
      setStatus('Theme saved to your account. It applies on every device you sign in to.');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <section className="card p-5">
        <h1 className="text-2xl font-semibold tracking-tight">Theme preferences</h1>
        <p className="mt-1 text-sm text-muted">Choose how ALU Ventures looks to you. Select a single theme, or sync with your device&apos;s preference for day and night.</p>
      </section>

      <section className="card p-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold">Theme mode</h2>
          <span className="inline-flex items-center gap-1 text-xs text-muted">
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Saved to your account
          </span>
        </div>
        <p className="mt-0.5 text-sm text-muted">Applies to every page of the platform, including dashboards, review queues and documents.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-3" role="radiogroup" aria-label="Theme">
          {THEMES.map(([value, label, body]) => {
            const selected = choice === value;
            const active = user.theme === value;
            return (
              <label key={value} className={`relative cursor-pointer rounded-lg p-3 ring-1 ${selected ? 'bg-accent-soft ring-2 ring-accent' : 'bg-subtle ring-line hover:ring-accent/50'}`}>
                {active && <span className="absolute -top-2 right-3 rounded bg-accent px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">Active</span>}
                <input type="radio" name="theme" value={value} checked={selected} onChange={() => setChoice(value)} className="sr-only" />
                <Preview mode={value} />
                <span className="mt-3 flex items-center justify-between">
                  <span className="font-semibold">{label}</span>
                  <span className={`flex h-4 w-4 items-center justify-center rounded-full ring-1 ${selected ? 'ring-accent' : 'ring-line'}`} aria-hidden="true">
                    {selected && <span className="h-2.5 w-2.5 rounded-full bg-accent" />}
                  </span>
                </span>
                <span className="mt-1 block text-xs text-muted">{body}</span>
              </label>
            );
          })}
        </div>
        <div className="mt-4 flex gap-2 rounded-md bg-accent-soft/60 p-3 text-sm ring-1 ring-line">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
          <p>
            <span className="font-semibold">Global account synchronization.</span> Your theme is stored on your account, not in this
            browser, so it follows you to every device and every part of the platform.
          </p>
        </div>
      </section>

      {error && <Alert type="error">{error}</Alert>}
      <div className="card flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-1.5 text-xs text-muted">
          <CheckCircle2 className="h-4 w-4 text-green-600" aria-hidden="true" />
          {status || (choice === user.theme ? 'Your saved theme is applied.' : 'Previewing — save to keep this theme.')}
        </p>
        <div className="flex gap-2">
          <button type="button" className="btn-secondary" onClick={() => setChoice('light')}>
            Reset defaults
          </button>
          <button type="button" className="btn-primary" disabled={busy || choice === user.theme} onClick={save}>
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> {busy ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Profile() {
  const { user, setUser } = useAuth();
  const [phone, setPhone] = useState(user.phone || '');
  const [photoKey, setPhotoKey] = useState(0);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [busy, setBusy] = useState(false);

  const savePhone = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setFieldError('');
    try {
      const res = await api.patch('/account/profile', { phone });
      setUser({ ...user, phone: res.phone });
      setPhone(res.phone || '');
      setNotice('Profile saved.');
    } catch (err) {
      setFieldError(err.fields?.phone || '');
      setError(err.fields?.phone ? '' : err.message);
    } finally {
      setBusy(false);
    }
  };
  const uploadPhoto = async (file) => {
    if (!file) return;
    setError('');
    try {
      const data = new FormData();
      data.append('profilePhoto', file);
      await api.upload('/account/photo', data);
      setUser({ ...user, hasPhoto: true });
      setPhotoKey((k) => k + 1);
      setNotice('Photo updated.');
    } catch (err) {
      setError(err.message);
    }
  };
  const removePhoto = async () => {
    await api.delete('/account/photo');
    setUser({ ...user, hasPhoto: false });
    setNotice('Photo removed.');
  };

  return (
    <div className="space-y-5">
      <section className="card p-5">
        <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
        <p className="mt-1 text-sm text-muted">Your photo and contact number. Your name and email are tied to your verified account.</p>
      </section>
      {notice && <Alert type="success">{notice}</Alert>}
      {error && <Alert type="error">{error}</Alert>}
      <section className="card p-5">
        <h2 className="font-semibold">Profile photo</h2>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <Avatar key={photoKey} name={user.fullName} src={user.hasPhoto ? `/api/account/photo?v=${photoKey}` : null} size="lg" />
          <label htmlFor="photo" className="btn-secondary cursor-pointer">
            {user.hasPhoto ? 'Change photo' : 'Upload photo'}
          </label>
          <input
            id="photo"
            type="file"
            accept="image/jpeg,image/png"
            className="sr-only"
            onChange={(e) => {
              uploadPhoto(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          {user.hasPhoto && (
            <button type="button" className="text-sm text-muted hover:text-red-600" onClick={removePhoto}>
              Remove
            </button>
          )}
          <p className="w-full text-xs text-muted">JPEG or PNG, up to 5 MB. Only you and administrators can see it.</p>
        </div>
      </section>
      <form className="card space-y-4 p-5" onSubmit={savePhone}>
        <h2 className="font-semibold">Contact details</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" htmlFor="name" help="Contact the administrator to correct your name.">
            <input id="name" className="input bg-subtle" value={user.fullName} readOnly />
          </Field>
          <Field label="Email" htmlFor="email">
            <input id="email" className="input bg-subtle" value={user.email} readOnly />
          </Field>
          <Field label="Phone number (optional)" htmlFor="phone" error={fieldError} help="e.g. +250 78 123 4567">
            <input id="phone" type="tel" className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
        </div>
        <div className="flex justify-end">
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
    </div>
  );
}

// Account Settings (Figma "Account Settings – Appearance").
export default function Settings() {
  const { section } = useParams();
  const { user } = useAuth();
  const current = section === 'appearance' ? 'appearance' : 'profile';

  useEffect(() => {
    document.title = `${current === 'appearance' ? 'Appearance' : 'Profile'} · Settings · ALU Ventures`;
  }, [current]);

  return (
    <div className="grid gap-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
      <div className="space-y-4">
        <div>
          <Breadcrumb items={[['Settings', '/app/settings'], [current === 'appearance' ? 'Appearance' : 'Profile']]} />
          <p className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted">Personal preferences</p>
          <nav className="space-y-0.5" aria-label="Settings">
            {[
              ['/app/settings', 'Profile', User, true],
              ['/app/settings/appearance', 'Appearance', Palette, false],
            ].map(([to, label, Icon, end]) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `relative flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm ${
                    isActive ? 'bg-accent-soft font-semibold text-accent before:absolute before:inset-y-1 before:left-0 before:w-0.5 before:rounded-full before:bg-accent' : 'hover:bg-subtle'
                  }`
                }
              >
                <Icon className="h-4 w-4" aria-hidden="true" /> {label}
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="card p-3 text-xs">
          <p className="flex items-center gap-1.5 font-semibold">
            {user.approved ? <BadgeCheck className="h-3.5 w-3.5 text-green-600" aria-hidden="true" /> : <Monitor className="h-3.5 w-3.5 text-muted" aria-hidden="true" />}
            {user.approved ? `Verified ${ROLE[user.role]}` : 'Pending verification'}
          </p>
          <p className="mt-1 font-mono text-[11px] text-muted">ID: ALU-{user.role.toUpperCase()}-{String(user.id).padStart(4, '0')}</p>
          <p className="text-muted">Member since {formatDate(user.createdAt)}</p>
        </div>
      </div>
      <div className="min-w-0">{current === 'appearance' ? <Appearance /> : <Profile />}</div>
    </div>
  );
}
