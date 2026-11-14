import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronLeft, FileText } from 'lucide-react';
import { formatDate } from './ui';

// One set of building blocks for every Open / View / Review screen (admin,
// staff, graduate and investor): a header card, a sticky action bar, cards
// with a label/value grid, file rows, long text, a decision panel, empty
// states, skeletons and a collapsible history. Tokens only (card, line,
// surface, ink, muted, accent), so light and dark mode follow data-theme.

// ---- Page frame -----------------------------------------------------------------

/** Back link (and optional current crumb) above a detail page. */
export function BackLink({ to, label, current }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-3 flex min-w-0 items-center gap-1.5 text-[13px] text-muted">
      <Link to={to} className="-ml-1 inline-flex min-h-11 shrink-0 items-center gap-1 rounded px-1 font-medium text-accent hover:underline">
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        {label}
      </Link>
      {current && (
        <>
          <span aria-hidden="true">/</span>
          <span className="truncate" aria-current="page">
            {current}
          </span>
        </>
      )}
    </nav>
  );
}

/**
 * Header card: avatar or logo, title, status badge(s) and a short meta line.
 * `actions` render in a bar that stays in view under the top bar while the
 * page scrolls, so Approve / Reject / Archive are always reachable on phones.
 */
export function DetailHeader({ back, title, avatar, status, meta, actions, children }) {
  return (
    <div className="mb-5">
      {back && <BackLink {...back} />}
      <header className="card p-4 sm:p-5">
        <div className="flex items-start gap-4">
          {avatar && <div className="shrink-0">{avatar}</div>}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <h1 className="!m-0 min-w-0 text-[20px] font-semibold leading-tight tracking-[-0.2px] text-ink [overflow-wrap:anywhere] sm:text-[22px]">{title}</h1>
              {status && <div className="flex flex-wrap items-center gap-1.5">{status}</div>}
            </div>
            {meta && <div className="mt-1.5 text-[13px] leading-[1.5] text-muted">{meta}</div>}
          </div>
        </div>
        {children && <div className="mt-4">{children}</div>}
      </header>
      {actions && <ActionBar>{actions}</ActionBar>}
    </div>
  );
}

export function ActionBar({ children }) {
  return (
    <div
      role="toolbar"
      aria-label="Actions"
      className="sticky top-[72px] z-20 mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-line bg-surface/95 px-3 py-2 shadow-[0_4px_16px_-12px_rgba(16,24,40,0.35)] backdrop-blur [&_.adm-act]:min-h-11 [&_.adm-act]:px-1 lg:[&_.adm-act]:min-h-9"
    >
      {children}
    </div>
  );
}

/** Two columns on wide screens: details on the left, `aside` (decision panel) on the right. */
export function DetailLayout({ children, aside }) {
  if (!aside) return <div className="space-y-4">{children}</div>;
  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-4">{children}</div>
      <aside className="min-w-0 space-y-4 xl:sticky xl:top-[136px]">{aside}</aside>
    </div>
  );
}

// ---- Cards and content -----------------------------------------------------------

/** A card with a section title (and optional meta or action on the right). */
export function InfoCard({ title, meta, action, children, id, className = '', flush = false }) {
  return (
    <section id={id} className={`card overflow-hidden ${className}`} aria-label={typeof title === 'string' ? title : undefined}>
      {(title || action || meta) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 sm:px-5">
          {title && <h2 className="!m-0 text-[14px] font-semibold text-ink">{title}</h2>}
          {(meta || action) && (
            <div className="flex items-center gap-3 text-[12px] text-muted">
              {meta}
              {action}
            </div>
          )}
        </div>
      )}
      <div className={flush ? '' : 'p-4 sm:p-5'}>{children}</div>
    </section>
  );
}

const missing = (v) => v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);

/**
 * Label/value grid: two columns from 640px, one on phones. `fields` is
 * [label, value, { wide }?]; empty values read "Not provided". Pass
 * `hideEmpty` to drop them instead.
 */
export function FieldGrid({ fields, hideEmpty = false, columns = 2 }) {
  const rows = fields.filter(Boolean).filter(([, v]) => !(hideEmpty && missing(v)));
  return (
    <dl className={`grid gap-x-6 gap-y-4 ${columns === 2 ? 'sm:grid-cols-2' : ''}`}>
      {rows.map(([label, value, opts = {}]) => (
        <div key={label} className={`min-w-0 ${opts.wide ? 'sm:col-span-2' : ''}`}>
          <dt className="text-[12px] font-medium text-muted">{label}</dt>
          <dd className="mt-0.5 text-[14px] leading-[1.5] text-ink [overflow-wrap:anywhere]">{missing(value) ? <span className="text-muted">Not provided</span> : value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Long text at a readable width and line height. */
export function LongText({ children, empty = 'Nothing added yet.' }) {
  if (missing(children)) return <EmptyNote>{empty}</EmptyNote>;
  return <p className="max-w-[72ch] whitespace-pre-line text-[14px] leading-7 text-ink [overflow-wrap:anywhere]">{children}</p>;
}

export function EmptyNote({ children = 'Nothing added yet.', className = '' }) {
  return <p className={`rounded-lg border border-dashed border-line px-4 py-6 text-center text-[13px] text-muted ${className}`}>{children}</p>;
}

// ---- Files -------------------------------------------------------------------------

const TYPE = { 'application/pdf': 'PDF', 'image/png': 'PNG', 'image/jpeg': 'JPEG', 'image/webp': 'WebP' };
export const fileType = (mime, name = '') => TYPE[mime] || (name.split('.').pop() || 'File').toUpperCase();
export const fileSize = (bytes) => (bytes === null || bytes === undefined ? null : bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

/**
 * Documents as tidy rows. `files`: [{ id, name, mimeType, sizeBytes, label,
 * date }]; `actions(file)` renders the view / download controls.
 */
export function FileList({ files, actions, empty = 'No documents yet.', children }) {
  if (!files.length) return <EmptyNote>{empty}</EmptyNote>;
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line">
      {files.map((f) => (
        <li key={f.id} className="bg-surface">
          <div className="flex flex-wrap items-center gap-3 px-3 py-2.5 sm:flex-nowrap">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-subtle" aria-hidden="true">
              <FileText className="h-4 w-4 text-muted" strokeWidth={1.75} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-medium text-ink" title={f.name}>
                {f.name}
              </span>
              <span className="block text-[12px] text-muted">
                {[f.label, fileType(f.mimeType, f.name), fileSize(f.sizeBytes), f.date ? formatDate(f.date) : null].filter(Boolean).join(' · ')}
              </span>
            </span>
            {actions && <span className="flex shrink-0 items-center gap-3">{actions(f)}</span>}
          </div>
          {children?.(f)}
        </li>
      ))}
    </ul>
  );
}

/** Text button that opens a file in a new tab. */
export function FileLink({ href, children = 'View' }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="adm-act inline-flex min-h-11 items-center lg:min-h-9">
      {children}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

// ---- Review -----------------------------------------------------------------------------

/** Decision panel for review screens: where it stands, what to do, and the buttons. */
export function DecisionPanel({ title = 'Decision', status, help, children }) {
  return (
    <section className="card overflow-hidden" aria-label={title}>
      <div className="border-b border-line px-4 py-3 sm:px-5">
        <h2 className="!m-0 text-[14px] font-semibold text-ink">{title}</h2>
      </div>
      <div className="space-y-4 p-4 sm:p-5">
        {status && (
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
            <span>Current status</span>
            {status}
          </div>
        )}
        {help && <p className="text-[13px] leading-[1.55] text-muted">{help}</p>}
        {children}
      </div>
    </section>
  );
}

// ---- Avatars and loading ----------------------------------------------------------------

export const initialsOf = (name = '') =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('') || '—';

/** Photo when there is one, initials otherwise (never a coloured icon). */
export function Avatar({ name, src, size = 48, square = false }) {
  const [failed, setFailed] = useState(false);
  const shape = square ? 'rounded-xl' : 'rounded-full';
  if (src && !failed) {
    return <img src={src} alt="" width={size} height={size} onError={() => setFailed(true)} className={`${shape} object-cover ring-1 ring-line`} style={{ width: size, height: size }} />;
  }
  return (
    <span
      className={`flex items-center justify-center ${shape} bg-subtle font-semibold text-muted ring-1 ring-line`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.34) }}
      aria-hidden="true"
    >
      {initialsOf(name)}
    </span>
  );
}

function Bone({ className = '' }) {
  return <div className={`animate-pulse rounded bg-subtle motion-reduce:animate-none ${className}`} />;
}

/** Placeholder while a detail page loads (never a blank page). */
export function DetailSkeleton({ aside = false }) {
  return (
    <div aria-busy="true" aria-label="Loading">
      <Bone className="mb-3 h-5 w-32" />
      <div className="card mb-5 flex gap-4 p-5">
        <Bone className="h-12 w-12 !rounded-full" />
        <div className="flex-1 space-y-2">
          <Bone className="h-6 w-1/2" />
          <Bone className="h-4 w-1/3" />
        </div>
      </div>
      <div className={`grid gap-4 ${aside ? 'xl:grid-cols-[minmax(0,1fr)_340px]' : ''}`}>
        <div className="card space-y-4 p-5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="grid gap-4 sm:grid-cols-2">
              <Bone className="h-10" />
              <Bone className="h-10" />
            </div>
          ))}
        </div>
        {aside && <Bone className="h-48 !rounded-xl" />}
      </div>
    </div>
  );
}

// ---- History (collapsible) -----------------------------------------------------------

/**
 * "History activity": collapsed to a one-line summary (latest event and the
 * count); the header button expands it with a short animation. `filter`
 * (e.g. a select) sits inside the expanded area.
 */
export function HistorySection({ title = 'History activity', count, latest, filter, loading = false, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  const summary = loading ? 'Loading…' : count === 0 ? 'Nothing yet' : [latest && `Latest: ${latest}`, count !== undefined && `${count} event${count === 1 ? '' : 's'}`].filter(Boolean).join(' · ');
  return (
    <section className="card overflow-hidden">
      <h2 className="!m-0">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((o) => !o)}
          className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-subtle focus-visible:outline-2 focus-visible:-outline-offset-2 sm:px-5"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-semibold text-ink">{title}</span>
            <span className="mt-0.5 block truncate text-[13px] font-normal text-muted">{summary}</span>
          </span>
          <ChevronDown className={`h-5 w-5 shrink-0 text-muted transition-transform duration-300 motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
      </h2>
      <div
        id={id}
        className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
        inert={!open}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="border-t border-line">
            {filter && <div className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">{filter}</div>}
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}
