import { statusLabel, statusTone } from '../lib/status';

// Shared primitives in the one design system (see admin.css): soft pills,
// plain messages, labelled fields. No decorative icons.
const PILL = { green: 'success', amber: 'warning', red: 'danger', blue: 'info', purple: 'info', slate: 'neutral' };

export function Pill({ tone = 'slate', children, className = '' }) {
  return <span className={`adm-pill adm-pill-${PILL[tone] || tone} ${className}`}>{children}</span>;
}

export function StatusPill({ status, label }) {
  return <Pill tone={statusTone(status)}>{label || statusLabel(status)}</Pill>;
}

export function Spinner({ label = 'Loading…', className = '' }) {
  return (
    <p role="status" className={`adm-muted text-[13px] ${className}`}>
      {label}
    </p>
  );
}

export function PageLoader() {
  return <Spinner className="p-4" />;
}

// A message line with a coloured left edge, as in the admin console.
const EDGE = { error: 'var(--adm-danger)', success: 'var(--adm-success)', warning: 'var(--adm-warning)', info: 'var(--adm-accent)' };

export function Alert({ type = 'info', title, children, action, className = '' }) {
  if (!title && !children) return null;
  return (
    <div
      role={type === 'error' ? 'alert' : 'status'}
      className={`flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface px-4 py-2 text-[13px] ${className}`}
      style={{ borderLeft: `3px solid ${EDGE[type]}` }}
    >
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? 'mt-0.5' : ''}>{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function Field({ label, htmlFor, error, help, required, children, className = '' }) {
  return (
    <div className={className}>
      {label && (
        <label htmlFor={htmlFor} className="label">
          {label}
          {required && <span className="text-red-600"> *</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="mt-1 text-xs text-red-600 dark:text-red-400" id={`${htmlFor}-error`}>
          {error}
        </p>
      ) : (
        help && <p className="help">{help}</p>
      )}
    </div>
  );
}

export function EmptyState({ title, children, action }) {
  return (
    <div className="px-6 py-10 text-center">
      <p className="font-semibold">{title}</p>
      {children && <p className="adm-muted mx-auto mt-1 max-w-md">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// Same structure as the admin page title: h1 left, short meta or actions right.
export function PageHeader({ title, description, actions, eyebrow }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        {eyebrow && <p className="adm-hint !mb-1">{eyebrow}</p>}
        <h1 className="text-[20px] font-semibold tracking-tight">{title}</h1>
        {description && <p className="adm-muted mt-1">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

// Compact tile: number large, label small.
export function StatCard({ label, value, hint }) {
  return (
    <div className="card p-4">
      <span className="block text-[24px] font-semibold leading-8 tabular-nums">{value}</span>
      <span className="adm-muted block text-[12px]">{label}</span>
      {hint && <span className="adm-muted block text-[12px]">{hint}</span>}
    </div>
  );
}

export function formatDate(value, withTime = false) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
}
