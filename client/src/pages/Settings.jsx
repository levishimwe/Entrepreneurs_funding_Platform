import { useEffect, useState } from 'react';
import { Link, NavLink, useParams } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { api } from '../lib/api';
import { passwordProblem, usePolicy } from '../lib/passwordPolicy';
import { PasswordRules } from './auth';
import { useAuth } from '../context/AuthContext';
import { Field, formatDate } from '../components/ui';
import Avatar from '../components/Avatar';
import { AdminPage, KeyValue, Messages } from '../components/admin';

const ROLE = { graduate: 'Graduate founder', investor: 'Investor / sponsor', admin: 'Administrator', staff: 'ALU staff' };
const THEMES = [
  ['light', 'Light'],
  ['dark', 'Dark'],
  ['system', 'Same as this device'],
];

function applyPreview(theme) {
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

function Appearance() {
  const { user, setUser } = useAuth();
  const [choice, setChoice] = useState(user.theme || 'light');
  const [notice, setNotice] = useState('');
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
      setNotice('Theme saved to your account. It applies on every device you sign in to.');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Messages notice={notice} error={error} />
      <fieldset className="adm-card max-w-xl p-4">
        <legend className="sr-only">Theme</legend>
        {THEMES.map(([value, label]) => (
          <label key={value} className="flex items-center gap-2 py-1.5">
            <input type="radio" name="theme" value={value} checked={choice === value} onChange={() => setChoice(value)} />
            {label}
            {user.theme === value && <span className="adm-muted text-[12px]">(saved)</span>}
          </label>
        ))}
        <p className="adm-hint mt-2">Previewing now. Save to keep it on every device.</p>
        <button type="button" className="adm-primary" disabled={busy || choice === user.theme} onClick={save}>
          {busy ? 'Saving…' : 'Save theme'}
        </button>
      </fieldset>
    </>
  );
}

const TESTIMONY_STATUS = { pending: 'Waiting for administrator approval', approved: 'Approved — shown on the home page', rejected: 'Not approved' };

// A short testimony for the home page; public only after administrator approval.
function Testimony() {
  const { user } = useAuth();
  const [current, setCurrent] = useState(undefined);
  const [body, setBody] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get('/testimonials/mine')
      .then((d) => {
        setCurrent(d.testimonial);
        setBody(d.testimonial?.body || '');
      })
      .catch((e) => setError(e.message));
  }, []);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const d = await api.put('/testimonials/mine', { body });
      setCurrent(d.testimonial);
      setNotice('Sent for approval. It appears on the home page once an administrator approves it.');
    } catch (err) {
      setError(err.fields?.body || err.message);
    } finally {
      setBusy(false);
    }
  };
  const withdraw = async () => {
    await api.delete('/testimonials/mine');
    setCurrent(null);
    setBody('');
    setNotice('Testimony withdrawn.');
  };

  if (current === undefined && !error) return null;
  return (
    <>
      <Messages notice={notice} error={error} />
      {current && (
        <p className="adm-hint">
          Status: {TESTIMONY_STATUS[current.status]}
          {current.status === 'rejected' && current.decisionReason ? ` (${current.decisionReason})` : ''}
        </p>
      )}
      <form className="adm-card max-w-xl space-y-4 p-4" onSubmit={save}>
        <Field
          label="Your testimony"
          htmlFor="testimony"
          help={`${body.trim().length} / 600. Shown with your name and ${user.role === 'investor' ? 'organisation' : 'cohort'}. Editing sends it back for approval.`}
        >
          <textarea id="testimony" rows={5} className="input" value={body} onChange={(e) => setBody(e.target.value)} maxLength={600} />
        </Field>
        <div className="flex gap-2">
          <button type="submit" className="adm-primary" disabled={busy || body.trim().length < 20 || user.status !== 'active'}>
            {busy ? 'Sending…' : current ? 'Update and resubmit' : 'Send for approval'}
          </button>
          {current && (
            <button type="button" className="adm-act adm-act-danger" onClick={withdraw}>
              Withdraw
            </button>
          )}
        </div>
        {user.status !== 'active' && <p className="adm-hint !mb-0">Available once your account is approved.</p>}
      </form>
    </>
  );
}

// What investors and sponsors see: a separate public image (not the account
// photo), a short bio and the consent that turns both on. The server resizes
// the image to 1200px and strips its metadata.
const PUBLIC_IMAGE_MAX = 3 * 1024 * 1024;
function PublicProfile() {
  const { user, setUser } = useAuth();
  const g = user.graduateProfile || {};
  const [bio, setBio] = useState(g.bio || '');
  const [consent, setConsent] = useState(Boolean(g.publicProfileConsent));
  const [version, setVersion] = useState(0);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const setProfile = (changes) => setUser({ ...user, graduateProfile: { ...g, ...changes } });

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await api.patch('/account/public-profile', { bio, consent });
      setProfile({ bio: res.bio, publicProfileConsent: res.publicProfileConsent });
      setNotice(
        res.publicProfileConsent ? 'Saved. Investors and sponsors can now see your profile.' : 'Saved. Your profile is hidden from investors and sponsors.',
      );
    } catch (err) {
      setError(err.fields?.bio || err.message);
    } finally {
      setBusy(false);
    }
  };
  const upload = async (file) => {
    if (!file) return;
    setError('');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return setError('Choose a JPG, PNG or WebP image.');
    if (file.size > PUBLIC_IMAGE_MAX) return setError('The image must be 3 MB or smaller.');
    try {
      const data = new FormData();
      data.append('publicImage', file);
      await api.upload('/account/public-image', data);
      setProfile({ hasPublicImage: true });
      setVersion((v) => v + 1);
      setNotice('Public image updated.');
    } catch (err) {
      setError(err.message);
    }
  };
  const remove = async () => {
    await api.delete('/account/public-image');
    setProfile({ hasPublicImage: false });
    setNotice('Public image removed. Investors see your initials instead.');
  };

  return (
    <>
      <h2>Public profile</h2>
      <Messages notice={notice} error={error} />
      <form className="adm-card max-w-xl space-y-4 p-4" onSubmit={save}>
        <div className="flex flex-wrap items-center gap-4">
          {g.hasPublicImage ? (
            <img
              key={version}
              src={`/api/account/public-image?v=${version}`}
              alt="Your public image"
              className="h-20 w-20 rounded-xl object-cover ring-1 ring-line"
            />
          ) : (
            <span
              className="flex h-20 w-20 items-center justify-center rounded-xl bg-subtle text-[20px] font-semibold text-muted ring-1 ring-line"
              aria-hidden="true"
            >
              {user.fullName
                .split(/\s+/)
                .slice(0, 2)
                .map((p) => p[0])
                .join('')}
            </span>
          )}
          <label htmlFor="public-image" className="adm-secondary cursor-pointer">
            {g.hasPublicImage ? 'Replace image' : 'Upload public image'}
          </label>
          <input
            id="public-image"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(e) => {
              upload(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          {g.hasPublicImage && (
            <button type="button" className="adm-act adm-act-danger" onClick={remove}>
              Remove
            </button>
          )}
          <p className="adm-hint w-full !mb-0">JPG, PNG or WebP, up to 3 MB. Separate from your account photo; resized and stripped of location data.</p>
        </div>
        <Field label="Short bio (optional)" htmlFor="public-bio" help={`${bio.length} / 500. Shown on your profile to investors and sponsors.`}>
          <textarea id="public-bio" rows={4} maxLength={500} className="input" value={bio} onChange={(e) => setBio(e.target.value)} />
        </Field>
        <label className="flex items-start gap-2">
          <input type="checkbox" className="mt-1" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>
            Investors and sponsors may see this photo.
            <span className="adm-hint block !mb-0">
              This also shows them your profile, bio and posts. Without it they see only your initials, and you cannot post.
            </span>
          </span>
        </label>
        <div className="flex flex-wrap items-center gap-4">
          <button type="submit" className="adm-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save public profile'}
          </button>
          <Link to={`/app/graduates/${user.id}`} className="adm-a">
            Preview my profile
          </Link>
        </div>
      </form>
    </>
  );
}

function Profile() {
  const { user, setUser } = useAuth();
  const canContact = ['graduate', 'investor'].includes(user.role);
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
    <>
      <Messages notice={notice} error={error} />
      <KeyValue
        rows={[
          ['Role', ROLE[user.role]],
          [
            'Account ID',
            <span key="id" className="adm-mono">
              ALU-{user.role.toUpperCase()}-{String(user.id).padStart(4, '0')}
            </span>,
          ],
          ['Member since', formatDate(user.createdAt)],
        ]}
      />

      <h2>Photo</h2>
      <div className="adm-card flex max-w-xl flex-wrap items-center gap-4 p-4">
        <Avatar key={photoKey} name={user.fullName} src={user.hasPhoto ? `/api/account/photo?v=${photoKey}` : null} size="lg" />
        <label htmlFor="photo" className="adm-secondary cursor-pointer">
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
          <button type="button" className="adm-act adm-act-danger" onClick={removePhoto}>
            Remove
          </button>
        )}
        <p className="adm-hint w-full !mb-0">JPEG or PNG, up to 5 MB. Only you and administrators can see it.</p>
      </div>

      {user.role === 'graduate' && <PublicProfile />}

      <h2>Contact details</h2>
      <form className="adm-card max-w-xl space-y-4 p-4" onSubmit={savePhone}>
        <Field
          label="Full name"
          htmlFor="name"
          help={
            canContact ? (
              <Link to="/app/contact?category=profile" className="adm-a">
                Request a name change
              </Link>
            ) : (
              'Contact the administrator to correct your name.'
            )
          }
        >
          <input id="name" className="input bg-subtle" value={user.fullName} readOnly />
        </Field>
        <Field label="Email" htmlFor="email">
          <input id="email" className="input bg-subtle" value={user.email} readOnly />
        </Field>
        <Field label="Phone number (optional)" htmlFor="phone" error={fieldError} help="e.g. +250 78 123 4567">
          <input id="phone" type="tel" className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <button type="submit" className="adm-primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </form>
    </>
  );
}

function SecretInput({ id, value, onChange, autoComplete }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <input id={id} type={shown ? 'text' : 'password'} autoComplete={autoComplete} className="input pr-10" value={value} onChange={(e) => onChange(e.target.value)} />
      <button
        type="button"
        onClick={() => setShown((v) => !v)}
        className="adm-muted absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded hover:text-[var(--adm-text)]"
        aria-label={shown ? 'Hide password' : 'Show password'}
        aria-pressed={shown}
      >
        {shown ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
      </button>
    </div>
  );
}

// Change password: the same policy as registration and reset (server-checked).
function Security() {
  const { user } = useAuth();
  const policy = usePolicy();
  const empty = { currentPassword: '', password: '', confirmPassword: '' };
  const [values, setValues] = useState(empty);
  const [fields, setFields] = useState({});
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => {
    setValues((s) => ({ ...s, [k]: v }));
    setFields((f) => ({ ...f, [k]: undefined }));
  };

  const submit = async (e) => {
    e.preventDefault();
    setNotice('');
    setError('');
    const local = {};
    if (!values.currentPassword) local.currentPassword = 'Enter your current password.';
    const problem = passwordProblem(policy, values.password, { email: user.email, fullName: user.fullName });
    if (problem) local.password = problem;
    if (values.confirmPassword !== values.password) local.confirmPassword = 'Passwords do not match.';
    setFields(local);
    if (Object.keys(local).length) return;
    setBusy(true);
    try {
      const res = await api.post('/account/password', values);
      setValues(empty);
      setNotice(res.message);
    } catch (err) {
      setFields(err.fields || {});
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Messages notice={notice} error={error} />
      <h2>Change password</h2>
      <form className="adm-card max-w-xl space-y-4 p-4" onSubmit={submit} noValidate>
        <Field label="Current password" htmlFor="pw-current" error={fields.currentPassword}>
          <SecretInput id="pw-current" autoComplete="current-password" value={values.currentPassword} onChange={set('currentPassword')} />
        </Field>
        <Field label="New password" htmlFor="pw-new" error={fields.password}>
          <SecretInput id="pw-new" autoComplete="new-password" value={values.password} onChange={set('password')} />
          <PasswordRules value={values.password} email={user.email} fullName={user.fullName} policy={policy} />
        </Field>
        <Field label="Confirm new password" htmlFor="pw-confirm" error={fields.confirmPassword}>
          <SecretInput id="pw-confirm" autoComplete="new-password" value={values.confirmPassword} onChange={set('confirmPassword')} />
        </Field>
        <button type="submit" className="adm-primary" disabled={busy}>
          {busy ? 'Saving…' : 'Change password'}
        </button>
        <p className="adm-hint !mb-0">Changing your password signs you out on every other device.</p>
      </form>
    </>
  );
}

// Account settings: Profile, Security and Appearance as text tabs.
export default function Settings() {
  const { section } = useParams();
  const { user } = useAuth();
  const member = ['graduate', 'investor'].includes(user.role);
  const current = section === 'appearance' ? 'appearance' : ['security', 'testimony'].includes(section) && member ? section : 'profile';

  useEffect(() => {
    document.title = `${{ appearance: 'Appearance', security: 'Security', testimony: 'Testimony', profile: 'Profile' }[current]} · Settings · ALU Ventures`;
  }, [current]);

  const tab = ({ isActive }) =>
    `border-b-2 py-2 text-[13px] ${isActive ? 'border-[var(--adm-accent)] font-semibold' : 'adm-muted border-transparent hover:text-[var(--adm-text)]'}`;
  return (
    <AdminPage title="Account settings">
      <nav className="mb-4 flex gap-6 border-b border-[var(--adm-border)]" aria-label="Settings">
        <NavLink to="/app/settings" end className={tab}>
          Profile
        </NavLink>
        {member && (
          <NavLink to="/app/settings/security" className={tab}>
            Security
          </NavLink>
        )}
        <NavLink to="/app/settings/appearance" className={tab}>
          Appearance
        </NavLink>
        {member && (
          <NavLink to="/app/settings/testimony" className={tab}>
            Testimony
          </NavLink>
        )}
        {member && (
          <Link to="/app/contact" className="adm-muted border-b-2 border-transparent py-2 text-[13px] hover:text-[var(--adm-text)]">
            Contact admin
          </Link>
        )}
      </nav>
      {current === 'appearance' ? <Appearance /> : current === 'security' ? <Security /> : current === 'testimony' ? <Testimony /> : <Profile />}
    </AdminPage>
  );
}
