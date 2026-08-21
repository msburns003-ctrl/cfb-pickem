-- CFB Pick'em schema (Postgres / Supabase)
-- These tables are only ever accessed by the trusted Express backend using
-- the anon key; the app implements its own auth/authorization, so RLS is
-- disabled intentionally (no direct client access to these tables).

create table if not exists users (
  id serial primary key,
  name text not null,
  email text not null unique,
  password_hash text not null,
  is_admin boolean not null default false,
  auth_token text,
  must_change_password boolean not null default true
);

create table if not exists weeks (
  id serial primary key,
  season_year integer not null,
  week_number integer not null,
  label text not null,
  pick_deadline text not null,
  money_game_count integer not null default 2,
  status text not null default 'setup' check (status in ('setup','open','locked','graded')),
  payout_amount double precision,
  payout_paid boolean not null default false
);

create table if not exists games (
  id serial primary key,
  week_id integer not null references weeks(id),
  source_fixture_id text,
  away_team text not null,
  home_team text not null,
  away_rank integer,
  home_rank integer,
  favorite_team text not null,
  spread double precision not null,
  kickoff text not null,
  broadcast text,
  pick_type text not null check (pick_type in ('SU','ATS')),
  is_selected boolean not null default false,
  sort_order integer not null default 0,
  status text not null default 'scheduled' check (status in ('scheduled','final')),
  away_score integer,
  home_score integer,
  winner text,
  ats_result text check (ats_result in ('favorite','underdog','push')),
  is_money_game boolean not null default false
);

create table if not exists picks (
  id serial primary key,
  game_id integer not null references games(id),
  user_id integer not null references users(id),
  selected_team text not null,
  is_correct boolean,
  points_earned integer,
  submitted_at text not null,
  unique (game_id, user_id)
);

create table if not exists upset_picks (
  id serial primary key,
  week_id integer not null references weeks(id),
  user_id integer not null references users(id),
  game_id integer not null references games(id),
  underdog_team text not null,
  favorite_team text not null,
  spread double precision not null,
  result text not null default 'pending' check (result in ('pending','win','loss','push')),
  points_earned integer not null default 0,
  submitted_at text not null,
  unique (week_id, user_id)
);

alter table users disable row level security;
alter table weeks disable row level security;
alter table games disable row level security;
alter table picks disable row level security;
alter table upset_picks disable row level security;
