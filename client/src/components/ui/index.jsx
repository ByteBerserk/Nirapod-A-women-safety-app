import { useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useToast } from '../../context/ToastContext';
import { initials, colourFromString } from '../../utils/format';

/* -------------------------------------------------------------- Toaster --- */

const TOAST_ICONS = { success: '✓', error: '✕', warning: '⚠', info: 'i' };

export function Toaster() {
  const { toasts, dismiss } = useToast();
  if (!toasts.length) return null;

  return createPortal(
    // aria-live so a screen reader announces the message without moving focus.
    <div className="toaster" role="region" aria-live="polite" aria-label="Notifications">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast-${toast.type}`}>
          <span className="toast-icon" aria-hidden="true">
            {TOAST_ICONS[toast.type]}
          </span>
          <div className="toast-body">
            {toast.title && <strong>{toast.title}</strong>}
            <span>{toast.message}</span>
          </div>
          <button type="button" className="toast-close" onClick={() => dismiss(toast.id)}>
            <span className="sr-only">Dismiss</span>
            <span aria-hidden="true">&times;</span>
          </button>
        </div>
      ))}
    </div>,
    document.body
  );
}

/* ---------------------------------------------------------------- Modal --- */

export function Modal({ open, onClose, title, children, footer, size = 'md' }) {
  const panelRef = useRef(null);
  const previouslyFocused = useRef(null);

  /*
   * `onClose` is almost always an inline arrow from the parent, so it is a new
   * function on every render. Held in a ref, the effect below can call the
   * current one without listing it as a dependency - which matters, see below.
   */
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  /*
   * Keyed on `open` alone, deliberately.
   *
   * With `onClose` in the dependency list this effect re-ran on every render of
   * the parent. Typing into a field inside a dialog sets parent state, which
   * re-renders, which recreates the inline onClose, which re-ran this effect,
   * which called panelRef.focus() and pulled the caret out of the input. The
   * symptom was that every text box in every dialog - safe place name, group
   * name, the invite address - accepted one character and then went dead.
   */
  useEffect(() => {
    if (!open) return undefined;

    previouslyFocused.current = document.activeElement;
    // Moving focus into the dialog is what makes Escape and Tab behave, and
    // what tells a screen reader something new has appeared.
    panelRef.current?.focus();

    const onKeyDown = (event) => {
      if (event.key === 'Escape') onCloseRef.current?.();

      // Keep Tab inside the dialog while it is open.
      if (event.key === 'Tab' && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (!focusable.length) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused.current?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div
        ref={panelRef}
        className={`modal modal-${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        tabIndex={-1}
      >
        <div className="modal-header">
          <h2 id="modal-title">{title}</h2>
          <button type="button" className="btn-ghost modal-close" onClick={onClose}>
            <span className="sr-only">Close</span>
            <span aria-hidden="true">&times;</span>
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

/* -------------------------------------------------------- ConfirmDialog --- */

export function ConfirmDialog({
  open,
  onCancel,
  onConfirm,
  title = 'Are you sure?',
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  busy = false,
}) {
  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onCancel}
      title={title}
      size="sm"
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`btn ${danger ? 'btn-danger' : ''}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? <span className="spinner" /> : confirmLabel}
          </button>
        </>
      }
    >
      <p className="mb-0">{message}</p>
    </Modal>
  );
}

/* ---------------------------------------------------------------- state --- */

export function LoadingState({ label = 'Loading...', rows = 3 }) {
  return (
    <div className="stack" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }).map((_, index) => (
        // eslint-disable-next-line react/no-array-index-key
        <div key={index} className="skeleton" style={{ height: 76 }} />
      ))}
    </div>
  );
}

export function EmptyState({ icon = '\u{1F4ED}', title, message, action }) {
  return (
    <div className="empty">
      <div className="icon" aria-hidden="true">
        {icon}
      </div>
      <h3>{title}</h3>
      {message && <p>{message}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="empty">
      <div className="icon" aria-hidden="true">
        {'⚠'}
      </div>
      <h3>Something went wrong</h3>
      <p>{message || 'We could not load this. Please try again.'}</p>
      {onRetry && (
        <button type="button" className="btn btn-secondary" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- misc --- */

export function Avatar({ user, size = 40 }) {
  const name = user?.name || 'Unknown';
  const style = { width: size, height: size, fontSize: size * 0.4 };

  if (user?.avatar) {
    return <img className="avatar" src={user.avatar} alt="" style={style} />;
  }

  return (
    <span
      className="avatar avatar-fallback"
      style={{ ...style, background: colourFromString(user?.username || name) }}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}

export function Pagination({ meta, onChange }) {
  if (!meta || meta.totalPages <= 1) return null;

  const { page, totalPages, total } = meta;

  return (
    <nav className="pagination" aria-label="Pagination">
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={() => onChange(page - 1)}
        disabled={!meta.hasPrevPage}
      >
        Previous
      </button>
      <span className="small muted">
        Page {page} of {totalPages} &middot; {total} item{total === 1 ? '' : 's'}
      </span>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={() => onChange(page + 1)}
        disabled={!meta.hasNextPage}
      >
        Next
      </button>
    </nav>
  );
}

/**
 * A labelled input that knows how to show a server-side field error.
 * Every form in the app uses this so error placement is consistent.
 */
export function Field({
  label,
  name,
  error,
  hint,
  required = false,
  as = 'input',
  children,
  ...inputProps
}) {
  const id = `field-${name}`;
  const describedBy = [error && `${id}-error`, hint && `${id}-hint`].filter(Boolean).join(' ');

  const Element = as;

  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {required && (
          <span className="required" aria-hidden="true">
            {' *'}
          </span>
        )}
      </label>

      {as === 'select' ? (
        <select
          id={id}
          name={name}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={describedBy || undefined}
          {...inputProps}
        >
          {children}
        </select>
      ) : (
        <Element
          id={id}
          name={name}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={describedBy || undefined}
          {...inputProps}
        />
      )}

      {hint && (
        <p className="hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      {error && (
        <p className="error" id={`${id}-error`} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** Copies text and confirms it, with a fallback for non-secure origins. */
export function useCopy() {
  const toast = useToast();

  return useCallback(
    async (text, label = 'Copied to clipboard.') => {
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(text);
        } else {
          // clipboard.writeText needs HTTPS; this works on plain http://.
          const helper = document.createElement('textarea');
          helper.value = text;
          helper.style.position = 'fixed';
          helper.style.opacity = '0';
          document.body.appendChild(helper);
          helper.select();
          document.execCommand('copy');
          document.body.removeChild(helper);
        }
        toast.success(label);
        return true;
      } catch {
        toast.error('Could not copy. Please select the text and copy it manually.');
        return false;
      }
    },
    [toast]
  );
}
