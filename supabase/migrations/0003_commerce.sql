-- Phase 3 — Commerce read side: bundles, entitlements, and the paid-content gate.
-- Run in the DEV Supabase project's SQL editor after 0001 and 0002.
--
-- This phase is READ-ONLY commerce: list active bundles (storefront), gate songs
-- by entitlement, and show a user the bundles they own. Creating entitlements
-- (codes, admin grants, Square) comes in Phases 4–5; for testing now, insert an
-- entitlement by hand using the seed block at the bottom.

-- ── BUNDLES — the song packs sold in the storefront ─────────────────────────
create table if not exists public.bundles (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  description     text,
  price_cents     integer not null default 0,
  square_link_url text,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);

alter table public.bundles enable row level security;

-- Anyone (incl. logged-out visitors) can read ACTIVE bundles; admins read all.
drop policy if exists bundles_select on public.bundles;
create policy bundles_select on public.bundles
  for select using (is_active or public.is_admin());

-- Only admins create/edit/delete bundles.
drop policy if exists bundles_admin_write on public.bundles;
create policy bundles_admin_write on public.bundles
  for all using (public.is_admin()) with check (public.is_admin());

-- ── songs.bundle_id now that bundles exists: add the FK ──────────────────────
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'songs_bundle_id_fkey' and table_name = 'songs'
  ) then
    alter table public.songs
      add constraint songs_bundle_id_fkey
      foreign key (bundle_id) references public.bundles(id) on delete cascade;
  end if;
end $$;
create index if not exists songs_bundle_id_idx on public.songs (bundle_id);

-- ── ENTITLEMENTS — who owns which bundle. One row = one grant. ───────────────
create table if not exists public.entitlements (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  bundle_id  uuid not null references public.bundles(id) on delete cascade,
  source     text not null check (source in ('purchase','code','admin_grant')),
  granted_at timestamptz not null default now(),
  unique (user_id, bundle_id)
);
create index if not exists entitlements_user_id_idx on public.entitlements (user_id);

alter table public.entitlements enable row level security;

-- See only your own entitlements (admins all). NO user write policy — grants are
-- created by Edge Functions (service role) or admins, never by the buyer.
drop policy if exists entitlements_select on public.entitlements;
create policy entitlements_select on public.entitlements
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists entitlements_admin_write on public.entitlements;
create policy entitlements_admin_write on public.entitlements
  for all using (public.is_admin()) with check (public.is_admin());

-- ── SONGS read policy: add the bundle-entitlement branch (the paid gate) ─────
drop policy if exists songs_select on public.songs;
create policy songs_select on public.songs
  for select using (
    owner_id = auth.uid()
    or public.is_admin()
    or exists (
      select 1 from public.entitlements e
      where e.user_id = auth.uid() and e.bundle_id = songs.bundle_id
    )
  );

-- ── Storefront RPC: active bundles + song counts, callable by anyone ─────────
-- SECURITY DEFINER so logged-out/non-entitled visitors get a song count without
-- being able to read the (gated) song rows themselves.
create or replace function public.storefront_bundles()
returns table (
  id              uuid,
  title           text,
  description     text,
  price_cents     integer,
  square_link_url text,
  song_count      bigint
)
language sql
security definer
set search_path = public
stable
as $$
  select b.id, b.title, b.description, b.price_cents, b.square_link_url,
         (select count(*) from public.songs s where s.bundle_id = b.id) as song_count
  from public.bundles b
  where b.is_active
  order by b.created_at;
$$;

-- Song TITLES for an active bundle — a storefront teaser. Returns titles only
-- (never `content`), so non-buyers can see what's inside without the gated song
-- bodies leaking. SECURITY DEFINER so it works for logged-out/non-entitled users.
create or replace function public.bundle_song_titles(p_bundle_id uuid)
returns table (id uuid, title text)
language sql
security definer
set search_path = public
stable
as $$
  select s.id, s.title
  from public.songs s
  join public.bundles b on b.id = s.bundle_id
  where s.bundle_id = p_bundle_id and b.is_active
  order by s.title;
$$;

-- ── SEED FOR TESTING (uncomment, set your email, run once) ───────────────────
-- Creates a demo bundle with one song and grants it to your user so you can see
-- the unlock end-to-end. Replace the email. Delete the bundle later to clean up.
--
-- NOTE: the final SELECT reads from the `b` CTE (its returned id), NOT from
-- `public.bundles` — a data-modifying CTE's inserted row is not visible to a
-- re-scan of the table within the same statement. The `s` CTE still runs (an
-- unreferenced data-modifying CTE is always executed).
--
-- with b as (
--   insert into public.bundles (title, description, price_cents)
--   values ('Demo Bundle', 'A test pack for Phase 3', 500)
--   returning id
-- ), s as (
--   insert into public.songs (id, bundle_id, title, content)
--   select gen_random_uuid(), b.id, 'Demo Song',
--          jsonb_build_object(
--            'title','Demo Song','tags','[]'::jsonb,'order',1,
--            'createdAt',0,'updatedAt',0,
--            'difficulties', jsonb_build_array(jsonb_build_object(
--              'id', gen_random_uuid(), 'level', 3, 'sections','[]'::jsonb))
--          )
--   from b returning bundle_id
-- )
-- insert into public.entitlements (user_id, bundle_id, source)
-- select p.id, b.id, 'admin_grant'
-- from b
-- cross join public.profiles p
-- where p.email = 'you@example.com';
