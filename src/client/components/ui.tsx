/**
 * UI primitives.
 *
 * Small, unstyled-prop-free components that wrap the design-system classes in
 * `app.css`. Keeping the class strings here rather than at every call site is
 * what stops the dashboard drifting into six slightly different buttons.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import { formatNumber, formatPkrShort } from "../lib/format";

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "gold";

const BUTTON_CLASS: Record<ButtonVariant, string> = {
  primary: "btn-primary",
  secondary: "btn-secondary",
  ghost: "btn-ghost",
  danger: "btn-danger",
  gold: "btn-gold"
};

interface ButtonProps {
  children: ReactNode;
  onClick?: () => void;
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
  type?: "button" | "submit";
  disabled?: boolean;
  /** Shows a spinner and blocks further clicks. */
  busy?: boolean;
  fullWidth?: boolean;
  title?: string;
  className?: string;
}

export function Button({
  children,
  onClick,
  variant = "secondary",
  size = "md",
  type = "button",
  disabled,
  busy,
  fullWidth,
  title,
  className
}: ButtonProps) {
  const sizeClass = size === "sm" ? "btn-sm" : size === "lg" ? "btn-lg" : "";
  return (
    <button
      type={type}
      title={title}
      disabled={disabled || busy}
      onClick={onClick}
      aria-busy={busy || undefined}
      className={`${BUTTON_CLASS[variant]} ${sizeClass} ${fullWidth ? "w-full" : ""} ${className ?? ""}`}
    >
      {busy ? <Spinner size={16} /> : null}
      {children}
    </button>
  );
}

export function Spinner({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={`animate-spin ${className ?? ""}`}
      role="status"
      aria-label="Loading"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" fill="none" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={`card ${className ?? ""}`}>{children}</section>;
}

export function CardBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={`card-body ${className ?? ""}`}>{children}</div>;
}

export function CardHeader({
  title,
  subtitle,
  action
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-ink-100 px-5 py-4 sm:px-6">
      <div>
        <h2 className="text-base font-semibold text-ink-900">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-sm text-ink-500">{subtitle}</p> : null}
      </div>
      {action ? <div className="flex shrink-0 gap-2">{action}</div> : null}
    </header>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-ink-500">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "brand" | "gold" | "risk";
}) {
  const valueTone =
    tone === "brand" ? "text-brand-700" : tone === "gold" ? "text-gold-700" : tone === "risk" ? "text-orange-700" : "";
  return (
    <div className="stat-card">
      <p className="stat-label">{label}</p>
      <p className={`stat-value ${valueTone}`}>{value}</p>
      {hint ? <p className="stat-hint">{hint}</p> : null}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
  icon
}: {
  title: string;
  body?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="empty">
      {icon ? <div className="text-ink-300">{icon}</div> : null}
      <p className="empty-title">{title}</p>
      {body ? <p className="empty-body">{body}</p> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={`skeleton ${className ?? "h-4 w-full"}`} aria-hidden="true" />;
}

export function LoadingBlock({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3 p-5" role="status" aria-label="Loading">
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} className={`h-4 ${index % 3 === 0 ? "w-3/4" : "w-full"}`} />
      ))}
    </div>
  );
}

export function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="empty">
      <p className="empty-title text-red-700">Could not load this</p>
      <p className="empty-body">{message}</p>
      {onRetry ? (
        <Button onClick={onRetry} variant="secondary" size="sm">
          Try again
        </Button>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------------

export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={className ?? "badge-neutral"}>{children}</span>;
}

// ---------------------------------------------------------------------------
// Form fields
// ---------------------------------------------------------------------------

interface BaseFieldProps {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  /**
   * Hides the label visually but keeps it for screen readers. Used where the
   * surrounding context already makes the field obvious — a sort dropdown next to
   * a search box — and a visible label would just be noise.
   */
  labelHidden?: boolean;
}

export function Field({
  label,
  hint,
  error,
  required,
  className,
  labelHidden,
  children,
  htmlFor
}: BaseFieldProps & { children: ReactNode; htmlFor?: string }) {
  return (
    <div className={`field ${className ?? ""}`}>
      <label className={labelHidden ? "sr-only" : "label"} htmlFor={htmlFor}>
        {label}
        {required && !labelHidden ? <span className="ml-0.5 text-red-500">*</span> : null}
      </label>
      {children}
      {error ? <p className="error-text">{error}</p> : hint ? <p className="hint">{hint}</p> : null}
    </div>
  );
}

interface TextInputProps extends BaseFieldProps {
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  inputMode?: "text" | "tel" | "numeric" | "decimal" | "email";
  autoFocus?: boolean;
  maxLength?: number;
  disabled?: boolean;
  onEnter?: () => void;
}

export function TextInput({
  label,
  hint,
  error,
  required,
  className,
  value,
  onChange,
  type = "text",
  placeholder,
  inputMode,
  autoFocus,
  maxLength,
  disabled,
  onEnter
}: TextInputProps) {
  const id = useId();
  return (
    <Field label={label} hint={hint} error={error} required={required} className={className} htmlFor={id}>
      <input
        id={id}
        className={`input ${error ? "input-error" : ""}`}
        type={type}
        value={value}
        placeholder={placeholder}
        inputMode={inputMode}
        autoFocus={autoFocus}
        maxLength={maxLength}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && onEnter) {
            event.preventDefault();
            onEnter();
          }
        }}
      />
    </Field>
  );
}

export function NumberInput({
  label,
  hint,
  error,
  required,
  className,
  value,
  onChange,
  min,
  max,
  step,
  disabled,
  prefix
}: BaseFieldProps & {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  prefix?: string;
}) {
  const id = useId();
  return (
    <Field label={label} hint={hint} error={error} required={required} className={className} htmlFor={id}>
      <div className="relative">
        {prefix ? (
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-ink-400">
            {prefix}
          </span>
        ) : null}
        <input
          id={id}
          className={`input tabular ${error ? "input-error" : ""} ${prefix ? "pl-11" : ""}`}
          type="number"
          inputMode="numeric"
          value={Number.isFinite(value) ? value : ""}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          onChange={(event) => {
            const parsed = Number(event.target.value);
            onChange(Number.isFinite(parsed) ? parsed : 0);
          }}
        />
      </div>
    </Field>
  );
}

export function Select<T extends string>({
  label,
  hint,
  error,
  required,
  className,
  labelHidden,
  value,
  onChange,
  options,
  disabled
}: BaseFieldProps & {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string; disabled?: boolean }>;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <Field
      label={label}
      hint={hint}
      error={error}
      required={required}
      className={className}
      labelHidden={labelHidden}
      htmlFor={id}
    >
      <select
        id={id}
        className={`input ${error ? "input-error" : ""}`}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as T)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function Textarea({
  label,
  hint,
  error,
  required,
  className,
  value,
  onChange,
  rows = 4,
  placeholder,
  maxLength
}: BaseFieldProps & {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
  maxLength?: number;
}) {
  const id = useId();
  return (
    <Field label={label} hint={hint} error={error} required={required} className={className} htmlFor={id}>
      <textarea
        id={id}
        className={`input ${error ? "input-error" : ""}`}
        rows={rows}
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
      />
      {maxLength ? (
        <p className="hint tabular text-right">
          {value.length}/{maxLength}
        </p>
      ) : null}
    </Field>
  );
}

export function Checkbox({
  label,
  description,
  checked,
  onChange,
  disabled
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex gap-3">
      <input
        id={id}
        type="checkbox"
        className="checkbox mt-0.5"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <label htmlFor={id} className="text-sm">
        <span className="font-medium text-ink-800">{label}</span>
        {description ? <span className="mt-0.5 block text-ink-500">{description}</span> : null}
      </label>
    </div>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder,
  autoFocus
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <div className="relative">
      <svg
        className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-400"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
      >
        <path
          fillRule="evenodd"
          d="M9 3.5a5.5 5.5 0 1 0 3.4 9.9l3.1 3.1a1 1 0 0 0 1.4-1.4l-3.1-3.1A5.5 5.5 0 0 0 9 3.5Zm-3.5 5.5a3.5 3.5 0 1 1 7 0 3.5 3.5 0 0 1-7 0Z"
          clipRule="evenodd"
        />
      </svg>
      <input
        className="input pl-10"
        type="search"
        value={value}
        placeholder={placeholder ?? "Search"}
        autoFocus={autoFocus}
        aria-label={placeholder ?? "Search"}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md"
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    // Prevents the page behind scrolling under the dialog on mobile.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  const width = size === "sm" ? "max-w-md" : size === "lg" ? "max-w-3xl" : "max-w-xl";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-ink-900/40 p-0 backdrop-blur-sm sm:items-center sm:p-6">
      <div
        className="absolute inset-0"
        aria-hidden="true"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`relative z-10 w-full ${width} rounded-t-2xl bg-white shadow-[--shadow-lift] sm:rounded-2xl`}
      >
        <header className="flex items-start justify-between gap-4 border-b border-ink-100 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-ink-900">{title}</h2>
            {description ? <p className="mt-0.5 text-sm text-ink-500">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 -mt-1 rounded-lg p-2 text-ink-400 hover:bg-ink-50 hover:text-ink-700"
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path d="M6.3 5A1 1 0 0 0 5 6.3L8.6 10 5 13.7A1 1 0 0 0 6.3 15L10 11.4 13.7 15a1 1 0 0 0 1.3-1.3L11.4 10 15 6.3A1 1 0 0 0 13.7 5L10 8.6 6.3 5Z" />
            </svg>
          </button>
        </header>

        <div className="max-h-[70vh] overflow-y-auto px-5 py-5">{children}</div>

        {footer ? (
          <footer className="flex flex-wrap justify-end gap-2 border-t border-ink-100 px-5 py-4">{footer}</footer>
        ) : null}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel = "Confirm",
  destructive,
  busy
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  body: string;
  confirmLabel?: string;
  destructive?: boolean;
  busy?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button onClick={onClose} variant="ghost">
            Cancel
          </Button>
          <Button onClick={onConfirm} variant={destructive ? "danger" : "primary"} busy={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm leading-6 text-ink-600">{body}</p>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------

interface Toast {
  id: number;
  message: string;
  kind: "success" | "error" | "info";
}

interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const push = useCallback((message: string, kind: Toast["kind"]) => {
    const id = nextId.current;
    nextId.current += 1;
    setToasts((current) => [...current, { id, message, kind }]);
    // Errors stay longer: they usually contain something the user must read.
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, kind === "error" ? 7000 : 4000);
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      success: (message) => push(message, "success"),
      error: (message) => push(message, "error"),
      info: (message) => push(message, "info")
    }),
    [push]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 sm:bottom-6"
        aria-live="polite"
        aria-atomic="false"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role={toast.kind === "error" ? "alert" : "status"}
            className={`pointer-events-auto w-full max-w-sm rounded-xl px-4 py-3 text-sm font-medium shadow-[--shadow-lift] ${
              toast.kind === "success"
                ? "bg-ink-900 text-white"
                : toast.kind === "error"
                  ? "bg-red-600 text-white"
                  : "bg-white text-ink-800 ring-1 ring-ink-200"
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast must be used inside ToastProvider");
  return api;
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

export function Tabs<T extends string>({
  value,
  onChange,
  tabs
}: {
  value: T;
  onChange: (value: T) => void;
  tabs: Array<{ value: T; label: string; count?: number }>;
}) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-ink-100" role="tablist">
      {tabs.map((tab) => {
        const active = tab.value === value;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.value)}
            className={`-mb-px shrink-0 border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors ${
              active
                ? "border-brand-600 text-brand-700"
                : "border-transparent text-ink-500 hover:border-ink-200 hover:text-ink-800"
            }`}
          >
            {tab.label}
            {tab.count !== undefined ? (
              <span className="tabular ml-1.5 text-xs text-ink-400">{formatNumber(tab.count)}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Charts
// ---------------------------------------------------------------------------

/**
 * A revenue sparkline drawn as inline SVG.
 *
 * Deliberately not a charting library: one 30-point line does not justify 90KB
 * of JavaScript on a connection that may be a phone hotspot.
 */
export function RevenueChart({ points }: { points: Array<{ day: string; revenue_pkr: number }> }) {
  if (points.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-ink-400">
        No revenue recorded yet
      </div>
    );
  }

  const width = 640;
  const height = 160;
  const padding = { top: 12, right: 8, bottom: 20, left: 8 };
  const max = Math.max(...points.map((point) => point.revenue_pkr), 1);
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const step = points.length > 1 ? innerWidth / (points.length - 1) : 0;

  const coordinates = points.map((point, index) => ({
    x: padding.left + index * step,
    y: padding.top + innerHeight - (point.revenue_pkr / max) * innerHeight,
    point
  }));

  const line = coordinates.map((c, index) => `${index === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
  const area = `${line} L${coordinates[coordinates.length - 1]!.x.toFixed(1)},${padding.top + innerHeight} L${
    coordinates[0]!.x.toFixed(1)
  },${padding.top + innerHeight} Z`;

  const peak = coordinates.reduce((best, c) => (c.point.revenue_pkr > best.point.revenue_pkr ? c : best), coordinates[0]!);

  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-40 w-full"
        role="img"
        aria-label={`Revenue over the last ${points.length} days, peaking at ${formatPkrShort(max)}`}
      >
        <defs>
          <linearGradient id="revenue-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#14a094" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#14a094" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#revenue-fill)" />
        <path d={line} fill="none" stroke="#0f8078" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={peak.x} cy={peak.y} r="4" fill="#0f8078" />
      </svg>
      <div className="flex justify-between px-1 text-xs text-ink-400">
        <span>{points[0]!.day}</span>
        <span className="tabular">Peak {formatPkrShort(max)}</span>
        <span>{points[points.length - 1]!.day}</span>
      </div>
    </div>
  );
}

/** Horizontal bar used in the staff and service breakdowns. */
export function BarRow({ label, value, max, caption }: { label: string; value: number; max: number; caption: string }) {
  const percent = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="truncate font-medium text-ink-800">{label}</span>
        <span className="tabular shrink-0 text-ink-500">{caption}</span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-ink-100">
        <div className="h-full rounded-full bg-brand-500" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

export function ProgressBar({ used, total, label }: { used: number; total: number; label?: string }) {
  const percent = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  const tone = percent >= 90 ? "bg-red-500" : percent >= 70 ? "bg-gold-500" : "bg-brand-500";
  return (
    <div>
      {label ? (
        <div className="mb-1.5 flex items-baseline justify-between text-xs">
          <span className="text-ink-500">{label}</span>
          <span className="tabular font-medium text-ink-700">
            {formatNumber(used)} / {formatNumber(total)}
          </span>
        </div>
      ) : null}
      <div className="h-2 overflow-hidden rounded-full bg-ink-100">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
