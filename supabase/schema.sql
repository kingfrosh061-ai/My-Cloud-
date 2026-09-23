-- My Cloud production database foundation
-- Run this in Supabase SQL Editor AFTER creating a Supabase project.
-- The storage bucket must be private.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  quota_bytes bigint not null default 1099511627776,
  created_at timestamptz not null default now()
);

create table if not exists public.files (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  storage_path text not null unique,
  mime_type text not null default 'application/octet-stream',
  size_bytes bigint not null default 0,
  kind text not null default 'file' check (kind in ('photo','video','file')),
  folder_id uuid null,
  album_id uuid null,
  is_favorite boolean not null default false,
  is_trashed boolean not null default false,
  trashed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists files_owner_idx on public.files(owner_id);
create index if not exists files_owner_kind_idx on public.files(owner_id, kind);
create index if not exists files_owner_trash_idx on public.files(owner_id, is_trashed);

alter table public.profiles enable row level security;
alter table public.files enable row level security;

drop policy if exists "profiles own row" on public.profiles;
create policy "profiles own row" on public.profiles
for all using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "files owner select" on public.files;
create policy "files owner select" on public.files
for select using (auth.uid() = owner_id);

drop policy if exists "files owner insert" on public.files;
create policy "files owner insert" on public.files
for insert with check (auth.uid() = owner_id);

drop policy if exists "files owner update" on public.files;
create policy "files owner update" on public.files
for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists "files owner delete" on public.files;
create policy "files owner delete" on public.files
for delete using (auth.uid() = owner_id);

insert into storage.buckets (id, name, public)
values ('user-files', 'user-files', false)
on conflict (id) do update set public = false;

drop policy if exists "storage own select" on storage.objects;
create policy "storage own select" on storage.objects
for select to authenticated
using (bucket_id = 'user-files' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "storage own insert" on storage.objects;
create policy "storage own insert" on storage.objects
for insert to authenticated
with check (bucket_id = 'user-files' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "storage own update" on storage.objects;
create policy "storage own update" on storage.objects
for update to authenticated
using (bucket_id = 'user-files' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'user-files' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "storage own delete" on storage.objects;
create policy "storage own delete" on storage.objects
for delete to authenticated
using (bucket_id = 'user-files' and (storage.foldername(name))[1] = auth.uid()::text);

create or replace function public.get_storage_usage()
returns bigint
language sql
security invoker
as $$
  select coalesce(sum(size_bytes),0)::bigint
  from public.files
  where owner_id = auth.uid()
    and is_trashed = false;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles(id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- NOTE:
-- This schema provides a 1 TB quota field and application-side quota check.
-- For production, enforce quota atomically server-side/with a database function
-- before accepting uploads, especially for concurrent uploads.
-- Never put a Supabase service-role key in the browser.
