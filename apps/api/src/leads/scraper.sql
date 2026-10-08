-- Lead scraper schema for the Supabase database named by VEXOL_LEADS_DATABASE_URL.
-- Run it in the Supabase SQL editor; it is safe to run again. The connection role
-- needs select, insert, update and delete on every table in the `scraper` schema.

create schema if not exists scraper;

-- One row per platform of a Vexol project. project_id and agent_id are ids in the
-- Vexol database: the project, and the platform's external agent (Agents tab), which
-- reads its jobs through the Vexol MCP endpoint with its own API key. The API creates
-- the default platforms of a project the first time its Leads page is opened.
-- lead_format decides what a lead of the platform holds: 'email' (a company and its
-- published email address) or 'social' (an account and the comment it placed).
create table if not exists scraper.platforms (
  id uuid primary key default gen_random_uuid(),
  project_id integer not null,
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (length(name) between 1 and 80),
  active boolean not null default false,
  lead_format text not null default 'email' check (lead_format in ('email', 'social')),
  instructions text not null default '',
  agent_id integer,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Databases set up before platforms belonged to a project have a global slug
-- constraint and project-less default rows; both are replaced here.
alter table scraper.platforms add column if not exists project_id integer;
alter table scraper.platforms drop constraint if exists platforms_slug_key;
delete from scraper.platforms where project_id is null;
alter table scraper.platforms alter column project_id set not null;

create unique index if not exists platforms_project_slug_idx
  on scraper.platforms (project_id, slug);

-- Databases set up before lead formats existed get the column once, with the social
-- default platforms switched to 'social'.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'scraper' and table_name = 'platforms' and column_name = 'lead_format'
  ) then
    alter table scraper.platforms add column lead_format text not null default 'email'
      check (lead_format in ('email', 'social'));
    update scraper.platforms set lead_format = 'social'
      where slug in ('tiktok', 'instagram', 'linkedin');
  end if;
end $$;

-- region, niche and scale are required free text. keywords, signal, max_leads and notes
-- are optional refinements a job can carry.
create table if not exists scraper.scrape_runs (
  id uuid primary key default gen_random_uuid(),
  platform_id uuid not null references scraper.platforms (id) on delete cascade,
  region text not null,
  niche text not null,
  scale text not null,
  keywords text not null default '',
  signal text not null default '',
  max_leads integer check (max_leads > 0),
  notes text not null default '',
  status text not null default 'queued'
    check (status in ('queued', 'running', 'completed', 'failed')),
  lead_count integer not null default 0,
  error text,
  requested_by text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

alter table scraper.scrape_runs add column if not exists keywords text not null default '';
alter table scraper.scrape_runs add column if not exists signal text not null default '';
alter table scraper.scrape_runs add column if not exists max_leads integer check (max_leads > 0);
alter table scraper.scrape_runs add column if not exists notes text not null default '';

create index if not exists scrape_runs_platform_created_idx
  on scraper.scrape_runs (platform_id, created_at desc);

-- An email lead has email, name and sector (the scraper CSV format; sector is the
-- category). A social lead has handle, profile_url, followers, comment, commented_at
-- and video_url. A platform stores an email or a handle once; a repeat keeps the first row.
create table if not exists scraper.leads (
  id uuid primary key default gen_random_uuid(),
  platform_id uuid not null references scraper.platforms (id) on delete cascade,
  scrape_run_id uuid references scraper.scrape_runs (id) on delete set null,
  email text check (email ~ '^[^@\s,]+@[^@\s,]+\.[a-z]{2,}$'),
  name text not null check (length(name) > 0),
  sector text,
  handle text,
  profile_url text,
  followers integer check (followers >= 0),
  comment text,
  commented_at timestamptz,
  video_url text,
  created_at timestamptz not null default now(),
  unique (platform_id, email)
);

alter table scraper.leads alter column email drop not null;
alter table scraper.leads add column if not exists handle text;
alter table scraper.leads add column if not exists profile_url text;
alter table scraper.leads add column if not exists followers integer check (followers >= 0);
alter table scraper.leads add column if not exists comment text;
alter table scraper.leads add column if not exists commented_at timestamptz;
alter table scraper.leads add column if not exists video_url text;
alter table scraper.leads drop constraint if exists leads_contact_check;
alter table scraper.leads add constraint leads_contact_check
  check (email is not null or handle is not null);

create unique index if not exists leads_platform_handle_idx
  on scraper.leads (platform_id, handle) where handle is not null;
create index if not exists leads_scrape_run_idx on scraper.leads (scrape_run_id);

-- Supabase exposes the public schema over its REST API; this schema is read only
-- by the Vexol API over a direct connection, so row level security stays off and
-- the anon and authenticated roles get no grants.
