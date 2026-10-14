// Shared Figma building blocks used across dashboard screens.
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, FileText, UploadCloud, X } from 'lucide-react';

export function Breadcrumb({ items }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-2 flex flex-wrap items-center gap-1 text-xs text-muted">
      {items.map(([label, to], i) => (
        <span key={`${label}-${i}`} className="inline-flex items-center gap-1">
          {i > 0 && <ChevronRight className="h-3 w-3" aria-hidden="true" />}
          {to ? (
            <Link to={to} className="hover:text-accent hover:underline">
              {label}
            </Link>
          ) : (
            <span className="font-medium text-ink">{label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

// Uppercase label, icon top-right, large value with unit, coloured status line.
export function StatTile({ label, icon: Icon, value, unit, status, statusTone = 'text-muted', badge, children, valueTone = '' }) {
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</p>
        {Icon && <Icon className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />}
      </div>
      <p className={`mt-2 text-2xl font-semibold tabular-nums ${valueTone}`}>
        {value}
        {unit && <span className="ml-1 text-xs font-normal text-muted">{unit}</span>}
      </p>
      {children}
      {badge && <div className="mt-1.5">{badge}</div>}
      {status && <p className={`mt-1 text-xs ${statusTone}`}>{status}</p>}
    </div>
  );
}

// Card with a tinted header bar: icon + title on the left, meta on the right.
export function SectionCard({ icon: Icon, title, meta, children, className = '', bodyClass = 'p-5', id }) {
  return (
    <section id={id} className={`card overflow-hidden ${className}`}>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-subtle px-5 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          {Icon && <Icon className="h-4 w-4 text-accent" aria-hidden="true" />}
          {title}
        </h2>
        {meta && <div className="text-xs text-muted">{meta}</div>}
      </header>
      <div className={bodyClass}>{children}</div>
    </section>
  );
}

export function CountTabs({ tabs, value, onChange, label = 'Filter' }) {
  return (
    <div className="flex min-w-max gap-1" role="tablist" aria-label={label}>
      {tabs.map(([key, text, count]) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={value === key}
          onClick={() => onChange(key)}
          className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm ${
            value === key ? 'bg-surface font-semibold text-ink shadow-sm ring-1 ring-line' : 'text-muted hover:text-ink'
          }`}
        >
          {text}
          {count !== undefined && <span className="rounded-full bg-subtle px-1.5 text-xs tabular-nums text-muted ring-1 ring-line">{count}</span>}
        </button>
      ))}
    </div>
  );
}

export const initials = (name = '') =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('') || '—';

export function InitialsBox({ name, className = 'h-9 w-9 text-xs' }) {
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-md border border-line bg-accent-soft font-semibold text-accent ${className}`} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

// Small uppercase category tag (GRANT, HACKATHON…).
export function Tag({ children, tone = 'slate' }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-700 ring-slate-500/25 dark:bg-slate-500/20 dark:text-slate-300',
    blue: 'bg-blue-50 text-blue-700 ring-blue-600/20 dark:bg-blue-500/15 dark:text-blue-300',
    amber: 'bg-amber-50 text-amber-800 ring-amber-600/25 dark:bg-amber-500/15 dark:text-amber-300',
    green: 'bg-green-50 text-green-700 ring-green-600/25 dark:bg-green-500/15 dark:text-green-300',
    purple: 'bg-purple-50 text-purple-700 ring-purple-600/25 dark:bg-purple-500/15 dark:text-purple-300',
  };
  return <span className={`inline-flex shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset ${tones[tone]}`}>{children}</span>;
}

export const relativeTime = (value) => {
  if (!value) return '—';
  const s = Math.round((Date.now() - new Date(value)) / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr${h === 1 ? '' : 's'} ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} day${d === 1 ? '' : 's'} ago`;
  return new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

const ACCEPT = { pdf: 'application/pdf', png: 'image/png', jpeg: 'image/jpeg' };

/**
 * Drag-and-drop file zone (click or drop). `files` is a File or File[];
 * `accept` lists allowed kinds ('pdf', 'png', 'jpeg').
 */
export function DropZone({ id, files, onChange, multiple = false, max = 3, accept = ['pdf', 'png', 'jpeg'], title, hint, error }) {
  const [over, setOver] = useState(false);
  const inputRef = useRef(null);
  const list = files ? (Array.isArray(files) ? files : [files]) : [];
  const mimes = accept.map((a) => ACCEPT[a]);
  const take = (picked) => {
    const ok = [...picked].filter((f) => mimes.includes(f.type));
    if (!ok.length) return;
    onChange(multiple ? [...list, ...ok].slice(0, max) : ok[0]);
  };
  return (
    <div>
      {list.length > 0 && (
        <ul className="mb-2 space-y-1.5">
          {list.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2 rounded-md border border-line bg-surface px-3 py-2 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <FileText className="h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block truncate font-medium">{f.name}</span>
                  <span className="text-xs text-muted">{(f.size / 1024 / 1024).toFixed(1)} MB · ready to upload</span>
                </span>
              </span>
              <button type="button" className="rounded p-1 text-muted hover:text-red-600" aria-label={`Remove ${f.name}`} onClick={() => onChange(multiple ? list.filter((_, j) => j !== i) : null)}>
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {(multiple ? list.length < max : true) && (
        <label
          htmlFor={id}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            take(e.dataTransfer.files);
          }}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-md border border-dashed px-4 py-6 text-center text-sm ${
            over ? 'border-accent bg-accent-soft' : error ? 'border-red-400 bg-red-50/40 dark:bg-red-500/5' : 'border-line bg-subtle hover:border-accent'
          }`}
        >
          <UploadCloud className="mb-2 h-6 w-6 text-muted" aria-hidden="true" />
          <span>
            <span className="font-medium text-accent">{title || (list.length ? 'Click to replace file' : 'Click to upload')}</span> or drag and drop
          </span>
          {hint && <span className="mt-0.5 text-xs text-muted">{hint}</span>}
        </label>
      )}
      <input
        ref={inputRef}
        id={id}
        type="file"
        className="sr-only"
        multiple={multiple}
        accept={mimes.join(',')}
        onChange={(e) => {
          take(e.target.files || []);
          e.target.value = '';
        }}
      />
      {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
