-- Phase 5 — Purchases (audit log of confirmed Square payments).
-- Run in the DEV Supabase project's SQL editor after 0001–0004 (independent of
-- 0006; either order is fine).
--
-- Rows are written ONLY by the square-webhook Edge Function (service role) after
-- it verifies Square's signature. Users may read their own; there is NO user
-- write policy. square_payment_id is UNIQUE so a duplicate webhook can't create
-- a second purchase (ON CONFLICT DO NOTHING in the function).

create table if not exists public.purchases (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles(id) on delete cascade,
  bundle_id         uuid not null references public.bundles(id),
  square_payment_id text unique,
  amount_cents      integer,
  status            text not null default 'completed',
  created_at        timestamptz not null default now()
);
create index if not exists purchases_user_id_idx on public.purchases (user_id);

alter table public.purchases enable row level security;

-- See your own; admins all. Writes happen server-side via the webhook.
drop policy if exists purchases_select on public.purchases;
create policy purchases_select on public.purchases
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists purchases_admin_write on public.purchases;
create policy purchases_admin_write on public.purchases
  for all using (public.is_admin()) with check (public.is_admin());
