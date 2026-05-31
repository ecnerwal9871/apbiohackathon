-- APBioFocus schema
-- Run this in Supabase SQL editor.

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  theme text not null default 'dark' check (theme in ('light', 'dark')),
  goals_summer_minutes integer not null default 240,
  goals_fall_minutes integer not null default 120,
  goals_winter_minutes integer not null default 120,
  goals_spring_minutes integer not null default 120,
  notify_session_end boolean not null default true,
  notify_break_end boolean not null default true,
  notify_daily boolean not null default false,
  notify_streak boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.units (
  id smallint primary key,
  name text not null,
  season text not null check (season in ('summer', 'fall', 'winter', 'spring')),
  difficulty text not null check (difficulty in ('hard', 'medium', 'easy')),
  order_index smallint not null
);

create table if not exists public.chapters (
  id text primary key,
  unit_id smallint not null references public.units(id) on delete cascade,
  title text not null,
  order_index smallint not null
);

create table if not exists public.user_chapter_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  chapter_id text not null references public.chapters(id) on delete cascade,
  completed boolean not null default false,
  completed_at timestamptz,
  primary key (user_id, chapter_id)
);

create table if not exists public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  unit_id smallint not null references public.units(id),
  chapter_id text references public.chapters(id),
  session_type text not null check (session_type in ('focus', 'break')),
  started_at timestamptz not null,
  ended_at timestamptz not null,
  focus_seconds integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.daily_stats (
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  focus_seconds integer not null default 0,
  session_count integer not null default 0,
  goal_minutes integer not null default 120,
  status text not null default 'lagging' check (status in ('lagging', 'on_track', 'ahead')),
  primary key (user_id, date)
);

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  unit_id smallint not null references public.units(id),
  body text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists public.user_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state_json jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.user_settings enable row level security;
alter table public.user_chapter_progress enable row level security;
alter table public.study_sessions enable row level security;
alter table public.daily_stats enable row level security;
alter table public.notes enable row level security;
alter table public.user_state enable row level security;

-- Public read access for static curriculum tables.
alter table public.units enable row level security;
alter table public.chapters enable row level security;

drop policy if exists units_read_all on public.units;
create policy units_read_all on public.units for select using (true);

drop policy if exists chapters_read_all on public.chapters;
create policy chapters_read_all on public.chapters for select using (true);

-- User-owned data policies.
drop policy if exists user_settings_owner on public.user_settings;
create policy user_settings_owner on public.user_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists progress_owner on public.user_chapter_progress;
create policy progress_owner on public.user_chapter_progress
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists sessions_owner on public.study_sessions;
create policy sessions_owner on public.study_sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists daily_stats_owner on public.daily_stats;
create policy daily_stats_owner on public.daily_stats
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists notes_owner on public.notes;
create policy notes_owner on public.notes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists user_state_owner on public.user_state;
create policy user_state_owner on public.user_state
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
