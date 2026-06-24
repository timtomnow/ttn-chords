-- Phase 1 — Auth + profiles.
-- Run this in the DEV Supabase project's SQL editor before testing Phase 1.
-- It is the profiles-related subset of ttn-chords-supabase-schema.md; later
-- phases add the remaining tables. Safe to re-run (idempotent where practical).

-- ── Profiles: one row per auth user ──
-- (Created first: is_admin() below is a SQL function whose body is validated at
--  creation time and references this table.)
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text,
  display_name text,
  role         text not null default 'user' check (role in ('user','admin')),
  created_at   timestamptz not null default now()
);

-- ── Helper: admin check (SECURITY DEFINER avoids RLS recursion on profiles) ──
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

-- ── Auto-create a profile row when a new auth user signs up ──
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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Block a normal user from promoting themselves to admin ──
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

drop trigger if exists profiles_guard_role on public.profiles;
create trigger profiles_guard_role
  before update on public.profiles
  for each row execute function public.guard_role_change();

-- ── RLS: read/update your own row; admins everything ──
alter table public.profiles enable row level security;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- Bootstrap the first admin AFTER signing up in the app. The guard trigger
-- blocks role changes for non-admins (and auth.uid() is null in the SQL editor),
-- so disable it for the one-off update, then re-enable. From the app a user can
-- never escalate their own role. Replace the email:
--   alter table public.profiles disable trigger profiles_guard_role;
--   update public.profiles set role = 'admin' where email = 'you@example.com';
--   alter table public.profiles enable trigger profiles_guard_role;
