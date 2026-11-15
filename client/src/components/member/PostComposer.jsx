import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import ReasonDialog from '../ReasonDialog';
import { PostCard } from './Posts';

// The graduate's post box and their own posts. The server checks every rule
// again: approved account, consent, 600 characters, no email, phone or
// project code, 10 posts a day, edits within 15 minutes.
const MAX = 600;
const IMAGE_MAX = 3 * 1024 * 1024;

export default function PostComposer({ avatar }) {
  const [state, setState] = useState(null);
  const [body, setBody] = useState('');
  const [image, setImage] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null); // { id, body }
  const [deleting, setDeleting] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const [kind, setKind] = useState('update');
  const [projectId, setProjectId] = useState('');
  const [projects, setProjects] = useState(null);

  const load = useCallback(() => {
    api
      .get('/posts/mine')
      .then(setState)
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    // Only Approved projects (open to investors) can be posted as seeking an investor.
    api
      .get('/projects/mine')
      .then((d) => setProjects(d.projects.filter((p) => p.status === 'approved')))
      .catch(() => setProjects([]));
  }, []);
  useEffect(() => {
    load();
    // Edit links disappear once the 15 minutes are up.
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, [load]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const data = new FormData();
      data.append('body', body);
      if (kind === 'seeking_investor') {
        data.append('kind', 'seeking_investor');
        data.append('projectId', projectId);
      }
      if (image) data.append('image', image);
      await api.upload('/posts', data);
      setBody('');
      setImage(null);
      setKind('update');
      setProjectId('');
      load();
    } catch (err) {
      setError(err.fields?.body || err.fields?.projectId || err.message);
    } finally {
      setBusy(false);
    }
  };
  const pickImage = (file) => {
    setError('');
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return setError('Choose a JPG, PNG or WebP image.');
    if (file.size > IMAGE_MAX) return setError('The image must be 3 MB or smaller.');
    setImage(file);
  };
  const saveEdit = async () => {
    setError('');
    try {
      await api.patch(`/posts/${editing.id}`, { body: editing.body });
      setEditing(null);
      load();
    } catch (err) {
      setError(err.fields?.body || err.message);
    }
  };

  if (!state) return null;
  const left = MAX - body.length;
  const atLimit = state.postedToday >= state.limitPerDay;

  return (
    <>
      <section className="rounded-xl border border-line bg-surface p-5" aria-label="Write a post">
        {state.blocked ? (
          <div className="flex items-center gap-4">
            {avatar}
            <p className="flex-1 text-[14px] text-muted">
              {state.blocked}{' '}
              {state.blocked.includes('Settings') && (
                <Link to="/app/settings" className="font-semibold text-accent hover:underline">
                  Open settings
                </Link>
              )}
            </p>
          </div>
        ) : (
          <form onSubmit={submit} noValidate>
            <div className="flex gap-4">
              <span className="hidden sm:block">{avatar}</span>
              <div className="min-w-0 flex-1">
                <fieldset className="mb-3">
                  <legend className="sr-only">Type of post</legend>
                  <div className="inline-flex rounded-lg border border-line p-0.5 text-[13px]">
                    {[
                      ['update', 'Update'],
                      ['seeking_investor', 'Seeking an investor'],
                    ].map(([k, l]) => (
                      <label key={k} className={`flex min-h-11 cursor-pointer items-center rounded-md px-3 lg:min-h-9 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent ${kind === k ? 'bg-subtle font-semibold text-ink' : 'text-muted'}`}>
                        <input type="radio" name="post-kind" value={k} checked={kind === k} onChange={() => setKind(k)} className="sr-only" />
                        {l}
                      </label>
                    ))}
                  </div>
                </fieldset>
                {kind === 'seeking_investor' &&
                  (projects && projects.length === 0 ? (
                    <p className="mb-3 text-[13px] text-muted">You need a project approved by an administrator before you can post that you are seeking an investor.</p>
                  ) : (
                    <div className="mb-3">
                      <label htmlFor="post-project" className="label">
                        Project
                      </label>
                      <select id="post-project" className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                        <option value="">Choose an approved project</option>
                        {(projects || []).map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.title}
                          </option>
                        ))}
                      </select>
                      <p className="help">The card shows the project title, sector, stage and funding sought, with a link to the project. Investors request an introduction from there.</p>
                    </div>
                  ))}
                <label htmlFor="post-body" className="sr-only">
                  Write a post
                </label>
                <textarea
                  id="post-body"
                  rows={body ? 4 : 2}
                  maxLength={MAX}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Write a post… Share progress, milestones or what you are looking for."
                  className="w-full resize-y rounded-xl border border-line bg-subtle px-4 py-3 text-[14px] text-ink outline-none transition-colors placeholder:text-muted focus:border-accent focus:bg-surface"
                  aria-describedby="post-help"
                />
                {image && (
                  <p className="mt-2 flex items-center gap-3 text-[13px] text-ink">
                    <span className="truncate">{image.name}</span>
                    <button type="button" className="font-semibold text-[#b91c1c] hover:underline" onClick={() => setImage(null)}>
                      Remove image
                    </button>
                  </p>
                )}
                {error && (
                  <p role="alert" className="mt-2 text-[13px] text-[#b91c1c]">
                    {error}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-4 text-[12px] text-muted" id="post-help">
                    <label className="cursor-pointer font-semibold text-accent hover:underline">
                      {image ? 'Change image' : 'Add an image'}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="sr-only"
                        onChange={(e) => {
                          pickImage(e.target.files?.[0]);
                          e.target.value = '';
                        }}
                      />
                    </label>
                    <span className={left < 40 ? 'text-[#b45309]' : ''}>{left} left</span>
                    <span>
                      {state.postedToday}/{state.limitPerDay} today
                    </span>
                  </div>
                  <button
                    type="submit"
                    className="h-9 rounded-lg bg-accent px-5 text-[14px] font-semibold text-white transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={busy || !body.trim() || atLimit || (kind === 'seeking_investor' && !projectId)}
                  >
                    {busy ? 'Posting…' : 'Post'}
                  </button>
                </div>
                <p className="mt-2 text-[12px] text-muted">
                  {atLimit
                    ? 'You have reached 10 posts today.'
                    : 'Investors and sponsors see your posts. No emails, phone numbers or project codes; investors reach you through introductions.'}
                </p>
              </div>
            </div>
          </form>
        )}
      </section>

      {state.posts.length > 0 && (
        <section className="rounded-xl border border-line bg-surface" aria-label="Your posts">
          <h2 className="!m-0 px-5 pt-5 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">Your posts</h2>
          <div className="mt-1">
            {state.posts.map((p) =>
              editing?.id === p.id ? (
                <div key={p.id} className="border-t border-line px-5 py-4 first:border-0">
                  <label htmlFor={`edit-${p.id}`} className="sr-only">
                    Edit post
                  </label>
                  <textarea
                    id={`edit-${p.id}`}
                    rows={4}
                    maxLength={MAX}
                    value={editing.body}
                    onChange={(e) => setEditing({ ...editing, body: e.target.value })}
                    className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-[14px] text-ink outline-none focus:border-accent"
                  />
                  <div className="mt-2 flex gap-4 text-[13px]">
                    <button type="button" className="font-semibold text-accent hover:underline" onClick={saveEdit}>
                      Save
                    </button>
                    <button type="button" className="text-muted hover:underline" onClick={() => setEditing(null)}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : p.removed ? (
                <div key={p.id} className="border-t border-line px-5 py-4 first:border-0">
                  <p className="text-[13px] font-semibold text-[#b91c1c]">Removed by an administrator</p>
                  <p className="text-[13px] text-muted">Reason: {p.removed.reason}</p>
                  <p className="mt-1 whitespace-pre-line text-[14px] text-muted line-through">{p.body}</p>
                </div>
              ) : (
                <PostCard
                  key={p.id}
                  post={p}
                  actions={
                    <>
                      {p.editableUntil && new Date(p.editableUntil).getTime() > now && (
                        <button
                          type="button"
                          className="font-semibold text-muted hover:text-ink hover:underline"
                          onClick={() => setEditing({ id: p.id, body: p.body })}
                        >
                          Edit
                        </button>
                      )}
                      <button type="button" className="font-semibold text-muted hover:text-[#b91c1c] hover:underline" onClick={() => setDeleting(p)}>
                        Delete
                      </button>
                    </>
                  }
                />
              ),
            )}
          </div>
        </section>
      )}

      <ReasonDialog
        open={Boolean(deleting)}
        reason="none"
        tone="danger"
        title="Delete this post?"
        description="It is removed from your profile and the investor feed. This cannot be undone."
        confirmLabel="Delete post"
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          await api.delete(`/posts/${deleting.id}`);
          load();
        }}
      />
    </>
  );
}
