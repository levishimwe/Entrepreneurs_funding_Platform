import { AlertCircle, CheckCircle2, Info, Loader2, TriangleAlert } from 'lucide-react';
import { statusLabel, statusTone } from '../lib/status';

const TONES = {
  green: 'bg-green-50 text-green-800 ring-green-600/25 dark:bg-green-500/15 dark:text-green-300 dark:ring-green-400/30',
  amber: 'bg-amber-50 text-amber-800 ring-amber-600/25 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-400/30',
  red: 'bg-red-50 text-red-700 ring-red-600/25 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-400/30',
  blue: 'bg-blue-50 text-blue-700 ring-blue-600/25 dark:bg-blue-500/15 dark:text-blue-300 dark:ring-blue-400/30',
  purple: 'bg-purple-50 text-purple-700 ring-purple-600/25 dark:bg-purple-500/15 dark:text-purple-300 dark:ring-purple-400/30',
  slate: 'bg-slate-100 text-slate-700 ring-slate-500/25 dark:bg-slate-500/20 dark:text-slate-300 dark:ring-slate-400/30',
};

export function Pill({ tone = 'slate', children, className = '' }) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export function StatusPill({ status, label }) {
  return <Pill tone={statusTone(status)}>{label || statusLabel(status)}</Pill>;
}

export function Spinner({ label = 'Loading…', className = '' }) {
  return (
    <div role="status" className={`flex items-center gap-2 text-sm text-muted ${className}`}>
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function PageLoader() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Spinner />
    </div>
  );
}

const ALERT = {
  error: { icon: AlertCircle, cls: 'border-red-300 bg-red-50 text-red-800 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200' },
  success: { icon: CheckCircle2, cls: 'border-green-300 bg-green-50 text-green-800 dark:border-green-500/40 dark:bg-green-500/10 dark:text-green-200' },
  warning: { icon: TriangleAlert, cls: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200' },
  info: { icon: Info, cls: 'border-blue-300 bg-accent-soft text-ink dark:border-blue-500/40' },
};

export function Alert({ type = 'info', title, children, action, className = '' }) {
  if (!title && !children) return null;
  const { icon: Icon, cls } = ALERT[type];
  return (
    <div role={type === 'error' ? 'alert' : 'status'} className={`flex gap-3 rounded-md border p-3 text-sm ${cls} ${className}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? 'mt-0.5' : ''}>{children}</div>}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
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

export function EmptyState({ icon: Icon, title, children, action }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      {Icon && (
        <div className="mb-3 rounded-full bg-accent-soft p-3 text-accent">
          <Icon className="h-6 w-6" aria-hidden="true" />
        </div>
      )}
      <h3 className="text-base font-semibold">{title}</h3>
      {children && <p className="mt-1 max-w-md text-sm text-muted">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, description, actions, eyebrow }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">{eyebrow}</p>}
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({ label, value, hint, tone }) {
  const color = { green: 'text-green-600 dark:text-green-400', amber: 'text-amber-600 dark:text-amber-400', blue: 'text-accent', purple: 'text-purple-600 dark:text-purple-400', red: 'text-red-600 dark:text-red-400' }[tone] || '';
  return (
    <div className="card p-4">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${color}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
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
