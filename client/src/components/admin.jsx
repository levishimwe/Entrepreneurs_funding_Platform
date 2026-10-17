import { useEffect, useRef } from 'react';
import { statusLabel } from '../lib/status';

// Building blocks for the plain, table-first admin and staff area. Styles live
// in index.css under the `adm` prefix.

// Page title, optional right-aligned text buttons and a one-line hint.
export function AdminPage({ title, actions, hint, children }) {
  return (
    <div className="adm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h1>{title}</h1>
        {actions && <div className="flex flex-wrap gap-1">{actions}</div>}
      </div>
      {hint && <p className="adm-hint">{hint}</p>}
      {children}
    </div>
  );
}

// Success and error messages (one line each), like Django's message list.
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

// "Status: All (12) · Pending (3) · …" as text links.
export function FilterLinks({ label, options, value, onChange }) {
  return (
    <span className="adm-filter-links">
      {label && <span className="adm-muted">{label}: </span>}
      {options.map(([key, text, count]) => (
        <button key={key} type="button" aria-pressed={value === key} onClick={() => onChange(key)}>
          {text}
          {count !== undefined && count !== null && ` (${count})`}
        </button>
      ))}
    </span>
  );
}

export function Filters({ children }) {
  return <div className="adm-filters">{children}</div>;
}

export function TableWrap({ children }) {
  return <div className="adm-table-wrap">{children}</div>;
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

export function Loading() {
  return <p className="adm-muted">Loading…</p>;
}

// Plain status text; problems (Suspicious, failed, rejected) in red.
const BAD = new Set(['suspicious', 'failed', 'rejected', 'not_selected', 'suspended']);
export function StatusText({ status, label }) {
  return <span className={BAD.has(status) ? 'adm-bad' : undefined}>{label || statusLabel(status)}</span>;
}

// "Showing 1–10 of 34 · Previous · Next".
export function Pager({ page, pageSize, total, onPage }) {
  if (total <= pageSize) return total ? <p className="adm-hint mt-2">{total} shown</p> : null;
  const pages = Math.ceil(total / pageSize);
  return (
    <p className="adm-hint mt-2 flex flex-wrap items-center gap-2">
      <span>
        {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
      </span>
      <button type="button" className="adm-btn" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        Previous
      </button>
      <button type="button" className="adm-btn" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        Next
      </button>
    </p>
  );
}

// Two-column label/value table.
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
      <button type="button" className="absolute inset-0 bg-black/30" aria-label="Close panel" onClick={onClose} />
      <section
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="adm relative h-full w-full overflow-y-auto border-l border-line bg-canvas p-4 outline-none sm:w-[46rem] sm:max-w-[92vw]"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <h1 className="!mb-0">{title}</h1>
          <button type="button" className="adm-btn" onClick={onClose}>
            Close
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

// Collapsed history/audit section under a page's main table.
export function Collapsed({ title, children }) {
  return (
    <details className="mt-4">
      <summary className="cursor-pointer text-[13px] font-semibold">{title}</summary>
      <div className="mt-2">{children}</div>
    </details>
  );
}
