-- =============================================================================
-- STOP. Do not run this file until the live server is using the secret key.
--
-- This turns on Row Level Security and removes the public anon and
-- authenticated roles' access to league data. The website's server is the
-- only thing that reads these tables. It must be using SUPABASE_SERVICE_ROLE_KEY
-- (the Supabase secret key, which bypasses row level security) BEFORE you
-- run this. If you run it while the server is still on the anon key, the
-- live site will stop loading games, picks, and standings.
--
-- Ready means all three of these are true:
--   1. SUPABASE_SERVICE_ROLE_KEY is set on the Perplexity host to the secret
--      key (starts with sb_secret_) or the legacy service_role key.
--      The anon key and the publishable key (sb_publishable_) do not count.
--   2. The code from this change has been published, and the site still loads.
--   3. The server log no longer says "still using the public anon key".
--
-- How to run it, once those are true:
--   Supabase dashboard → SQL Editor → New query → paste this whole file → Run.
-- It is safe to run a second time. Nothing in the app runs this file for you.
-- This file was not applied when it was added to the repo.
--
-- If the site breaks after you run it, the server is still on the anon key.
-- Set SUPABASE_SERVICE_ROLE_KEY and publish again. That restores access.
-- Do not turn row level security back off to "fix" it.
-- =============================================================================

begin;

-- Enable RLS and create no policies. With row level security on and zero
-- policies, anon and authenticated are denied. service_role has BYPASSRLS,
-- which is how the Express server keeps working. postgres (the SQL editor)
-- also bypasses RLS, so this editor can still read the tables.
-- No policy is created for anon or authenticated on purpose.

alter table public.users enable row level security;
alter table public.weeks enable row level security;
alter table public.games enable row level security;
alter table public.picks enable row level security;
alter table public.upset_picks enable row level security;
alter table public.cristo_ball_entries enable row level security;
alter table public.cristo_ball_results enable row level security;

-- public.rls_auto_enable() is a SECURITY DEFINER event trigger
-- (ensure_rls). Its privileges are granted to PUBLIC as well as directly to
-- anon and authenticated. Revoking only from anon and authenticated would
-- leave the PUBLIC grant, and those roles could still call the function
-- through the Data API. Revoke PUBLIC too.
-- postgres and service_role keep their own explicit EXECUTE grants, so the
-- event trigger still runs when a table is created from the SQL editor.
-- dashboard_user is not an API role; it is granted back so the table editor
-- can still create tables. anon and authenticated are not granted back.

revoke execute on function public.rls_auto_enable() from public;
revoke execute on function public.rls_auto_enable() from anon, authenticated;
grant execute on function public.rls_auto_enable() to dashboard_user;

-- Defense in depth. Row level security already denies anon and authenticated
-- when it is on. Revoking the grants means they still have no access if RLS
-- is ever turned off again. service_role keeps its grants (this script does
-- not touch them), so the server can still read and write, including the
-- id sequences used by inserts. The Supabase dashboard uses postgres, which
-- is also not changed here.

revoke all privileges on table
  public.users,
  public.weeks,
  public.games,
  public.picks,
  public.upset_picks,
  public.cristo_ball_entries,
  public.cristo_ball_results
from anon, authenticated;

revoke all privileges on sequence
  public.users_id_seq,
  public.weeks_id_seq,
  public.games_id_seq,
  public.picks_id_seq,
  public.upset_picks_id_seq,
  public.cristo_ball_entries_id_seq,
  public.cristo_ball_results_id_seq
from anon, authenticated;

-- Tables created later by the role that runs this script (postgres, in the
-- SQL editor) should not be granted to anon or authenticated automatically.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;

commit;

-- Optional check, run as a separate query after this succeeds. Every league
-- table should show row_level_security = true:
--
-- select c.relname as table_name, c.relrowsecurity as row_level_security
-- from pg_class c
-- join pg_namespace n on n.oid = c.relnamespace
-- where n.nspname = 'public' and c.relkind = 'r'
-- order by c.relname;
