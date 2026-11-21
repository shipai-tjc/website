-- TJC SHIPAI CMS · isolated tables for a dedicated Supabase project
-- Apply through Supabase SQL Editor / migration, never from the public browser.
create extension if not exists pgcrypto;

create table if not exists public.tjc_cms_members (
  email text primary key,
  role text not null check (role in ('viewer','editor','reviewer','admin')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tjc_cms_email_lowercase check (email = lower(trim(email)))
);

create table if not exists public.tjc_cms_drafts (
  id uuid primary key default gen_random_uuid(),
  path text not null check (path in (
    'index.html','schedule.html','contact.html',
    'data/news.json','data/history.json','data/testimonies.json'
  )),
  content text not null,
  base_sha text not null,
  note text not null default '',
  status text not null default 'draft'
    check (status in ('draft','review','published','rejected')),
  author_email text not null,
  reviewed_by text,
  reviewed_at timestamptz,
  published_commit text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tjc_cms_drafts_status_idx
  on public.tjc_cms_drafts (status, updated_at desc);
create index if not exists tjc_cms_drafts_author_idx
  on public.tjc_cms_drafts (author_email, updated_at desc);

alter table public.tjc_cms_members enable row level security;
alter table public.tjc_cms_drafts enable row level security;
-- Deliberately NO anon / authenticated policies. All reads/writes are performed
-- by the Edge Function after verifying JWT and role with a server-only key.
revoke all on public.tjc_cms_members from anon, authenticated;
revoke all on public.tjc_cms_drafts from anon, authenticated;

-- Bootstrap ONE trusted administrator in the SQL editor before first login:
-- insert into public.tjc_cms_members(email,role)
-- values ('YOUR_CONFIRMED_EMAIL@example.org','admin');
