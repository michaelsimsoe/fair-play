import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  PropsWithChildren,
  ReactNode,
} from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "quiet" | "danger";
  full?: boolean;
};

export function Button({
  variant = "secondary",
  full = false,
  className = "",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`button button--${variant} ${full ? "button--full" : ""} ${className}`}
      {...props}
    />
  );
}

export function Card({ className = "", ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={`card ${className}`} {...props} />;
}

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  backLabel,
  onBack,
  action,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  backLabel?: string;
  onBack?: () => void;
  action?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div className="page-header__top">
        {onBack ? (
          <Button variant="quiet" className="page-header__back" onClick={onBack}>
            <span aria-hidden="true">←</span> {backLabel ?? "Tilbake"}
          </Button>
        ) : (
          <span />
        )}
        {action}
      </div>
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h1>{title}</h1>
      {subtitle && <p className="page-header__subtitle">{subtitle}</p>}
    </header>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
}: PropsWithChildren<{
  label: string;
  hint?: string;
  error?: string;
}>) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      {children}
      {hint && !error && <span className="field__hint">{hint}</span>}
      {error && (
        <span className="field__error" role="alert">
          {error}
        </span>
      )}
    </label>
  );
}

export function EmptyState({
  title,
  children,
  action,
}: PropsWithChildren<{ title: string; action?: ReactNode }>) {
  return (
    <Card className="empty-state">
      <div className="empty-state__mark" aria-hidden="true">
        ○
      </div>
      <h2>{title}</h2>
      <div className="muted">{children}</div>
      {action}
    </Card>
  );
}

export function StatusPill({
  tone = "neutral",
  children,
}: PropsWithChildren<{
  tone?: "neutral" | "positive" | "warning" | "danger";
}>) {
  return <span className={`status-pill status-pill--${tone}`}>{children}</span>;
}

export function LoadingScreen() {
  return (
    <main className="centered-page" aria-busy="true">
      <div className="loading-mark" aria-hidden="true" />
      <p>Laster lokale data …</p>
    </main>
  );
}
