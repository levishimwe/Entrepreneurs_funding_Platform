import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Alert, Field } from './ui';

// Accessible modal used for every recorded decision. `reason` is 'required',
// 'optional' or 'none'; `children` can add extra fields (e.g. a decision select).
export default function ReasonDialog({
  open,
  title,
  description,
  warning,
  confirmLabel = 'Confirm',
  tone = 'primary',
  reason = 'optional',
  reasonLabel = 'Reason',
  reasonHelp,
  onConfirm,
  onClose,
  children,
}) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    setText('');
    setError('');
    setFieldError('');
    const previous = document.activeElement;
    dialogRef.current?.querySelector('textarea, select, button')?.focus();
    const onKey = (e) => e.key === 'Escape' && !busy && onClose();
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  const submit = async (e) => {
    e.preventDefault();
    if (reason === 'required' && text.trim().length < 5) {
      setFieldError('Give a reason (at least 5 characters).');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onConfirm(text.trim());
      onClose();
    } catch (err) {
      setFieldError(err.fields?.reason || err.fields?.note || '');
      setError(err.fields?.reason || err.fields?.note ? '' : err.message);
    } finally {
      setBusy(false);
    }
  };

  const btn = { primary: 'btn-primary', danger: 'btn border-transparent bg-red-600 text-white hover:bg-red-700', success: 'btn-cta' }[tone];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <form
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        onSubmit={submit}
        className="card w-full max-w-lg p-5 shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="dialog-title" className="text-lg font-semibold">
            {title}
          </h2>
          <button type="button" className="rounded p-1 text-muted hover:bg-subtle" onClick={onClose} aria-label="Close" disabled={busy}>
            <X className="h-4 w-4" />
          </button>
        </div>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
        <div className="mt-4 space-y-4">
          {warning && <Alert type="warning">{warning}</Alert>}
          {error && <Alert type="error">{error}</Alert>}
          {children}
          {reason !== 'none' && (
            <Field label={`${reasonLabel}${reason === 'optional' ? ' (optional)' : ''}`} htmlFor="dialog-reason" error={fieldError} help={reasonHelp}>
              <textarea id="dialog-reason" rows={3} className="input" value={text} onChange={(e) => setText(e.target.value)} />
            </Field>
          )}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className={btn} disabled={busy}>
            {busy ? 'Saving…' : confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
