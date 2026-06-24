-- Phase 2 — User-authored content: songs, setlists, song_notes.
-- Run in the DEV Supabase project's SQL editor after 0001.
--
-- Design notes (reconciles the schema file with the app's actual data model):
--  * SONGS are stored as a JSONB aggregate: the full app Song object lives in
--    `content`; `title` is mirrored to a column for listing/admin. A song is
--    EITHER personal (owner_id set) OR paid bundle content (bundle_id set) —
--    the owner/bundle refinement from the cloud-refactor brief.
--  * SETLISTS are also a JSONB aggregate (chosen over a normalized
--    setlist_songs join table): the app treats a setlist as one object with
--    rich per-performance entry overrides, and never queries its contents
--    relationally. So there is NO setlist_songs table.
--  * Phase 2 is personal content only. The SONGS read policy here covers
--    owner + admin; Phase 3 REPLACES it to add the "entitled to bundle_id"
--    branch and creates bundles/entitlements + the bundle_id FK.

-- ── SONGS ──────────────────────────────────────────────────────────────────
create table if not exists public.songs (
  id         uuid primary key,           -- app supplies the id (newId) so
                                          -- in-content references stay valid
  owner_id   uuid references public.profiles(id) on delete cascade,
  bundle_id  uuid,                        -- FK to bundles(id) added in Phase 3
  title      text not null,
  content    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint songs_owner_or_bundle check (owner_id is not null or bundle_id is not null)
);
create index if not exists songs_owner_id_idx on public.songs (owner_id);

alter table public.songs enable row level security;

-- Read: your own songs, or admin. (Phase 3 replaces this to add bundle access.)
drop policy if exists songs_select on public.songs;
create policy songs_select on public.songs
  for select using (owner_id = auth.uid() or public.is_admin());

-- Write: you may create/modify/delete songs you own.
drop policy if exists songs_owner_write on public.songs;
create policy songs_owner_write on public.songs
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Admins may write any song (used for bundle content from Phase 3 on).
drop policy if exists songs_admin_write on public.songs;
create policy songs_admin_write on public.songs
  for all using (public.is_admin()) with check (public.is_admin());

-- ── SETLISTS (JSON aggregate; entries live in content) ──────────────────────
create table if not exists public.setlists (
  id          uuid primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  title       text not null,
  description text,
  content     jsonb not null default '{}'::jsonb,  -- { ...Setlist, entries[] }
  created_at  timestamptz not null default now()
);
create index if not exists setlists_user_id_idx on public.setlists (user_id);

alter table public.setlists enable row level security;

drop policy if exists setlists_own on public.setlists;
create policy setlists_own on public.setlists
  for all using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

-- ── SONG_NOTES (user notes layered on a song; private by default) ───────────
create table if not exists public.song_notes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  song_id    uuid not null references public.songs(id) on delete cascade,
  body       text not null default '',
  is_public  boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists song_notes_song_id_idx on public.song_notes (song_id);

alter table public.song_notes enable row level security;

-- Read your own notes + any note flagged public; admins all.
drop policy if exists song_notes_select on public.song_notes;
create policy song_notes_select on public.song_notes
  for select using (user_id = auth.uid() or is_public or public.is_admin());

-- Write only your own notes.
drop policy if exists song_notes_insert on public.song_notes;
create policy song_notes_insert on public.song_notes
  for insert with check (user_id = auth.uid());

drop policy if exists song_notes_update on public.song_notes;
create policy song_notes_update on public.song_notes
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists song_notes_delete on public.song_notes;
create policy song_notes_delete on public.song_notes
  for delete using (user_id = auth.uid() or public.is_admin());
