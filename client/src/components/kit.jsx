// Shared building blocks in the one design system (admin console style).
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Pill } from './ui';

// "Projects / ALU-2026-XXXX" trail, as on the admin project page.
export function Breadcrumb({ items }) {
  return (
    <nav aria-label="Breadcrumb" className="adm-hint">
      {items.map(([label, to], i) => (
        <span key={`${label}-${i}`}>
          {i > 0 && ' / '}
          {to ? (
            <Link to={to} className="adm-a">
              {label}
            </Link>
          ) : (
            <span>{label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

// Compact tile: number large, label small (icons are ignored).
export function StatTile({ label, value, unit, status, children, to }) {
  const body = (
    <>
      <span className="block text-[24px] font-semibold leading-8 tabular-nums">
        {value}
        {unit && <span className="adm-muted ml-1 text-[12px] font-normal">{unit}</span>}
      </span>
      <span className="adm-muted block text-[12px]">{label}</span>
      {status && <span className="adm-muted block text-[12px]">{status}</span>}
      {children}
    </>
  );
  return to ? (
    <Link to={to} className="card block p-4 hover:border-accent">
      {body}
    </Link>
  ) : (
    <div className="card p-4">{body}</div>
  );
}

// Plain card with a title row (meta on the right).
export function SectionCard({ title, meta, children, className = '', bodyClass = 'p-4', id }) {
  return (
    <section id={id} className={`card overflow-hidden ${className}`}>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <h2 className="!m-0 text-[14px] font-semibold">{title}</h2>
        {meta && <div className="adm-muted text-[12px]">{meta}</div>}
      </header>
      <div className={bodyClass}>{children}</div>
    </section>
  );
}

export function CountTabs({ tabs, value, onChange, label = 'Filter' }) {
  return (
    <div className="flex min-w-max gap-4" role="tablist" aria-label={label}>
      {tabs.map(([key, text, count]) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={value === key}
          onClick={() => onChange(key)}
          className={`border-b-2 py-1.5 text-[13px] ${value === key ? 'border-accent font-semibold text-ink' : 'border-transparent text-muted hover:text-ink'}`}
        >
          {text}
          {count !== undefined && <span className="adm-muted ml-1 tabular-nums">{count}</span>}
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

export function InitialsBox() {
  return null;
}

// Category tag (Grant, Hackathon…) as a soft pill.
export function Tag({ children, tone = 'slate' }) {
  return <Pill tone={tone}>{children}</Pill>;
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
            <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2 rounded-md border border-line bg-surface px-3 py-2 text-[13px]">
              <span className="min-w-0">
                <span className="block truncate font-medium">{f.name}</span>
                <span className="adm-muted text-[12px]">{(f.size / 1024 / 1024).toFixed(1)} MB · ready to upload</span>
              </span>
              <button type="button" className="adm-act adm-act-danger" aria-label={`Remove ${f.name}`} onClick={() => onChange(multiple ? list.filter((_, j) => j !== i) : null)}>
                Remove
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
          className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed px-4 py-5 text-center text-[13px] ${
            over ? 'border-accent bg-accent-soft' : error ? 'border-red-400 bg-red-50/40 dark:bg-red-500/5' : 'border-line bg-subtle hover:border-accent'
          }`}
        >
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
