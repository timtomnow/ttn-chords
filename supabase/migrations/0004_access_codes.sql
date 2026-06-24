-- Phase 4 — Access codes (redeemable for a bundle entitlement).
-- Run in the DEV Supabase project's SQL editor after 0001–0003.
--
-- Normal users get NO policy on this table => deny all: they can't list or read
-- codes. Redemption runs server-side in the `redeem-code` Edge Function (service
-- role, bypasses RLS). Admins manage codes directly via the admin UI.

create table if not exists public.access_codes (
  code        text primary key,
  bundle_id   uuid not null references public.bundles(id) on delete cascade,
  redeemed_by uuid references public.profiles(id),
  redeemed_at timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists access_codes_bundle_id_idx on public.access_codes (bundle_id);

alter table public.access_codes enable row level security;

-- Admin-only, full stop. (No policy for normal users = deny.)
drop policy if exists access_codes_admin on public.access_codes;
create policy access_codes_admin on public.access_codes
  for all using (public.is_admin()) with check (public.is_admin());
