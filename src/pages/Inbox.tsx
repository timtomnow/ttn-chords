import { Link } from 'react-router-dom';
import { Bell, CreditCard, Gift, KeyRound, Trash2, type LucideIcon } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  useNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  type AppNotification,
} from '@/db/repo';

const TYPE_ICON: Record<AppNotification['type'], LucideIcon> = {
  purchase: CreditCard,
  code: KeyRound,
  admin_grant: Gift,
};

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const secs = Math.round((Date.now() - then) / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function Inbox() {
  const notifications = useNotifications();
  const hasUnread = (notifications ?? []).some((n) => n.read_at === null);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inbox"
        subtitle="Purchases, redeemed codes, and bundles added to your account."
        actions={
          hasUnread ? (
            <button className="btn-secondary" onClick={() => void markAllNotificationsRead()}>
              Mark all read
            </button>
          ) : undefined
        }
      />

      {notifications === undefined ? (
        <p className="text-sm text-ink-500 dark:text-ink-400">Loading…</p>
      ) : notifications.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="No notifications yet"
          description="When you buy or unlock a bundle, you'll see it here."
        />
      ) : (
        <ul className="space-y-2">
          {notifications.map((n) => {
            const Icon = TYPE_ICON[n.type] ?? Bell;
            const unread = n.read_at === null;
            return (
              <li
                key={n.id}
                className={[
                  'card flex items-start gap-3 px-4 py-3 transition',
                  unread ? 'border-accent/40' : '',
                ].join(' ')}
              >
                <span
                  className={[
                    'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
                    unread
                      ? 'bg-accent text-accent-fg'
                      : 'bg-ink-100 text-ink-400 dark:bg-ink-800 dark:text-ink-500',
                  ].join(' ')}
                >
                  <Icon size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{n.title}</span>
                    {unread && <span className="h-2 w-2 shrink-0 rounded-full bg-accent" />}
                  </div>
                  {n.body && (
                    <p className="mt-0.5 text-sm text-ink-600 dark:text-ink-300">{n.body}</p>
                  )}
                  <div className="mt-1 flex items-center gap-3 text-xs text-ink-500 dark:text-ink-400">
                    <span>{relativeTime(n.created_at)}</span>
                    {n.bundle_id && (
                      <Link
                        to={`/store/${n.bundle_id}`}
                        className="font-medium text-accent hover:underline"
                        onClick={() => unread && void markNotificationRead(n.id)}
                      >
                        View bundle
                      </Link>
                    )}
                    {unread && (
                      <button
                        className="font-medium hover:text-ink-700 dark:hover:text-ink-200"
                        onClick={() => void markNotificationRead(n.id)}
                      >
                        Mark read
                      </button>
                    )}
                  </div>
                </div>
                <button
                  className="shrink-0 rounded-lg p-1.5 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700 dark:hover:bg-ink-800 dark:hover:text-ink-200"
                  title="Dismiss"
                  onClick={() => void deleteNotification(n.id)}
                >
                  <Trash2 size={16} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
