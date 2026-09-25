-- My Cloud V2 database upgrade
-- Run this AFTER the existing My Cloud schema/tables are already present.
-- This migration is designed to be safe for the current files/folders/albums/profiles setup.

create extension if not exists pgcrypto;

-- Profiles
alter table public.profiles add column if not exists display_name text;
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists quota_bytes bigint not null default 1099511627776;

-- Folders
create table if not exists public.folders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  parent_id uuid null references public.folders(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.folders add column if not exists parent_id uuid;
alter table public.folders add column if not exists created_at timestamptz not null default now();
create index if not exists folders_owner_idx on public.folders(owner_id);
create index if not exists folders_parent_idx on public.folders(parent_id);

-- Albums
create table if not exists public.albums (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  cover_file_id uuid null,
  created_at timestamptz not null default now()
);
alter table public.albums add column if not exists cover_file_id uuid;
alter table public.albums add column if not exists created_at timestamptz not null default now();
create index if not exists albums_owner_idx on public.albums(owner_id);

-- Files: fields required by V2
alter table public.files add column if not exists folder_id uuid;
alter table public.files add column if not exists album_id uuid;
alter table public.files add column if not exists is_favorite boolean not null default false;
alter table public.files add column if not exists is_trashed boolean not null default false;
alter table public.files add column if not exists trashed_at timestamptz;
create index if not exists files_folder_idx on public.files(owner_id,folder_id);
create index if not exists files_album_idx on public.files(owner_id,album_id);
create index if not exists files_favorite_idx on public.files(owner_id,is_favorite);

-- Ownership-safe foreign keys. These can fail only if existing data contains invalid IDs;
-- if that happens, fix those orphan references before adding the constraints.
do $$ begin
  if not exists (select 1 from pg_constraint where conname='files_folder_fk') then
    alter table public.files add constraint files_folder_fk foreign key(folder_id) references public.folders(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname='files_album_fk') then
    alter table public.files add constraint files_album_fk foreign key(album_id) references public.albums(id) on delete set null;
  end if;
end $$;

-- Permanent share records. The frontend currently creates 1-hour signed links directly
-- from private storage. This table gives us a persistent audit/management layer for
-- future Edge Function based public links without exposing a service-role key.
create table if not exists public.shares (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  file_id uuid not null references public.files(id) on delete cascade,
  token text not null unique default encode(gen_random_bytes(24),'hex'),
  permission text not null default 'view' check(permission in ('view','download')),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists shares_owner_idx on public.shares(owner_id);
create index if not exists shares_file_idx on public.shares(file_id);

-- RLS
alter table public.profiles enable row level security;
alter table public.files enable row level security;
alter table public.folders enable row level security;
alter table public.albums enable row level security;
alter table public.shares enable row level security;

drop policy if exists "profiles own row" on public.profiles;
create policy "profiles own row" on public.profiles for all using(auth.uid()=id) with check(auth.uid()=id);

-- Drop/recreate owner policies so V2 is deterministic.
do $$ declare r record; begin
  for r in select policyname from pg_policies where schemaname='public' and tablename in ('folders','albums','shares') loop
    execute format('drop policy if exists %I on public.%I',r.policyname,(select tablename from pg_policies p where p.policyname=r.policyname and p.schemaname='public' limit 1));
  end loop;
end $$;

drop policy if exists "folders owner all" on public.folders;
create policy "folders owner all" on public.folders for all using(auth.uid()=owner_id) with check(auth.uid()=owner_id);
drop policy if exists "albums owner all" on public.albums;
create policy "albums owner all" on public.albums for all using(auth.uid()=owner_id) with check(auth.uid()=owner_id);
drop policy if exists "shares owner all" on public.shares;
create policy "shares owner all" on public.shares for all using(auth.uid()=owner_id) with check(auth.uid()=owner_id);

-- Grants used by the current frontend.
grant select,insert,update,delete on public.profiles,public.files,public.folders,public.albums,public.shares to authenticated;

-- Storage remains PRIVATE. Do not make user-files public.
insert into storage.buckets(id,name,public) values('user-files','user-files',false)
on conflict(id) do update set public=false;

drop policy if exists "storage own select" on storage.objects;
create policy "storage own select" on storage.objects for select to authenticated using(bucket_id='user-files' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists "storage own insert" on storage.objects;
create policy "storage own insert" on storage.objects for insert to authenticated with check(bucket_id='user-files' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists "storage own update" on storage.objects;
create policy "storage own update" on storage.objects for update to authenticated using(bucket_id='user-files' and (storage.foldername(name))[1]=auth.uid()::text) with check(bucket_id='user-files' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists "storage own delete" on storage.objects;
create policy "storage own delete" on storage.objects for delete to authenticated using(bucket_id='user-files' and (storage.foldername(name))[1]=auth.uid()::text);

create or replace function public.get_storage_usage()
returns bigint language sql security invoker
as $$ select coalesce(sum(size_bytes),0)::bigint from public.files where owner_id=auth.uid() and is_trashed=false; $$;

-- Important: this is still an application quota model, not 1 TB of free physical storage.
-- Real 1 TB/user requires a storage provider/billing architecture capable of funding the data.
-- Never put a service-role/secret key in the browser.
