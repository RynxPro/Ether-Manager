import { AlertCircle } from "lucide-react";
import { Button } from "./Button";
import { cn } from "../../lib/utils";

const TONE_STYLES = {
  neutral: {
    panel: "border-border bg-surface/60",
    icon: "bg-surface text-text-secondary border-border",
    title: "text-text-primary",
    message: "text-text-secondary",
  },
  danger: {
    panel: "border-red-500/20 bg-red-500/8",
    icon: "bg-red-500/10 text-red-400 border-red-500/20",
    title: "text-red-100",
    message: "text-red-200/80",
  },
  success: {
    panel: "border-emerald-500/20 bg-emerald-500/8",
    icon: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    title: "text-emerald-100",
    message: "text-emerald-200/80",
  },
};

export function StatePanel({
  icon,
  title,
  message,
  description,
  tone = "neutral",
  action,
  actionLabel,
  onAction,
  className,
}) {
  const styles = TONE_STYLES[tone] || TONE_STYLES.neutral;
  const IconComponent = icon || AlertCircle;
  const bodyText = message ?? description;

  return (
    <div
      className={cn(
        "flex min-h-[16rem] flex-col items-center justify-center rounded-[var(--radius-lg)] border border-dashed px-6 py-12 text-center shadow-card",
        styles.panel,
        className,
      )}
    >
      <div
        className={cn(
          "mb-5 flex h-16 w-16 items-center justify-center rounded-[var(--radius-md)] border shadow-interactive",
          styles.icon,
        )}
      >
        <IconComponent size={28} strokeWidth={2.25} />
      </div>
      <h3 className={cn("text-xl font-black tracking-tight", styles.title)}>
        {title}
      </h3>
      {bodyText && (
        <p className={cn("mt-3 max-w-md text-sm leading-6", styles.message)}>
          {bodyText}
        </p>
      )}
      {action
        ? <div className="mt-6">{action}</div>
        : actionLabel && onAction && (
          <div className="mt-6">
            <Button onClick={onAction} size="sm">
              {actionLabel}
            </Button>
          </div>
        )}
    </div>
  );
}

export function StateGridSkeleton({
  count = 6,
  className,
  itemClassName = "h-56",
  columnsClassName = "grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5",
}) {
  return (
    <div className={cn(columnsClassName, className)}>
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className={cn(
            "ui-panel animate-pulse",
            itemClassName,
          )}
        />
      ))}
    </div>
  );
}

export function StatusBanner({ tone = "neutral", children, className }) {
  const styles = TONE_STYLES[tone] || TONE_STYLES.neutral;

  return (
    <div
      className={cn(
        "rounded-[var(--radius-md)] border px-4 py-3 text-sm font-medium shadow-card",
        styles.panel,
        styles.message,
        className,
      )}
    >
      {children}
    </div>
  );
}
