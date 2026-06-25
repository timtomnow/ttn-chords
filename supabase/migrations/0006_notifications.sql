-- Chunk 1 (pre-Phase-5) — In-app notifications + marketing consent.
-- Run in the DEV Supabase project's SQL editor after 0001–0004 (0005 may come
-- before or after; they're independent).
--
-- Notifications are an in-app inbox. Rows are created by privileged paths only:
--   * the square-webhook Edge Function (purchase)   — service role, Phase 5
--   * the redeem-code Edge Function (code redeemed)  — service role
--   * an admin grant (grant by email)                — admin RLS, client-side
-- Normal users may only READ their own and mark them read/dismiss — never insert
-- (no self-insert policy), so the inbox can't be spoofed.

-- marketing_opt_in: consent captured from day one (no marketing send yet).
-- Users can flip their own via the existing profiles_update policy.
alter table public.profiles
  add column if not exists marketing_opt_in boolean not null default false;

create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  -- mirrors entitlements.source so the inbox can label how access was granted.
  type       text not null check (type in ('purchase','code','admin_grant')),
  title      text not null,
  body       text,
  bundle_id  uuid references public.bundles(id) on delete set null,
  read_at    timestamptz,            -- null = unread
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_id_created_idx
  on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

-- READ: your own; admins all.
drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications
  for select using (user_id = auth.uid() or public.is_admin());

-- UPDATE: only your own (mark read). Can't reassign to another user.
drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- DELETE: dismiss your own; admins any.
drop policy if exists notifications_delete on public.notifications;
create policy notifications_delete on public.notifications
  for delete using (user_id = auth.uid() or public.is_admin());

-- INSERT: admins only (for admin grants). Edge Functions use the service role,
-- which bypasses RLS. There is intentionally NO self-insert policy for users.
drop policy if exists notifications_admin_insert on public.notifications;
create policy notifications_admin_insert on public.notifications
  for insert with check (public.is_admin());
