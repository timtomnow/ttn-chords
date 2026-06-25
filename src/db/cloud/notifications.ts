// In-app notification inbox, backed by Supabase. Rows are created by privileged
// paths only (Edge Functions via service role for purchase/code; admins for
// grants — see createNotification). Users may only read their own and mark them
// read/dismiss; RLS enforces this. Reactive via the shared CloudList cache so
// the unread badge updates the moment a notification is read.

import { useMemo } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { NotificationRow } from '@/lib/supabase/types';
import { CloudList, useCloudList } from './reactive';
import { getUserId } from './auth';

export type AppNotification = NotificationRow;

async function fetchNotifications(): Promise<NotificationRow[]> {
  const uid = await getUserId();
  if (!uid) return [];
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', uid)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export const notificationsList = new CloudList<NotificationRow>(fetchNotifications);

export function useNotifications(): NotificationRow[] | undefined {
  return useCloudList(notificationsList);
}

/** Count of unread notifications (undefined while loading). */
export function useUnreadNotificationCount(): number | undefined {
  const rows = useCloudList(notificationsList);
  return useMemo(
    () => (rows === undefined ? undefined : rows.filter((n) => n.read_at === null).length),
    [rows],
  );
}

export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id)
    .is('read_at', null);
  if (error) throw error;
  await notificationsList.refresh();
}

export async function markAllNotificationsRead(): Promise<void> {
  const uid = await getUserId();
  if (!uid) return;
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', uid)
    .is('read_at', null);
  if (error) throw error;
  await notificationsList.refresh();
}

export async function deleteNotification(id: string): Promise<void> {
  const { error } = await supabase.from('notifications').delete().eq('id', id);
  if (error) throw error;
  await notificationsList.refresh();
}

/** Create a notification for a user. Admin-only at the RLS layer — used by the
 *  admin "grant by email" path. (Purchase/code notifications are written
 *  server-side by Edge Functions using the service role.) */
export async function createNotification(input: {
  userId: string;
  type: NotificationRow['type'];
  title: string;
  body?: string | null;
  bundleId?: string | null;
}): Promise<void> {
  const { error } = await supabase.from('notifications').insert({
    user_id: input.userId,
    type: input.type,
    title: input.title,
    body: input.body ?? null,
    bundle_id: input.bundleId ?? null,
  });
  if (error) throw error;
}
