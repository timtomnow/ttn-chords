# TTN Chords — Supabase Data Model & Security (RLS) Sketch

**Scope:** 100% of app data lives in Supabase (cloud is the single source of truth).
IndexedDB, if used at all, is only a local cache. Frontend hosted on GitHub Pages
(public repo, free tier). Payments via Square.

---

## The two principles that make this safe

1. **Security lives in Row-Level Security (RLS), not in hiding code.**
   Every table below has RLS *on*. With RLS on and no matching policy, the default
   is **deny**. The browser only ever uses the public **anon key**; the database
   itself decides what each user may read/write. This is why the repo can be public.

2. **Privileged writes go through Edge Functions using the service-role key.**
   Granting a purchase, redeeming a code, and recording a Square payment are done by
   server-side Edge Functions that use the **service-role key** (which bypasses RLS).
   That key never appears in the repo or the browser — only in Supabase function
   secrets. Users therefore *cannot* grant themselves bundles or read raw codes.

**Dev vs prod:** run two separate Supabase projects (e.g. `ttn-chords-dev`,
`ttn-chords-prod`), each with its own URL + keys. The frontend reads which to use
from an env var (`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`). `npm run dev`
points at dev (seeded with fake data); the deployed build points at prod. Never
commit either project's keys — keep them in git-ignored `.env` files and in your
deploy's secret settings.

---

## Helper functions & signup wiring

```sql
-- Admin check that safely bypasses RLS (SECURITY DEFINER) to avoid recursion.
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- Auto-create a profile row when a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Stop a normal user from promoting themselves to admin.
create or replace function public.guard_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role and not public.is_admin() then
    raise exception 'Only admins can change role';
  end if;
  return new;
end;
$$;
```

---

## Tables

```sql
-- 1. PROFILES — app-level info, one row per auth user
create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text,
  display_name text,
  role         text not null default 'user' check (role in ('user','admin')),
  created_at   timestamptz not null default now()
);

create trigger profiles_guard_role
  before update on public.profiles
  for each row execute function public.guard_role_change();

-- 2. BUNDLES — the song packs you sell (the storefront)
create table public.bundles (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  description     text,
  price_cents     integer not null default 0,
  square_link_url text,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);

-- 3. SONGS — your paid content (chords/lyrics/rhythm)
create table public.songs (
  id         uuid primary key default gen_random_uuid(),
  bundle_id  uuid not null references public.bundles(id) on delete cascade,
  title      text not null,
  content    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- 4. ENTITLEMENTS — the heart: who owns which bundle. One row = one grant.
create table public.entitlements (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  bundle_id  uuid not null references public.bundles(id) on delete cascade,
  source     text not null check (source in ('purchase','code','admin_grant')),
  granted_at timestamptz not null default now(),
  unique (user_id, bundle_id)
);

-- 5. ACCESS_CODES — redeemable codes (never readable by normal users)
create table public.access_codes (
  code        text primary key,
  bundle_id   uuid not null references public.bundles(id) on delete cascade,
  redeemed_by uuid references public.profiles(id),
  redeemed_at timestamptz,
  created_at  timestamptz not null default now()
);

-- 6. PURCHASES — audit log of Square payments
create table public.purchases (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles(id) on delete cascade,
  bundle_id         uuid not null references public.bundles(id),
  square_payment_id text unique,
  amount_cents      integer,
  status            text not null default 'completed',
  created_at        timestamptz not null default now()
);

-- 7. SETLISTS — user-authored groupings (their own content)
create table public.setlists (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  title      text not null,
  created_at timestamptz not null default now()
);

-- 8. SETLIST_SONGS — ordered songs within a setlist
create table public.setlist_songs (
  id         uuid primary key default gen_random_uuid(),
  setlist_id uuid not null references public.setlists(id) on delete cascade,
  song_id    uuid not null references public.songs(id) on delete cascade,
  position   integer not null default 0,
  unique (setlist_id, song_id)
);

-- 9. SONG_NOTES — users' own comments/notes layered on top of songs
--    Private by default; set is_public = true to share a note with others.
create table public.song_notes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  song_id    uuid not null references public.songs(id) on delete cascade,
  body       text not null default '',
  is_public  boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

---

## Enable RLS on everything

```sql
alter table public.profiles      enable row level security;
alter table public.bundles       enable row level security;
alter table public.songs         enable row level security;
alter table public.entitlements  enable row level security;
alter table public.access_codes  enable row level security;
alter table public.purchases     enable row level security;
alter table public.setlists      enable row level security;
alter table public.setlist_songs enable row level security;
alter table public.song_notes    enable row level security;
```

---

## Policies (the actual security perimeter)

```sql
-- PROFILES: read/update your own row; admins everything.
-- (role escalation is blocked by the guard_role_change trigger, not RLS)
create policy profiles_select on public.profiles
  for select using (id = auth.uid() or public.is_admin());
create policy profiles_update on public.profiles
  for update using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- BUNDLES: anyone (including logged-out visitors) sees active bundles.
-- Only admins create/edit/delete.
create policy bundles_select on public.bundles
  for select using (is_active or public.is_admin());
create policy bundles_admin_write on public.bundles
  for all using (public.is_admin()) with check (public.is_admin());

-- SONGS: readable ONLY if you have an entitlement to its bundle. Admins all.
-- This is the paid-content gate.
create policy songs_select_entitled on public.songs
  for select using (
    public.is_admin()
    or exists (
      select 1 from public.entitlements e
      where e.user_id = auth.uid() and e.bundle_id = songs.bundle_id
    )
  );
create policy songs_admin_write on public.songs
  for all using (public.is_admin()) with check (public.is_admin());

-- ENTITLEMENTS: see only your own. NO user write policy — grants are created
-- by Edge Functions (service role) for purchases/codes, or by admins.
create policy entitlements_select on public.entitlements
  for select using (user_id = auth.uid() or public.is_admin());
create policy entitlements_admin_write on public.entitlements
  for all using (public.is_admin()) with check (public.is_admin());

-- ACCESS_CODES: admin-only, full stop. Normal users get NO policy => deny all,
-- so they can't list or read codes. Redemption happens server-side (service role).
create policy access_codes_admin on public.access_codes
  for all using (public.is_admin()) with check (public.is_admin());

-- PURCHASES: see your own; writes happen via the Square webhook function.
create policy purchases_select on public.purchases
  for select using (user_id = auth.uid() or public.is_admin());
create policy purchases_admin_write on public.purchases
  for all using (public.is_admin()) with check (public.is_admin());

-- SETLISTS: full control over your own rows.
create policy setlists_own on public.setlists
  for all using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

-- SETLIST_SONGS: access gated by ownership of the parent setlist.
create policy setlist_songs_own on public.setlist_songs
  for all using (
    exists (select 1 from public.setlists s
            where s.id = setlist_songs.setlist_id
              and (s.user_id = auth.uid() or public.is_admin()))
  )
  with check (
    exists (select 1 from public.setlists s
            where s.id = setlist_songs.setlist_id
              and (s.user_id = auth.uid() or public.is_admin()))
  );

-- SONG_NOTES: read your own + any note flagged public; write only your own.
create policy song_notes_select on public.song_notes
  for select using (user_id = auth.uid() or is_public or public.is_admin());
create policy song_notes_insert on public.song_notes
  for insert with check (user_id = auth.uid());
create policy song_notes_update on public.song_notes
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy song_notes_delete on public.song_notes
  for delete using (user_id = auth.uid() or public.is_admin());
```

**Optional stricter note rule** — only let users annotate songs they actually own.
Replace the `song_notes_insert` check with:

```sql
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.songs sg
    join public.entitlements e
      on e.bundle_id = sg.bundle_id and e.user_id = auth.uid()
    where sg.id = song_notes.song_id
  )
)
```

---

## How the three access paths use this model

All three simply create an `entitlements` row — the app only ever asks
"does this user have an entitlement for this bundle?"

- **Square purchase** → user pays via the bundle's `square_link_url` → Square sends a
  webhook to a Supabase **Edge Function** → the function verifies Square's signature,
  inserts a `purchases` row and an `entitlements` row (`source='purchase'`). Service
  role, so RLS is bypassed. The unlock is never trusted to the browser.
- **Access code** → user submits a code → an Edge Function looks it up in
  `access_codes` (which users can't read directly), marks it redeemed, inserts an
  `entitlements` row (`source='code'`).
- **Admin grant** → admin picks user + bundle in an admin screen → inserts an
  `entitlements` row (`source='admin_grant'`). Free, instant, no payment.

> Square's webhook setup and payment-link fields change over time — confirm the
> current specifics in Square's developer docs when you build the function. The
> shape above is stable; field names and signature steps are worth checking live.

---

## Honest limits to keep in mind

- **RLS must be on and correct — test it.** Log in as user A and confirm you cannot
  read user B's rows or songs from an unowned bundle. This testing *is* your security
  review; it matters more than repo privacy.
- **A paying user can still copy what they bought.** RLS stops non-buyers and
  outsiders. It can't stop someone who legitimately owns a bundle from extracting the
  song data their browser fetched. No web setup fully solves this.
- **Service-role key = crown jewels.** Only ever in Edge Function secrets. Never the
  repo, never the browser, never an `.env` that gets committed.
