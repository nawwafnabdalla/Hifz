-- Row Level Security, immutability and constraint checks for Hifz OS.
-- Run in the Supabase SQL editor AFTER applying the migration. It creates two throwaway
-- auth users inside a transaction and ROLLS BACK at the end, so nothing is kept.
-- Every check prints PASS or raises an exception naming what failed.
begin;

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'rls-a@example.test'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'rls-b@example.test');

create temp table _ids (n int) on commit drop;
grant all on _ids to authenticated, anon;

create or replace function pg_temp.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

create or replace function pg_temp.expect_error(sql text, label text) returns void language plpgsql as $$
begin
  begin
    execute sql;
  exception when others then
    raise notice 'PASS  % (blocked: %)', label, sqlerrm;
    return;
  end;
  raise exception 'FAIL  % (statement was allowed)', label;
end $$;

-- 1. A user can insert and read their own event.
select pg_temp.as_user('aaaaaaaa-0000-4000-8000-000000000001');
insert into public.review_events (id, kind, surah, ayah_start, ayah_end, grade, context, cue_level, occurred_at)
values ('11111111-1111-4111-8111-111111111111', 'recall', 112, 1, 1, 'independent', 'free', 4, now());
do $$ begin
  if (select count(*) from public.review_events) <> 1 then raise exception 'FAIL own insert/select'; end if;
  raise notice 'PASS  user A can write and read own event';
end $$;

-- 2. Retrying the same id with DO NOTHING never duplicates.
insert into public.review_events (id, kind, surah, ayah_start, ayah_end, grade, context, cue_level, occurred_at)
values ('11111111-1111-4111-8111-111111111111', 'recall', 112, 1, 1, 'failed', 'free', 4, now())
on conflict (id) do nothing;
do $$ begin
  if (select count(*) from public.review_events) <> 1 or (select grade from public.review_events) <> 'independent'
  then raise exception 'FAIL idempotent insert'; end if;
  raise notice 'PASS  duplicate id is ignored and the original is kept';
end $$;

-- 3. History is immutable and cannot be deleted by the user.
select pg_temp.expect_error($q$update public.review_events set grade = 'failed'$q$, 'update of an event is refused');
select pg_temp.expect_error($q$delete from public.review_events$q$, 'delete of an event is refused');

-- 4. Constraints reject impossible verses and ranges.
select pg_temp.expect_error($q$insert into public.review_events (id, kind, surah, ayah_start, ayah_end, grade, context, cue_level, occurred_at) values (gen_random_uuid(), 'recall', 112, 1, 5, 'independent', 'free', 4, now())$q$, 'ayah beyond surah length (112:5)');
select pg_temp.expect_error($q$insert into public.review_events (id, kind, surah, ayah_start, ayah_end, grade, context, cue_level, occurred_at) values (gen_random_uuid(), 'recall', 115, 1, 1, 'independent', 'free', 4, now())$q$, 'surah 115');
select pg_temp.expect_error($q$insert into public.review_events (id, kind, surah, ayah_start, ayah_end, grade, context, cue_level, occurred_at) values (gen_random_uuid(), 'recall', 2, 1, 1, 'perfect', 'free', 4, now())$q$, 'unknown grade');
select pg_temp.expect_error($q$insert into public.review_events (id, kind, surah, ayah_start, ayah_end, grade, context, cue_level, occurred_at) values (gen_random_uuid(), 'junction', 2, 1, 5, 'independent', 'free', 4, now())$q$, 'junction spanning more than two ayahs');

-- 5. Another user sees nothing and cannot write as the first user.
select pg_temp.as_user('bbbbbbbb-0000-4000-8000-000000000002');
do $$ begin
  if (select count(*) from public.review_events) <> 0 then raise exception 'FAIL cross-user read'; end if;
  raise notice 'PASS  user B cannot read user A events';
end $$;
select pg_temp.expect_error($q$insert into public.review_events (id, user_id, kind, surah, ayah_start, ayah_end, grade, context, cue_level, occurred_at) values (gen_random_uuid(), 'aaaaaaaa-0000-4000-8000-000000000001', 'recall', 1, 1, 1, 'independent', 'free', 4, now())$q$, 'writing a row owned by another user');

-- 6. Mutable tables: a stale write is a no-op; a newer one wins.
select pg_temp.as_user('aaaaaaaa-0000-4000-8000-000000000001');
insert into public.learning_targets (id, surah, ayah_start, ayah_end, status, label, updated_at)
values ('22222222-2222-4222-8222-222222222222', 112, 1, 4, 'active', 'new', '2026-01-02');
update public.learning_targets set label = 'stale', updated_at = '2026-01-01' where id = '22222222-2222-4222-8222-222222222222';
do $$ begin
  if (select label from public.learning_targets) <> 'new' then raise exception 'FAIL stale write was applied'; end if;
  raise notice 'PASS  stale update ignored';
end $$;
update public.learning_targets set label = 'newer', updated_at = '2026-01-03' where id = '22222222-2222-4222-8222-222222222222';
do $$ begin
  if (select label from public.learning_targets) <> 'newer' then raise exception 'FAIL newer write was not applied'; end if;
  raise notice 'PASS  newer update applied';
end $$;

-- 7. Anonymous role has no access at all.
reset role;
set local role anon;
select pg_temp.expect_error($q$select * from public.review_events$q$, 'anon read');

-- 8. Export returns only the caller's data; erase deletes only the caller's data.
reset role;
select pg_temp.as_user('aaaaaaaa-0000-4000-8000-000000000001');
do $$ begin
  if jsonb_array_length(public.export_my_data() -> 'review_events') <> 1 then raise exception 'FAIL export'; end if;
  raise notice 'PASS  export_my_data returns own rows';
  perform public.erase_my_data();
  if (select count(*) from public.review_events) <> 0 then raise exception 'FAIL erase'; end if;
  raise notice 'PASS  erase_my_data removes own rows';
end $$;

rollback;
