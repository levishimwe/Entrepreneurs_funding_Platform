import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { relativeTime } from '../kit';
import { initials } from '../Avatar';
import ReasonDialog from '../ReasonDialog';

// Graduate posts as investors see them (profile and feed). Bodies are plain
// text; React escapes them, and line breaks are kept.

// A graduate's public image when they consented to show it, otherwise initials.
export function GraduateImage({ graduate, size = 40, rounded = 'rounded-full' }) {
  const [failed, setFailed] = useState(false);
  const style = { width: size, height: size };
  if (graduate?.imageUrl && !failed) {
    return (
      <img
        src={graduate.imageUrl}
        alt=""
        style={style}
        loading="lazy"
        onError={() => setFailed(true)}
        className={`shrink-0 object-cover ring-1 ring-line ${rounded}`}
      />
    );
  }
  return (
    <span
      style={{ ...style, fontSize: Math.round(size * 0.34) }}
      className={`flex shrink-0 items-center justify-center bg-subtle font-semibold text-muted ring-1 ring-line ${rounded}`}
      aria-hidden="true"
    >
      {initials(graduate?.name)}
    </span>
  );
}

export function PostCard({ post, showAuthor = false, canReport = false, actions = null }) {
  const [reporting, setReporting] = useState(false);
  const [reported, setReported] = useState(false);
  return (
    <article className="border-t border-line px-5 py-4 first:border-0">
      <div className="flex gap-3">
        {showAuthor && post.graduate && (
          <Link to={`/app/graduates/${post.graduate.id}`} className="shrink-0" aria-label={`${post.graduate.name}'s profile`}>
            <GraduateImage graduate={post.graduate} size={40} />
          </Link>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            {showAuthor && post.graduate ? (
              <Link to={`/app/graduates/${post.graduate.id}`} className="text-[14px] font-semibold text-ink hover:underline">
                {post.graduate.name}
              </Link>
            ) : (
              <span className="sr-only">Post</span>
            )}
            <span className="text-[12px] text-muted">
              <time dateTime={post.createdAt}>{relativeTime(post.createdAt)}</time>
              {post.editedAt ? ' · edited' : ''}
            </span>
          </div>
          <p className="mt-1 whitespace-pre-line break-words text-[14px] leading-[1.6] text-ink">{post.body}</p>
          {post.imageUrl && <img src={post.imageUrl} alt="" loading="lazy" className="mt-3 max-h-[420px] w-full rounded-lg border border-line object-cover" />}
          {(canReport || actions) && (
            <div className="mt-2 flex flex-wrap items-center gap-4 text-[12px]">
              {actions}
              {canReport &&
                (reported ? (
                  <span className="text-muted">Reported to the administrator</span>
                ) : (
                  <button type="button" className="font-semibold text-muted hover:text-ink hover:underline" onClick={() => setReporting(true)}>
                    Report post
                  </button>
                ))}
            </div>
          )}
        </div>
      </div>
      <ReasonDialog
        open={reporting}
        title="Report this post?"
        description="An administrator reviews it and can remove it. The graduate is not told who reported it."
        reasonLabel="What is wrong with it? (optional)"
        confirmLabel="Report post"
        onClose={() => setReporting(false)}
        onConfirm={async (reason) => {
          await api.post(`/posts/${post.id}/report`, { reason });
          setReported(true);
        }}
      />
    </article>
  );
}
