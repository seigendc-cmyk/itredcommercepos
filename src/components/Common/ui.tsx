import React from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger';
type ButtonSize = 'sm' | 'md';

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    'border-transparent bg-[var(--itred-color-primary)] text-white hover:bg-[var(--itred-color-primary-hover)]',
  secondary:
    'border-[var(--itred-color-charcoal)] bg-[var(--itred-color-charcoal)] text-white hover:bg-[var(--itred-color-charcoal-strong)]',
  quiet:
    'border-[var(--itred-color-border)] bg-white text-[var(--itred-color-text)] hover:bg-[var(--itred-color-surface-subtle)]',
  danger: 'border-transparent bg-[var(--itred-color-danger)] text-white hover:brightness-90',
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: 'min-h-8 px-3 py-1.5 text-xs',
  md: 'min-h-10 px-4 py-2 text-sm',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = '', variant = 'primary', size = 'md', loading = false, disabled, children, type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center gap-2 rounded-[var(--itred-radius-md)] border font-semibold shadow-[var(--itred-shadow-sm)] transition-colors disabled:opacity-55 ${buttonVariants[variant]} ${buttonSizes[size]} ${className}`}
      {...props}
    >
      {loading && (
        <span
          className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden="true"
        />
      )}
      {children}
    </button>
  ),
);
Button.displayName = 'Button';

export interface FieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
}

export const Field = React.forwardRef<HTMLInputElement, FieldProps>(
  ({ id, label, error, hint, required, className = '', ...props }, ref) => {
    const generatedId = React.useId();
    const fieldId = id || generatedId;
    const messageId = `${fieldId}-message`;
    return (
      <div className="space-y-1.5">
        <label htmlFor={fieldId} className="block text-xs font-semibold text-[var(--itred-color-text)]">
          {label}
          {required && <span className="ml-1 text-[var(--itred-color-danger)]" aria-hidden="true">*</span>}
        </label>
        <input
          ref={ref}
          id={fieldId}
          required={required}
          aria-invalid={Boolean(error)}
          aria-describedby={error || hint ? messageId : undefined}
          className={`min-h-10 w-full rounded-[var(--itred-radius-md)] border bg-white px-3 py-2 text-sm text-[var(--itred-color-text)] placeholder:text-slate-400 ${
            error
              ? 'border-[var(--itred-color-danger)]'
              : 'border-[var(--itred-color-border-strong)] hover:border-slate-400'
          } ${className}`}
          {...props}
        />
        {(error || hint) && (
          <p
            id={messageId}
            className={`text-xs ${error ? 'text-[var(--itred-color-danger)]' : 'text-[var(--itred-color-text-muted)]'}`}
          >
            {error || hint}
          </p>
        )}
      </div>
    );
  },
);
Field.displayName = 'Field';

export const Surface: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className = '', ...props }) => (
  <div
    className={`rounded-[var(--itred-radius-lg)] border border-[var(--itred-color-border)] bg-[var(--itred-color-surface)] shadow-[var(--itred-shadow-sm)] ${className}`}
    {...props}
  />
);

type NoticeTone = 'info' | 'success' | 'warning' | 'error';
const noticeTone: Record<NoticeTone, string> = {
  info: 'border-blue-200 bg-blue-50 text-blue-900',
  success: 'border-green-200 bg-green-50 text-green-900',
  warning: 'border-amber-200 bg-amber-50 text-amber-950',
  error: 'border-red-200 bg-red-50 text-red-900',
};

export const Notice: React.FC<React.HTMLAttributes<HTMLDivElement> & { tone?: NoticeTone }> = ({
  tone = 'info',
  className = '',
  ...props
}) => (
  <div
    role={tone === 'error' ? 'alert' : 'status'}
    className={`rounded-[var(--itred-radius-md)] border px-3 py-2.5 text-sm ${noticeTone[tone]} ${className}`}
    {...props}
  />
);

export const LoadingState: React.FC<{ label: string }> = ({ label }) => (
  <div className="itred-app flex items-center justify-center p-4" role="status" aria-live="polite">
    <div className="text-center">
      <span
        className="mx-auto block size-10 animate-spin rounded-full border-4 border-[var(--itred-color-primary)] border-t-transparent"
        aria-hidden="true"
      />
      <p className="mt-3 text-sm font-semibold text-[var(--itred-color-text)]">{label}</p>
    </div>
  </div>
);

export interface PageHeaderProps {
  title: string;
  description: string;
  context?: string;
  notificationCount?: number;
  action?: React.ReactNode;
  loading?: boolean;
  error?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  description,
  context,
  notificationCount = 0,
  action,
  loading = false,
  error,
}) => (
  <header className="mb-5 border-b border-[var(--itred-color-border)] bg-white px-4 py-4 sm:px-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-bold text-[var(--itred-color-charcoal)]">{title}</h1>
          {notificationCount > 0 && (
            <span
              className="rounded-[var(--itred-radius-sm)] bg-[var(--itred-color-primary)] px-2 py-0.5 text-xs font-bold text-white"
              aria-label={`${notificationCount} unread notifications`}
            >
              {notificationCount}
            </span>
          )}
          {loading && (
            <span className="text-xs font-semibold text-[var(--itred-color-text-muted)]" role="status">
              Loading…
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-[var(--itred-color-text-muted)]">{description}</p>
        {context && <p className="mt-1 text-xs font-semibold text-slate-500">Context: {context}</p>}
        {error && <Notice tone="error" className="mt-3">{error}</Notice>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  </header>
);
