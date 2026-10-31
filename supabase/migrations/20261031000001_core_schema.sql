-- Hifz OS core schema. Append-only event logs + a few small mutable tables.
-- Every table is owned per-user via Row Level Security. Client-generated UUIDs make
-- retried uploads idempotent (INSERT ... ON CONFLICT DO NOTHING).

create sequence if not exists public.hifz_seq as bigint;

-- Canonical Hafs ayah counts (matches data/PROVENANCE.md and the app's tests).
create or replace function public.ayah_count(s int) returns int
language sql immutable parallel safe set search_path = ''
as $$ select (array[7,286,200,176,120,165,206,75,129,109,123,111,43,52,99,128,111,110,98,135,112,78,118,64,77,227,93,88,69,60,34,30,73,54,45,83,182,88,75,85,54,53,89,59,37,35,38,29,18,45,60,49,62,55,78,96,29,22,24,13,14,11,11,18,12,12,30,52,52,44,28,28,20,56,40,31,50,40,46,42,29,19,36,25,22,17,19,26,30,20,15,21,11,8,8,19,5,8,8,11,11,8,3,9,5,4,7,3,6,3,5,4,5,6])[s] $$;

create or replace function public.valid_range(s int, a int, b int) returns boolean
language sql immutable parallel safe set search_path = ''
as $$ select s between 1 and 114 and a >= 1 and b >= a and b <= public.ayah_count(s) $$;

-- Bump the sync cursor on every write so other devices can pull changes.
create or replace function public.hifz_touch_seq() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.seq := nextval('public.hifz_seq');
  return new;
end $$;

-- Mutable tables are last-writer-wins by the client's updated_at; a stale write is a no-op.
create or replace function public.hifz_reject_stale() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.updated_at < old.updated_at then
    return old;
  end if;
  return new;
end $$;

-- Immutable tables: history is never edited.
create or replace function public.hifz_forbid_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Table % is append-only; events cannot be modified', tg_table_name using errcode = 'P0001';
end $$;

-- ───────────── profiles (settings; mutable) ─────────────
create table public.profiles (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  seq bigint not null default nextval('public.hifz_seq'),
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object' and pg_column_size(settings) < 20000),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- ───────────── review_events (immutable) ─────────────
create table public.review_events (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  seq bigint not null default nextval('public.hifz_seq'),
  kind text not null check (kind in ('recall','junction')),
  surah smallint not null,
  ayah_start smallint not null,
  ayah_end smallint not null,
  grade text not null check (grade in ('independent','hesitant','prompted','failed')),
  context text not null check (context in ('new','sabqi','manzil','repair','verify','free','probe')),
  cue_level smallint not null check (cue_level between 0 and 4),
  stumbles jsonb not null default '[]'::jsonb check (jsonb_typeof(stumbles) = 'array' and jsonb_array_length(stumbles) <= 300),
  shaky_junctions jsonb not null default '[]'::jsonb check (jsonb_typeof(shaky_junctions) = 'array' and jsonb_array_length(shaky_junctions) <= 300),
  completed_to smallint,
  duration_ms integer not null default 0 check (duration_ms between 0 and 86400000),
  occurred_at timestamptz not null,
  session_id uuid,
  strategy text check (strategy in ('A','B')),
  experiment_id uuid,
  listened_first boolean,
  created_at timestamptz not null default now(),
  constraint review_events_range_valid check (public.valid_range(surah, ayah_start, ayah_end)),
  constraint review_events_completed_valid check (completed_to is null or (completed_to >= ayah_start and completed_to <= ayah_end)),
  constraint review_events_junction_span check (kind <> 'junction' or ayah_end = ayah_start + 1)
);
create index review_events_user_seq on public.review_events (user_id, seq);
create index review_events_user_time on public.review_events (user_id, occurred_at);
create index review_events_user_verse on public.review_events (user_id, surah, ayah_start);

-- ───────────── flow_events (immutable) ─────────────
create table public.flow_events (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  seq bigint not null default nextval('public.hifz_seq'),
  surah smallint not null,
  ayah smallint not null,
  from_phrase smallint not null check (from_phrase >= 0),
  to_phrase smallint not null,
  phrase_count smallint not null check (phrase_count >= 1),
  rating text not null check (rating in ('tangled','improving','natural')),
  reps smallint not null default 0 check (reps between 0 and 1000),
  duration_ms integer not null default 0 check (duration_ms between 0 and 86400000),
  occurred_at timestamptz not null,
  session_id uuid,
  strategy text check (strategy in ('A','B')),
  experiment_id uuid,
  listened_first boolean,
  created_at timestamptz not null default now(),
  constraint flow_events_verse_valid check (public.valid_range(surah, ayah, ayah)),
  constraint flow_events_phrase_valid check (to_phrase >= from_phrase and to_phrase < phrase_count)
);
create index flow_events_user_seq on public.flow_events (user_id, seq);
create index flow_events_user_verse on public.flow_events (user_id, surah, ayah);

-- ───────────── declarations (immutable; "I know this" is evidence of a claim, not of recall) ─────────────
create table public.declarations (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  seq bigint not null default nextval('public.hifz_seq'),
  surah smallint not null,
  ayah_start smallint not null,
  ayah_end smallint not null,
  level text not null check (level in ('known','retract')),
  note text check (note is null or char_length(note) <= 500),
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint declarations_range_valid check (public.valid_range(surah, ayah_start, ayah_end))
);
create index declarations_user_seq on public.declarations (user_id, seq);

-- ───────────── study_sessions (mutable: end time + summary) ─────────────
create table public.study_sessions (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  seq bigint not null default nextval('public.hifz_seq'),
  started_at timestamptz not null,
  ended_at timestamptz,
  planned_minutes smallint check (planned_minutes is null or planned_minutes between 1 and 600),
  plan_snapshot jsonb check (plan_snapshot is null or pg_column_size(plan_snapshot) < 200000),
  summary jsonb check (summary is null or pg_column_size(summary) < 50000),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index study_sessions_user_seq on public.study_sessions (user_id, seq);

-- ───────────── learning_targets (mutable) ─────────────
create table public.learning_targets (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  seq bigint not null default nextval('public.hifz_seq'),
  surah smallint not null,
  ayah_start smallint not null,
  ayah_end smallint not null,
  status text not null check (status in ('active','paused','done')),
  label text check (label is null or char_length(label) <= 120),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint learning_targets_range_valid check (public.valid_range(surah, ayah_start, ayah_end))
);
create index learning_targets_user_seq on public.learning_targets (user_id, seq);

-- ───────────── phrase_markers (mutable; the user's own phrase boundaries) ─────────────
create table public.phrase_markers (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  surah smallint not null,
  ayah smallint not null,
  seq bigint not null default nextval('public.hifz_seq'),
  boundaries jsonb not null check (jsonb_typeof(boundaries) = 'array' and jsonb_array_length(boundaries) <= 200),
  updated_at timestamptz not null default now(),
  primary key (user_id, surah, ayah),
  constraint phrase_markers_verse_valid check (public.valid_range(surah, ayah, ayah))
);
create index phrase_markers_user_seq on public.phrase_markers (user_id, seq);

-- ───────────── experiments (mutable) ─────────────
create table public.experiments (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  seq bigint not null default nextval('public.hifz_seq'),
  name text not null check (char_length(name) between 1 and 120),
  started_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > started_at),
  assignments jsonb not null default '{}'::jsonb check (jsonb_typeof(assignments) = 'object' and pg_column_size(assignments) < 100000),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index experiments_user_seq on public.experiments (user_id, seq);

-- ───────────── triggers ─────────────
create trigger review_events_no_update before update on public.review_events for each row execute function public.hifz_forbid_update();
create trigger flow_events_no_update before update on public.flow_events for each row execute function public.hifz_forbid_update();
create trigger declarations_no_update before update on public.declarations for each row execute function public.hifz_forbid_update();
create trigger profiles_stale before update on public.profiles for each row execute function public.hifz_reject_stale();
create trigger profiles_seq before update on public.profiles for each row execute function public.hifz_touch_seq();
create trigger study_sessions_stale before update on public.study_sessions for each row execute function public.hifz_reject_stale();
create trigger study_sessions_seq before update on public.study_sessions for each row execute function public.hifz_touch_seq();
create trigger learning_targets_stale before update on public.learning_targets for each row execute function public.hifz_reject_stale();
create trigger learning_targets_seq before update on public.learning_targets for each row execute function public.hifz_touch_seq();
create trigger phrase_markers_stale before update on public.phrase_markers for each row execute function public.hifz_reject_stale();
create trigger phrase_markers_seq before update on public.phrase_markers for each row execute function public.hifz_touch_seq();
create trigger experiments_stale before update on public.experiments for each row execute function public.hifz_reject_stale();
create trigger experiments_seq before update on public.experiments for each row execute function public.hifz_touch_seq();

-- ───────────── Row Level Security ─────────────
alter table public.profiles enable row level security;
revoke all on public.profiles from anon, public;
revoke update, delete, truncate on public.profiles from authenticated;
grant select, insert on public.profiles to authenticated;
create policy "profiles_select_own" on public.profiles for select to authenticated using (user_id = (select auth.uid()));
create policy "profiles_insert_own" on public.profiles for insert to authenticated with check (user_id = (select auth.uid()));
grant update on public.profiles to authenticated;
create policy "profiles_update_own" on public.profiles for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter table public.review_events enable row level security;
revoke all on public.review_events from anon, public;
revoke update, delete, truncate on public.review_events from authenticated;
grant select, insert on public.review_events to authenticated;
create policy "review_events_select_own" on public.review_events for select to authenticated using (user_id = (select auth.uid()));
create policy "review_events_insert_own" on public.review_events for insert to authenticated with check (user_id = (select auth.uid()));
alter table public.flow_events enable row level security;
revoke all on public.flow_events from anon, public;
revoke update, delete, truncate on public.flow_events from authenticated;
grant select, insert on public.flow_events to authenticated;
create policy "flow_events_select_own" on public.flow_events for select to authenticated using (user_id = (select auth.uid()));
create policy "flow_events_insert_own" on public.flow_events for insert to authenticated with check (user_id = (select auth.uid()));
alter table public.declarations enable row level security;
revoke all on public.declarations from anon, public;
revoke update, delete, truncate on public.declarations from authenticated;
grant select, insert on public.declarations to authenticated;
create policy "declarations_select_own" on public.declarations for select to authenticated using (user_id = (select auth.uid()));
create policy "declarations_insert_own" on public.declarations for insert to authenticated with check (user_id = (select auth.uid()));
alter table public.study_sessions enable row level security;
revoke all on public.study_sessions from anon, public;
revoke update, delete, truncate on public.study_sessions from authenticated;
grant select, insert on public.study_sessions to authenticated;
create policy "study_sessions_select_own" on public.study_sessions for select to authenticated using (user_id = (select auth.uid()));
create policy "study_sessions_insert_own" on public.study_sessions for insert to authenticated with check (user_id = (select auth.uid()));
grant update on public.study_sessions to authenticated;
create policy "study_sessions_update_own" on public.study_sessions for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter table public.learning_targets enable row level security;
revoke all on public.learning_targets from anon, public;
revoke update, delete, truncate on public.learning_targets from authenticated;
grant select, insert on public.learning_targets to authenticated;
create policy "learning_targets_select_own" on public.learning_targets for select to authenticated using (user_id = (select auth.uid()));
create policy "learning_targets_insert_own" on public.learning_targets for insert to authenticated with check (user_id = (select auth.uid()));
grant update on public.learning_targets to authenticated;
create policy "learning_targets_update_own" on public.learning_targets for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter table public.phrase_markers enable row level security;
revoke all on public.phrase_markers from anon, public;
revoke update, delete, truncate on public.phrase_markers from authenticated;
grant select, insert on public.phrase_markers to authenticated;
create policy "phrase_markers_select_own" on public.phrase_markers for select to authenticated using (user_id = (select auth.uid()));
create policy "phrase_markers_insert_own" on public.phrase_markers for insert to authenticated with check (user_id = (select auth.uid()));
grant update on public.phrase_markers to authenticated;
create policy "phrase_markers_update_own" on public.phrase_markers for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter table public.experiments enable row level security;
revoke all on public.experiments from anon, public;
revoke update, delete, truncate on public.experiments from authenticated;
grant select, insert on public.experiments to authenticated;
create policy "experiments_select_own" on public.experiments for select to authenticated using (user_id = (select auth.uid()));
create policy "experiments_insert_own" on public.experiments for insert to authenticated with check (user_id = (select auth.uid()));
grant update on public.experiments to authenticated;
create policy "experiments_update_own" on public.experiments for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ───────────── user-owned data: export and erase ─────────────
create or replace function public.export_my_data() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'exported_at', now(),
    'schema', 1,
    'profiles', coalesce((select jsonb_agg(to_jsonb(t)) from public.profiles t), '[]'),
    'review_events', coalesce((select jsonb_agg(to_jsonb(t) order by t.occurred_at) from public.review_events t), '[]'),
    'flow_events', coalesce((select jsonb_agg(to_jsonb(t) order by t.occurred_at) from public.flow_events t), '[]'),
    'declarations', coalesce((select jsonb_agg(to_jsonb(t) order by t.occurred_at) from public.declarations t), '[]'),
    'study_sessions', coalesce((select jsonb_agg(to_jsonb(t) order by t.started_at) from public.study_sessions t), '[]'),
    'learning_targets', coalesce((select jsonb_agg(to_jsonb(t)) from public.learning_targets t), '[]'),
    'phrase_markers', coalesce((select jsonb_agg(to_jsonb(t)) from public.phrase_markers t), '[]'),
    'experiments', coalesce((select jsonb_agg(to_jsonb(t)) from public.experiments t), '[]')
  )
$$;

-- Deletes ALL of the calling user's learning data (the user's right; there is no per-event delete).
create or replace function public.erase_my_data() returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;
  delete from public.review_events where user_id = uid;
  delete from public.flow_events where user_id = uid;
  delete from public.declarations where user_id = uid;
  delete from public.study_sessions where user_id = uid;
  delete from public.learning_targets where user_id = uid;
  delete from public.phrase_markers where user_id = uid;
  delete from public.experiments where user_id = uid;
  delete from public.profiles where user_id = uid;
end $$;

revoke execute on function public.erase_my_data() from public, anon;
grant execute on function public.erase_my_data() to authenticated;
revoke execute on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;
