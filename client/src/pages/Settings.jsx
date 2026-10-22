import { useEffect, useState } from 'react';
import { Link, NavLink, useParams } from 'react-router-dom';
import { api } from '../lib/api';
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
          ['Account ID', <span key="id" className="adm-mono">ALU-{user.role.toUpperCase()}-{String(user.id).padStart(4, '0')}</span>],
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

// Account settings: Profile and Appearance as two text tabs.
export default function Settings() {
  const { section } = useParams();
  const { user } = useAuth();
  const current = section === 'appearance' ? 'appearance' : 'profile';

  useEffect(() => {
    document.title = `${current === 'appearance' ? 'Appearance' : 'Profile'} · Settings · ALU Ventures`;
  }, [current]);

  const tab = ({ isActive }) => `border-b-2 py-2 text-[13px] ${isActive ? 'border-[var(--adm-accent)] font-semibold' : 'adm-muted border-transparent hover:text-[var(--adm-text)]'}`;
  return (
    <AdminPage title="Account settings">
      <nav className="mb-4 flex gap-6 border-b border-[var(--adm-border)]" aria-label="Settings">
        <NavLink to="/app/settings" end className={tab}>
          Profile
        </NavLink>
        <NavLink to="/app/settings/appearance" className={tab}>
          Appearance
        </NavLink>
        {['graduate', 'investor'].includes(user.role) && (
          <Link to="/app/contact" className="adm-muted border-b-2 border-transparent py-2 text-[13px] hover:text-[var(--adm-text)]">
            Contact admin
          </Link>
        )}
      </nav>
      {current === 'appearance' ? <Appearance /> : <Profile />}
    </AdminPage>
  );
}
