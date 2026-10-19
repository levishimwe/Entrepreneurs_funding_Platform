import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { statusLabel, statusTone } from '../lib/status';
import { useAuth } from '../context/AuthContext';
import ReasonDialog from './ReasonDialog';

// Building blocks of the admin and staff console. Styles: src/admin.css.

// ---- Page structure -----------------------------------------------------------

export function AdminPage({ title, meta, children }) {
  return (
    <div className="adm">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h1>{title}</h1>
        {meta && <span className="adm-muted text-[13px]">{meta}</span>}
      </div>
      {children}
    </div>
  );
}

export function Messages({ notice, error }) {
  return (
    <>
      {notice && (
        <p className="adm-message" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="adm-message adm-message-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

export function Loading() {
  return <p className="adm-muted p-4">Loading…</p>;
}

// Search box that submits on Enter (or as you type when `live`).
export function SearchInput({ value, onChange, onSubmit, placeholder = 'Search' }) {
  return (
    <form
      className="flex min-w-0 basis-full gap-2 sm:basis-auto sm:flex-1 sm:max-w-sm"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit?.();
      }}
    >
      <input className="adm-input" type="search" aria-label={placeholder} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
      {onSubmit && (
        <button type="submit" className="adm-secondary">
          Search
        </button>
      )}
    </form>
  );
}

export function StatusSelect({ value, options, onChange, label = 'Status' }) {
  return (
    <select className="adm-input w-auto" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map(([key, text, count]) => (
        <option key={key} value={key}>
          {text}
          {count !== undefined && count !== null ? ` (${count})` : ''}
        </option>
      ))}
    </select>
  );
}

/**
 * List page body: a toolbar, then one card with the table, and a right-hand
 * filter panel on wide screens (behind a "Filters" button on narrow ones).
 * `filters`: [{ title, value, onChange, options: [[key, label, count?]] }]
 */
export function ListLayout({ toolbar, filters = [], children, footer }) {
  const [open, setOpen] = useState(false);
  const hasFilters = filters.length > 0;
  const panel = hasFilters && (
    <aside className="adm-card adm-filter h-fit" aria-label="Filters">
      <h3>Filter</h3>
      {filters.map((g) => (
        <div key={g.title} className="adm-filter-group">
          <p>By {g.title.toLowerCase()}</p>
          {g.options.map(([key, label, count]) => (
            <button key={key || 'all'} type="button" aria-pressed={g.value === key} onClick={() => g.onChange(key)}>
              <span>{label}</span>
              {count !== undefined && count !== null && <span className="adm-muted">{count}</span>}
            </button>
          ))}
        </div>
      ))}
    </aside>
  );
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {toolbar}
        <div className="ml-auto flex items-center gap-2">
          {hasFilters && (
            <button type="button" className="adm-secondary xl:hidden" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
              Filters
            </button>
          )}
          <ViewToggle />
        </div>
      </div>
      {open && <div className="mb-4 xl:hidden">{panel}</div>}
      <div className={hasFilters ? 'grid gap-4 xl:grid-cols-[minmax(0,1fr)_13rem]' : ''}>
        <div className="min-w-0">
          {children}
          {footer}
        </div>
        {hasFilters && <div className="hidden xl:block">{panel}</div>}
      </div>
    </>
  );
}

// ---- Table / Cards ------------------------------------------------------------

const NARROW = '(max-width: 639px)';
const viewKey = (userId) => `alu.admin.view.${userId || 'anon'}`;
const listeners = new Set();

// Table or Cards, remembered per user in this browser. Narrow screens always use cards.
export function useViewMode() {
  const { user } = useAuth();
  const [mode, setMode] = useState(() => {
    try {
      return localStorage.getItem(viewKey(user?.id)) || 'table';
    } catch {
      return 'table';
    }
  });
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia(NARROW).matches);
  useEffect(() => {
    const mq = window.matchMedia(NARROW);
    const onChange = () => setNarrow(mq.matches);
    mq.addEventListener('change', onChange);
    const sync = (m) => setMode(m);
    listeners.add(sync);
    return () => {
      mq.removeEventListener('change', onChange);
      listeners.delete(sync);
    };
  }, []);
  const choose = (m) => {
    try {
      localStorage.setItem(viewKey(user?.id), m);
    } catch {
      // Private mode: the choice lasts for this page only.
    }
    listeners.forEach((l) => l(m));
  };
  return { mode: narrow ? 'cards' : mode, narrow, choose };
}

export function ViewToggle() {
  const { mode, narrow, choose } = useViewMode();
  if (narrow) return null;
  return (
    <div className="inline-flex overflow-hidden rounded-md border border-[var(--adm-border)]" role="group" aria-label="View">
      {[
        ['table', 'Table'],
        ['cards', 'Cards'],
      ].map(([key, label]) => (
        <button
          key={key}
          type="button"
          aria-pressed={mode === key}
          onClick={() => choose(key)}
          className={`h-8 px-3 text-[13px] font-medium ${mode === key ? 'bg-[var(--adm-accent)] text-white' : 'bg-[var(--adm-card)] text-[var(--adm-text)]'}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/**
 * columns: [{ key, label, render(row), num?, className? }] — the first column is
 * the card title in Cards view. `actions(row)` renders the row's text buttons.
 * `selection` (optional): { selected: Set, toggle(id), toggleAll(ids) }.
 */
export function DataTable({ columns, rows, rowKey = (r) => r.id, actions, empty = 'Nothing to show.', selection, rowClass }) {
  const { mode } = useViewMode();
  const ids = rows.map(rowKey);
  const allSelected = selection && ids.length > 0 && ids.every((id) => selection.selected.has(id));

  if (mode === 'cards') {
    return (
      <div className="grid gap-2 sm:grid-cols-2">
        {rows.length === 0 && <p className="adm-card adm-muted p-4 sm:col-span-2">{empty}</p>}
        {rows.map((row) => {
          const [first, ...rest] = columns;
          return (
            <div key={rowKey(row)} className="adm-card p-4">
              <div className="flex items-start gap-2">
                {selection && (
                  <input type="checkbox" className="mt-1" aria-label="Select" checked={selection.selected.has(rowKey(row))} onChange={() => selection.toggle(rowKey(row))} />
                )}
                <div className="min-w-0 flex-1 font-semibold">{first.render(row)}</div>
              </div>
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                {rest.map((c) => (
                  <div key={c.key} className="contents">
                    <dt className="adm-muted text-[12px]">{c.label}</dt>
                    <dd className="min-w-0 break-words">{c.render(row)}</dd>
                  </div>
                ))}
              </dl>
              {actions && <div className="mt-3 border-t border-[var(--adm-border)] pt-2">{actions(row)}</div>}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="adm-card adm-scroll">
      <table className="adm-table">
        <thead>
          <tr>
            {selection && (
              <th className="w-10">
                <input type="checkbox" aria-label="Select all" checked={allSelected} onChange={() => selection.toggleAll(ids)} />
              </th>
            )}
            {columns.map((c) => (
              <th key={c.key} className={c.num ? 'adm-num' : undefined}>
                {c.label}
              </th>
            ))}
            {actions && <th className="adm-actions text-right">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length + (actions ? 1 : 0) + (selection ? 1 : 0)} className="adm-muted">
                {empty}
              </td>
            </tr>
          )}
          {rows.map((row) => (
            <tr key={rowKey(row)} className={rowClass?.(row)}>
              {selection && (
                <td>
                  <input type="checkbox" aria-label="Select" checked={selection.selected.has(rowKey(row))} onChange={() => selection.toggle(rowKey(row))} />
                </td>
              )}
              {columns.map((c) => (
                <td key={c.key} className={[c.num ? 'adm-num' : '', c.className || ''].join(' ').trim() || undefined}>
                  {c.render(row)}
                </td>
              ))}
              {actions && <td className="adm-actions">{actions(row)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Multi-select state for a table.
export function useSelection() {
  const [selected, setSelected] = useState(() => new Set());
  return {
    selected,
    toggle: (id) =>
      setSelected((s) => {
        const next = new Set(s);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    toggleAll: (ids) => setSelected((s) => (ids.every((id) => s.has(id)) ? new Set() : new Set(ids))),
    clear: () => setSelected(new Set()),
  };
}

export function Pager({ page, pageSize, total, onPage }) {
  if (total <= pageSize) return total ? <p className="adm-hint mt-2">{total} shown</p> : null;
  const pages = Math.ceil(total / pageSize);
  return (
    <p className="adm-hint mt-2 flex flex-wrap items-center gap-4">
      <span>
        {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
      </span>
      <button type="button" className="adm-act" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        Previous
      </button>
      <button type="button" className="adm-act" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        Next
      </button>
    </p>
  );
}

// ---- Status, values ---------------------------------------------------------------

const PILL = { green: 'success', amber: 'warning', red: 'danger', blue: 'info', purple: 'info', slate: 'neutral' };
export function Pill({ tone = 'neutral', children }) {
  return <span className={`adm-pill adm-pill-${tone}`}>{children}</span>;
}
export function StatusPill({ status, label }) {
  return <Pill tone={PILL[statusTone(status)] || 'neutral'}>{label || statusLabel(status)}</Pill>;
}
// Kept for shared components that show a status inline.
export const StatusText = StatusPill;

export function KeyValue({ rows }) {
  return (
    <div className="adm-table-wrap">
      <table className="adm-table adm-kv">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <th scope="row">{k}</th>
              <td>{v ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function EmptyRow({ colSpan, children = 'Nothing to show.' }) {
  return (
    <tr>
      <td colSpan={colSpan} className="adm-muted">
        {children}
      </td>
    </tr>
  );
}

export function TableWrap({ children }) {
  return <div className="adm-table-wrap">{children}</div>;
}

export function StatTile({ label, value, to }) {
  const body = (
    <>
      <span className="block text-[24px] font-semibold leading-8 tabular-nums">{value}</span>
      <span className="adm-muted block text-[12px]">{label}</span>
    </>
  );
  return to ? (
    <Link to={to} className="adm-card block p-4 hover:border-[var(--adm-accent)]">
      {body}
    </Link>
  ) : (
    <div className="adm-card p-4">{body}</div>
  );
}

// ---- Panels and dialogs --------------------------------------------------------------

// Right-hand detail panel (full width on a narrow screen). Esc closes it.
export function SidePanel({ title, onClose, children }) {
  const ref = useRef(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    ref.current?.focus();
    // Only when focus is in the panel, so Esc in a dialog above it closes just the dialog.
    const onKey = (e) => e.key === 'Escape' && ref.current?.contains(document.activeElement) && close.current();
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, []);
  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close panel" onClick={onClose} />
      <section
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="adm relative h-full w-full overflow-y-auto bg-[var(--adm-page)] p-4 outline-none sm:w-[46rem] sm:max-w-[92vw] sm:p-6"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h1>{title}</h1>
          <button type="button" className="adm-secondary" onClick={onClose}>
            Close
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

export function Collapsed({ title, children }) {
  return (
    <details className="mt-4">
      <summary className="cursor-pointer text-[13px] font-semibold">{title}</summary>
      <div className="mt-2">{children}</div>
    </details>
  );
}

const REMOVES = {
  account: 'account',
  project: 'project',
  projects: 'project',
  opportunity: 'opportunity',
  documents: 'document',
  files: 'stored file',
  reviews: 'review decision',
  emails: 'email',
  codes: 'sign-in code',
  applications: 'application',
};
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Permanent delete with the server's plan: what will be removed, or why it is
 * blocked. `planUrl` (GET) returns { plan: { allowed, blockers, removes } }.
 */
export function DeleteDialog({ open, title, planUrl, deleteUrl, onClose, onDeleted }) {
  const [plan, setPlan] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    setPlan(null);
    setError('');
    api
      .get(planUrl)
      .then((d) => setPlan(d.plan))
      .catch((e) => setError(e.message));
  }, [open, planUrl]);

  const removes = plan
    ? Object.entries(plan.removes)
        .filter(([, n]) => n > 0)
        .map(([k, n]) => plural(n, REMOVES[k] || k))
    : [];
  return (
    <ReasonDialog
      open={open}
      title={title}
      reason="none"
      tone="danger"
      confirmLabel="Delete permanently"
      confirmDisabled={!plan?.allowed}
      onClose={onClose}
      onConfirm={async () => {
        await api.delete(deleteUrl);
        onDeleted?.(removes);
      }}
    >
      {error && <p className="adm-bad">{error}</p>}
      {!plan && !error && <p className="adm-muted">Checking what would be removed…</p>}
      {plan && !plan.allowed && (
        <div>
          <p className="font-semibold">This cannot be deleted:</p>
          <ul className="mt-1 list-disc pl-5">
            {plan.blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
      )}
      {plan?.allowed && (
        <p>
          This permanently removes {removes.join(', ')}. It cannot be undone. An audit entry records who deleted it, without personal details.
        </p>
      )}
    </ReasonDialog>
  );
}
