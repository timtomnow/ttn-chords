// Unread-notification badge for the Inbox nav entry. Subscribes to the shared
// notifications cache, so it lights up the moment a notification arrives or is
// read. Two looks: a count pill in the sidebar, a dot on the bottom tab bar.

import { useUnreadNotificationCount } from '@/db/repo';

export function InboxBadge({ variant }: { variant: 'sidebar' | 'bottom' }) {
  const count = useUnreadNotificationCount();
  if (!count) return null;

  if (variant === 'bottom') {
    return (
      <span className="absolute right-[calc(50%-18px)] top-1 h-2 w-2 rounded-full bg-accent ring-2 ring-white dark:ring-ink-900" />
    );
  }
  return (
    <span className="ml-auto rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-semibold leading-none text-accent-fg">
      {count > 99 ? '99+' : count}
    </span>
  );
}
