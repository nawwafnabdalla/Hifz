-- Hifz OS: Row Level Security, immutability and constraint checks, run against the REAL database.
--
-- HOW TO RUN: Supabase dashboard -> SQL Editor -> paste this whole file -> Run.
-- If Supabase warns about "destructive" statements, confirm: the UPDATE/DELETE/TRUNCATE below are
-- attempts that are SUPPOSED to be refused, and everything is rolled back at the end.
--
-- HOW TO READ THE RESULT: the script ALWAYS finishes by raising an error whose message lists one line
-- per check ("PASS ..." or "FAIL ..."). That error is what rolls everything back, so nothing persists
-- (including the two throwaway users it creates). Success looks like an error box full of PASS lines.
do $$
declare
  res text[] := '{}';
  u1 uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
  u2 uuid := 'bbbbbbbb-0000-4000-8000-000000000002';
  n int; g text; s1 bigint; j jsonb;
begin
  insert into auth.users (id, email) values (u1, 'rls-a@example.test'), (u2, 'rls-b@example.test');

  ---------------- user A ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  set local role authenticated;

  begin
    insert into public.review_events (id, kind, surah, ayah_start, ayah_end, grade, context, cue_level, occurred_at)
      values ('11111111-1111-4111-8111-111111111111', 'recall', 20, 1, 1, 'independent', 'free', 4, now());
    select count(*) into n from public.review_events;
    res := res || (case when n = 1 then 'PASS  A inserts and reads own event' else 'FAIL  A own insert/select, count=' || n end);
  exception when others then res := res || ('FAIL  A own insert: ' || sqlerrm); end;

  begin
    insert into public.review_events (id, kind, surah, ayah_start, ayah_end, grade, context, cue_level, occurred_at)
      values ('11111111-1111-4111-8111-111111111111', 'recall', 20, 1, 1, 'failed', 'free', 4, now()) on conflict (id) do nothing;
    select count(*), min(grade) into n, g from public.review_events;
    res := res || (case when n = 1 and g = 'independent' then 'PASS  retried upload with same id is ignored; original kept (no duplicate)' else 'FAIL  idempotent insert n=' || n || ' grade=' || g end);
  exception when others then res := res || ('FAIL  idempotent insert: ' || sqlerrm); end;

  begin
    insert into public.review_events (id, kind, surah, ayah_start, ayah_end, grade, context, cue_level, occurred_at)
      values ('11111111-1111-4111-8111-222222222222', 'recall', 20, 2, 2, 'hesitant', 'free', 4, now());
    select max(seq) - min(seq) into s1 from public.review_events;
    res := res || (case when s1 > 0 then 'PASS  seq cursor increases with each event' else 'FAIL  seq not increasing' end);
  exception when others then res := res || ('FAIL  seq: ' || sqlerrm); end;

  begin update public.review_events set grade = 'failed'; res := res || 'FAIL  A could UPDATE event history';
  exception when others then res := res || ('PASS  UPDATE of event history refused (' || sqlerrm || ')'); end;
  begin delete from public.review_events; res := res || 'FAIL  A could DELETE event history';
  exception when others then res := res || ('PASS  DELETE of event history refused (' || sqlerrm || ')'); end;
  begin truncate public.review_events; res := res || 'FAIL  A could TRUNCATE';
  exception when others then res := res || ('PASS  TRUNCATE refused (' || sqlerrm || ')'); end;

  begin insert into public.review_events (id, kind, surah, ayah_start, ayah_end, grade, context, cue_level, occurred_at) values (gen_random_uuid(), 'recall', 112, 1, 5, 'independent', 'free', 4, now());
    res := res || 'FAIL  accepted 112:5'; exception when others then res := res || 'PASS  rejects ayah beyond surah length (112:5)'; end;
  begin insert into public.review_events (id, kind, surah, ayah_start, ayah_end, grade, context, cue_level, occurred_at) values (gen_random_uuid(), 'recall', 115, 1, 1, 'independent', 'free', 4, now());
    res := res || 'FAIL  accepted surah 115'; exception when others then res := res || 'PASS  rejects surah 115'; end;
  begin insert into public.review_events (id, kind, surah, ayah_start, ayah_end, grade, context, cue_level, occurred_at) values (gen_random_uuid(), 'recall', 2, 1, 1, 'perfect', 'free', 4, now());
    res := res || 'FAIL  accepted unknown grade'; exception when others then res := res || 'PASS  rejects unknown grade'; end;
  begin insert into public.review_events (id, kind, surah, ayah_start, ayah_end, grade, context, cue_level, occurred_at) values (gen_random_uuid(), 'junction', 2, 1, 5, 'independent', 'free', 4, now());
    res := res || 'FAIL  accepted wide junction'; exception when others then res := res || 'PASS  rejects a transition spanning more than two ayahs'; end;
  begin insert into public.review_events (id, kind, surah, ayah_start, ayah_end, grade, context, cue_level, completed_to, occurred_at) values (gen_random_uuid(), 'recall', 2, 1, 3, 'independent', 'free', 4, 9, now());
    res := res || 'FAIL  accepted completed_to outside range'; exception when others then res := res || 'PASS  rejects completed_to outside the range'; end;
  begin insert into public.flow_events (id, surah, ayah, from_phrase, to_phrase, phrase_count, rating, occurred_at) values (gen_random_uuid(), 20, 1, 0, 3, 2, 'natural', now());
    res := res || 'FAIL  accepted bad phrase range'; exception when others then res := res || 'PASS  rejects phrase range beyond phrase count'; end;

  begin insert into public.review_events (id, user_id, kind, surah, ayah_start, ayah_end, grade, context, cue_level, occurred_at) values (gen_random_uuid(), u2, 'recall', 1, 1, 1, 'independent', 'free', 4, now());
    res := res || 'FAIL  A wrote a row owned by B'; exception when others then res := res || ('PASS  A cannot write a row owned by B (' || sqlerrm || ')'); end;

  begin
    insert into public.learning_targets (id, surah, ayah_start, ayah_end, status, label, updated_at) values ('22222222-2222-4222-8222-222222222222', 20, 1, 135, 'active', 'new', '2026-01-02');
    update public.learning_targets set label = 'stale', updated_at = '2026-01-01' where id = '22222222-2222-4222-8222-222222222222';
    select label into g from public.learning_targets;
    res := res || (case when g = 'new' then 'PASS  stale update to a mutable row is ignored' else 'FAIL  stale write applied: ' || g end);
    update public.learning_targets set label = 'newer', updated_at = '2026-01-03' where id = '22222222-2222-4222-8222-222222222222';
    select label into g from public.learning_targets;
    res := res || (case when g = 'newer' then 'PASS  newer update to a mutable row is applied' else 'FAIL  newer write not applied: ' || g end);
  exception when others then res := res || ('FAIL  mutable rows: ' || sqlerrm); end;

  begin
    insert into public.profiles (settings, updated_at) values ('{"minutes": 20}', now());
    res := res || 'PASS  A creates own profile row (user_id defaults to auth.uid())';
  exception when others then res := res || ('FAIL  profile insert: ' || sqlerrm); end;

  ---------------- user B ----------------
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  set local role authenticated;

  select (select count(*) from public.review_events) + (select count(*) from public.flow_events) + (select count(*) from public.declarations)
       + (select count(*) from public.study_sessions) + (select count(*) from public.learning_targets) + (select count(*) from public.phrase_markers)
       + (select count(*) from public.experiments) + (select count(*) from public.profiles) into n;
  res := res || (case when n = 0 then 'PASS  B sees none of A''s rows in any of the 8 tables' else 'FAIL  B can see ' || n || ' of A''s rows' end);

  update public.learning_targets set label = 'hijack', updated_at = '2030-01-01';
  get diagnostics n = row_count;
  res := res || (case when n = 0 then 'PASS  B''s UPDATE of A''s mutable rows affects 0 rows' else 'FAIL  B updated ' || n || ' of A''s rows' end);

  j := public.export_my_data();
  res := res || (case when jsonb_array_length(j->'review_events') = 0 and jsonb_array_length(j->'learning_targets') = 0 then 'PASS  B''s export contains none of A''s data' else 'FAIL  B''s export leaked data' end);

  begin
    insert into public.review_events (id, kind, surah, ayah_start, ayah_end, grade, context, cue_level, occurred_at) values ('33333333-3333-4333-8333-333333333333', 'recall', 20, 3, 3, 'independent', 'free', 4, now());
    perform public.erase_my_data();
    select count(*) into n from public.review_events;
    res := res || (case when n = 0 then 'PASS  B can erase B''s own data' else 'FAIL  erase_my_data left rows' end);
  exception when others then res := res || ('FAIL  B erase: ' || sqlerrm); end;

  ---------------- back to A: B's erase must not have touched A ----------------
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  j := public.export_my_data();
  res := res || (case when jsonb_array_length(j->'review_events') = 2 and jsonb_array_length(j->'learning_targets') = 1 and jsonb_array_length(j->'profiles') = 1
                 then 'PASS  A''s export returns exactly A''s 2 events, 1 target, 1 profile; B''s erase did not touch A' else 'FAIL  A export wrong: ' || j::text end);

  ---------------- signed out ----------------
  reset role;
  set local role anon;
  begin perform 1 from public.review_events; res := res || 'FAIL  anon could read events'; exception when others then res := res || ('PASS  signed-out visitor cannot read events (' || sqlerrm || ')'); end;
  begin insert into public.review_events (id, kind, surah, ayah_start, ayah_end, grade, context, cue_level, occurred_at) values (gen_random_uuid(), 'recall', 1, 1, 1, 'independent', 'free', 4, now());
    res := res || 'FAIL  anon could insert'; exception when others then res := res || 'PASS  signed-out visitor cannot write'; end;
  begin perform public.erase_my_data(); res := res || 'FAIL  anon could call erase_my_data'; exception when others then res := res || 'PASS  signed-out visitor cannot call erase_my_data'; end;
  begin perform public.export_my_data(); res := res || 'FAIL  anon could call export_my_data'; exception when others then res := res || 'PASS  signed-out visitor cannot call export_my_data'; end;

  reset role;
  -- Always roll back: nothing from this test is kept.
  raise exception E'RLS TEST RESULTS (rolled back, nothing persisted):\n%', array_to_string(res, E'\n');
end $$;
