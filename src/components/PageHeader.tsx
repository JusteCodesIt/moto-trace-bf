import { LucideIcon } from "lucide-react";

export function PageHeader({
  title,
  subtitle,
  icon: Icon,
  action,
}: {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-10 glass-strong rounded-none border-x-0 border-t-0 px-4 md:px-8 py-4 flex items-center gap-4">
      {Icon && (
        <div className="size-10 rounded-lg bg-[var(--bg-elevated)] grid place-items-center text-[var(--accent-primary)]">
          <Icon className="size-5" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <h1 className="text-xl font-semibold tracking-tight truncate">{title}</h1>
        {subtitle && <p className="text-xs text-[var(--text-secondary)] truncate">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

export function EmptyState({
  title,
  description,
  icon: Icon,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-24 px-6">
      <div className="size-20 rounded-2xl bg-[var(--bg-surface)] grid place-items-center mb-5 border border-[var(--border)]">
        <Icon className="size-9 text-[var(--text-dim)]" strokeWidth={1.5} />
      </div>
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="text-xs text-[var(--text-secondary)] mt-1 max-w-xs">{description}</p>
    </div>
  );
}

export function SoonBadge() {
  return (
    <span className="text-[10px] mono uppercase tracking-wider px-2 py-1 rounded bg-[var(--accent-violet)]/15 text-[var(--accent-violet)]">
      Bientôt
    </span>
  );
}
