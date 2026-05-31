import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-ink-200 px-6 py-16 text-center dark:border-ink-800">
      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-ink-100 text-ink-400 dark:bg-ink-800 dark:text-ink-500">
        <Icon size={22} />
      </span>
      <h2 className="text-base font-medium">{title}</h2>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-ink-500 dark:text-ink-400">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
