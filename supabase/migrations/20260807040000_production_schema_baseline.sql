--
-- PostgreSQL database dump
--

-- Canonical schema baseline captured from production on 2026-08-06.
-- This file intentionally contains schema and grants only. User data, auth
-- rows, storage objects, cron entries, and vault secrets are not included.

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.10 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS public;

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: plan_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.plan_type AS ENUM (
    'free',
    'premium'
);


--
-- Name: subscription_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.subscription_status AS ENUM (
    'trial',
    'active',
    'canceled',
    'past_due',
    'incomplete',
    'incomplete_expired'
);


--
-- Name: applied_migrations(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.applied_migrations() RETURNS TABLE(version text, name text)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT version::text, name::text
  FROM supabase_migrations.schema_migrations
  ORDER BY version;
$$;


--
-- Name: assign_chat_message_refs(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.assign_chat_message_refs() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  max_turn INTEGER;
BEGIN
  IF NEW.turn_number IS NOT NULL THEN
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('chat_refs:' || NEW.session_id::text, 0));
  SELECT COALESCE(MAX(turn_number), 0)
    INTO max_turn
    FROM chat_messages
   WHERE session_id = NEW.session_id;
  IF NEW.role = 'user' THEN
    NEW.turn_number := max_turn + 1;
    NEW.reply_seq := 0;
  ELSE
    -- Assistant/system rows attach to the latest turn (turn 1 if the thread
    -- opens with an assistant message, e.g. a welcome).
    NEW.turn_number := GREATEST(max_turn, 1);
    SELECT COALESCE(MAX(reply_seq), 0) + 1
      INTO NEW.reply_seq
      FROM chat_messages
     WHERE session_id = NEW.session_id
       AND turn_number = NEW.turn_number
       AND role <> 'user';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: assign_thread_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.assign_thread_number() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Intentionally leave NEW.thread_number NULL for new drafts.
  -- Numbers are assigned by assign_thread_number_on_first_message below.
  RETURN NEW;
END;
$$;


--
-- Name: assign_thread_number_on_first_message(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.assign_thread_number_on_first_message() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  owner_id uuid;
BEGIN
  IF NEW.role IS DISTINCT FROM 'user' THEN
    RETURN NEW;
  END IF;

  -- Only claim a number once per session.
  SELECT user_id INTO owner_id
    FROM conversation_sessions
   WHERE id = NEW.session_id
     AND thread_number IS NULL
   FOR UPDATE;

  IF owner_id IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('thread_number:' || owner_id::text, 0));

  UPDATE conversation_sessions
     SET thread_number = (
           SELECT COALESCE(MAX(thread_number), 0) + 1
             FROM conversation_sessions
            WHERE user_id = owner_id
         )
   WHERE id = NEW.session_id
     AND thread_number IS NULL;

  RETURN NEW;
END;
$$;


--
-- Name: can_reverse_event(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_reverse_event(event_id_param uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    event_record RECORD;
BEGIN
    SELECT reversible, reversal_id INTO event_record
    FROM continuity_events
    WHERE id = event_id_param;

    IF NOT FOUND THEN
        RETURN false;
    END IF;

    RETURN event_record.reversible AND event_record.reversal_id IS NULL;
END;
$$;


--
-- Name: check_api_rate_limit(text, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_api_rate_limit(p_bucket_key text, p_max integer, p_window_ms integer) RETURNS TABLE(allowed boolean, retry_after_sec integer)
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_now timestamptz := now();
  v_window interval := (p_window_ms || ' milliseconds')::interval;
  v_expires timestamptz := v_now + v_window;
  v_count integer;
  v_reset timestamptz;
BEGIN
  DELETE FROM api_rate_limit_buckets WHERE expires_at < v_now;

  -- Peek existing active bucket. If already at/over max, deny without bumping.
  SELECT count, expires_at
    INTO v_count, v_reset
    FROM api_rate_limit_buckets
   WHERE bucket_key = p_bucket_key
     AND expires_at >= v_now;

  IF FOUND AND v_count >= p_max THEN
    allowed := false;
    retry_after_sec := GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_reset - v_now)))::integer);
    RETURN NEXT;
    RETURN;
  END IF;

  INSERT INTO api_rate_limit_buckets (bucket_key, window_start, count, expires_at)
  VALUES (p_bucket_key, v_now, 1, v_expires)
  ON CONFLICT (bucket_key) DO UPDATE
    SET
      count = CASE
        WHEN api_rate_limit_buckets.expires_at < v_now THEN 1
        ELSE api_rate_limit_buckets.count + 1
      END,
      window_start = CASE
        WHEN api_rate_limit_buckets.expires_at < v_now THEN v_now
        ELSE api_rate_limit_buckets.window_start
      END,
      expires_at = CASE
        WHEN api_rate_limit_buckets.expires_at < v_now THEN v_expires
        ELSE api_rate_limit_buckets.expires_at
      END
  RETURNING count, expires_at INTO v_count, v_reset;

  IF v_count > p_max THEN
    allowed := false;
    retry_after_sec := GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_reset - v_now)))::integer);
    RETURN NEXT;
    RETURN;
  END IF;

  allowed := true;
  retry_after_sec := 0;
  RETURN NEXT;
END;
$$;


--
-- Name: FUNCTION check_api_rate_limit(p_bucket_key text, p_max integer, p_window_ms integer); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.check_api_rate_limit(p_bucket_key text, p_max integer, p_window_ms integer) IS 'Atomic API rate limit bucket — deny without incrementing when already at max';


--
-- Name: compute_chronology_buckets(timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.compute_chronology_buckets(p_start_time timestamp with time zone, p_end_time timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS TABLE(year_bucket integer, month_bucket date, decade_bucket integer)
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY SELECT EXTRACT(YEAR FROM p_start_time)::INTEGER,
    DATE_TRUNC('month', p_start_time)::DATE,
    (EXTRACT(YEAR FROM p_start_time) / 10)::INTEGER * 10;
END; $$;


--
-- Name: detect_temporal_contradiction(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.detect_temporal_contradiction(claim1_id uuid, claim2_id uuid) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
DECLARE
  claim1 RECORD;
  claim2 RECORD;
BEGIN
  SELECT * INTO claim1 FROM omega_claims WHERE id = claim1_id;
  SELECT * INTO claim2 FROM omega_claims WHERE id = claim2_id;
  IF NOT temporal_overlap(
    claim1.start_time,
    claim1.end_time,
    claim2.start_time,
    claim2.end_time
  ) THEN
    RETURN false;
  END IF;
  RETURN true;
END;
$$;


--
-- Name: get_database_storage_stats(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_database_storage_stats() RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  cron_rows bigint := NULL;
  pg_ver text := current_setting('server_version');
  pg_major int;
  deprecated text[] := ARRAY[]::text[];
  enabled jsonb := '[]'::jsonb;
BEGIN
  pg_major := (regexp_match(pg_ver, '^(\d+)'))[1]::int;

  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    BEGIN
      SELECT count(*)::bigint INTO cron_rows FROM cron.job_run_details;
    EXCEPTION WHEN OTHERS THEN
      cron_rows := NULL;
    END;
  END IF;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'name', e.extname,
        'schema', n.nspname,
        'version', e.extversion
      )
      ORDER BY e.extname
    ),
    '[]'::jsonb
  )
  INTO enabled
  FROM pg_extension e
  JOIN pg_namespace n ON n.oid = e.extnamespace
  WHERE e.extname <> 'plpgsql';

  SELECT coalesce(array_agg(e.extname ORDER BY e.extname), ARRAY[]::text[])
  INTO deprecated
  FROM pg_extension e
  WHERE e.extname = ANY(ARRAY['pgjwt', 'timescaledb', 'plv8', 'plls', 'plcoffee']);

  RETURN jsonb_build_object(
    'database_bytes', pg_database_size(current_database()),
    'wal_bytes', COALESCE((SELECT sum(size) FROM pg_ls_waldir()), 0::bigint),
    'postgres_version', pg_ver,
    'postgres_major', pg_major,
    'cron_job_run_details_rows', cron_rows,
    'deprecated_extensions', to_jsonb(deprecated),
    'enabled_extensions', enabled
  );
END;
$$;


--
-- Name: get_event_explanation(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_event_explanation(event_id_param uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    event_record RECORD;
    result JSONB;
BEGIN
    SELECT * INTO event_record
    FROM continuity_events
    WHERE id = event_id_param;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    result := jsonb_build_object(
        'id', event_record.id,
        'timestamp', event_record.timestamp,
        'type', event_record.type,
        'explanation', event_record.explanation,
        'context', event_record.context,
        'reversible', event_record.reversible,
        'severity', event_record.severity,
        'initiated_by', event_record.initiated_by,
        'related_claim_ids', event_record.related_claim_ids,
        'related_entity_ids', event_record.related_entity_ids,
        'related_location_ids', event_record.related_location_ids
    );

    RETURN result;
END;
$$;


--
-- Name: get_pending_mrq(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_pending_mrq(user_id_param uuid) RETURNS TABLE(id uuid, entity_id uuid, claim_text text, perspective_id uuid, confidence double precision, risk_level text, created_at timestamp with time zone, reasoning text, source_excerpt text)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        mp.id,
        mp.entity_id,
        mp.claim_text,
        mp.perspective_id,
        mp.confidence,
        mp.risk_level,
        mp.created_at,
        mp.reasoning,
        mp.source_excerpt
    FROM memory_proposals mp
    WHERE mp.user_id = user_id_param
      AND mp.status = 'PENDING'
    ORDER BY
        CASE mp.risk_level
            WHEN 'HIGH' THEN 1
            WHEN 'MEDIUM' THEN 2
            WHEN 'LOW' THEN 3
        END,
        mp.created_at ASC;
END;
$$;


--
-- Name: has_accepted_latest_terms(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_accepted_latest_terms(p_user_id uuid, p_version text DEFAULT '1.0'::text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
begin
  return exists (
    select 1 from public.terms_acceptance
    where user_id = p_user_id
    and version = p_version
  );
end;
$$;


--
-- Name: identity_mutations_block_mutate(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.identity_mutations_block_mutate() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  raise exception 'identity_mutations is append-only; % is not permitted', tg_op;
end;
$$;


--
-- Name: initialize_free_subscription(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.initialize_free_subscription() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
begin
  insert into public.subscriptions (user_id, status, plan_type)
  values (new.id, 'active', 'free')
  on conflict (user_id) do nothing;
  return new;
end;
$$;


--
-- Name: match_journal_entries(uuid, public.vector, double precision, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.match_journal_entries(user_uuid uuid, query_embedding public.vector, match_threshold double precision DEFAULT 0.4, match_count integer DEFAULT 20) RETURNS TABLE(id uuid, user_id uuid, content text, date timestamp with time zone, tags text[], similarity double precision)
    LANGUAGE plpgsql
    AS $$
begin
  return query
  select
    journal_entries.id,
    journal_entries.user_id,
    journal_entries.content,
    journal_entries.date,
    journal_entries.tags,
    1 - (journal_entries.embedding <=> query_embedding) as similarity
  from journal_entries
  where journal_entries.user_id = user_uuid
    and journal_entries.embedding is not null
    and 1 - (journal_entries.embedding <=> query_embedding) > match_threshold
  order by journal_entries.embedding <=> query_embedding
  limit match_count;
end;
$$;


--
-- Name: match_omega_claims(public.vector, uuid, double precision, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.match_omega_claims(query_embedding public.vector, user_id_param uuid, match_threshold double precision DEFAULT 0.78, match_count integer DEFAULT 3) RETURNS TABLE(id uuid, entity_id uuid, text text, confidence double precision, similarity double precision)
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.entity_id,
    c.text,
    c.confidence,
    1 - (c.embedding <=> query_embedding) as similarity
  FROM omega_claims c
  WHERE c.user_id = user_id_param
    AND c.is_active = true
    AND c.embedding IS NOT NULL
    AND 1 - (c.embedding <=> query_embedding) > match_threshold
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;


--
-- Name: memory_events_block_mutate(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.memory_events_block_mutate() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  raise exception 'memory_events is append-only; % is not permitted', tg_op;
end;
$$;


--
-- Name: normalize_character_registry_key(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.normalize_character_registry_key(value text) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
  select btrim(
    regexp_replace(
      lower(
        translate(
          coalesce(value, ''),
          'ÀÁÂÃÄÅĀĂĄÇĆĈĊČÐĎÈÉÊËĒĔĖĘĚÌÍÎÏĨĪĬĮİÑŃŇÒÓÔÕÖØŌŎŐÙÚÛÜŨŪŬŮŰŲÝŸŶÞŠŚŜŞȘŽŹŻàáâãäåāăąçćĉċčðďèéêëēĕėęěìíîïĩīĭįıñńňòóôõöøōŏőùúûüũūŭůűųýÿŷþšśŝşșžźż',
          'AAAAAAAAACCCCCDDEEEEEEEEEIIIIIIIIINNNOOOOOOOOOUUUUUUUUUUYYYBSSSSSZZZaaaaaaaaacccccddeeeeeeeeeiiiiiiiiinnnooooooooouuuuuuuuuuyyybssssszzz'
        )
      ),
      '\s+',
      ' ',
      'g'
    )
  );
$$;


--
-- Name: preserve_perception_original_content(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.preserve_perception_original_content() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF OLD.original_content IS NULL AND NEW.content IS DISTINCT FROM OLD.content THEN
    NEW.original_content = OLD.content;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: record_openai_cost_daily(date, text, text, integer, bigint, bigint, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_openai_cost_daily(p_day date, p_operation text, p_model text, p_calls integer, p_input_tokens bigint, p_output_tokens bigint, p_usd numeric) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  INSERT INTO public.openai_cost_daily AS c
    (day, operation, model, calls, input_tokens, output_tokens, estimated_usd, updated_at)
  VALUES
    (p_day, COALESCE(p_operation, 'unknown'), COALESCE(p_model, 'unknown'),
     p_calls, p_input_tokens, p_output_tokens, p_usd, now())
  ON CONFLICT (day, operation, model) DO UPDATE SET
    calls         = c.calls         + EXCLUDED.calls,
    input_tokens  = c.input_tokens  + EXCLUDED.input_tokens,
    output_tokens = c.output_tokens + EXCLUDED.output_tokens,
    estimated_usd = c.estimated_usd + EXCLUDED.estimated_usd,
    updated_at    = now();
END;
$$;


--
-- Name: rls_auto_enable(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rls_auto_enable() RETURNS event_trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


--
-- Name: set_event_candidates_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_event_candidates_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: set_life_arcs_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_life_arcs_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: sync_character_identity_index(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_character_identity_index() RETURNS trigger
    LANGUAGE plpgsql
    AS $_$
declare
  alias_value text;
  mention_count integer;
begin
  mention_count := case
    when coalesce(new.metadata->>'mention_count', '') ~ '^\d+$'
      then (new.metadata->>'mention_count')::integer
    else 1
  end;

  delete from public.character_identity_index
  where character_id = new.id
    and user_id = new.user_id
    and source in ('primary_name', 'alias');

  insert into public.character_identity_index (
    user_id,
    character_id,
    mention,
    mention_key,
    source,
    confidence,
    evidence_count,
    updated_at
  )
  values (
    new.user_id,
    new.id,
    new.name,
    public.normalize_character_registry_key(new.name),
    'primary_name',
    1.0,
    mention_count,
    now()
  )
  on conflict (user_id, character_id, mention_key)
  do update set
    mention = excluded.mention,
    source = excluded.source,
    confidence = greatest(public.character_identity_index.confidence, excluded.confidence),
    evidence_count = greatest(public.character_identity_index.evidence_count, excluded.evidence_count),
    updated_at = now();

  foreach alias_value in array coalesce(new.alias, '{}'::text[])
  loop
    if nullif(btrim(alias_value), '') is not null
      and public.normalize_character_registry_key(alias_value) <> public.normalize_character_registry_key(new.name)
    then
      insert into public.character_identity_index (
        user_id,
        character_id,
        mention,
        mention_key,
        source,
        confidence,
        evidence_count,
        updated_at
      )
      values (
        new.user_id,
        new.id,
        btrim(alias_value),
        public.normalize_character_registry_key(alias_value),
        'alias',
        0.95,
        mention_count,
        now()
      )
      on conflict (user_id, character_id, mention_key)
      do update set
        mention = excluded.mention,
        confidence = greatest(public.character_identity_index.confidence, excluded.confidence),
        evidence_count = greatest(public.character_identity_index.evidence_count, excluded.evidence_count),
        updated_at = now();
    end if;
  end loop;

  return new;
end;
$_$;


--
-- Name: sync_chronology_index(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_chronology_index() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE v_buckets RECORD;
BEGIN
  SELECT * INTO v_buckets FROM compute_chronology_buckets(COALESCE(NEW.date, NOW()), COALESCE(NEW.end_time, NULL));
  INSERT INTO public.chronology_index (user_id, journal_entry_id, start_time, end_time, time_precision, year_bucket, month_bucket, decade_bucket)
  VALUES (NEW.user_id, NEW.id, COALESCE(NEW.date, NOW()), NEW.end_time, COALESCE(NEW.time_precision, 'exact'),
    v_buckets.year_bucket, v_buckets.month_bucket, v_buckets.decade_bucket)
  ON CONFLICT (user_id, journal_entry_id) DO UPDATE SET
    start_time = EXCLUDED.start_time, end_time = EXCLUDED.end_time, time_precision = EXCLUDED.time_precision,
    year_bucket = EXCLUDED.year_bucket, month_bucket = EXCLUDED.month_bucket, decade_bucket = EXCLUDED.decade_bucket;
  RETURN NEW;
END; $$;


--
-- Name: sync_omega_entity_type(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_omega_entity_type() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  NEW.entity_type := NEW.type;
  RETURN NEW;
END;
$$;


--
-- Name: sync_perception_retraction_status(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_perception_retraction_status() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.retracted = TRUE AND NEW.status != 'retracted' THEN
    NEW.status = 'retracted';
    NEW.retracted_at = COALESCE(NEW.retracted_at, NOW());
  END IF;
  IF NEW.status = 'retracted' AND NEW.retracted = FALSE THEN
    NEW.retracted = TRUE;
    NEW.retracted_at = COALESCE(NEW.retracted_at, NOW());
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: temporal_overlap(timestamp with time zone, timestamp with time zone, timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.temporal_overlap(start1 timestamp with time zone, end1 timestamp with time zone, start2 timestamp with time zone, end2 timestamp with time zone) RETURNS boolean
    LANGUAGE plpgsql IMMUTABLE
    AS $$
BEGIN
  IF end1 IS NULL THEN
    RETURN start2 <= start1 OR (end2 IS NOT NULL AND end2 >= start1);
  END IF;
  IF end2 IS NULL THEN
    RETURN start1 <= start2 OR (end1 IS NOT NULL AND end1 >= start2);
  END IF;
  RETURN (start1 <= end2 AND end1 >= start2);
END;
$$;


--
-- Name: update_character_perception_stats(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_character_perception_stats() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  target_id UUID;
BEGIN
  target_id := COALESCE(NEW.subject_person_id, OLD.subject_person_id);
  IF target_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  UPDATE public.characters
  SET
    perception_count = (
      SELECT COUNT(*) FROM public.perception_entries
      WHERE subject_person_id = target_id
        AND user_id = COALESCE(NEW.user_id, OLD.user_id)
        AND retracted = FALSE
        AND status != 'retracted'
    ),
    first_perception_at = (
      SELECT MIN(timestamp_heard) FROM public.perception_entries
      WHERE subject_person_id = target_id
        AND user_id = COALESCE(NEW.user_id, OLD.user_id)
    ),
    last_perception_at = (
      SELECT MAX(timestamp_heard) FROM public.perception_entries
      WHERE subject_person_id = target_id
        AND user_id = COALESCE(NEW.user_id, OLD.user_id)
        AND retracted = FALSE
        AND status != 'retracted'
    )
  WHERE id = target_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;


--
-- Name: update_chat_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_chat_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


--
-- Name: update_interests_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_interests_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_omega_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_omega_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


--
-- Name: update_organizations_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_organizations_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: update_perception_entries_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_perception_entries_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_timeline_events_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_timeline_events_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_timelines_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_timelines_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: achievement_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.achievement_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    achievement_name text NOT NULL,
    achievement_type text NOT NULL,
    description text NOT NULL,
    icon_name text,
    criteria_type text NOT NULL,
    criteria_config jsonb DEFAULT '{}'::jsonb NOT NULL,
    xp_reward integer DEFAULT 0,
    rarity text DEFAULT 'common'::text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: achievements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.achievements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    achievement_name text NOT NULL,
    achievement_type text NOT NULL,
    description text,
    icon_name text,
    criteria_met jsonb DEFAULT '{}'::jsonb NOT NULL,
    unlocked_at timestamp with time zone NOT NULL,
    xp_reward integer DEFAULT 0,
    skill_xp_rewards jsonb DEFAULT '{}'::jsonb,
    rarity text DEFAULT 'common'::text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT achievements_achievement_type_check CHECK ((achievement_type = ANY (ARRAY['milestone'::text, 'streak'::text, 'skill_level'::text, 'xp_milestone'::text, 'consistency'::text, 'exploration'::text, 'reflection'::text, 'growth'::text, 'other'::text]))),
    CONSTRAINT achievements_rarity_check CHECK ((rarity = ANY (ARRAY['common'::text, 'uncommon'::text, 'rare'::text, 'epic'::text, 'legendary'::text]))),
    CONSTRAINT achievements_xp_reward_check CHECK ((xp_reward >= 0))
);


--
-- Name: api_rate_limit_buckets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.api_rate_limit_buckets (
    bucket_key text NOT NULL,
    window_start timestamp with time zone DEFAULT now() NOT NULL,
    count integer DEFAULT 0 NOT NULL,
    expires_at timestamp with time zone NOT NULL
);


--
-- Name: arc_event_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.arc_event_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    arc_id uuid NOT NULL,
    resolved_event_id uuid,
    journal_entry_id uuid,
    user_presence text DEFAULT 'unknown'::text NOT NULL,
    temporal_role text DEFAULT 'during'::text NOT NULL,
    sort_time timestamp with time zone,
    importance_score double precision DEFAULT 0.5 NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT arc_event_links_has_target CHECK (((resolved_event_id IS NOT NULL) OR (journal_entry_id IS NOT NULL))),
    CONSTRAINT arc_event_links_temporal_role_check CHECK ((temporal_role = ANY (ARRAY['before'::text, 'during'::text, 'after'::text, 'throughout'::text]))),
    CONSTRAINT arc_event_links_user_presence_check CHECK ((user_presence = ANY (ARRAY['attended'::text, 'heard_about'::text, 'unknown'::text])))
);


--
-- Name: TABLE arc_event_links; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.arc_event_links IS 'Links occasion life_arcs to resolved_events and journal_entries with attendance + temporal role';


--
-- Name: arc_memberships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.arc_memberships (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    arc_id uuid NOT NULL,
    event_candidate_id uuid NOT NULL,
    importance_score double precision DEFAULT 0.5 NOT NULL,
    role text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT arc_memberships_role_check CHECK ((role = ANY (ARRAY['defining_moment'::text, 'turning_point'::text, 'background'::text, 'transition'::text])))
);


--
-- Name: arc_relationships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.arc_relationships (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    source_arc_id uuid NOT NULL,
    target_arc_id uuid NOT NULL,
    relationship_type text NOT NULL,
    description text,
    confidence double precision DEFAULT 0.6 NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT arc_relationships_no_self CHECK ((source_arc_id <> target_arc_id)),
    CONSTRAINT arc_relationships_relationship_type_check CHECK ((relationship_type = ANY (ARRAY['spawned'::text, 'influenced'::text, 'overlapped'::text, 'preceded'::text, 'merged'::text, 'split'::text])))
);


--
-- Name: assertion_evidence; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assertion_evidence (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    target_kind text NOT NULL,
    target_id uuid NOT NULL,
    evidence_kind text NOT NULL,
    evidence_id uuid NOT NULL,
    weight double precision DEFAULT 0.7 NOT NULL,
    excerpt text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT assertion_evidence_target_kind_check CHECK ((target_kind = ANY (ARRAY['node'::text, 'edge'::text, 'narrative_claim'::text])))
);


--
-- Name: association_edges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.association_edges (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    source_entity_id text NOT NULL,
    target_entity_id text NOT NULL,
    source_name text NOT NULL,
    target_name text NOT NULL,
    target_kind text DEFAULT 'unknown'::text NOT NULL,
    association_type text NOT NULL,
    confidence numeric DEFAULT 0.2 NOT NULL,
    mention_count integer DEFAULT 1 NOT NULL,
    first_seen timestamp with time zone DEFAULT now() NOT NULL,
    last_seen timestamp with time zone DEFAULT now() NOT NULL,
    supporting_evidence jsonb DEFAULT '[]'::jsonb NOT NULL,
    promoted_from text,
    promoted_to text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT association_edges_confidence_check CHECK (((confidence >= (0)::numeric) AND (confidence <= (1)::numeric)))
);


--
-- Name: autobiographical_meaning_artifacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.autobiographical_meaning_artifacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    source_message_id uuid,
    source_event_id uuid,
    meaning_type text NOT NULL,
    subject_entity_id uuid,
    object_entity_id uuid,
    normalized_value text NOT NULL,
    display_label text NOT NULL,
    confidence real DEFAULT 0.5 NOT NULL,
    evidence_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    evidence_quotes text[] DEFAULT '{}'::text[] NOT NULL,
    extractor_version text DEFAULT 'memory-quality-v1'::text NOT NULL,
    source_fingerprint text NOT NULL,
    epistemic_type text DEFAULT 'deterministic_inference'::text NOT NULL,
    status text DEFAULT 'ACTIVE'::text NOT NULL,
    supersedes_id uuid,
    linked_from_type text,
    linked_from_value text,
    linked_to_type text,
    linked_to_value text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    CONSTRAINT autobiographical_meaning_artifacts_confidence_check CHECK (((confidence >= (0)::double precision) AND (confidence <= (1)::double precision)))
);


--
-- Name: TABLE autobiographical_meaning_artifacts; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.autobiographical_meaning_artifacts IS 'Durable Memory Quality meaning layer. Metadata on chat_messages/resolved_events is a projection only.';


--
-- Name: chapters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chapters (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    title text NOT NULL,
    start_date timestamp with time zone NOT NULL,
    end_date timestamp with time zone,
    description text,
    summary text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    parent_id uuid
);


--
-- Name: character_authority_map; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.character_authority_map (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    canonical_character_id uuid NOT NULL,
    source_table text NOT NULL,
    source_id uuid NOT NULL,
    alias_name text,
    match_method text DEFAULT 'exact'::text NOT NULL,
    confidence numeric DEFAULT 1.0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT character_authority_map_confidence_check CHECK (((confidence >= (0)::numeric) AND (confidence <= (1)::numeric))),
    CONSTRAINT character_authority_map_source_table_check CHECK ((source_table = ANY (ARRAY['people_places'::text, 'omega_entities'::text, 'characters'::text])))
);


--
-- Name: character_identity_index; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.character_identity_index (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    character_id uuid NOT NULL,
    mention text NOT NULL,
    mention_key text NOT NULL,
    source text DEFAULT 'alias'::text NOT NULL,
    confidence numeric DEFAULT 1.0 NOT NULL,
    evidence_count integer DEFAULT 1 NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT character_identity_index_confidence_check CHECK (((confidence >= (0)::numeric) AND (confidence <= (1)::numeric))),
    CONSTRAINT character_identity_index_evidence_count_check CHECK ((evidence_count >= 0)),
    CONSTRAINT character_identity_index_source_check CHECK ((source = ANY (ARRAY['primary_name'::text, 'alias'::text, 'nickname'::text, 'mention'::text, 'manual'::text, 'imported'::text])))
);


--
-- Name: TABLE character_identity_index; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.character_identity_index IS 'Per-user lookup index for every known character name, alias, nickname, and mention. characters.id remains the canonical stable person id.';


--
-- Name: COLUMN character_identity_index.mention_key; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.character_identity_index.mention_key IS 'Normalized lookup key matching app-side normalizeNameKey.';


--
-- Name: character_media; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.character_media (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    character_id uuid NOT NULL,
    kind text NOT NULL,
    url text,
    storage_path text,
    text text,
    caption text,
    source text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT character_media_kind_check CHECK ((kind = ANY (ARRAY['photo'::text, 'message'::text])))
);


--
-- Name: TABLE character_media; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.character_media IS 'Per-character photos and message/DM screenshots (with extracted text) for the Characters Book Photos/Messages tabs.';


--
-- Name: character_memories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.character_memories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    character_id uuid,
    journal_entry_id uuid,
    chapter_id uuid,
    role text,
    emotion text,
    perspective text,
    summary text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: character_relationships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.character_relationships (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    source_character_id uuid,
    target_character_id uuid,
    relationship_type text NOT NULL,
    closeness_score smallint,
    status text DEFAULT 'active'::text,
    summary text,
    last_shared_memory_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    relationship_category text,
    relationship_role text,
    inverse_role text,
    strength smallint,
    trust smallint,
    frequency text,
    sentiment text,
    inference_status text DEFAULT 'asserted'::text NOT NULL,
    evidence jsonb DEFAULT '[]'::jsonb NOT NULL,
    timeline jsonb DEFAULT '[]'::jsonb NOT NULL,
    CONSTRAINT character_relationships_closeness_score_check CHECK (((closeness_score >= '-10'::integer) AND (closeness_score <= 10))),
    CONSTRAINT character_relationships_strength_check CHECK (((strength >= 0) AND (strength <= 100))),
    CONSTRAINT character_relationships_trust_check CHECK (((trust >= 0) AND (trust <= 100)))
);


--
-- Name: character_timeline_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.character_timeline_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    character_id uuid NOT NULL,
    event_id uuid NOT NULL,
    timeline_type text NOT NULL,
    user_was_present boolean NOT NULL,
    character_role text,
    relationship_context text,
    event_title text,
    event_date timestamp with time zone,
    event_summary text,
    event_type text,
    impact_type text,
    connection_character_id uuid,
    emotional_impact text,
    source_entry_ids uuid[],
    source_message_ids uuid[],
    confidence double precision DEFAULT 0.7,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT character_timeline_events_character_role_check CHECK ((character_role = ANY (ARRAY['participant'::text, 'subject'::text, 'mentioned'::text, 'affected'::text, 'organizer'::text, 'observer'::text]))),
    CONSTRAINT character_timeline_events_confidence_check CHECK (((confidence >= (0)::double precision) AND (confidence <= (1)::double precision))),
    CONSTRAINT character_timeline_events_emotional_impact_check CHECK ((emotional_impact = ANY (ARRAY['positive'::text, 'negative'::text, 'neutral'::text, 'mixed'::text]))),
    CONSTRAINT character_timeline_events_timeline_type_check CHECK ((timeline_type = ANY (ARRAY['shared_experience'::text, 'lore'::text, 'mentioned_in'::text])))
);


--
-- Name: characters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.characters (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    alias text[],
    pronouns text,
    archetype text,
    role text,
    status text DEFAULT 'active'::text,
    first_appearance date,
    summary text,
    tags text[] DEFAULT '{}'::text[],
    embedding public.vector(1536),
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    embedding_model text DEFAULT 'text-embedding-3-small'::text,
    embedding_version integer DEFAULT 1,
    last_embedded_at timestamp with time zone,
    perception_count integer DEFAULT 0 NOT NULL,
    first_perception_at timestamp with time zone,
    last_perception_at timestamp with time zone,
    sensitivity_level text DEFAULT 'public'::text NOT NULL,
    requires_extra_confirmation boolean DEFAULT false NOT NULL,
    first_name text,
    last_name text,
    is_nickname boolean DEFAULT false NOT NULL,
    avatar_url text,
    importance_level text DEFAULT 'minor'::text NOT NULL,
    importance_score integer DEFAULT 0 NOT NULL,
    proximity_level text,
    has_met boolean,
    relationship_depth text,
    associated_with_character_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    mentioned_by_character_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    context_of_mention text,
    likelihood_to_meet text,
    canonical_name text GENERATED ALWAYS AS (btrim(regexp_replace(lower(translate(name, 'ÀÁÂÃÄÅĀĂĄÇĆĈĊČÐĎÈÉÊËĒĔĖĘĚÌÍÎÏĨĪĬĮİÑŃŇÒÓÔÕÖØŌŎŐÙÚÛÜŨŪŬŮŰŲÝŸŶÞŠŚŜŞȘŽŹŻàáâãäåāăąçćĉċčðďèéêëēĕėęěìíîïĩīĭįıñńňòóôõöøōŏőùúûüũūŭůűųýÿŷþšśŝşșžźż'::text, 'AAAAAAAAACCCCCDDEEEEEEEEEIIIIIIIIINNNOOOOOOOOOUUUUUUUUUUYYYBSSSSSZZZaaaaaaaaacccccddeeeeeeeeeiiiiiiiiinnnooooooooouuuuuuuuuuyyybssssszzz'::text)), '\s+'::text, ' '::text, 'g'::text))) STORED,
    identity_strength_score real,
    identity_strength jsonb,
    species text,
    CONSTRAINT characters_sensitivity_level_check CHECK ((sensitivity_level = ANY (ARRAY['public'::text, 'private'::text, 'sensitive'::text])))
);


--
-- Name: COLUMN characters.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.characters.status IS 'Lifecycle: active, inactive, unmet, archived (hidden from book), pending_deletion (queued for permanent delete review)';


--
-- Name: COLUMN characters.identity_strength_score; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.characters.identity_strength_score IS 'Identity Strength Engine score (0..100): a richer identity-health signal, separate from confidence. See identity_strength for the breakdown.';


--
-- Name: chat_contexts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_contexts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    session_id uuid NOT NULL,
    active_entity_ids uuid[] DEFAULT '{}'::uuid[],
    active_perspective_ids uuid[] DEFAULT '{}'::uuid[],
    unresolved_mrq_ids uuid[] DEFAULT '{}'::uuid[],
    recent_insight_ids uuid[] DEFAULT '{}'::uuid[],
    user_intent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    CONSTRAINT chat_contexts_user_intent_check CHECK ((user_intent = ANY (ARRAY['REFLECTION'::text, 'QUESTION'::text, 'CLARIFICATION'::text, 'DECISION_SUPPORT'::text, 'MEMORY_REVIEW'::text])))
);


--
-- Name: chat_message_revisions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_message_revisions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    message_id uuid NOT NULL,
    user_id uuid NOT NULL,
    revision integer NOT NULL,
    content text NOT NULL,
    reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: chat_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    session_id uuid NOT NULL,
    role text NOT NULL,
    content text NOT NULL,
    response_mode text,
    citations uuid[] DEFAULT '{}'::uuid[],
    confidence double precision,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    revision integer DEFAULT 1 NOT NULL,
    edited_at timestamp with time zone,
    original_content text,
    turn_number integer,
    reply_seq integer,
    client_idempotency_key text,
    CONSTRAINT chat_messages_confidence_check CHECK (((confidence >= (0.0)::double precision) AND (confidence <= (1.0)::double precision))),
    CONSTRAINT chat_messages_response_mode_check CHECK ((response_mode = ANY (ARRAY['FACTUAL_SUMMARY'::text, 'PERSPECTIVE_SUMMARY'::text, 'INSIGHT_REFLECTION'::text, 'UNCERTAINTY_NOTICE'::text, 'MRQ_PROMPT'::text]))),
    CONSTRAINT chat_messages_role_check CHECK ((role = ANY (ARRAY['user'::text, 'assistant'::text, 'system'::text])))
);


--
-- Name: COLUMN chat_messages.client_idempotency_key; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.chat_messages.client_idempotency_key IS 'Client-generated send attempt key; scoped unique per user to prevent duplicate user rows on retry.';


--
-- Name: chat_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    session_id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb
);


--
-- Name: chronology_index; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chronology_index (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    journal_entry_id uuid NOT NULL,
    start_time timestamp with time zone NOT NULL,
    end_time timestamp with time zone,
    time_precision text NOT NULL,
    year_bucket integer NOT NULL,
    month_bucket date,
    decade_bucket integer,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT chronology_index_time_precision_check CHECK ((time_precision = ANY (ARRAY['exact'::text, 'day'::text, 'month'::text, 'year'::text, 'approximate'::text])))
);


--
-- Name: chronology_order_corrections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chronology_order_corrections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    scope_type text NOT NULL,
    scope_id uuid DEFAULT '00000000-0000-0000-0000-000000000000'::uuid NOT NULL,
    item_kind text NOT NULL,
    item_id uuid NOT NULL,
    previous_sort_time timestamp with time zone,
    new_sort_index integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE chronology_order_corrections; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.chronology_order_corrections IS 'Log of user chronology corrections for training';


--
-- Name: chronology_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chronology_snapshots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    node_count integer DEFAULT 0 NOT NULL,
    edge_count integer DEFAULT 0 NOT NULL,
    gap_count integer DEFAULT 0 NOT NULL,
    chain_count integer DEFAULT 0 NOT NULL,
    pattern_count integer DEFAULT 0 NOT NULL,
    gaps jsonb DEFAULT '[]'::jsonb NOT NULL,
    causal_chains jsonb DEFAULT '[]'::jsonb NOT NULL,
    patterns jsonb DEFAULT '[]'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: classifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.classifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    root_type text NOT NULL,
    label text NOT NULL,
    parent_id uuid,
    status text DEFAULT 'proposed'::text NOT NULL,
    confidence real DEFAULT 0 NOT NULL,
    usage_count integer DEFAULT 0 NOT NULL,
    created_by text DEFAULT 'system'::text NOT NULL,
    canonical_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT classifications_confidence_check CHECK (((confidence >= (0)::double precision) AND (confidence <= (1)::double precision))),
    CONSTRAINT classifications_created_by_check CHECK ((created_by = ANY (ARRAY['system'::text, 'user'::text, 'llm'::text]))),
    CONSTRAINT classifications_status_check CHECK ((status = ANY (ARRAY['proposed'::text, 'active'::text, 'deprecated'::text])))
);


--
-- Name: TABLE classifications; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.classifications IS 'Dynamic classification vocabulary — subcategories and swimlanes keyed by stable root_type.';


--
-- Name: continuity_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.continuity_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    type text NOT NULL,
    "timestamp" timestamp with time zone DEFAULT now() NOT NULL,
    context jsonb DEFAULT '{}'::jsonb NOT NULL,
    explanation text NOT NULL,
    related_claim_ids uuid[] DEFAULT '{}'::uuid[],
    related_entity_ids uuid[] DEFAULT '{}'::uuid[],
    related_location_ids uuid[] DEFAULT '{}'::uuid[],
    initiated_by text NOT NULL,
    severity text NOT NULL,
    reversible boolean DEFAULT false NOT NULL,
    reversal_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    CONSTRAINT continuity_events_initiated_by_check CHECK ((initiated_by = ANY (ARRAY['SYSTEM'::text, 'USER'::text, 'AI'::text]))),
    CONSTRAINT continuity_events_severity_check CHECK ((severity = ANY (ARRAY['INFO'::text, 'WARNING'::text, 'ALERT'::text]))),
    CONSTRAINT continuity_events_type_check CHECK ((type = ANY (ARRAY['CLAIM_CREATED'::text, 'CLAIM_UPDATED'::text, 'CLAIM_ENDED'::text, 'CLAIM_REJECTED'::text, 'ENTITY_RESOLVED'::text, 'ENTITY_MERGED'::text, 'CONTRADICTION_FOUND'::text, 'CONTINUITY_ALERT'::text, 'TIMELINE_SEGMENTED'::text, 'NARRATIVE_TRANSITION'::text, 'DECISION_RECORDED'::text, 'DECISION_OUTCOME_RECORDED'::text, 'RESOURCE_DELETED'::text])))
);


--
-- Name: continuity_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.continuity_snapshots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    window_days integer DEFAULT 30 NOT NULL,
    contradictions integer DEFAULT 0 NOT NULL,
    abandoned_goals integer DEFAULT 0 NOT NULL,
    arc_shifts integer DEFAULT 0 NOT NULL,
    identity_drifts integer DEFAULT 0 NOT NULL,
    emotional_transitions integer DEFAULT 0 NOT NULL,
    thematic_drifts integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: contradiction_signals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contradiction_signals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    type text NOT NULL,
    category_key text NOT NULL,
    label text NOT NULL,
    section text NOT NULL,
    stated_signal_id uuid,
    revealed_signal_id uuid,
    conflict_with_key text,
    stated_count integer DEFAULT 0 NOT NULL,
    revealed_count integer DEFAULT 0 NOT NULL,
    alignment_delta real DEFAULT 0 NOT NULL,
    confidence real DEFAULT 0 NOT NULL,
    evidence_count integer DEFAULT 0 NOT NULL,
    severity text DEFAULT 'low'::text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    detail text NOT NULL,
    evidence jsonb DEFAULT '[]'::jsonb NOT NULL,
    first_detected_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT contradiction_signals_confidence_check CHECK (((confidence >= (0)::double precision) AND (confidence <= (1)::double precision))),
    CONSTRAINT contradiction_signals_section_check CHECK ((section = ANY (ARRAY['tension'::text, 'blind_spot'::text, 'identity_conflict'::text, 'value_conflict'::text]))),
    CONSTRAINT contradiction_signals_severity_check CHECK ((severity = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text]))),
    CONSTRAINT contradiction_signals_status_check CHECK ((status = ANY (ARRAY['open'::text, 'resolved'::text, 'dismissed'::text]))),
    CONSTRAINT contradiction_signals_type_check CHECK ((type = ANY (ARRAY['STATED_VS_REVEALED'::text, 'GOAL_VS_ACTION'::text, 'IDENTITY_VS_BEHAVIOR'::text, 'VALUE_CONFLICT'::text, 'INTENTION_OUTCOME'::text])))
);


--
-- Name: TABLE contradiction_signals; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.contradiction_signals IS 'Contradiction Engine: deterministically-proven divergences between stated identity and revealed behavior. Each row references its preference_signals evidence.';


--
-- Name: conversation_compactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversation_compactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    session_id text NOT NULL,
    compaction_type text NOT NULL,
    turn_range_start integer NOT NULL,
    turn_range_end integer NOT NULL,
    original_turns integer NOT NULL,
    summary text NOT NULL,
    summary_tokens integer NOT NULL,
    original_tokens integer NOT NULL,
    compression_ratio double precision NOT NULL,
    model_used text NOT NULL,
    key_entities text[] DEFAULT '{}'::text[],
    key_topics text[] DEFAULT '{}'::text[],
    time_range_start timestamp with time zone,
    time_range_end timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone,
    CONSTRAINT conversation_compactions_compaction_type_check CHECK ((compaction_type = ANY (ARRAY['ROLLING'::text, 'EPISODIC'::text, 'SESSION_CLOSE'::text])))
);


--
-- Name: conversation_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversation_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text NOT NULL,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    CONSTRAINT conversation_messages_role_check CHECK ((role = ANY (ARRAY['user'::text, 'assistant'::text])))
);


--
-- Name: conversation_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversation_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    ended_at timestamp with time zone,
    title text,
    summary text,
    scope text DEFAULT 'PRIVATE'::text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    thread_number integer,
    CONSTRAINT conversation_sessions_scope_check CHECK ((scope = ANY (ARRAY['PRIVATE'::text, 'SHARED'::text, 'PUBLIC'::text])))
);


--
-- Name: correction_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.correction_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    target_type text NOT NULL,
    target_id uuid NOT NULL,
    original_content text,
    corrected_content text,
    correction_type text NOT NULL,
    confidence double precision DEFAULT 1.0,
    applied boolean DEFAULT false,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT correction_records_correction_type_check CHECK ((correction_type = ANY (ARRAY['retraction'::text, 'amendment'::text, 'clarification'::text, 'contradiction'::text]))),
    CONSTRAINT correction_records_target_type_check CHECK ((target_type = ANY (ARRAY['claim'::text, 'entry'::text, 'entity'::text, 'relationship'::text, 'event'::text])))
);


--
-- Name: crystallized_knowledge; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crystallized_knowledge (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    machine_claim text NOT NULL,
    human_readable_claim text NOT NULL,
    knowledge_type text NOT NULL,
    status text DEFAULT 'ACTIVE'::text NOT NULL,
    superseded_by_id uuid,
    crystallize_after timestamp with time zone,
    confidence double precision NOT NULL,
    confidence_breakdown jsonb DEFAULT '{}'::jsonb NOT NULL,
    trigger_type text NOT NULL,
    trigger_id uuid,
    first_evidenced_at timestamp with time zone,
    last_reinforced_at timestamp with time zone,
    principle_eligible boolean DEFAULT false NOT NULL,
    biography_eligible boolean DEFAULT false NOT NULL,
    arc_close_eligible boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT crystallized_knowledge_confidence_check CHECK (((confidence >= (0.05)::double precision) AND (confidence <= (0.95)::double precision))),
    CONSTRAINT crystallized_knowledge_knowledge_type_check CHECK ((knowledge_type = ANY (ARRAY['behavioral_pattern'::text, 'value'::text, 'belief'::text, 'skill'::text, 'relationship'::text, 'lesson'::text, 'preference'::text, 'career'::text, 'creative'::text, 'identity'::text, 'health'::text, 'location'::text]))),
    CONSTRAINT crystallized_knowledge_status_check CHECK ((status = ANY (ARRAY['PENDING'::text, 'ACTIVE'::text, 'DORMANT'::text, 'HISTORICAL'::text, 'SUPERSEDED'::text]))),
    CONSTRAINT crystallized_knowledge_trigger_type_check CHECK ((trigger_type = ANY (ARRAY['pattern_threshold'::text, 'arc_close'::text, 'user_reflection'::text])))
);


--
-- Name: daily_summaries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.daily_summaries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    date date NOT NULL,
    summary text,
    tags text[] DEFAULT '{}'::text[],
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: embedding_model_registry; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.embedding_model_registry (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    model_name text NOT NULL,
    version integer NOT NULL,
    dimensions integer NOT NULL,
    deployed_at timestamp with time zone DEFAULT now() NOT NULL,
    retired_at timestamp with time zone,
    is_current boolean DEFAULT false NOT NULL
);


--
-- Name: engine_dependencies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.engine_dependencies (
    engine_name text NOT NULL,
    depends_on text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT engine_dependencies_no_self_reference CHECK ((engine_name <> depends_on))
);


--
-- Name: engine_results; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.engine_results (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    results jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: entity_aliases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.entity_aliases (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    node_id uuid NOT NULL,
    alias text NOT NULL,
    alias_kind text DEFAULT 'nickname'::text NOT NULL,
    confidence double precision DEFAULT 0.8 NOT NULL,
    source text DEFAULT 'system'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT entity_aliases_alias_kind_check CHECK ((alias_kind = ANY (ARRAY['nickname'::text, 'kinship'::text, 'misspelling'::text, 'former_name'::text, 'abbreviation'::text])))
);


--
-- Name: entity_authority_decisions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.entity_authority_decisions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    kind text NOT NULL,
    decision text NOT NULL,
    relationship text,
    source_id uuid,
    source_name text,
    target_id uuid,
    target_name text,
    canonical_entity_id uuid,
    confidence real,
    reason text,
    evidence jsonb DEFAULT '[]'::jsonb NOT NULL,
    status text DEFAULT 'confirmed'::text NOT NULL,
    applied boolean DEFAULT false NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE entity_authority_decisions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.entity_authority_decisions IS 'Confirmed entity authority decisions (MERGE/ALIAS/PARENT_CHILD/LINK) — the authority graph + audit trail.';


--
-- Name: entity_conversation_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.entity_conversation_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    session_id uuid NOT NULL,
    link_kind text DEFAULT 'mention'::text NOT NULL,
    mention_count integer DEFAULT 1 NOT NULL,
    first_linked_at timestamp with time zone DEFAULT now() NOT NULL,
    last_linked_at timestamp with time zone DEFAULT now() NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT entity_conversation_links_entity_type_check CHECK ((entity_type = ANY (ARRAY['character'::text, 'location'::text, 'organization'::text, 'skill'::text, 'event'::text]))),
    CONSTRAINT entity_conversation_links_link_kind_check CHECK ((link_kind = ANY (ARRAY['mention'::text, 'origin'::text, 'created'::text]))),
    CONSTRAINT entity_conversation_links_mention_count_check CHECK ((mention_count >= 1))
);


--
-- Name: TABLE entity_conversation_links; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.entity_conversation_links IS 'Many-to-many: entities ↔ conversation_sessions. Origin links mark first mention thread; RESTRICT prevents silent session deletion.';


--
-- Name: entity_deletion_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.entity_deletion_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    entity_name text NOT NULL,
    normalized_keys text[] DEFAULT '{}'::text[] NOT NULL,
    deletion_kind text DEFAULT 'permanent'::text NOT NULL,
    reason text,
    initiated_by text DEFAULT 'USER'::text NOT NULL,
    snapshot jsonb DEFAULT '{}'::jsonb NOT NULL,
    source_message_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    source_thread_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    facts_preserved integer DEFAULT 0 NOT NULL,
    claims_preserved integer DEFAULT 0 NOT NULL,
    reprocess_jobs_queued integer DEFAULT 0 NOT NULL,
    deletion_count integer DEFAULT 1 NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT entity_deletion_events_deletion_kind_check CHECK ((deletion_kind = ANY (ARRAY['permanent'::text, 'archive'::text]))),
    CONSTRAINT entity_deletion_events_entity_type_check CHECK ((entity_type = ANY (ARRAY['character'::text, 'organization'::text, 'location'::text]))),
    CONSTRAINT entity_deletion_events_initiated_by_check CHECK ((initiated_by = ANY (ARRAY['USER'::text, 'SYSTEM'::text])))
);


--
-- Name: TABLE entity_deletion_events; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.entity_deletion_events IS 'User entity deletions — preserves lore snapshots, blocks wrong re-creation, drives reprocessing';


--
-- Name: entity_facts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.entity_facts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    entity_id uuid NOT NULL,
    entity_type text NOT NULL,
    fact text NOT NULL,
    category text DEFAULT 'general'::text NOT NULL,
    confidence double precision DEFAULT 0.7 NOT NULL,
    mention_count integer DEFAULT 1 NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    previous_value text,
    first_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    last_confirmed_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    superseded_at timestamp with time zone,
    superseded_reason text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT entity_facts_confidence_check CHECK (((confidence >= (0)::double precision) AND (confidence <= (1)::double precision))),
    CONSTRAINT entity_facts_entity_type_check CHECK ((entity_type = ANY (ARRAY['character'::text, 'location'::text, 'organization'::text]))),
    CONSTRAINT entity_facts_status_check CHECK ((status = ANY (ARRAY['active'::text, 'updated'::text, 'corrected'::text, 'contradicted'::text])))
);


--
-- Name: entity_gravity_scores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.entity_gravity_scores (
    user_id uuid NOT NULL,
    entity_id uuid NOT NULL,
    entity_type text NOT NULL,
    entity_name text NOT NULL,
    gravity_score real DEFAULT 0 NOT NULL,
    components jsonb DEFAULT '{}'::jsonb NOT NULL,
    roles text[] DEFAULT '{}'::text[] NOT NULL,
    computed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT entity_gravity_scores_gravity_score_check CHECK (((gravity_score >= (0)::double precision) AND (gravity_score <= (1)::double precision)))
);


--
-- Name: entity_merge_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.entity_merge_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    survivor_node_id uuid NOT NULL,
    merged_node_id uuid NOT NULL,
    merge_reason text,
    evidence jsonb DEFAULT '{}'::jsonb NOT NULL,
    merged_by text DEFAULT 'system'::text NOT NULL,
    merged_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: entity_merge_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.entity_merge_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    source_entity_id uuid NOT NULL,
    target_entity_id uuid NOT NULL,
    source_entity_type text NOT NULL,
    target_entity_type text NOT NULL,
    merged_by text DEFAULT 'USER'::text NOT NULL,
    reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    reversible boolean DEFAULT true NOT NULL,
    reverted_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT entity_merge_records_merged_by_check CHECK ((merged_by = ANY (ARRAY['SYSTEM'::text, 'USER'::text]))),
    CONSTRAINT entity_merge_records_source_entity_type_check CHECK ((source_entity_type = ANY (ARRAY['CHARACTER'::text, 'PERSON'::text, 'LOCATION'::text, 'COUNTRY'::text, 'CITY'::text, 'ORG'::text, 'ORGANIZATION'::text, 'SCHOOL'::text, 'ENTITY'::text, 'CONCEPT'::text, 'APP'::text, 'SOFTWARE_TOOL'::text, 'PROJECT'::text, 'PRODUCT'::text, 'EVENT'::text]))),
    CONSTRAINT entity_merge_records_target_entity_type_check CHECK ((target_entity_type = ANY (ARRAY['CHARACTER'::text, 'PERSON'::text, 'LOCATION'::text, 'COUNTRY'::text, 'CITY'::text, 'ORG'::text, 'ORGANIZATION'::text, 'SCHOOL'::text, 'ENTITY'::text, 'CONCEPT'::text, 'APP'::text, 'SOFTWARE_TOOL'::text, 'PROJECT'::text, 'PRODUCT'::text, 'EVENT'::text])))
);


--
-- Name: entity_questions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.entity_questions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    thread_id uuid,
    mention_text text NOT NULL,
    mention_lower text NOT NULL,
    candidates jsonb DEFAULT '[]'::jsonb NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    asked_count integer DEFAULT 0 NOT NULL,
    resolution jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    resolved_at timestamp with time zone,
    raw_text text,
    CONSTRAINT entity_questions_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'resolved'::text, 'dismissed'::text])))
);


--
-- Name: entity_resolution_cache; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.entity_resolution_cache (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    entity_name text NOT NULL,
    resolved_entity_id uuid,
    entity_type text,
    confidence numeric(3,2),
    aliases text[] DEFAULT '{}'::text[],
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    access_count integer DEFAULT 0,
    last_accessed_at timestamp with time zone DEFAULT now()
);


--
-- Name: entry_dependencies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.entry_dependencies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    entry_id uuid NOT NULL,
    dependency_type text NOT NULL,
    dependency_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT entry_dependencies_dependency_type_check CHECK ((dependency_type = ANY (ARRAY['ENTITY'::text, 'ENTRY'::text])))
);


--
-- Name: entry_ir; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.entry_ir (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    source_utterance_id uuid,
    thread_id uuid NOT NULL,
    "timestamp" timestamp with time zone NOT NULL,
    knowledge_type text NOT NULL,
    content text NOT NULL,
    entities jsonb DEFAULT '[]'::jsonb,
    emotions jsonb DEFAULT '[]'::jsonb,
    themes jsonb DEFAULT '[]'::jsonb,
    confidence double precision NOT NULL,
    certainty_source text NOT NULL,
    narrative_links jsonb DEFAULT '{}'::jsonb,
    compiler_flags jsonb DEFAULT '{"is_dirty": true, "is_deprecated": false, "compilation_version": 1}'::jsonb,
    consolidated_to uuid,
    consolidated_at timestamp with time zone,
    consolidation_status text DEFAULT 'PENDING'::text NOT NULL,
    consolidation_skip_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT entry_ir_certainty_source_check CHECK ((certainty_source = ANY (ARRAY['DIRECT_EXPERIENCE'::text, 'INFERENCE'::text, 'HEARSAY'::text, 'VERIFICATION'::text, 'MEMORY_RECALL'::text]))),
    CONSTRAINT entry_ir_confidence_check CHECK (((confidence >= (0.0)::double precision) AND (confidence <= (1.0)::double precision))),
    CONSTRAINT entry_ir_consolidation_status_check CHECK ((consolidation_status = ANY (ARRAY['PENDING'::text, 'CONSOLIDATED'::text, 'SKIPPED'::text, 'QUEUED_FOR_REVIEW'::text]))),
    CONSTRAINT entry_ir_knowledge_type_check CHECK ((knowledge_type = ANY (ARRAY['EXPERIENCE'::text, 'FEELING'::text, 'BELIEF'::text, 'FACT'::text, 'DECISION'::text, 'QUESTION'::text])))
);


--
-- Name: epiphany_insights; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.epiphany_insights (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    claim text NOT NULL,
    confidence double precision NOT NULL,
    supporting_memory_ids text[] DEFAULT '{}'::text[] NOT NULL,
    contradicting_memory_ids text[] DEFAULT '{}'::text[] NOT NULL,
    supersedes_interpretation_ids text[] DEFAULT '{}'::text[] NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: episodes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.episodes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    source_thread_id uuid NOT NULL,
    episode_index integer NOT NULL,
    title text NOT NULL,
    start_at timestamp with time zone NOT NULL,
    end_at timestamp with time zone NOT NULL,
    boundary_reason text NOT NULL,
    source_message_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    source_entity_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    source_location_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    source_event_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    participant_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    location_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT episodes_episode_index_check CHECK ((episode_index >= 0)),
    CONSTRAINT episodes_message_evidence CHECK ((cardinality(source_message_ids) > 0)),
    CONSTRAINT episodes_time_order CHECK ((end_at >= start_at))
);


--
-- Name: TABLE episodes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.episodes IS 'Conversation episodes segmented from chat_messages via episodeSegmentationCore. Every row requires source_message_ids evidence.';


--
-- Name: event_candidates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_candidates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    canonical_title text NOT NULL,
    dominant_entities text[] DEFAULT '{}'::text[] NOT NULL,
    dominant_entity_names text[] DEFAULT '{}'::text[] NOT NULL,
    recurring_activities text[] DEFAULT '{}'::text[] NOT NULL,
    source_event_ids text[] DEFAULT '{}'::text[] NOT NULL,
    source_thread_ids text[] DEFAULT '{}'::text[] NOT NULL,
    occurrence_count integer DEFAULT 1 NOT NULL,
    continuity_strength double precision DEFAULT 0.25 NOT NULL,
    timeline_candidate boolean DEFAULT false NOT NULL,
    confidence double precision DEFAULT 0.40 NOT NULL,
    first_seen_at timestamp with time zone,
    last_seen_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    emotional_tone text
);


--
-- Name: COLUMN event_candidates.emotional_tone; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.event_candidates.emotional_tone IS 'Optional emotional register inferred for this recurring autobiographical scene.';


--
-- Name: event_causal_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_causal_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    cause_event_id uuid NOT NULL,
    effect_event_id uuid NOT NULL,
    causal_type text NOT NULL,
    confidence double precision DEFAULT 0.7,
    evidence_count integer DEFAULT 1,
    evidence_source_ids uuid[],
    time_lag_days integer,
    causal_strength double precision,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT event_causal_links_causal_strength_check CHECK (((causal_strength >= (0)::double precision) AND (causal_strength <= (1)::double precision))),
    CONSTRAINT event_causal_links_causal_type_check CHECK ((causal_type = ANY (ARRAY['causes'::text, 'enables'::text, 'prevents'::text, 'triggers'::text, 'follows_from'::text, 'reaction_to'::text, 'mitigates'::text, 'amplifies'::text, 'parallel_to'::text, 'replaces'::text]))),
    CONSTRAINT event_causal_links_confidence_check CHECK (((confidence >= (0)::double precision) AND (confidence <= (1)::double precision)))
);


--
-- Name: event_cognitions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_cognitions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    event_record_id uuid,
    cognition_type text NOT NULL,
    content text NOT NULL,
    source_message_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT event_cognitions_cognition_type_check CHECK ((cognition_type = ANY (ARRAY['belief'::text, 'insecurity_triggered'::text, 'realization'::text, 'question'::text, 'doubt'::text])))
);


--
-- Name: event_confidence_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_confidence_snapshots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    user_id uuid NOT NULL,
    confidence double precision NOT NULL,
    reason text NOT NULL,
    recorded_at timestamp with time zone DEFAULT now() NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    CONSTRAINT event_confidence_snapshots_confidence_check CHECK (((confidence >= (0.0)::double precision) AND (confidence <= (1.0)::double precision)))
);


--
-- Name: event_continuity_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_continuity_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    current_event_id uuid NOT NULL,
    past_event_id uuid NOT NULL,
    continuity_type text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    CONSTRAINT event_continuity_links_continuity_type_check CHECK ((continuity_type = ANY (ARRAY['CONTINUATION'::text, 'CONTRAST'::text, 'RETURN'::text, 'CLOSURE'::text, 'ESCALATION'::text, 'DE_ESCALATION'::text])))
);


--
-- Name: event_emotions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_emotions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    event_record_id uuid,
    emotion text NOT NULL,
    intensity double precision,
    timestamp_offset integer,
    source_message_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT event_emotions_intensity_check CHECK (((intensity >= (0)::double precision) AND (intensity <= (1)::double precision)))
);


--
-- Name: event_identity_impacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_identity_impacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    event_record_id uuid,
    impact_type text NOT NULL,
    identity_aspect text,
    source_message_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT event_identity_impacts_impact_type_check CHECK ((impact_type = ANY (ARRAY['reinforced'::text, 'challenged'::text, 'shifted'::text, 'clarified'::text])))
);


--
-- Name: event_impacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_impacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    event_id uuid NOT NULL,
    impact_type text NOT NULL,
    connection_character_id uuid,
    connection_type text,
    emotional_impact text,
    impact_intensity double precision DEFAULT 0.5,
    impact_description text,
    source_message_ids uuid[],
    source_journal_entry_ids uuid[],
    confidence double precision DEFAULT 0.5,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT event_impacts_confidence_check CHECK (((confidence >= (0)::double precision) AND (confidence <= (1)::double precision))),
    CONSTRAINT event_impacts_emotional_impact_check CHECK ((emotional_impact = ANY (ARRAY['positive'::text, 'negative'::text, 'neutral'::text, 'mixed'::text]))),
    CONSTRAINT event_impacts_impact_intensity_check CHECK (((impact_intensity >= (0)::double precision) AND (impact_intensity <= (1)::double precision))),
    CONSTRAINT event_impacts_impact_type_check CHECK ((impact_type = ANY (ARRAY['direct_participant'::text, 'indirect_affected'::text, 'related_person_affected'::text, 'observer'::text, 'ripple_effect'::text])))
);


--
-- Name: event_meaning_cache; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_meaning_cache (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    event_id uuid NOT NULL,
    meaning_summary text,
    identity_impact text,
    life_lesson text,
    chapter_relevance text,
    confidence double precision DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT event_meaning_cache_confidence_check CHECK (((confidence >= (0)::double precision) AND (confidence <= (1)::double precision)))
);


--
-- Name: event_mentions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_mentions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    memory_id uuid NOT NULL,
    signal jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: event_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    event_date timestamp with time zone NOT NULL,
    event_date_end timestamp with time zone,
    location_ids uuid[] DEFAULT '{}'::uuid[],
    participant_ids uuid[] DEFAULT '{}'::uuid[],
    tags text[] DEFAULT '{}'::text[],
    source_entry_id uuid,
    source_message_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    resolved_event_id uuid
);


--
-- Name: event_unit_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_unit_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    unit_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: external_account_connections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.external_account_connections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    provider text NOT NULL,
    provider_user_id text,
    provider_username text,
    access_token_enc text,
    refresh_token_enc text,
    scopes text[] DEFAULT '{}'::text[] NOT NULL,
    expires_at timestamp with time zone,
    last_sync_at timestamp with time zone,
    status text DEFAULT 'connected'::text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: extracted_units; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.extracted_units (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    utterance_id uuid NOT NULL,
    user_id uuid NOT NULL,
    type text NOT NULL,
    content text NOT NULL,
    confidence double precision DEFAULT 0.6 NOT NULL,
    temporal_context jsonb DEFAULT '{}'::jsonb,
    entity_ids uuid[] DEFAULT '{}'::uuid[],
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    superseded_at timestamp with time zone,
    superseded_reason text,
    CONSTRAINT extracted_units_confidence_check CHECK (((confidence >= (0.0)::double precision) AND (confidence <= (1.0)::double precision))),
    CONSTRAINT extracted_units_type_check CHECK ((type = ANY (ARRAY['EXPERIENCE'::text, 'FEELING'::text, 'THOUGHT'::text, 'PERCEPTION'::text, 'CLAIM'::text, 'DECISION'::text, 'CORRECTION'::text])))
);


--
-- Name: goal_cognition_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.goal_cognition_audit (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    suggestion_id uuid,
    prior_title text NOT NULL,
    source_message_id text,
    source_text text,
    prior_payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    decision text NOT NULL,
    reasons jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT goal_cognition_audit_decision_check CHECK ((decision = ANY (ARRAY['ACCEPT'::text, 'REVIEW'::text, 'REJECT'::text, 'UPDATE_EXISTING'::text, 'COMPLETE_EXISTING'::text, 'CANCEL_EXISTING'::text])))
);


--
-- Name: goal_insights; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.goal_insights (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    type text NOT NULL,
    message text NOT NULL,
    confidence double precision DEFAULT 0.5 NOT NULL,
    "timestamp" timestamp with time zone DEFAULT now() NOT NULL,
    related_goal_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT goal_insights_confidence_check CHECK (((confidence >= (0)::double precision) AND (confidence <= (1)::double precision))),
    CONSTRAINT goal_insights_type_check CHECK ((type = ANY (ARRAY['progress'::text, 'stagnation'::text, 'dependency_warning'::text, 'milestone'::text, 'success_probability'::text, 'goal_state_change'::text])))
);


--
-- Name: goals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.goals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    last_action_at timestamp with time zone,
    status text DEFAULT 'active'::text NOT NULL,
    milestones jsonb DEFAULT '[]'::jsonb,
    probability double precision,
    dependencies uuid[] DEFAULT '{}'::uuid[],
    source text,
    source_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb,
    CONSTRAINT goals_probability_check CHECK (((probability >= (0)::double precision) AND (probability <= (1)::double precision))),
    CONSTRAINT goals_source_check CHECK ((source = ANY (ARRAY['entry'::text, 'task'::text, 'arc'::text, 'manual'::text]))),
    CONSTRAINT goals_status_check CHECK ((status = ANY (ARRAY['active'::text, 'paused'::text, 'abandoned'::text, 'completed'::text])))
);


--
-- Name: graph_edges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.graph_edges (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    from_node_id uuid NOT NULL,
    to_node_id uuid NOT NULL,
    relation_kind text NOT NULL,
    confidence double precision DEFAULT 0.7 NOT NULL,
    epistemic_state text DEFAULT 'UNKNOWN'::text NOT NULL,
    valid_from timestamp with time zone,
    valid_to timestamp with time zone,
    observed_at timestamp with time zone DEFAULT now() NOT NULL,
    asserted_at timestamp with time zone DEFAULT now() NOT NULL,
    extraction_method text,
    meta jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT graph_edges_confidence_check CHECK (((confidence >= (0.05)::double precision) AND (confidence <= (1.0)::double precision))),
    CONSTRAINT graph_edges_epistemic_state_check CHECK ((epistemic_state = ANY (ARRAY['UNKNOWN'::text, 'POSSIBLE'::text, 'LIKELY'::text, 'VERIFIED'::text, 'CONTRADICTED'::text, 'DEPRECATED'::text]))),
    CONSTRAINT graph_edges_no_self_loop CHECK ((from_node_id <> to_node_id))
);


--
-- Name: graph_nodes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.graph_nodes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    node_kind text NOT NULL,
    root_type text NOT NULL,
    classification_id uuid,
    machine_key text,
    display_name text NOT NULL,
    epistemic_state text DEFAULT 'UNKNOWN'::text NOT NULL,
    confidence double precision DEFAULT 0.5 NOT NULL,
    valid_from timestamp with time zone,
    valid_to timestamp with time zone,
    observed_at timestamp with time zone DEFAULT now() NOT NULL,
    asserted_at timestamp with time zone DEFAULT now() NOT NULL,
    extraction_method text,
    source_table text,
    source_id uuid,
    meta jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT graph_nodes_confidence_check CHECK (((confidence >= (0.05)::double precision) AND (confidence <= (0.99)::double precision))),
    CONSTRAINT graph_nodes_epistemic_state_check CHECK ((epistemic_state = ANY (ARRAY['UNKNOWN'::text, 'POSSIBLE'::text, 'LIKELY'::text, 'VERIFIED'::text, 'CONTRADICTED'::text, 'DEPRECATED'::text]))),
    CONSTRAINT graph_nodes_node_kind_check CHECK ((node_kind = ANY (ARRAY['person'::text, 'place'::text, 'organization'::text, 'event'::text, 'relationship'::text, 'skill'::text, 'artifact'::text, 'goal'::text, 'decision'::text, 'concept'::text, 'group'::text]))),
    CONSTRAINT graph_nodes_source_pair CHECK ((((source_table IS NULL) AND (source_id IS NULL)) OR ((source_table IS NOT NULL) AND (source_id IS NOT NULL))))
);


--
-- Name: group_candidates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.group_candidates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    proposed_name text,
    detected_members text[] DEFAULT '{}'::text[] NOT NULL,
    suggested_group_type text DEFAULT 'friend_group'::text NOT NULL,
    suggested_user_relationship text DEFAULT 'member'::text NOT NULL,
    suggested_membership_model text DEFAULT 'strict'::text NOT NULL,
    is_public_entity boolean DEFAULT false NOT NULL,
    confidence double precision DEFAULT 0.65 NOT NULL,
    occurrence_count integer DEFAULT 1 NOT NULL,
    source_message_ids text[] DEFAULT '{}'::text[] NOT NULL,
    context text,
    status text DEFAULT 'pending'::text NOT NULL,
    created_organization_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    detected_member_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    rejected_reason text,
    detection_version integer DEFAULT 2 NOT NULL,
    evidence jsonb DEFAULT '{}'::jsonb NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT group_candidates_group_type_check CHECK ((suggested_group_type = ANY (ARRAY['friend_group'::text, 'band'::text, 'sports_team'::text, 'company'::text, 'club'::text, 'nonprofit'::text, 'family'::text, 'martial_arts'::text, 'scene'::text, 'crew'::text, 'collective'::text, 'institution'::text, 'public_entity'::text, 'other'::text]))),
    CONSTRAINT group_candidates_relationship_check CHECK ((suggested_user_relationship = ANY (ARRAY['founder'::text, 'leader'::text, 'member'::text, 'former_member'::text, 'collaborator'::text, 'adjacent'::text, 'fan'::text, 'aware_of'::text, 'referenced'::text, 'alumnus'::text]))),
    CONSTRAINT group_candidates_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'rejected'::text])))
);


--
-- Name: group_evolution; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.group_evolution (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    group_id uuid NOT NULL,
    event_type text NOT NULL,
    event_description text,
    event_date timestamp with time zone NOT NULL,
    previous_state jsonb,
    new_state jsonb,
    evidence_source_ids uuid[],
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT group_evolution_event_type_check CHECK ((event_type = ANY (ARRAY['formed'::text, 'merged'::text, 'split'::text, 'dissolved'::text, 'renamed'::text, 'purpose_changed'::text, 'location_changed'::text, 'member_added'::text, 'member_removed'::text, 'status_changed'::text])))
);


--
-- Name: identity_mutations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.identity_mutations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    entity_id uuid NOT NULL,
    entity_type text NOT NULL,
    mutation_type text NOT NULL,
    previous_value jsonb,
    new_value jsonb,
    reason text,
    confidence real,
    source text DEFAULT 'SYSTEM'::text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT identity_mutations_mutation_type_check CHECK ((mutation_type = ANY (ARRAY['ENTITY_CREATED'::text, 'ENTITY_UPDATED'::text, 'ENTITY_ARCHIVED'::text, 'ENTITY_MERGED'::text, 'MERGE_REJECTED'::text, 'ALIAS_ADDED'::text, 'ALIAS_REMOVED'::text, 'RELATIONSHIP_CREATED'::text, 'RELATIONSHIP_REMOVED'::text, 'TRUTH_STATE_CHANGED'::text, 'CONFIDENCE_CHANGED'::text])))
);


--
-- Name: TABLE identity_mutations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.identity_mutations IS 'Identity Ledger v1 — immutable, append-only audit trail of every identity mutation (create/update/archive/merge/alias/relationship/truth-state/confidence). Never overwritten.';


--
-- Name: ingestion_dead_letter; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ingestion_dead_letter (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    payload jsonb NOT NULL,
    error text,
    attempts integer DEFAULT 1,
    created_at timestamp with time zone DEFAULT now(),
    last_attempted_at timestamp with time zone DEFAULT now()
);


--
-- Name: ingestion_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ingestion_jobs (
    id uuid NOT NULL,
    idempotency_key text NOT NULL,
    user_id uuid NOT NULL,
    chat_message_id text,
    session_id text,
    priority text DEFAULT 'NORMAL'::text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    last_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    logical_status text,
    current_stage text,
    completed_stages jsonb DEFAULT '[]'::jsonb NOT NULL,
    failed_stage text,
    last_error_code text,
    last_error_category text,
    retryable boolean,
    next_retry_at timestamp with time zone,
    locked_at timestamp with time zone,
    locked_by text,
    completed_at timestamp with time zone,
    ingestion_version integer DEFAULT 1 NOT NULL,
    lease_token text,
    attempt_version integer DEFAULT 0 NOT NULL,
    memory_quality_status text
);


--
-- Name: COLUMN ingestion_jobs.logical_status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ingestion_jobs.logical_status IS 'Explicit state machine: RECEIVED|PERSISTED|QUEUED|PROCESSING|PARTIAL|COMPLETED|RETRYABLE_FAILED|PERMANENT_FAILED|CANCELLED';


--
-- Name: COLUMN ingestion_jobs.lease_token; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ingestion_jobs.lease_token IS 'Worker lease identity; fenced updates require matching lease_token + attempt_version.';


--
-- Name: COLUMN ingestion_jobs.attempt_version; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ingestion_jobs.attempt_version IS 'Monotonic attempt fence; reclaimed jobs get a new version on next claim.';


--
-- Name: COLUMN ingestion_jobs.memory_quality_status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ingestion_jobs.memory_quality_status IS 'Observable Memory Quality stage status for this ingestion job.';


--
-- Name: interest_mentions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.interest_mentions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    interest_id uuid NOT NULL,
    source_entry_id uuid,
    source_message_id uuid,
    mention_text text NOT NULL,
    emotional_intensity double precision DEFAULT 0.5,
    sentiment double precision DEFAULT 0.0,
    word_count integer,
    time_spent_minutes double precision,
    mentioned_with_people uuid[] DEFAULT '{}'::uuid[],
    mentioned_at_location uuid,
    related_events uuid[] DEFAULT '{}'::uuid[],
    action_taken boolean DEFAULT false,
    action_type text,
    influence_on_decision boolean DEFAULT false,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT interest_mentions_emotional_intensity_check CHECK (((emotional_intensity >= (0)::double precision) AND (emotional_intensity <= (1)::double precision))),
    CONSTRAINT interest_mentions_sentiment_check CHECK (((sentiment >= ('-1'::integer)::double precision) AND (sentiment <= (1)::double precision))),
    CONSTRAINT interest_mentions_time_spent_minutes_check CHECK ((time_spent_minutes >= (0)::double precision))
);


--
-- Name: interest_scope_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.interest_scope_groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    scope text NOT NULL,
    scope_context text,
    interest_ids uuid[] DEFAULT '{}'::uuid[],
    confidence double precision DEFAULT 0.5,
    evidence_count integer DEFAULT 1,
    first_observed_at timestamp with time zone DEFAULT now(),
    last_observed_at timestamp with time zone DEFAULT now(),
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT interest_scope_groups_confidence_check CHECK (((confidence >= (0)::double precision) AND (confidence <= (1)::double precision)))
);


--
-- Name: interest_scopes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.interest_scopes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    interest_id uuid NOT NULL,
    scope text NOT NULL,
    scope_context text,
    confidence double precision DEFAULT 0.5,
    evidence_count integer DEFAULT 1,
    first_observed_at timestamp with time zone DEFAULT now(),
    last_observed_at timestamp with time zone DEFAULT now(),
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT interest_scopes_confidence_check CHECK (((confidence >= (0)::double precision) AND (confidence <= (1)::double precision)))
);


--
-- Name: interests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.interests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    interest_name text NOT NULL,
    interest_category text,
    interest_level double precision DEFAULT 0.5,
    mention_count integer DEFAULT 1,
    emotional_intensity_avg double precision DEFAULT 0.5,
    behavioral_impact_score double precision DEFAULT 0.0,
    influence_score double precision DEFAULT 0.0,
    knowledge_depth_score double precision DEFAULT 0.0,
    time_investment_hours double precision DEFAULT 0.0,
    trend text,
    trend_confidence double precision DEFAULT 0.5,
    first_mentioned_at timestamp with time zone NOT NULL,
    last_mentioned_at timestamp with time zone NOT NULL,
    peak_interest_at timestamp with time zone,
    related_character_ids uuid[] DEFAULT '{}'::uuid[],
    related_location_ids uuid[] DEFAULT '{}'::uuid[],
    related_event_ids uuid[] DEFAULT '{}'::uuid[],
    related_skill_ids uuid[] DEFAULT '{}'::uuid[],
    evidence_quotes text[] DEFAULT '{}'::text[],
    source_entry_ids uuid[] DEFAULT '{}'::uuid[],
    description text,
    tags text[] DEFAULT '{}'::text[],
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT interests_behavioral_impact_score_check CHECK (((behavioral_impact_score >= (0)::double precision) AND (behavioral_impact_score <= (1)::double precision))),
    CONSTRAINT interests_emotional_intensity_avg_check CHECK (((emotional_intensity_avg >= (0)::double precision) AND (emotional_intensity_avg <= (1)::double precision))),
    CONSTRAINT interests_influence_score_check CHECK (((influence_score >= (0)::double precision) AND (influence_score <= (1)::double precision))),
    CONSTRAINT interests_interest_level_check CHECK (((interest_level >= (0)::double precision) AND (interest_level <= (1)::double precision))),
    CONSTRAINT interests_knowledge_depth_score_check CHECK (((knowledge_depth_score >= (0)::double precision) AND (knowledge_depth_score <= (1)::double precision))),
    CONSTRAINT interests_time_investment_hours_check CHECK ((time_investment_hours >= (0)::double precision)),
    CONSTRAINT interests_trend_check CHECK ((trend = ANY (ARRAY['growing'::text, 'stable'::text, 'declining'::text, 'new'::text]))),
    CONSTRAINT interests_trend_confidence_check CHECK (((trend_confidence >= (0)::double precision) AND (trend_confidence <= (1)::double precision)))
);


--
-- Name: journal_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.journal_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    date timestamp with time zone DEFAULT now() NOT NULL,
    content text NOT NULL,
    tags text[] DEFAULT '{}'::text[],
    chapter_id uuid,
    mood text,
    summary text,
    source text DEFAULT 'manual'::text NOT NULL,
    embedding public.vector(1536),
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    embedding_model text DEFAULT 'text-embedding-3-small'::text,
    embedding_version integer DEFAULT 1,
    content_type text DEFAULT 'standard'::text,
    original_content text,
    preserve_original_language boolean DEFAULT false,
    accessibility_score double precision DEFAULT 1.0 NOT NULL,
    emotional_intensity double precision DEFAULT 0.0 NOT NULL,
    retrieval_count integer DEFAULT 0 NOT NULL,
    last_retrieved_at timestamp with time zone,
    narrative_order integer,
    derived_from_entry_id uuid,
    end_time timestamp with time zone,
    time_precision text DEFAULT 'exact'::text,
    time_confidence numeric(3,2) DEFAULT 1.0,
    "timestamp" timestamp with time zone DEFAULT now(),
    CONSTRAINT journal_entries_content_type_check CHECK ((content_type = ANY (ARRAY['standard'::text, 'testimony'::text, 'advice'::text, 'message_to_reader'::text, 'dedication'::text, 'acknowledgment'::text, 'preface'::text, 'epilogue'::text, 'manifesto'::text, 'vow'::text, 'promise'::text, 'declaration'::text]))),
    CONSTRAINT journal_entries_time_confidence_check CHECK (((time_confidence >= (0)::numeric) AND (time_confidence <= (1)::numeric))),
    CONSTRAINT journal_entries_time_precision_check CHECK ((time_precision = ANY (ARRAY['exact'::text, 'day'::text, 'month'::text, 'year'::text, 'approximate'::text])))
);


--
-- Name: COLUMN journal_entries."timestamp"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.journal_entries."timestamp" IS 'Mirrors date (event occurrence). Do not use created_at for timeline ordering.';


--
-- Name: knowledge_gaps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knowledge_gaps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    gap_type text NOT NULL,
    label text NOT NULL,
    prompt text NOT NULL,
    entity_id uuid,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    resolved_at timestamp with time zone,
    CONSTRAINT knowledge_gaps_gap_type_check CHECK ((gap_type = ANY (ARRAY['unknown_entity'::text, 'sparse_entity'::text]))),
    CONSTRAINT knowledge_gaps_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'filled'::text, 'dismissed'::text])))
);


--
-- Name: knowledge_units; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knowledge_units (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    source_entry_id uuid,
    unit_type text NOT NULL,
    content text NOT NULL,
    confidence double precision DEFAULT 0.6,
    entity_ids uuid[] DEFAULT '{}'::uuid[],
    embedding public.vector(1536),
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    certainty_source text,
    CONSTRAINT knowledge_units_certainty_source_check CHECK ((certainty_source = ANY (ARRAY['DIRECT_EXPERIENCE'::text, 'HEARSAY'::text, 'INFERENCE'::text, 'VERIFICATION'::text, 'MEMORY_RECALL'::text]))),
    CONSTRAINT knowledge_units_confidence_check CHECK (((confidence >= (0.0)::double precision) AND (confidence <= (1.0)::double precision)))
);


--
-- Name: lexical_analysis_results; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lexical_analysis_results (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    thread_id uuid,
    message_id uuid,
    raw_text text NOT NULL,
    normalized_text text NOT NULL,
    result_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    confidence numeric DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT lexical_analysis_results_confidence_check CHECK (((confidence >= (0)::numeric) AND (confidence <= (1)::numeric)))
);


--
-- Name: life_arcs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.life_arcs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    title text NOT NULL,
    arc_type text DEFAULT 'life_era'::text NOT NULL,
    parent_id uuid,
    start_date date,
    end_date date,
    is_active boolean DEFAULT false NOT NULL,
    summary text,
    confidence double precision DEFAULT 0.5 NOT NULL,
    source text DEFAULT 'inferred'::text NOT NULL,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    track text,
    dominant_emotion text,
    emotional_arc text,
    stability_score real DEFAULT 0.5 NOT NULL,
    CONSTRAINT life_arcs_arc_type_check CHECK ((arc_type = ANY (ARRAY['life_era'::text, 'skill'::text, 'location'::text, 'work'::text, 'custom'::text, 'occasion'::text]))),
    CONSTRAINT life_arcs_emotional_arc_check CHECK ((emotional_arc = ANY (ARRAY['building'::text, 'climax'::text, 'resolution'::text, 'grief'::text, 'recovery'::text, 'neutral'::text]))),
    CONSTRAINT life_arcs_source_check CHECK ((source = ANY (ARRAY['inferred'::text, 'user_created'::text]))),
    CONSTRAINT life_arcs_track_check CHECK ((track = ANY (ARRAY['career'::text, 'romance'::text, 'relationships'::text, 'creative'::text, 'health'::text, 'inner'::text, 'mixed'::text, 'custom'::text])))
);


--
-- Name: location_character_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.location_character_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    location_id uuid NOT NULL,
    character_id uuid NOT NULL,
    relationship_type text DEFAULT 'mentioned'::text NOT NULL,
    confidence numeric(4,3) DEFAULT 1.0 NOT NULL,
    evidence_count integer DEFAULT 1 NOT NULL,
    first_seen_at timestamp with time zone,
    last_seen_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT location_character_links_confidence_check CHECK (((confidence >= (0)::numeric) AND (confidence <= (1)::numeric))),
    CONSTRAINT location_character_links_evidence_count_check CHECK ((evidence_count >= 0)),
    CONSTRAINT location_character_links_relationship_type_check CHECK ((relationship_type = ANY (ARRAY['regular'::text, 'staff'::text, 'owner'::text, 'manager'::text, 'frequent_visitor'::text, 'community_member'::text, 'visitor'::text, 'mentioned'::text])))
);


--
-- Name: TABLE location_character_links; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.location_character_links IS 'Verified links between places and confirmed character rows. UI should use this table or character_identity_index-backed resolution, never raw extracted person strings.';


--
-- Name: location_mentions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.location_mentions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    location_id uuid NOT NULL,
    memory_id uuid NOT NULL,
    raw_text text NOT NULL,
    extracted_name text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.locations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    normalized_name text NOT NULL,
    type text,
    latitude double precision,
    longitude double precision,
    embedding public.vector(1536),
    confidence double precision DEFAULT 1.0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    address text,
    city text,
    region text,
    country text,
    owner_operator text,
    operating_hours jsonb DEFAULT '{}'::jsonb NOT NULL,
    purpose text[] DEFAULT '{}'::text[] NOT NULL,
    physical_attributes jsonb DEFAULT '{}'::jsonb NOT NULL,
    reputation jsonb DEFAULT '{}'::jsonb NOT NULL,
    user_relationship jsonb DEFAULT '{}'::jsonb NOT NULL,
    timeline jsonb DEFAULT '[]'::jsonb NOT NULL,
    current_state jsonb DEFAULT '{}'::jsonb NOT NULL,
    social_graph jsonb DEFAULT '{}'::jsonb NOT NULL,
    associated_character_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    associated_location_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    importance_level text DEFAULT 'supporting'::text NOT NULL,
    importance_score integer DEFAULT 0 NOT NULL,
    is_nickname boolean DEFAULT false NOT NULL,
    event_context text,
    proximity_target text,
    aliases text[] DEFAULT '{}'::text[] NOT NULL,
    root_type text DEFAULT 'PLACE'::text NOT NULL,
    spatial_category text,
    spatial_subcategory text,
    parent_location_id uuid,
    identity_strength_score real,
    identity_strength jsonb,
    summary text,
    CONSTRAINT locations_confidence_check CHECK (((confidence >= (0)::double precision) AND (confidence <= (1)::double precision)))
);


--
-- Name: COLUMN locations.purpose; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.locations.purpose IS 'Why this place exists for the user/story: entertainment, work, education, residence, worship, recreation, etc.';


--
-- Name: COLUMN locations.physical_attributes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.locations.physical_attributes IS 'Layout, capacity, rooms, accessibility, parking, and notable physical features.';


--
-- Name: COLUMN locations.reputation; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.locations.reputation IS 'Personal, public, and community reputation signals for this place.';


--
-- Name: COLUMN locations.user_relationship; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.locations.user_relationship IS 'Per-user relationship to the place: first visit, last visit, frequency, memories, favorite areas, emotional associations.';


--
-- Name: COLUMN locations.timeline; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.locations.timeline IS 'Place lifecycle and story timeline events such as opening, renovation, ownership changes, and important memories.';


--
-- Name: COLUMN locations.current_state; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.locations.current_state IS 'Dynamic state such as active events, popularity, crowding, current sentiment, and status.';


--
-- Name: COLUMN locations.root_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.locations.root_type IS 'PLACE or EVENT — events masquerading as places are flagged EVENT';


--
-- Name: COLUMN locations.spatial_category; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.locations.spatial_category IS 'HOUSEHOLD, ROOM, PROPERTY, VENUE, BUSINESS, CITY, REGION, EVENT_LOCATION, LANDMARK, UNKNOWN';


--
-- Name: COLUMN locations.spatial_subcategory; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.locations.spatial_subcategory IS 'Finer grain: KITCHEN, NIGHTCLUB, HOUSE, etc.';


--
-- Name: COLUMN locations.parent_location_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.locations.parent_location_id IS 'Rooms and nested places link to their parent household or container';


--
-- Name: lore_agent_observations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lore_agent_observations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    run_id text NOT NULL,
    agent_name text NOT NULL,
    kind text NOT NULL,
    summary text NOT NULL,
    evidence jsonb DEFAULT '[]'::jsonb NOT NULL,
    confidence real,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: lore_agent_proposed_actions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lore_agent_proposed_actions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    run_id text NOT NULL,
    agent_name text NOT NULL,
    action_type text NOT NULL,
    status text DEFAULT 'proposed'::text NOT NULL,
    target_kind text,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    confidence real,
    requires_confirmation boolean DEFAULT true NOT NULL,
    routed_to text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: lore_agent_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lore_agent_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    run_id text NOT NULL,
    agent_name text NOT NULL,
    thread_id text,
    message_id uuid,
    status text DEFAULT 'completed'::text NOT NULL,
    confidence real,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    duration_ms integer,
    warnings jsonb DEFAULT '[]'::jsonb NOT NULL,
    error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: lore_topic_ledger; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lore_topic_ledger (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    topic_key text NOT NULL,
    topic_label text NOT NULL,
    atom_count integer DEFAULT 0 NOT NULL,
    entry_count integer DEFAULT 0 NOT NULL,
    word_count integer DEFAULT 0 NOT NULL,
    progress numeric(6,4) DEFAULT 0 NOT NULL,
    readiness_level text DEFAULT 'needs_more'::text NOT NULL,
    can_generate boolean DEFAULT false NOT NULL,
    atom_type_counts jsonb DEFAULT '{}'::jsonb NOT NULL,
    gaps jsonb DEFAULT '[]'::jsonb NOT NULL,
    entity_candidates jsonb,
    dimension_scores jsonb,
    time_start timestamp with time zone,
    time_end timestamp with time zone,
    total_atoms_snapshot integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: mcp_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mcp_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    aggregate_type text NOT NULL,
    aggregate_id text NOT NULL,
    event_type text NOT NULL,
    payload jsonb NOT NULL,
    request_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: mcp_oauth_authorization_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mcp_oauth_authorization_codes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code_hash text NOT NULL,
    user_id uuid NOT NULL,
    client_id text NOT NULL,
    redirect_uri text NOT NULL,
    scopes text[] DEFAULT '{memory:read}'::text[] NOT NULL,
    code_challenge text NOT NULL,
    code_challenge_method text DEFAULT 'S256'::text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    consumed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: mcp_oauth_clients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mcp_oauth_clients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id text NOT NULL,
    client_name text NOT NULL,
    client_type text NOT NULL,
    redirect_uris text[] DEFAULT '{}'::text[] NOT NULL,
    allowed_scopes text[] DEFAULT '{memory:read}'::text[] NOT NULL,
    owner_user_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone,
    CONSTRAINT mcp_oauth_clients_client_type_check CHECK ((client_type = ANY (ARRAY['public'::text, 'confidential'::text])))
);


--
-- Name: mcp_oauth_refresh_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mcp_oauth_refresh_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    token_hash text NOT NULL,
    user_id uuid NOT NULL,
    client_id text NOT NULL,
    scopes text[] DEFAULT '{memory:read}'::text[] NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: mcp_tool_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mcp_tool_audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    client_id text NOT NULL,
    tool_name text NOT NULL,
    tool_version text DEFAULT '1'::text NOT NULL,
    request_id text NOT NULL,
    input_hash text NOT NULL,
    output_artifact_ids text[] DEFAULT '{}'::text[] NOT NULL,
    status text NOT NULL,
    error_code text,
    latency_ms integer,
    ip_hash text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT mcp_tool_audit_log_status_check CHECK ((status = ANY (ARRAY['ok'::text, 'error'::text, 'denied'::text, 'rate_limited'::text])))
);


--
-- Name: mcp_tool_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mcp_tool_versions (
    tool_name text NOT NULL,
    version text NOT NULL,
    schema jsonb NOT NULL,
    deprecated_at timestamp with time zone,
    sunset_at timestamp with time zone
);


--
-- Name: meaning_resolution_results; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meaning_resolution_results (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    thread_id uuid,
    message_id uuid,
    lexical_result_id uuid,
    result_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    confidence numeric DEFAULT 0 NOT NULL,
    factuality text DEFAULT 'uncertain'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT meaning_resolution_results_confidence_check CHECK (((confidence >= (0)::numeric) AND (confidence <= (1)::numeric)))
);


--
-- Name: memoir_outlines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.memoir_outlines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    title text NOT NULL,
    structure jsonb DEFAULT '{}'::jsonb NOT NULL,
    language_style jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: memory_components; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.memory_components (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    journal_entry_id uuid NOT NULL,
    component_type text NOT NULL,
    text text NOT NULL,
    characters_involved text[] DEFAULT '{}'::text[],
    location text,
    "timestamp" timestamp with time zone,
    tags text[] DEFAULT '{}'::text[],
    importance_score integer DEFAULT 0,
    embedding public.vector(1536),
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT memory_components_component_type_check CHECK ((component_type = ANY (ARRAY['event'::text, 'thought'::text, 'reflection'::text, 'decision'::text, 'relationship_update'::text, 'worldbuilding'::text, 'lore_drop'::text, 'timeline_marker'::text]))),
    CONSTRAINT memory_components_importance_score_check CHECK (((importance_score >= 0) AND (importance_score <= 10)))
);


--
-- Name: memory_decisions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.memory_decisions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    proposal_id uuid NOT NULL,
    decision text NOT NULL,
    edited_text text,
    edited_confidence double precision,
    decided_by text NOT NULL,
    reason text,
    "timestamp" timestamp with time zone DEFAULT now() NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    CONSTRAINT memory_decisions_decided_by_check CHECK ((decided_by = ANY (ARRAY['USER'::text, 'SYSTEM'::text]))),
    CONSTRAINT memory_decisions_decision_check CHECK ((decision = ANY (ARRAY['APPROVE'::text, 'REJECT'::text, 'EDIT'::text, 'DEFER'::text]))),
    CONSTRAINT memory_decisions_edited_confidence_check CHECK (((edited_confidence >= (0.0)::double precision) AND (edited_confidence <= (1.0)::double precision)))
);


--
-- Name: memory_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.memory_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    kind text NOT NULL,
    actor text DEFAULT 'user'::text NOT NULL,
    session_id uuid,
    source_message_id uuid,
    entity_id uuid,
    extraction_method text,
    confidence real,
    user_confirmed boolean DEFAULT false NOT NULL,
    content text,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    supersedes_event_id uuid,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT memory_events_actor_check CHECK ((actor = ANY (ARRAY['user'::text, 'assistant'::text, 'system'::text]))),
    CONSTRAINT memory_events_confidence_check CHECK (((confidence IS NULL) OR ((confidence >= (0)::double precision) AND (confidence <= (1)::double precision)))),
    CONSTRAINT memory_events_kind_check CHECK ((kind = ANY (ARRAY['user_message'::text, 'assistant_message'::text, 'correction'::text, 'entity_extraction'::text, 'relationship_change'::text, 'file_upload'::text, 'inference'::text, 'fact_update'::text, 'retraction'::text, 'deletion'::text])))
);


--
-- Name: TABLE memory_events; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.memory_events IS 'Append-only source-of-truth event log (Durable Memory Architecture slice 1). Never updated or deleted; retractions/corrections supersede prior events by reference.';


--
-- Name: memory_health; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.memory_health AS
 SELECT ( SELECT count(*) AS count
           FROM public.journal_entries) AS total_journal_entries,
    ( SELECT count(*) AS count
           FROM public.journal_entries
          WHERE (journal_entries.embedding IS NOT NULL)) AS journal_entries_with_embeddings,
    ( SELECT count(*) AS count
           FROM public.journal_entries
          WHERE (journal_entries.embedding IS NULL)) AS journal_entries_missing_embeddings,
    ( SELECT count(*) AS count
           FROM public.journal_entries
          WHERE ((journal_entries.metadata ->> 'source'::text) = 'chat'::text)) AS journal_entries_from_chat,
    ( SELECT count(*) AS count
           FROM public.entry_ir
          WHERE (entry_ir.consolidation_status = 'PENDING'::text)) AS entry_ir_pending_consolidation,
    ( SELECT count(*) AS count
           FROM public.entry_ir
          WHERE (entry_ir.consolidation_status = 'CONSOLIDATED'::text)) AS entry_ir_consolidated,
    ( SELECT count(*) AS count
           FROM public.entry_ir
          WHERE (entry_ir.consolidation_status = 'SKIPPED'::text)) AS entry_ir_skipped,
    ( SELECT count(*) AS count
           FROM public.characters) AS total_characters,
    ( SELECT count(*) AS count
           FROM public.characters
          WHERE (characters.embedding IS NULL)) AS characters_missing_embeddings,
    now() AS checked_at;


--
-- Name: memory_proposals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.memory_proposals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    entity_id uuid NOT NULL,
    claim_text text NOT NULL,
    perspective_id uuid,
    confidence double precision DEFAULT 0.6 NOT NULL,
    temporal_context jsonb DEFAULT '{}'::jsonb,
    source_excerpt text,
    reasoning text,
    affected_claim_ids uuid[] DEFAULT '{}'::uuid[],
    risk_level text NOT NULL,
    status text DEFAULT 'PENDING'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    resolved_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb,
    CONSTRAINT memory_proposals_confidence_check CHECK (((confidence >= (0.0)::double precision) AND (confidence <= (1.0)::double precision))),
    CONSTRAINT memory_proposals_risk_level_check CHECK ((risk_level = ANY (ARRAY['LOW'::text, 'MEDIUM'::text, 'HIGH'::text]))),
    CONSTRAINT memory_proposals_status_check CHECK ((status = ANY (ARRAY['PENDING'::text, 'APPROVED'::text, 'REJECTED'::text, 'EDITED'::text, 'DEFERRED'::text])))
);


--
-- Name: narrative_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.narrative_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    event_record_id uuid,
    account_type text NOT NULL,
    narrator_id uuid,
    narrative_text text NOT NULL,
    recorded_at timestamp with time zone NOT NULL,
    source_entry_id uuid,
    source_message_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT narrative_accounts_account_type_check CHECK ((account_type = ANY (ARRAY['at_the_time'::text, 'others_perspective'::text, 'later_interpretation'::text, 'biography_snapshot'::text, 'theme_summary'::text, 'life_period'::text])))
);


--
-- Name: narrative_anchor_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.narrative_anchor_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    anchor_id uuid NOT NULL,
    user_id uuid NOT NULL,
    member_kind text NOT NULL,
    member_id uuid,
    member_name text NOT NULL,
    role text,
    gravity_score real,
    evidence jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT narrative_anchor_members_member_kind_check CHECK ((member_kind = ANY (ARRAY['entity'::text, 'event'::text, 'group'::text, 'place'::text, 'activity'::text])))
);


--
-- Name: narrative_anchors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.narrative_anchors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    title text NOT NULL,
    anchor_type text NOT NULL,
    confidence real DEFAULT 0.5 NOT NULL,
    gravity_score real DEFAULT 0 NOT NULL,
    start_date timestamp with time zone,
    end_date timestamp with time zone,
    evidence jsonb DEFAULT '[]'::jsonb NOT NULL,
    provenance jsonb DEFAULT '{}'::jsonb NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    consolidation_key text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT narrative_anchors_anchor_type_check CHECK ((anchor_type = ANY (ARRAY['life_era'::text, 'school_era'::text, 'work_era'::text, 'relationship_arc'::text, 'community'::text, 'family_period'::text, 'project_arc'::text, 'travel_period'::text, 'recurring_activity'::text, 'pivotal_event'::text]))),
    CONSTRAINT narrative_anchors_confidence_check CHECK (((confidence >= (0)::double precision) AND (confidence <= (1)::double precision))),
    CONSTRAINT narrative_anchors_gravity_score_check CHECK (((gravity_score >= (0)::double precision) AND (gravity_score <= (1)::double precision)))
);


--
-- Name: narrative_chapters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.narrative_chapters (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    life_arc_id uuid NOT NULL,
    title text NOT NULL,
    thesis text NOT NULL,
    dominant_theme text NOT NULL,
    start_date date,
    end_date date,
    participant_ids text[] DEFAULT '{}'::text[] NOT NULL,
    location_ids text[] DEFAULT '{}'::text[] NOT NULL,
    supporting_event_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    background_event_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    background_context text[] DEFAULT '{}'::text[] NOT NULL,
    outcomes text[] DEFAULT '{}'::text[] NOT NULL,
    contribution_scores jsonb DEFAULT '{}'::jsonb NOT NULL,
    quality jsonb DEFAULT '{}'::jsonb NOT NULL,
    confidence real DEFAULT 0.5 NOT NULL,
    generation_version text DEFAULT 'chapter-thesis-v1'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT narrative_chapters_check CHECK (((end_date IS NULL) OR (start_date IS NULL) OR (end_date >= start_date))),
    CONSTRAINT narrative_chapters_confidence_check CHECK (((confidence >= (0)::double precision) AND (confidence <= (1)::double precision)))
);


--
-- Name: TABLE narrative_chapters; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.narrative_chapters IS 'Autobiographical chapters generated thesis-first, with contribution-gated scenes, background context, outcomes, and quality metrics.';


--
-- Name: narrative_claim_edges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.narrative_claim_edges (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    from_claim_id uuid NOT NULL,
    to_claim_id uuid NOT NULL,
    relation text NOT NULL,
    confidence double precision DEFAULT 1.0 NOT NULL,
    meta jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT narrative_claim_edges_confidence_check CHECK (((confidence >= (0.05)::double precision) AND (confidence <= (1.0)::double precision))),
    CONSTRAINT narrative_claim_edges_no_self_loop CHECK ((from_claim_id <> to_claim_id)),
    CONSTRAINT narrative_claim_edges_relation_check CHECK ((relation = ANY (ARRAY['evidences'::text, 'interpreted_as'::text, 'means_for'::text, 'derived_from'::text, 'contradicts'::text, 'supersedes'::text, 'caused'::text, 'led_to'::text])))
);


--
-- Name: narrative_claims; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.narrative_claims (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    claim_kind text NOT NULL,
    statement text NOT NULL,
    summary text,
    machine_key text,
    confidence double precision DEFAULT 0.5 NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    source_table text,
    source_id uuid,
    occurred_at timestamp with time zone,
    occurred_end timestamp with time zone,
    significance double precision,
    meta jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    epistemic_state text DEFAULT 'UNKNOWN'::text NOT NULL,
    valid_from timestamp with time zone,
    valid_to timestamp with time zone,
    observed_at timestamp with time zone DEFAULT now() NOT NULL,
    asserted_at timestamp with time zone DEFAULT now() NOT NULL,
    extraction_method text,
    CONSTRAINT narrative_claims_claim_kind_check CHECK ((claim_kind = ANY (ARRAY['fact'::text, 'event'::text, 'evidence'::text, 'interpretation'::text, 'meaning'::text, 'decision'::text]))),
    CONSTRAINT narrative_claims_confidence_check CHECK (((confidence >= (0.05)::double precision) AND (confidence <= (0.99)::double precision))),
    CONSTRAINT narrative_claims_epistemic_state_check CHECK ((epistemic_state = ANY (ARRAY['UNKNOWN'::text, 'POSSIBLE'::text, 'LIKELY'::text, 'VERIFIED'::text, 'CONTRADICTED'::text, 'DEPRECATED'::text]))),
    CONSTRAINT narrative_claims_significance_check CHECK (((significance IS NULL) OR ((significance >= (0)::double precision) AND (significance <= (1)::double precision)))),
    CONSTRAINT narrative_claims_source_pair CHECK ((((source_table IS NULL) AND (source_id IS NULL)) OR ((source_table IS NOT NULL) AND (source_id IS NOT NULL)))),
    CONSTRAINT narrative_claims_status_check CHECK ((status = ANY (ARRAY['active'::text, 'superseded'::text, 'disputed'::text, 'archived'::text])))
);


--
-- Name: narrative_life_chapters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.narrative_life_chapters (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    domain text NOT NULL,
    title text NOT NULL,
    summary text NOT NULL,
    time_start timestamp with time zone,
    time_end timestamp with time zone,
    location text,
    participants text[] DEFAULT '{}'::text[] NOT NULL,
    storyline_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    scene_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    event_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    themes text[] DEFAULT '{}'::text[] NOT NULL,
    dominant_emotion text,
    significance_score integer DEFAULT 0 NOT NULL,
    confidence double precision DEFAULT 0.5 NOT NULL,
    era_id uuid,
    thread_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT narrative_life_chapters_confidence_check CHECK (((confidence >= (0)::double precision) AND (confidence <= (1)::double precision))),
    CONSTRAINT narrative_life_chapters_significance_score_check CHECK (((significance_score >= 0) AND (significance_score <= 100)))
);


--
-- Name: TABLE narrative_life_chapters; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.narrative_life_chapters IS 'Domain-grouped life chapters (Career, Family, Creative Work, ...) assembled from Story Chapters ("Storylines"), attached to a Life Era.';


--
-- Name: narrative_life_eras; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.narrative_life_eras (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    title text NOT NULL,
    summary text NOT NULL,
    thesis text,
    time_start timestamp with time zone,
    time_end timestamp with time zone,
    location text,
    participants text[] DEFAULT '{}'::text[] NOT NULL,
    chapter_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    scene_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    event_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    themes text[] DEFAULT '{}'::text[] NOT NULL,
    dominant_emotion text,
    is_current boolean DEFAULT false NOT NULL,
    significance_score integer DEFAULT 0 NOT NULL,
    confidence double precision DEFAULT 0.5 NOT NULL,
    thread_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT narrative_life_eras_confidence_check CHECK (((confidence >= (0)::double precision) AND (confidence <= (1)::double precision))),
    CONSTRAINT narrative_life_eras_significance_score_check CHECK (((significance_score >= 0) AND (significance_score <= 100)))
);


--
-- Name: TABLE narrative_life_eras; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.narrative_life_eras IS 'Durable life eras assembled from Story Chapters (months-to-years life periods).';


--
-- Name: narrative_moments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.narrative_moments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    occurred_at timestamp with time zone,
    recorded_at timestamp with time zone DEFAULT now() NOT NULL,
    sentence_kind text DEFAULT 'EVENT'::text NOT NULL,
    summary text NOT NULL,
    participants text[] DEFAULT '{}'::text[] NOT NULL,
    location text,
    emotions text[] DEFAULT '{}'::text[] NOT NULL,
    evidence_unit_ids text[] DEFAULT '{}'::text[] NOT NULL,
    thread_id uuid,
    source_message_id uuid,
    significance_score integer DEFAULT 0 NOT NULL,
    promoted_event_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    previous_moment_id uuid,
    next_moment_id uuid,
    scene_id uuid,
    caused_by_moment_id uuid,
    leads_to_moment_id uuid,
    CONSTRAINT narrative_moments_sentence_kind_check CHECK ((sentence_kind = ANY (ARRAY['EVENT'::text, 'FACT'::text, 'STATE'::text, 'GOAL'::text, 'OPINION'::text, 'BACKGROUND'::text, 'EMOTION'::text, 'PROFILE'::text, 'IGNORE'::text]))),
    CONSTRAINT narrative_moments_significance_score_check CHECK (((significance_score >= 0) AND (significance_score <= 100)))
);


--
-- Name: narrative_scenes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.narrative_scenes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    title text NOT NULL,
    summary text NOT NULL,
    time_start timestamp with time zone,
    time_end timestamp with time zone,
    location text,
    participants text[] DEFAULT '{}'::text[] NOT NULL,
    moment_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    primary_goal text,
    dominant_emotion text,
    outcome text,
    confidence double precision DEFAULT 0.5 NOT NULL,
    significance_score integer DEFAULT 0 NOT NULL,
    promoted_event_id uuid,
    thread_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    chapter_id uuid,
    CONSTRAINT narrative_scenes_significance_score_check CHECK (((significance_score >= 0) AND (significance_score <= 100)))
);


--
-- Name: narrative_story_chapters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.narrative_story_chapters (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    title text NOT NULL,
    summary text NOT NULL,
    thesis text,
    time_start timestamp with time zone,
    time_end timestamp with time zone,
    location text,
    participants text[] DEFAULT '{}'::text[] NOT NULL,
    scene_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    event_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    themes text[] DEFAULT '{}'::text[] NOT NULL,
    dominant_emotion text,
    significance_score integer DEFAULT 0 NOT NULL,
    confidence double precision DEFAULT 0.5 NOT NULL,
    thread_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    era_id uuid,
    primary_narrative text,
    primary_subject text,
    primary_conflict text,
    primary_outcome text,
    contribution_scores jsonb DEFAULT '{}'::jsonb NOT NULL,
    life_chapter_id uuid,
    CONSTRAINT narrative_story_chapters_confidence_check CHECK (((confidence >= (0)::double precision) AND (confidence <= (1)::double precision))),
    CONSTRAINT narrative_story_chapters_significance_score_check CHECK (((significance_score >= 0) AND (significance_score <= 100)))
);


--
-- Name: TABLE narrative_story_chapters; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.narrative_story_chapters IS 'Durable narrative chapters assembled from Scenes (experiences), not from individual Moments.';


--
-- Name: COLUMN narrative_story_chapters.primary_narrative; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.narrative_story_chapters.primary_narrative IS 'One-sentence story the chapter owns (Narrative Ownership contract).';


--
-- Name: COLUMN narrative_story_chapters.contribution_scores; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.narrative_story_chapters.contribution_scores IS 'Per-scene narrative contribution strengths keyed by scene id.';


--
-- Name: omega_claims; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.omega_claims (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    entity_id uuid NOT NULL,
    text text NOT NULL,
    source text NOT NULL,
    confidence double precision DEFAULT 0.6 NOT NULL,
    sentiment text,
    start_time timestamp with time zone DEFAULT now() NOT NULL,
    end_time timestamp with time zone,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    embedding public.vector(1536),
    temporal_context jsonb DEFAULT '{}'::jsonb,
    temporal_confidence double precision DEFAULT 0.8,
    source_event_id uuid,
    last_confirmed_at timestamp with time zone,
    extraction_method text,
    lifecycle_state text DEFAULT 'active'::text NOT NULL,
    CONSTRAINT omega_claims_confidence_check CHECK (((confidence >= (0.0)::double precision) AND (confidence <= (1.0)::double precision))),
    CONSTRAINT omega_claims_lifecycle_state_check CHECK ((lifecycle_state = ANY (ARRAY['active'::text, 'outdated'::text, 'contradicted'::text, 'retracted'::text, 'corrected'::text]))),
    CONSTRAINT omega_claims_sentiment_check CHECK ((sentiment = ANY (ARRAY['POSITIVE'::text, 'NEGATIVE'::text, 'NEUTRAL'::text, 'MIXED'::text]))),
    CONSTRAINT omega_claims_source_check CHECK ((source = ANY (ARRAY['USER'::text, 'AI'::text, 'EXTERNAL'::text]))),
    CONSTRAINT omega_claims_temporal_confidence_check CHECK (((temporal_confidence >= (0.0)::double precision) AND (temporal_confidence <= (1.0)::double precision)))
);


--
-- Name: COLUMN omega_claims.source_event_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.omega_claims.source_event_id IS 'Soft reference to memory_events.id — the originating event for this claim (provenance).';


--
-- Name: COLUMN omega_claims.lifecycle_state; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.omega_claims.lifecycle_state IS 'Epistemic lifecycle: active | outdated | contradicted | retracted | corrected. Older truth is superseded, never deleted.';


--
-- Name: omega_claims_with_evidence; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.omega_claims_with_evidence AS
SELECT
    NULL::uuid AS id,
    NULL::uuid AS user_id,
    NULL::uuid AS entity_id,
    NULL::text AS text,
    NULL::text AS source,
    NULL::double precision AS confidence,
    NULL::text AS sentiment,
    NULL::timestamp with time zone AS start_time,
    NULL::timestamp with time zone AS end_time,
    NULL::boolean AS is_active,
    NULL::timestamp with time zone AS created_at,
    NULL::timestamp with time zone AS updated_at,
    NULL::jsonb AS metadata,
    NULL::public.vector(1536) AS embedding,
    NULL::jsonb AS temporal_context,
    NULL::double precision AS temporal_confidence,
    NULL::double precision AS evidence_weighted_score,
    NULL::bigint AS evidence_count;


--
-- Name: omega_entities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.omega_entities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    type text NOT NULL,
    primary_name text NOT NULL,
    aliases text[] DEFAULT '{}'::text[],
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    embedding public.vector(1536),
    mention_count integer DEFAULT 1 NOT NULL,
    mention_status text DEFAULT 'mentioned_only'::text NOT NULL,
    entity_type text,
    CONSTRAINT omega_entities_type_check CHECK ((type = ANY (ARRAY['PERSON'::text, 'CHARACTER'::text, 'LOCATION'::text, 'ORG'::text, 'EVENT'::text, 'PRODUCT'::text, 'APP'::text, 'BRAND'::text, 'PROJECT'::text, 'SKILL'::text, 'PET'::text, 'VEHICLE'::text, 'MEDIA'::text, 'FOOD_DRINK'::text, 'UNKNOWN'::text])))
);


--
-- Name: omega_evidence; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.omega_evidence (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    claim_id uuid NOT NULL,
    content text NOT NULL,
    source text NOT NULL,
    "timestamp" timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    reliability_score double precision DEFAULT 1.0,
    source_type text DEFAULT 'journal_entry'::text,
    CONSTRAINT omega_evidence_reliability_score_check CHECK (((reliability_score >= (0.0)::double precision) AND (reliability_score <= (1.0)::double precision))),
    CONSTRAINT omega_evidence_source_type_check CHECK ((source_type = ANY (ARRAY['journal_entry'::text, 'chat'::text, 'external'::text, 'user_verified'::text, 'ai_inferred'::text])))
);


--
-- Name: openai_cost_daily; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.openai_cost_daily (
    day date NOT NULL,
    operation text DEFAULT 'unknown'::text NOT NULL,
    model text DEFAULT 'unknown'::text NOT NULL,
    calls integer DEFAULT 0 NOT NULL,
    input_tokens bigint DEFAULT 0 NOT NULL,
    output_tokens bigint DEFAULT 0 NOT NULL,
    estimated_usd numeric(14,8) DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: organization_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    event_id uuid,
    title text NOT NULL,
    date date NOT NULL,
    type text DEFAULT 'other'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT organization_events_type_check CHECK ((type = ANY (ARRAY['meeting'::text, 'game'::text, 'social'::text, 'work'::text, 'other'::text])))
);


--
-- Name: organization_locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_locations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    location_id uuid,
    location_name text NOT NULL,
    visit_count integer DEFAULT 1 NOT NULL,
    last_visited date,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: organization_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    character_id uuid,
    character_name text NOT NULL,
    role text,
    joined_date date,
    status text DEFAULT 'active'::text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    left_at date,
    CONSTRAINT organization_members_status_check CHECK ((status = ANY (ARRAY['active'::text, 'former'::text, 'honorary'::text])))
);


--
-- Name: organization_relationships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_relationships (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    from_org_id uuid NOT NULL,
    to_org_id uuid NOT NULL,
    relationship_type text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT org_rel_no_self_ref CHECK ((from_org_id <> to_org_id)),
    CONSTRAINT org_rel_type_check CHECK ((relationship_type = ANY (ARRAY['part_of'::text, 'affiliated_with'::text, 'rival_of'::text, 'spawned_from'::text, 'collaborated_with'::text, 'succeeded_by'::text, 'merged_with'::text])))
);


--
-- Name: organization_stories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_stories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    memory_id uuid,
    title text NOT NULL,
    summary text NOT NULL,
    date date NOT NULL,
    related_member_ids uuid[] DEFAULT '{}'::uuid[],
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: organization_suggestions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_suggestions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    normalized_name text NOT NULL,
    organization_type text DEFAULT 'unknown_organization'::text NOT NULL,
    group_type text DEFAULT 'other'::text NOT NULL,
    role_to_user text,
    description text,
    confidence numeric DEFAULT 0.5 NOT NULL,
    reasoning text,
    evidence jsonb DEFAULT '[]'::jsonb NOT NULL,
    context jsonb DEFAULT '{}'::jsonb NOT NULL,
    aliases jsonb DEFAULT '[]'::jsonb NOT NULL,
    source_message_id text,
    source text DEFAULT 'chat'::text NOT NULL,
    promotion_status text DEFAULT 'candidate'::text NOT NULL,
    match_status text DEFAULT 'new'::text,
    matched_organization_id uuid,
    status_row text DEFAULT 'pending'::text NOT NULL,
    requires_review boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT organization_suggestions_confidence_check CHECK (((confidence >= (0)::numeric) AND (confidence <= (1)::numeric))),
    CONSTRAINT organization_suggestions_match_status_check CHECK ((match_status = ANY (ARRAY['new'::text, 'similar'::text, 'existing'::text]))),
    CONSTRAINT organization_suggestions_status_row_check CHECK ((status_row = ANY (ARRAY['pending'::text, 'confirmed'::text, 'rejected'::text])))
);


--
-- Name: organizations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organizations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    aliases text[] DEFAULT '{}'::text[],
    type text DEFAULT 'other'::text NOT NULL,
    description text,
    location text,
    founded_date date,
    status text DEFAULT 'active'::text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    group_type text DEFAULT 'other'::text NOT NULL,
    membership_model text DEFAULT 'strict'::text NOT NULL,
    user_relationship text DEFAULT 'member'::text NOT NULL,
    is_public_entity boolean DEFAULT false NOT NULL,
    founded_year integer,
    dissolved_year integer,
    importance_score real DEFAULT 0 NOT NULL,
    root_type text DEFAULT 'GROUP'::text NOT NULL,
    social_category text,
    social_subcategory text,
    parent_group_id uuid,
    identity_strength_score real,
    identity_strength jsonb,
    CONSTRAINT organizations_group_type_check CHECK ((group_type = ANY (ARRAY['friend_group'::text, 'band'::text, 'sports_team'::text, 'company'::text, 'club'::text, 'nonprofit'::text, 'family'::text, 'household'::text, 'martial_arts'::text, 'scene'::text, 'crew'::text, 'collective'::text, 'community'::text, 'institution'::text, 'public_entity'::text, 'brand'::text, 'vendor'::text, 'team'::text, 'project'::text, 'event_group'::text, 'other'::text]))),
    CONSTRAINT organizations_membership_model_check CHECK ((membership_model = ANY (ARRAY['strict'::text, 'fuzzy'::text, 'none'::text]))),
    CONSTRAINT organizations_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text, 'dissolved'::text]))),
    CONSTRAINT organizations_type_check CHECK ((type = ANY (ARRAY['friend_group'::text, 'band'::text, 'sports_team'::text, 'company'::text, 'club'::text, 'nonprofit'::text, 'family'::text, 'household'::text, 'martial_arts'::text, 'scene'::text, 'crew'::text, 'collective'::text, 'community'::text, 'institution'::text, 'public_entity'::text, 'brand'::text, 'vendor'::text, 'team'::text, 'project'::text, 'event_group'::text, 'affiliation'::text, 'other'::text]))),
    CONSTRAINT organizations_user_relationship_check CHECK ((user_relationship = ANY (ARRAY['founder'::text, 'leader'::text, 'member'::text, 'former_member'::text, 'collaborator'::text, 'adjacent'::text, 'fan'::text, 'aware_of'::text, 'referenced'::text, 'alumnus'::text])))
);


--
-- Name: COLUMN organizations.root_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organizations.root_type IS 'GROUP — canonical social entity root';


--
-- Name: COLUMN organizations.social_category; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organizations.social_category IS 'COMPANY, INSTITUTION, COMMUNITY, SCENE, FAMILY, HOUSEHOLD, TEAM, BAND, EVENT_GROUP, FRIEND_GROUP, PROJECT, UNKNOWN';


--
-- Name: COLUMN organizations.social_subcategory; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organizations.social_subcategory IS 'Finer grain: STAFFING, BOOTCAMP, GOTH_SCENE, etc.';


--
-- Name: COLUMN organizations.parent_group_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organizations.parent_group_id IS 'Households and sub-teams link to parent family/community';


--
-- Name: original_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.original_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    title text NOT NULL,
    content text NOT NULL,
    source text NOT NULL,
    file_type text,
    file_name text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: people_places; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.people_places (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    first_mentioned_at timestamp with time zone,
    last_mentioned_at timestamp with time zone,
    total_mentions integer DEFAULT 0,
    related_entries uuid[] DEFAULT '{}'::uuid[],
    corrected_names text[] DEFAULT '{}'::text[],
    relationship_counts jsonb DEFAULT '{}'::jsonb,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT people_places_type_check CHECK ((type = ANY (ARRAY['person'::text, 'place'::text, 'organization'::text, 'platform'::text])))
);


--
-- Name: perception_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.perception_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    subject_person_id uuid,
    subject_alias text DEFAULT 'Unknown'::text NOT NULL,
    source text NOT NULL,
    source_character_id uuid,
    source_detail text,
    content text NOT NULL,
    original_content text,
    sentiment text,
    confidence_level numeric(3,2) DEFAULT 0.30 NOT NULL,
    status text DEFAULT 'unverified'::text NOT NULL,
    timestamp_heard timestamp with time zone DEFAULT now() NOT NULL,
    related_memory_id uuid,
    retracted boolean DEFAULT false NOT NULL,
    retracted_at timestamp with time zone,
    retraction_reason text,
    impact_on_me text DEFAULT 'Not specified'::text NOT NULL,
    evolution_notes text[] DEFAULT '{}'::text[] NOT NULL,
    created_in_high_emotion boolean DEFAULT false NOT NULL,
    review_reminder_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT perception_entries_confidence_level_check CHECK (((confidence_level >= 0.0) AND (confidence_level <= 1.0))),
    CONSTRAINT perception_entries_sentiment_check CHECK ((sentiment = ANY (ARRAY['positive'::text, 'negative'::text, 'neutral'::text, 'mixed'::text, 'uncertain'::text]))),
    CONSTRAINT perception_entries_source_check CHECK ((source = ANY (ARRAY['overheard'::text, 'told_by'::text, 'rumor'::text, 'social_media'::text, 'intuition'::text, 'assumption'::text, 'other'::text]))),
    CONSTRAINT perception_entries_status_check CHECK ((status = ANY (ARRAY['unverified'::text, 'confirmed'::text, 'disproven'::text, 'retracted'::text])))
);


--
-- Name: perspective_claims; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.perspective_claims (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    base_claim_id uuid NOT NULL,
    perspective_id uuid NOT NULL,
    text text NOT NULL,
    confidence double precision DEFAULT 0.6 NOT NULL,
    sentiment text,
    temporal_context jsonb DEFAULT '{}'::jsonb,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    ended_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb,
    CONSTRAINT perspective_claims_confidence_check CHECK (((confidence >= (0.0)::double precision) AND (confidence <= (1.0)::double precision))),
    CONSTRAINT perspective_claims_sentiment_check CHECK ((sentiment = ANY (ARRAY['POSITIVE'::text, 'NEGATIVE'::text, 'NEUTRAL'::text, 'MIXED'::text])))
);


--
-- Name: perspective_disputes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.perspective_disputes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    base_claim_id uuid NOT NULL,
    perspective_claim_a_id uuid NOT NULL,
    perspective_claim_b_id uuid NOT NULL,
    reason text,
    detected_at timestamp with time zone DEFAULT now() NOT NULL,
    resolved_at timestamp with time zone,
    is_resolved boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb
);


--
-- Name: perspectives; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.perspectives (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    type text NOT NULL,
    owner_entity_id uuid,
    label text NOT NULL,
    reliability_modifier double precision DEFAULT 1.0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    CONSTRAINT perspectives_reliability_modifier_check CHECK (((reliability_modifier >= (0.0)::double precision) AND (reliability_modifier <= (2.0)::double precision))),
    CONSTRAINT perspectives_type_check CHECK ((type = ANY (ARRAY['SELF'::text, 'OTHER_PERSON'::text, 'GROUP'::text, 'SYSTEM'::text, 'FICTIONAL'::text, 'HISTORICAL'::text])))
);


--
-- Name: pipeline_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pipeline_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    job_id text NOT NULL,
    user_id uuid NOT NULL,
    chat_message_id uuid,
    session_id text,
    status text DEFAULT 'running'::text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    duration_ms integer,
    step_results jsonb DEFAULT '[]'::jsonb NOT NULL,
    completed_steps integer DEFAULT 0 NOT NULL,
    total_steps integer DEFAULT 12 NOT NULL,
    error text,
    failed_at_step text
);


--
-- Name: pipeline_runs_incomplete; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.pipeline_runs_incomplete WITH (security_invoker='on') AS
 SELECT id,
    job_id,
    user_id,
    chat_message_id,
    session_id,
    status,
    started_at,
    completed_steps,
    total_steps,
    failed_at_step,
    error
   FROM public.pipeline_runs
  WHERE ((status = ANY (ARRAY['running'::text, 'partial'::text, 'failed'::text])) AND (started_at < (now() - '00:05:00'::interval)));


--
-- Name: platform_openai_spend; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_openai_spend (
    month date NOT NULL,
    estimated_usd numeric(12,6) DEFAULT 0 NOT NULL,
    input_tokens bigint DEFAULT 0 NOT NULL,
    output_tokens bigint DEFAULT 0 NOT NULL,
    call_count integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE platform_openai_spend; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.platform_openai_spend IS 'Monthly estimated OpenAI spend for platform budget guard (MONTHLY_OPENAI_BUDGET_USD)';


--
-- Name: preference_evidence; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.preference_evidence (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    signal_id uuid NOT NULL,
    category_key text NOT NULL,
    signal_type text NOT NULL,
    source text NOT NULL,
    source_id uuid NOT NULL,
    matched_term text NOT NULL,
    snippet text NOT NULL,
    weight real DEFAULT 1 NOT NULL,
    occurred_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT preference_evidence_signal_type_check CHECK ((signal_type = ANY (ARRAY['stated'::text, 'revealed'::text, 'disliked'::text]))),
    CONSTRAINT preference_evidence_source_check CHECK ((source = ANY (ARRAY['journal'::text, 'chat'::text])))
);


--
-- Name: TABLE preference_evidence; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.preference_evidence IS 'Revealed Preference Engine: per-episode provenance for every signal.';


--
-- Name: preference_signals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.preference_signals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    type text NOT NULL,
    category_key text NOT NULL,
    label text NOT NULL,
    stated_count integer DEFAULT 0 NOT NULL,
    revealed_count integer DEFAULT 0 NOT NULL,
    evidence_count integer DEFAULT 0 NOT NULL,
    confidence real DEFAULT 0 NOT NULL,
    stated_share real DEFAULT 0 NOT NULL,
    revealed_share real DEFAULT 0 NOT NULL,
    alignment_score real,
    alignment_label text,
    recent_revealed integer DEFAULT 0 NOT NULL,
    prior_revealed integer DEFAULT 0 NOT NULL,
    trend real DEFAULT 0 NOT NULL,
    first_seen_at timestamp with time zone,
    last_seen_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    disliked_count integer DEFAULT 0 NOT NULL,
    CONSTRAINT preference_signals_confidence_check CHECK (((confidence >= (0)::double precision) AND (confidence <= (1)::double precision))),
    CONSTRAINT preference_signals_type_check CHECK ((type = ANY (ARRAY['value'::text, 'goal'::text, 'fear'::text, 'motivation'::text, 'identity'::text, 'habit'::text, 'preference'::text, 'interest'::text, 'skill'::text])))
);


--
-- Name: TABLE preference_signals; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.preference_signals IS 'Revealed Preference Engine: aggregated stated-vs-revealed priority signals per user.';


--
-- Name: COLUMN preference_signals.disliked_count; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.preference_signals.disliked_count IS 'Episodes where the user explicitly dislikes this category (deterministic stance layer). Orthogonal to stated_count/revealed_count alignment.';


--
-- Name: profile_claim_evidence; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profile_claim_evidence (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    claim_id uuid NOT NULL,
    user_id uuid NOT NULL,
    evidence_type text NOT NULL,
    evidence_id uuid,
    evidence_text text,
    strength numeric(3,2) DEFAULT 0.5,
    relevance numeric(3,2) DEFAULT 0.5,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT profile_claim_evidence_evidence_type_check CHECK ((evidence_type = ANY (ARRAY['journal_entry'::text, 'work_summary'::text, 'skill_progress'::text, 'external_verification'::text, 'time_pattern'::text]))),
    CONSTRAINT profile_claim_evidence_relevance_check CHECK (((relevance >= (0)::numeric) AND (relevance <= (1)::numeric))),
    CONSTRAINT profile_claim_evidence_strength_check CHECK (((strength >= (0)::numeric) AND (strength <= (1)::numeric)))
);


--
-- Name: TABLE profile_claim_evidence; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.profile_claim_evidence IS 'Evidence linking claims to actual behavior (journal entries, skills, etc.)';


--
-- Name: profile_claims; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profile_claims (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    claim_type text NOT NULL,
    claim_text text NOT NULL,
    source text NOT NULL,
    source_id uuid,
    source_detail text,
    verified_status text DEFAULT 'unverified'::text,
    confidence numeric(3,2) DEFAULT 0.6,
    evidence jsonb DEFAULT '{}'::jsonb,
    user_confirmed boolean DEFAULT false,
    user_confirmed_at timestamp with time zone,
    user_notes text,
    metadata jsonb DEFAULT '{}'::jsonb,
    first_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    last_updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT profile_claims_claim_type_check CHECK ((claim_type = ANY (ARRAY['role'::text, 'skill'::text, 'experience'::text, 'achievement'::text, 'education'::text, 'certification'::text, 'project'::text]))),
    CONSTRAINT profile_claims_confidence_check CHECK (((confidence >= (0)::numeric) AND (confidence <= (1)::numeric))),
    CONSTRAINT profile_claims_source_check CHECK ((source = ANY (ARRAY['resume'::text, 'chat'::text, 'linkedin'::text, 'manual'::text, 'work_summary'::text, 'journal_entry'::text]))),
    CONSTRAINT profile_claims_verified_status_check CHECK ((verified_status = ANY (ARRAY['unverified'::text, 'supported'::text, 'verified'::text, 'contradicted'::text, 'downgraded'::text])))
);


--
-- Name: TABLE profile_claims; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.profile_claims IS 'User identity claims from resumes, chat, etc. These are claims, not facts - verified over time.';


--
-- Name: project_chronicle_meta; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_chronicle_meta (
    key text NOT NULL,
    value jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: project_chronicle_milestones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_chronicle_milestones (
    id text NOT NULL,
    slug text NOT NULL,
    title text NOT NULL,
    summary text DEFAULT ''::text NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    significance smallint NOT NULL,
    category text DEFAULT 'other'::text NOT NULL,
    chapter_id text,
    source text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT project_chronicle_milestones_significance_check CHECK (((significance >= 1) AND (significance <= 5)))
);


--
-- Name: project_chronicle_pending_detections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_chronicle_pending_detections (
    id text NOT NULL,
    title text NOT NULL,
    summary text DEFAULT ''::text NOT NULL,
    confidence real DEFAULT 0.5 NOT NULL,
    significance smallint NOT NULL,
    category text DEFAULT 'other'::text NOT NULL,
    source text NOT NULL,
    source_ref text,
    detected_at timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT project_chronicle_pending_detections_confidence_check CHECK (((confidence >= (0)::double precision) AND (confidence <= (1)::double precision))),
    CONSTRAINT project_chronicle_pending_detections_significance_check CHECK (((significance >= 1) AND (significance <= 5))),
    CONSTRAINT project_chronicle_pending_detections_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'rejected'::text])))
);


--
-- Name: project_suggestions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_suggestions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    normalized_name text NOT NULL,
    description text,
    project_type text DEFAULT 'project'::text,
    status text DEFAULT 'active'::text,
    confidence numeric DEFAULT 0.5 NOT NULL,
    reasoning text,
    evidence jsonb DEFAULT '[]'::jsonb NOT NULL,
    source_message_id text,
    source text DEFAULT 'chat'::text NOT NULL,
    match_status text DEFAULT 'new'::text,
    matched_project_id uuid,
    status_row text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT project_suggestions_confidence_check CHECK (((confidence >= (0)::numeric) AND (confidence <= (1)::numeric))),
    CONSTRAINT project_suggestions_match_status_check CHECK ((match_status = ANY (ARRAY['new'::text, 'similar'::text, 'existing'::text]))),
    CONSTRAINT project_suggestions_status_check CHECK ((status = ANY (ARRAY['active'::text, 'paused'::text, 'completed'::text, 'abandoned'::text]))),
    CONSTRAINT project_suggestions_status_row_check CHECK ((status_row = ANY (ARRAY['pending'::text, 'confirmed'::text, 'rejected'::text])))
);


--
-- Name: projects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.projects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    normalized_name text NOT NULL,
    type text DEFAULT 'project'::text,
    status text DEFAULT 'active'::text,
    description text,
    summary text,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    importance_score numeric DEFAULT 50,
    associated_character_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    associated_location_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    started_at timestamp with time zone,
    ended_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE projects; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.projects IS 'Canonical project entities — the Projects Book authority (mirrors locations).';


--
-- Name: provenance_edges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.provenance_edges (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    source_id uuid NOT NULL,
    source_type text NOT NULL,
    target_id uuid NOT NULL,
    target_type text NOT NULL,
    relation text NOT NULL,
    confidence double precision DEFAULT 1.0 NOT NULL,
    to_truth_state text,
    meta jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: provenance_edges_export; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.provenance_edges_export WITH (security_invoker='on') AS
 SELECT id,
    source_id,
    source_type,
    target_id,
    target_type,
    relation,
    confidence,
    to_truth_state,
    created_at
   FROM public.provenance_edges
  WHERE (auth.uid() = user_id);


--
-- Name: quest_achievements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quest_achievements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    quest_id uuid NOT NULL,
    user_id uuid NOT NULL,
    achievement_type text NOT NULL,
    title text NOT NULL,
    description text,
    unlocked_at timestamp with time zone DEFAULT now() NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    CONSTRAINT quest_achievements_achievement_type_check CHECK ((achievement_type = ANY (ARRAY['completion'::text, 'milestone'::text, 'streak'::text, 'speed'::text, 'quality'::text])))
);


--
-- Name: TABLE quest_achievements; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.quest_achievements IS 'Rewards and unlocks for quest completion';


--
-- Name: quest_dependencies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quest_dependencies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    quest_id uuid NOT NULL,
    depends_on_quest_id uuid NOT NULL,
    dependency_type text DEFAULT 'blocks'::text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT quest_dependencies_dependency_type_check CHECK ((dependency_type = ANY (ARRAY['blocks'::text, 'recommends'::text, 'enables'::text])))
);


--
-- Name: TABLE quest_dependencies; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.quest_dependencies IS 'Quest dependency relationships (blocks, recommends, enables)';


--
-- Name: quest_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quest_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    quest_id uuid NOT NULL,
    user_id uuid NOT NULL,
    event_type text NOT NULL,
    description text,
    progress_before numeric(5,2),
    progress_after numeric(5,2),
    notes text,
    journal_entry_id uuid,
    related_quest_ids uuid[] DEFAULT '{}'::uuid[],
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    CONSTRAINT quest_history_event_type_check CHECK ((event_type = ANY (ARRAY['created'::text, 'started'::text, 'progress_update'::text, 'milestone_achieved'::text, 'paused'::text, 'resumed'::text, 'completed'::text, 'abandoned'::text, 'reflected'::text])))
);


--
-- Name: TABLE quest_history; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.quest_history IS 'Event log for quest lifecycle tracking';


--
-- Name: quest_suggestions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quest_suggestions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    quest_type text DEFAULT 'side'::text NOT NULL,
    priority integer DEFAULT 5 NOT NULL,
    importance integer DEFAULT 5 NOT NULL,
    impact integer DEFAULT 5 NOT NULL,
    category text,
    confidence numeric DEFAULT 0.5 NOT NULL,
    reasoning text,
    evidence jsonb DEFAULT '[]'::jsonb NOT NULL,
    source_message_id text,
    source text DEFAULT 'chat'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    item_type text,
    context jsonb DEFAULT '{}'::jsonb NOT NULL,
    parent_project_name text,
    promotion_status text DEFAULT 'candidate'::text NOT NULL,
    requires_review boolean DEFAULT false NOT NULL,
    normalized_title text,
    CONSTRAINT quest_suggestions_confidence_check CHECK (((confidence >= (0)::numeric) AND (confidence <= (1)::numeric))),
    CONSTRAINT quest_suggestions_impact_check CHECK (((impact >= 1) AND (impact <= 10))),
    CONSTRAINT quest_suggestions_importance_check CHECK (((importance >= 1) AND (importance <= 10))),
    CONSTRAINT quest_suggestions_priority_check CHECK (((priority >= 1) AND (priority <= 10))),
    CONSTRAINT quest_suggestions_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'rejected'::text])))
);


--
-- Name: quests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    quest_type text NOT NULL,
    priority integer DEFAULT 5 NOT NULL,
    importance integer DEFAULT 5 NOT NULL,
    impact integer DEFAULT 5 NOT NULL,
    difficulty integer DEFAULT 5,
    effort_hours numeric(5,2),
    status text DEFAULT 'active'::text NOT NULL,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    abandoned_at timestamp with time zone,
    completion_notes text,
    parent_quest_id uuid,
    related_goal_id uuid,
    related_task_id uuid,
    quest_chain_id uuid,
    progress_percentage numeric(5,2) DEFAULT 0,
    milestones jsonb DEFAULT '[]'::jsonb,
    reward_description text,
    motivation_notes text,
    estimated_completion_date timestamp with time zone,
    actual_completion_date timestamp with time zone,
    time_spent_hours numeric(8,2) DEFAULT 0,
    tags text[] DEFAULT '{}'::text[],
    category text,
    source text DEFAULT 'manual'::text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    last_activity_at timestamp with time zone,
    CONSTRAINT quests_difficulty_check CHECK (((difficulty >= 1) AND (difficulty <= 10))),
    CONSTRAINT quests_impact_check CHECK (((impact >= 1) AND (impact <= 10))),
    CONSTRAINT quests_importance_check CHECK (((importance >= 1) AND (importance <= 10))),
    CONSTRAINT quests_priority_check CHECK (((priority >= 1) AND (priority <= 10))),
    CONSTRAINT quests_progress_percentage_check CHECK (((progress_percentage >= (0)::numeric) AND (progress_percentage <= (100)::numeric))),
    CONSTRAINT quests_quest_type_check CHECK ((quest_type = ANY (ARRAY['main'::text, 'side'::text, 'daily'::text, 'achievement'::text]))),
    CONSTRAINT quests_source_check CHECK ((source = ANY (ARRAY['manual'::text, 'extracted'::text, 'suggested'::text, 'imported'::text]))),
    CONSTRAINT quests_status_check CHECK ((status = ANY (ARRAY['active'::text, 'paused'::text, 'completed'::text, 'abandoned'::text, 'archived'::text])))
);


--
-- Name: TABLE quests; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.quests IS 'Main quest table tracking goals, todos, and quests with multi-dimensional ranking';


--
-- Name: COLUMN quests.quest_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.quests.quest_type IS 'Type of quest: main (primary objectives), side (secondary), daily (short-term), achievement (milestone-based)';


--
-- Name: COLUMN quests.priority; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.quests.priority IS 'Urgency/importance ranking (1-10)';


--
-- Name: COLUMN quests.importance; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.quests.importance IS 'Long-term significance ranking (1-10)';


--
-- Name: COLUMN quests.impact; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.quests.impact IS 'Expected outcome magnitude ranking (1-10)';


--
-- Name: COLUMN quests.difficulty; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.quests.difficulty IS 'Effort/complexity ranking (1-10)';


--
-- Name: COLUMN quests.completion_notes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.quests.completion_notes IS 'User reflection on quest completion';


--
-- Name: COLUMN quests.progress_percentage; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.quests.progress_percentage IS 'Progress from 0-100, can be milestone-based or percentage-based';


--
-- Name: relationship_arcs; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.relationship_arcs WITH (security_invoker='true') AS
 SELECT id,
    user_id,
    title,
    arc_type,
    dominant_emotion,
    emotional_arc,
    start_date,
    end_date,
    is_active,
    summary,
    confidence,
    stability_score,
    source,
    tags,
    metadata,
    ((metadata ->> 'romantic_relationship_id'::text))::uuid AS romantic_relationship_id,
    created_at,
    updated_at
   FROM public.life_arcs
  WHERE (track = ANY (ARRAY['romance'::text, 'relationships'::text]));


--
-- Name: relationship_peripherals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.relationship_peripherals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    anchor_relationship_id uuid,
    anchor_person_id uuid NOT NULL,
    anchor_person_type text NOT NULL,
    peripheral_person_id uuid,
    peripheral_person_type text,
    peripheral_surface text NOT NULL,
    role text DEFAULT 'unknown'::text NOT NULL,
    tier text DEFAULT 'suspected'::text NOT NULL,
    confidence double precision DEFAULT 0.7 NOT NULL,
    has_met boolean DEFAULT false NOT NULL,
    proximity text DEFAULT 'third_party'::text NOT NULL,
    associated_via text DEFAULT 'chat_extract'::text,
    source_message_ids text[] DEFAULT '{}'::text[],
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    domain text DEFAULT 'romantic'::text NOT NULL,
    CONSTRAINT romantic_peripherals_anchor_person_type_check CHECK ((anchor_person_type = ANY (ARRAY['character'::text, 'omega_entity'::text]))),
    CONSTRAINT romantic_peripherals_confidence_check CHECK (((confidence >= (0)::double precision) AND (confidence <= (1)::double precision))),
    CONSTRAINT romantic_peripherals_peripheral_person_type_check CHECK ((peripheral_person_type = ANY (ARRAY['character'::text, 'omega_entity'::text]))),
    CONSTRAINT romantic_peripherals_proximity_check CHECK ((proximity = ANY (ARRAY['direct'::text, 'indirect'::text, 'distant'::text, 'unmet'::text, 'third_party'::text]))),
    CONSTRAINT romantic_peripherals_tier_check CHECK ((tier = ANY (ARRAY['suspected'::text, 'confirmed'::text, 'dismissed'::text])))
);


--
-- Name: TABLE relationship_peripherals; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.relationship_peripherals IS 'Vicarious relationship intelligence — other people connected to a subject (any domain).';


--
-- Name: relationship_type_ontology; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.relationship_type_ontology (
    id text NOT NULL,
    category text NOT NULL,
    role text NOT NULL,
    display_name text NOT NULL,
    inverse_role text,
    hierarchy text DEFAULT 'lateral'::text NOT NULL,
    generation_delta integer DEFAULT 0 NOT NULL,
    aliases text[] DEFAULT '{}'::text[] NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE relationship_type_ontology; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.relationship_type_ontology IS 'Universal relationship roles independent from the characters/entities filling those roles.';


--
-- Name: COLUMN relationship_type_ontology.generation_delta; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.relationship_type_ontology.generation_delta IS 'Position relative to the user/root for family-style trees: parent=-1, grandparent=-2, child=1.';


--
-- Name: resolved_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.resolved_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    title text NOT NULL,
    summary text,
    type text,
    start_time timestamp with time zone,
    confidence double precision DEFAULT 0.6,
    tags text[] DEFAULT '{}'::text[],
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    end_time timestamp with time zone,
    people uuid[] DEFAULT '{}'::uuid[],
    locations uuid[] DEFAULT '{}'::uuid[],
    activities uuid[] DEFAULT '{}'::uuid[],
    embedding public.vector(1536),
    significance_score integer DEFAULT 0 NOT NULL,
    significance_level text DEFAULT 'minor'::text NOT NULL,
    timezone text,
    temporal_precision text DEFAULT 'unknown'::text NOT NULL,
    temporal_source text DEFAULT 'recording_fallback'::text NOT NULL,
    temporal_confidence real,
    temporal_expression text,
    temporal_status text DEFAULT 'unanchored'::text NOT NULL,
    source_fingerprint text,
    source_message_id uuid,
    extractor_version text DEFAULT 'v1'::text,
    CONSTRAINT resolved_events_confidence_check CHECK (((confidence >= (0.0)::double precision) AND (confidence <= (1.0)::double precision))),
    CONSTRAINT resolved_events_significance_score_check CHECK (((significance_score >= 0) AND (significance_score <= 100)))
);


--
-- Name: COLUMN resolved_events.significance_score; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.resolved_events.significance_score IS 'Sprint AL deterministic significance (0-100)';


--
-- Name: COLUMN resolved_events.significance_level; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.resolved_events.significance_level IS 'Sprint AL: legendary | major | moderate | minor';


--
-- Name: COLUMN resolved_events.temporal_precision; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.resolved_events.temporal_precision IS 'exact|time_of_day|date|month|season|year|unknown — precision of the temporal evidence';


--
-- Name: COLUMN resolved_events.temporal_source; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.resolved_events.temporal_source IS 'user_corrected|user_stated|document_stated|relative_expression|context_inferred|recording_fallback';


--
-- Name: COLUMN resolved_events.temporal_status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.resolved_events.temporal_status IS 'anchored|approximate|ambiguous|unanchored|corrected';


--
-- Name: COLUMN resolved_events.source_fingerprint; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.resolved_events.source_fingerprint IS 'Deterministic key: user|sourceMessageId|extractorVersion|artifactType|normalizedSubject — replay-safe.';


--
-- Name: resume_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.resume_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    file_name text NOT NULL,
    file_type text NOT NULL,
    file_size integer NOT NULL,
    file_url text,
    raw_text text,
    parsed_data jsonb DEFAULT '{}'::jsonb,
    processing_status text DEFAULT 'pending'::text,
    processing_error text,
    claims_generated integer DEFAULT 0,
    claims_confirmed integer DEFAULT 0,
    metadata jsonb DEFAULT '{}'::jsonb,
    uploaded_at timestamp with time zone DEFAULT now() NOT NULL,
    processed_at timestamp with time zone,
    CONSTRAINT resume_documents_processing_status_check CHECK ((processing_status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'failed'::text])))
);


--
-- Name: TABLE resume_documents; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.resume_documents IS 'Uploaded resume documents with parsed content and generated claims.';


--
-- Name: reversal_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reversal_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    event_id uuid NOT NULL,
    reversal_timestamp timestamp with time zone DEFAULT now() NOT NULL,
    reversed_by text NOT NULL,
    reason text,
    snapshot_before jsonb NOT NULL,
    snapshot_after jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    CONSTRAINT reversal_logs_reversed_by_check CHECK ((reversed_by = ANY (ARRAY['USER'::text, 'SYSTEM'::text])))
);


--
-- Name: romantic_peripherals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.romantic_peripherals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    anchor_relationship_id uuid,
    anchor_person_id uuid NOT NULL,
    anchor_person_type text NOT NULL,
    peripheral_person_id uuid,
    peripheral_person_type text,
    peripheral_surface text NOT NULL,
    role text DEFAULT 'unknown'::text NOT NULL,
    tier text DEFAULT 'suspected'::text NOT NULL,
    confidence double precision DEFAULT 0.7 NOT NULL,
    has_met boolean DEFAULT false NOT NULL,
    proximity text DEFAULT 'third_party'::text NOT NULL,
    associated_via text DEFAULT 'chat_extract'::text,
    source_message_ids text[] DEFAULT '{}'::text[],
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT romantic_peripherals_anchor_person_type_check1 CHECK ((anchor_person_type = ANY (ARRAY['character'::text, 'omega_entity'::text]))),
    CONSTRAINT romantic_peripherals_confidence_check1 CHECK (((confidence >= (0)::double precision) AND (confidence <= (1)::double precision))),
    CONSTRAINT romantic_peripherals_peripheral_person_type_check1 CHECK ((peripheral_person_type = ANY (ARRAY['character'::text, 'omega_entity'::text]))),
    CONSTRAINT romantic_peripherals_proximity_check1 CHECK ((proximity = ANY (ARRAY['direct'::text, 'indirect'::text, 'distant'::text, 'unmet'::text, 'third_party'::text]))),
    CONSTRAINT romantic_peripherals_role_check CHECK ((role = ANY (ARRAY['side_partner'::text, 'current_partner'::text, 'ex'::text, 'crush'::text, 'hookup'::text, 'rival'::text, 'unknown'::text]))),
    CONSTRAINT romantic_peripherals_tier_check1 CHECK ((tier = ANY (ARRAY['suspected'::text, 'confirmed'::text, 'dismissed'::text])))
);


--
-- Name: TABLE romantic_peripherals; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.romantic_peripherals IS 'Vicarious romantic intelligence — suspected/confirmed other partners of a relationship person.';


--
-- Name: romantic_relationships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.romantic_relationships (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    person_id uuid NOT NULL,
    person_type text NOT NULL,
    relationship_type text NOT NULL,
    love_status text,
    love_declared_at timestamp with time zone,
    love_reciprocated boolean,
    status text DEFAULT 'active'::text,
    start_date timestamp with time zone,
    end_date timestamp with time zone,
    is_current boolean DEFAULT true,
    affection_score double precision DEFAULT 0.5,
    emotional_intensity double precision DEFAULT 0.5,
    physical_attraction double precision DEFAULT 0.5,
    emotional_connection double precision DEFAULT 0.5,
    is_situationship boolean DEFAULT false,
    ambiguity_level double precision DEFAULT 0.5,
    exclusivity_status text,
    compatibility_score double precision DEFAULT 0.5,
    relationship_health double precision DEFAULT 0.5,
    strengths text[] DEFAULT '{}'::text[],
    weaknesses text[] DEFAULT '{}'::text[],
    pros text[] DEFAULT '{}'::text[],
    cons text[] DEFAULT '{}'::text[],
    red_flags text[] DEFAULT '{}'::text[],
    green_flags text[] DEFAULT '{}'::text[],
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT romantic_relationships_affection_score_check CHECK (((affection_score >= (0)::double precision) AND (affection_score <= (1)::double precision))),
    CONSTRAINT romantic_relationships_ambiguity_level_check CHECK (((ambiguity_level >= (0)::double precision) AND (ambiguity_level <= (1)::double precision))),
    CONSTRAINT romantic_relationships_compatibility_score_check CHECK (((compatibility_score >= (0)::double precision) AND (compatibility_score <= (1)::double precision))),
    CONSTRAINT romantic_relationships_emotional_connection_check CHECK (((emotional_connection >= (0)::double precision) AND (emotional_connection <= (1)::double precision))),
    CONSTRAINT romantic_relationships_emotional_intensity_check CHECK (((emotional_intensity >= (0)::double precision) AND (emotional_intensity <= (1)::double precision))),
    CONSTRAINT romantic_relationships_exclusivity_status_check CHECK ((exclusivity_status = ANY (ARRAY['exclusive'::text, 'non_exclusive'::text, 'unknown'::text, 'complicated'::text]))),
    CONSTRAINT romantic_relationships_love_status_check CHECK ((love_status = ANY (ARRAY['in_love'::text, 'falling_in_love'::text, 'loved'::text, 'love_faded'::text, 'never_loved'::text, 'uncertain'::text]))),
    CONSTRAINT romantic_relationships_person_type_check CHECK ((person_type = ANY (ARRAY['character'::text, 'omega_entity'::text]))),
    CONSTRAINT romantic_relationships_physical_attraction_check CHECK (((physical_attraction >= (0)::double precision) AND (physical_attraction <= (1)::double precision))),
    CONSTRAINT romantic_relationships_relationship_health_check CHECK (((relationship_health >= (0)::double precision) AND (relationship_health <= (1)::double precision))),
    CONSTRAINT romantic_relationships_relationship_type_check CHECK ((relationship_type = ANY (ARRAY['boyfriend'::text, 'girlfriend'::text, 'wife'::text, 'husband'::text, 'fiancé'::text, 'fiancée'::text, 'lover'::text, 'fuck_buddy'::text, 'crush'::text, 'obsession'::text, 'infatuation'::text, 'lust'::text, 'ex_boyfriend'::text, 'ex_girlfriend'::text, 'ex_wife'::text, 'ex_husband'::text, 'situationship'::text, 'dating'::text, 'talking'::text, 'hooking_up'::text, 'one_night_stand'::text, 'complicated'::text, 'on_break'::text, 'friends_with_benefits'::text, 'ex_lover'::text, 'in_love'::text]))),
    CONSTRAINT romantic_relationships_status_check CHECK ((status = ANY (ARRAY['active'::text, 'on_break'::text, 'ended'::text, 'complicated'::text, 'paused'::text, 'ghosted'::text, 'blocked'::text, 'unrequited'::text, 'fading'::text, 'rekindled'::text])))
);


--
-- Name: salience_scores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.salience_scores (
    user_id uuid NOT NULL,
    target_kind text NOT NULL,
    target_id uuid NOT NULL,
    score double precision DEFAULT 0.5 NOT NULL,
    components jsonb DEFAULT '{}'::jsonb NOT NULL,
    computed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: shadow_extraction_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shadow_extraction_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    message_id uuid NOT NULL,
    user_id uuid NOT NULL,
    merged_extraction jsonb,
    merged_error text,
    merged_token_count integer DEFAULT 0 NOT NULL,
    merged_call_count integer DEFAULT 1 NOT NULL,
    merged_runtime_ms integer DEFAULT 0 NOT NULL,
    baseline_entities jsonb DEFAULT '[]'::jsonb NOT NULL,
    baseline_relationships jsonb DEFAULT '[]'::jsonb NOT NULL,
    baseline_interests jsonb DEFAULT '[]'::jsonb NOT NULL,
    baseline_romantic_signals jsonb DEFAULT '[]'::jsonb NOT NULL,
    baseline_token_count_est integer DEFAULT 0 NOT NULL,
    baseline_call_count_est integer DEFAULT 0 NOT NULL,
    entity_recall numeric(4,3),
    entity_precision numeric(4,3),
    relationship_recall numeric(4,3),
    relationship_precision numeric(4,3),
    romantic_signal_recall numeric(4,3),
    romantic_signal_precision numeric(4,3),
    interest_recall numeric(4,3),
    token_ratio numeric(6,4),
    call_ratio numeric(6,4),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    entity_f1 numeric(4,3),
    relationship_f1 numeric(4,3),
    romantic_signal_f1 numeric(4,3),
    interest_f1 numeric(4,3),
    token_reduction_pct numeric(6,1),
    call_reduction_pct numeric(6,1),
    latency_reduction_pct numeric(6,1),
    novel_entities jsonb DEFAULT '[]'::jsonb NOT NULL,
    novel_relationships jsonb DEFAULT '[]'::jsonb NOT NULL,
    novel_experiences jsonb DEFAULT '[]'::jsonb NOT NULL,
    novel_entity_count integer DEFAULT 0 NOT NULL,
    novel_relationship_count integer DEFAULT 0 NOT NULL,
    novel_experience_count integer DEFAULT 0 NOT NULL,
    baseline_experiences jsonb DEFAULT '[]'::jsonb NOT NULL
);


--
-- Name: TABLE shadow_extraction_log; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.shadow_extraction_log IS 'Phase 0 shadow mode diagnostic table. Safe to truncate. Auto-expire after 60 days via cleanup job.';


--
-- Name: skill_clusters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.skill_clusters (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    cluster_name text NOT NULL,
    skill_ids uuid[] NOT NULL,
    cluster_type text,
    description text,
    confidence double precision DEFAULT 0.7,
    evidence_count integer DEFAULT 1,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT skill_clusters_confidence_check CHECK (((confidence >= (0)::double precision) AND (confidence <= (1)::double precision)))
);


--
-- Name: skill_evidence; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.skill_evidence (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    skill_id uuid,
    suggestion_id uuid,
    evidence_text text NOT NULL,
    source_type text DEFAULT 'chat'::text NOT NULL,
    source_id text,
    confidence numeric,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: skill_progress; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.skill_progress (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    skill_id uuid NOT NULL,
    user_id uuid NOT NULL,
    xp_gained integer NOT NULL,
    level_before integer NOT NULL,
    level_after integer NOT NULL,
    source_type text NOT NULL,
    source_id uuid,
    notes text,
    "timestamp" timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT skill_progress_source_type_check CHECK ((source_type = ANY (ARRAY['memory'::text, 'achievement'::text, 'manual'::text]))),
    CONSTRAINT skill_progress_xp_gained_check CHECK ((xp_gained > 0))
);


--
-- Name: skill_relationships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.skill_relationships (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    from_skill_id uuid NOT NULL,
    to_skill_id uuid NOT NULL,
    relationship_type text NOT NULL,
    confidence double precision DEFAULT 0.7,
    strength double precision DEFAULT 0.5,
    evidence_count integer DEFAULT 1,
    evidence_source_ids uuid[],
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT skill_relationships_confidence_check CHECK (((confidence >= (0)::double precision) AND (confidence <= (1)::double precision))),
    CONSTRAINT skill_relationships_relationship_type_check CHECK ((relationship_type = ANY (ARRAY['prerequisite_for'::text, 'requires'::text, 'builds_on'::text, 'foundation_for'::text, 'complements'::text, 'synergizes_with'::text, 'related_to'::text, 'specialization_of'::text, 'generalization_of'::text, 'alternative_to'::text, 'evolves_into'::text, 'learned_with'::text, 'practiced_with'::text, 'taught_with'::text, 'transfers_to'::text, 'applies_to'::text]))),
    CONSTRAINT skill_relationships_strength_check CHECK (((strength >= (0)::double precision) AND (strength <= (1)::double precision)))
);


--
-- Name: skill_suggestions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.skill_suggestions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    skill_name text NOT NULL,
    skill_category text DEFAULT 'other'::text NOT NULL,
    skill_type text DEFAULT 'professional'::text NOT NULL,
    monetization text DEFAULT 'unpaid'::text NOT NULL,
    proficiency integer DEFAULT 50 NOT NULL,
    confidence numeric DEFAULT 0.5 NOT NULL,
    enjoyment integer DEFAULT 50 NOT NULL,
    usage_frequency text DEFAULT 'rarely'::text NOT NULL,
    trajectory text DEFAULT 'unknown'::text NOT NULL,
    description text,
    origin_story text,
    first_learned_context text,
    related_jobs jsonb DEFAULT '[]'::jsonb NOT NULL,
    related_projects jsonb DEFAULT '[]'::jsonb NOT NULL,
    evidence jsonb DEFAULT '[]'::jsonb NOT NULL,
    source_message_id text,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    parent_skill_name text,
    related_skill_names jsonb DEFAULT '[]'::jsonb NOT NULL,
    CONSTRAINT skill_suggestions_confidence_check CHECK (((confidence >= (0)::numeric) AND (confidence <= (1)::numeric))),
    CONSTRAINT skill_suggestions_enjoyment_check CHECK (((enjoyment >= 1) AND (enjoyment <= 100))),
    CONSTRAINT skill_suggestions_proficiency_check CHECK (((proficiency >= 1) AND (proficiency <= 100))),
    CONSTRAINT skill_suggestions_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'rejected'::text])))
);


--
-- Name: skill_usage_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.skill_usage_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    skill_id uuid NOT NULL,
    used_at timestamp with time zone DEFAULT now() NOT NULL,
    context text,
    source_message_id text,
    enjoyment integer,
    CONSTRAINT skill_usage_events_enjoyment_check CHECK (((enjoyment IS NULL) OR ((enjoyment >= 1) AND (enjoyment <= 100))))
);


--
-- Name: skills; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.skills (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    skill_name text NOT NULL,
    skill_category text,
    proficiency_level text,
    description text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    current_level integer DEFAULT 1,
    total_xp integer DEFAULT 0,
    xp_to_next_level integer DEFAULT 100,
    first_mentioned_at timestamp with time zone,
    last_practiced_at timestamp with time zone,
    practice_count integer DEFAULT 0,
    auto_detected boolean DEFAULT false,
    confidence_score numeric(3,2) DEFAULT 0.5,
    is_active boolean DEFAULT true
);


--
-- Name: social_communities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.social_communities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    type text,
    description text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    theme text
);


--
-- Name: subscription_usage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscription_usage (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    month date NOT NULL,
    entry_count integer DEFAULT 0 NOT NULL,
    ai_requests_count integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    stripe_customer_id text,
    stripe_subscription_id text,
    status public.subscription_status DEFAULT 'active'::public.subscription_status NOT NULL,
    plan_type public.plan_type DEFAULT 'free'::public.plan_type NOT NULL,
    trial_ends_at timestamp with time zone,
    current_period_start timestamp with time zone,
    current_period_end timestamp with time zone,
    cancel_at_period_end boolean DEFAULT false NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: suggestion_dismissal_stats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.suggestion_dismissal_stats (
    user_id uuid NOT NULL,
    book_domain text NOT NULL,
    normalized_name text NOT NULL,
    dismiss_count integer DEFAULT 0 NOT NULL,
    is_permanent boolean DEFAULT false NOT NULL,
    last_dismissed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT suggestion_dismissal_stats_book_domain_check CHECK ((book_domain = ANY (ARRAY['projects'::text, 'skills'::text, 'quests'::text, 'locations'::text, 'characters'::text]))),
    CONSTRAINT suggestion_dismissal_stats_dismiss_count_check CHECK ((dismiss_count >= 0))
);


--
-- Name: suggestion_thread_dismissals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.suggestion_thread_dismissals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    book_domain text NOT NULL,
    normalized_name text NOT NULL,
    thread_id text NOT NULL,
    dismissed_at timestamp with time zone DEFAULT now() NOT NULL,
    source_suggestion_id text,
    CONSTRAINT suggestion_thread_dismissals_book_domain_check CHECK ((book_domain = ANY (ARRAY['projects'::text, 'skills'::text, 'quests'::text, 'locations'::text, 'characters'::text])))
);


--
-- Name: system_knowledge; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_knowledge (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    concept text NOT NULL,
    description text NOT NULL,
    source_file text,
    route text,
    service_name text,
    schema_name text,
    confidence real DEFAULT 1.0 NOT NULL,
    last_verified_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: task_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.task_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    task_id uuid,
    event_type text NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now(),
    metadata jsonb DEFAULT '{}'::jsonb
);


--
-- Name: tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    category text DEFAULT 'admin'::text NOT NULL,
    intent text,
    source text DEFAULT 'manual'::text NOT NULL,
    status text DEFAULT 'incomplete'::text NOT NULL,
    priority integer DEFAULT 3 NOT NULL,
    urgency integer DEFAULT 1 NOT NULL,
    impact integer DEFAULT 1 NOT NULL,
    effort integer DEFAULT 0 NOT NULL,
    due_date timestamp with time zone,
    external_id text,
    external_source text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: terms_acceptance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.terms_acceptance (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    version text DEFAULT '1.0'::text NOT NULL,
    accepted_at timestamp with time zone DEFAULT now() NOT NULL,
    ip_address text,
    user_agent text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: text_message_uploads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.text_message_uploads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    character_id uuid,
    character_media_id uuid,
    storage_path text,
    public_url text,
    extracted_text text,
    platform text,
    counterpart_name text,
    analysis jsonb DEFAULT '{}'::jsonb NOT NULL,
    source text DEFAULT 'chat'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE text_message_uploads; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.text_message_uploads IS 'Archive of uploaded DM/text-message screenshots with AI-extracted transcripts.';


--
-- Name: timeline_actions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.timeline_actions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    parent_id uuid,
    title text NOT NULL,
    description text,
    start_date timestamp with time zone NOT NULL,
    end_date timestamp with time zone,
    tags text[] DEFAULT '{}'::text[],
    source_type text DEFAULT 'manual'::text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT timeline_actions_source_type_check CHECK ((source_type = ANY (ARRAY['import'::text, 'manual'::text, 'ai'::text])))
);


--
-- Name: timeline_arcs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.timeline_arcs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    parent_id uuid,
    title text NOT NULL,
    description text,
    start_date timestamp with time zone NOT NULL,
    end_date timestamp with time zone,
    tags text[] DEFAULT '{}'::text[],
    source_type text DEFAULT 'manual'::text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT timeline_arcs_source_type_check CHECK ((source_type = ANY (ARRAY['import'::text, 'manual'::text, 'ai'::text])))
);


--
-- Name: timeline_epochs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.timeline_epochs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    parent_id uuid,
    title text NOT NULL,
    description text,
    start_date timestamp with time zone NOT NULL,
    end_date timestamp with time zone,
    tags text[] DEFAULT '{}'::text[],
    source_type text DEFAULT 'manual'::text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT timeline_epochs_source_type_check CHECK ((source_type = ANY (ARRAY['import'::text, 'manual'::text, 'ai'::text])))
);


--
-- Name: timeline_eras; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.timeline_eras (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    parent_id uuid,
    title text NOT NULL,
    description text,
    start_date timestamp with time zone NOT NULL,
    end_date timestamp with time zone,
    tags text[] DEFAULT '{}'::text[],
    source_type text DEFAULT 'manual'::text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT timeline_eras_source_type_check CHECK ((source_type = ANY (ARRAY['import'::text, 'manual'::text, 'ai'::text])))
);


--
-- Name: timeline_memberships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.timeline_memberships (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    journal_entry_id uuid NOT NULL,
    timeline_id uuid NOT NULL,
    role text,
    importance_score numeric(3,2) DEFAULT 0.5,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT timeline_memberships_importance_score_check CHECK (((importance_score >= (0)::numeric) AND (importance_score <= (1)::numeric)))
);


--
-- Name: timeline_microactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.timeline_microactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    parent_id uuid,
    title text NOT NULL,
    description text,
    start_date timestamp with time zone NOT NULL,
    end_date timestamp with time zone,
    tags text[] DEFAULT '{}'::text[],
    source_type text DEFAULT 'manual'::text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT timeline_microactions_source_type_check CHECK ((source_type = ANY (ARRAY['import'::text, 'manual'::text, 'ai'::text])))
);


--
-- Name: timeline_mythos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.timeline_mythos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    start_date timestamp with time zone NOT NULL,
    end_date timestamp with time zone,
    tags text[] DEFAULT '{}'::text[],
    source_type text DEFAULT 'manual'::text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT timeline_mythos_source_type_check CHECK ((source_type = ANY (ARRAY['import'::text, 'manual'::text, 'ai'::text])))
);


--
-- Name: timeline_relationships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.timeline_relationships (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    source_timeline_id uuid NOT NULL,
    target_timeline_id uuid NOT NULL,
    relationship_type text NOT NULL,
    description text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT timeline_relationships_check CHECK ((source_timeline_id <> target_timeline_id)),
    CONSTRAINT timeline_relationships_relationship_type_check CHECK ((relationship_type = ANY (ARRAY['spawned'::text, 'influenced'::text, 'overlapped'::text, 'preceded'::text, 'merged'::text, 'split'::text])))
);


--
-- Name: timeline_sagas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.timeline_sagas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    parent_id uuid,
    title text NOT NULL,
    description text,
    start_date timestamp with time zone NOT NULL,
    end_date timestamp with time zone,
    tags text[] DEFAULT '{}'::text[],
    source_type text DEFAULT 'manual'::text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT timeline_sagas_source_type_check CHECK ((source_type = ANY (ARRAY['import'::text, 'manual'::text, 'ai'::text])))
);


--
-- Name: timeline_scenes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.timeline_scenes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    parent_id uuid,
    title text NOT NULL,
    description text,
    start_date timestamp with time zone NOT NULL,
    end_date timestamp with time zone,
    tags text[] DEFAULT '{}'::text[],
    source_type text DEFAULT 'manual'::text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT timeline_scenes_source_type_check CHECK ((source_type = ANY (ARRAY['import'::text, 'manual'::text, 'ai'::text])))
);


--
-- Name: timeline_search_index; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.timeline_search_index (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    layer_type text NOT NULL,
    layer_id uuid NOT NULL,
    search_text text NOT NULL,
    tags text[] DEFAULT '{}'::text[],
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT timeline_search_index_layer_type_check CHECK ((layer_type = ANY (ARRAY['mythos'::text, 'epoch'::text, 'era'::text, 'saga'::text, 'arc'::text, 'chapter'::text, 'scene'::text, 'action'::text, 'microaction'::text])))
);


--
-- Name: timelines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.timelines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    timeline_type text NOT NULL,
    parent_id uuid,
    start_date timestamp with time zone NOT NULL,
    end_date timestamp with time zone,
    tags text[] DEFAULT '{}'::text[],
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT timelines_timeline_type_check CHECK ((timeline_type = ANY (ARRAY['life_era'::text, 'sub_timeline'::text, 'skill'::text, 'location'::text, 'work'::text, 'custom'::text])))
);


--
-- Name: user_activity_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_activity_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    action text NOT NULL,
    ip_address text,
    user_agent text,
    device text,
    location text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    "timestamp" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_chronology_order; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_chronology_order (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    scope_type text NOT NULL,
    scope_id uuid DEFAULT '00000000-0000-0000-0000-000000000000'::uuid NOT NULL,
    item_kind text NOT NULL,
    item_id uuid NOT NULL,
    sort_index integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_chronology_order_item_kind_check CHECK ((item_kind = ANY (ARRAY['moment'::text, 'event'::text]))),
    CONSTRAINT user_chronology_order_scope_type_check CHECK ((scope_type = ANY (ARRAY['global'::text, 'life_arc'::text])))
);


--
-- Name: TABLE user_chronology_order; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.user_chronology_order IS 'User drag-reorder overrides for stitched timeline views';


--
-- Name: user_corrections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_corrections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    correction_type text NOT NULL,
    original_value text NOT NULL,
    corrected_value text NOT NULL,
    context text,
    source_message_id uuid,
    source_unit_id text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    used_for_training boolean DEFAULT false,
    training_used_at timestamp with time zone
);


--
-- Name: user_files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_files (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    filename text NOT NULL,
    mime_type text NOT NULL,
    sha256 text NOT NULL,
    storage_url text,
    uploaded_at timestamp with time zone DEFAULT now() NOT NULL,
    processing_status text DEFAULT 'pending'::text NOT NULL,
    ingest_kind text,
    derived_counts jsonb DEFAULT '{"facts": 0, "events": 0, "moments": 0, "entities": 0, "relationships": 0}'::jsonb NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    error_message text,
    CONSTRAINT user_files_processing_status_check CHECK ((processing_status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'failed'::text])))
);


--
-- Name: TABLE user_files; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.user_files IS 'Canonical registry for every user-uploaded artifact; all ingestion flows through this table.';


--
-- Name: user_inference_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_inference_state (
    user_id uuid NOT NULL,
    last_chat_at timestamp with time zone,
    last_t1_run_at timestamp with time zone,
    last_t2_run_at timestamp with time zone,
    pending_reasons jsonb DEFAULT '[]'::jsonb NOT NULL,
    domain_timestamps jsonb DEFAULT '{}'::jsonb NOT NULL,
    last_report jsonb,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE user_inference_state; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.user_inference_state IS 'Orchestrator throttle + staleness for lore inference jobs';


--
-- Name: utterances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.utterances (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    message_id uuid NOT NULL,
    user_id uuid NOT NULL,
    normalized_text text NOT NULL,
    original_text text NOT NULL,
    language text DEFAULT 'en'::text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb
);


--
-- Name: achievement_templates achievement_templates_achievement_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.achievement_templates
    ADD CONSTRAINT achievement_templates_achievement_name_key UNIQUE (achievement_name);


--
-- Name: achievement_templates achievement_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.achievement_templates
    ADD CONSTRAINT achievement_templates_pkey PRIMARY KEY (id);


--
-- Name: achievements achievements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.achievements
    ADD CONSTRAINT achievements_pkey PRIMARY KEY (id);


--
-- Name: api_rate_limit_buckets api_rate_limit_buckets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_rate_limit_buckets
    ADD CONSTRAINT api_rate_limit_buckets_pkey PRIMARY KEY (bucket_key);


--
-- Name: arc_event_links arc_event_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.arc_event_links
    ADD CONSTRAINT arc_event_links_pkey PRIMARY KEY (id);


--
-- Name: arc_memberships arc_memberships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.arc_memberships
    ADD CONSTRAINT arc_memberships_pkey PRIMARY KEY (id);


--
-- Name: arc_relationships arc_relationships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.arc_relationships
    ADD CONSTRAINT arc_relationships_pkey PRIMARY KEY (id);


--
-- Name: assertion_evidence assertion_evidence_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assertion_evidence
    ADD CONSTRAINT assertion_evidence_pkey PRIMARY KEY (id);


--
-- Name: association_edges association_edges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.association_edges
    ADD CONSTRAINT association_edges_pkey PRIMARY KEY (id);


--
-- Name: association_edges association_edges_user_id_source_entity_id_association_type_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.association_edges
    ADD CONSTRAINT association_edges_user_id_source_entity_id_association_type_key UNIQUE (user_id, source_entity_id, association_type, target_entity_id);


--
-- Name: autobiographical_meaning_artifacts autobiographical_meaning_artifacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.autobiographical_meaning_artifacts
    ADD CONSTRAINT autobiographical_meaning_artifacts_pkey PRIMARY KEY (id);


--
-- Name: chapters chapters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chapters
    ADD CONSTRAINT chapters_pkey PRIMARY KEY (id);


--
-- Name: character_authority_map character_authority_map_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.character_authority_map
    ADD CONSTRAINT character_authority_map_pkey PRIMARY KEY (id);


--
-- Name: character_authority_map character_authority_map_user_id_source_table_source_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.character_authority_map
    ADD CONSTRAINT character_authority_map_user_id_source_table_source_id_key UNIQUE (user_id, source_table, source_id);


--
-- Name: character_identity_index character_identity_index_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.character_identity_index
    ADD CONSTRAINT character_identity_index_pkey PRIMARY KEY (id);


--
-- Name: character_media character_media_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.character_media
    ADD CONSTRAINT character_media_pkey PRIMARY KEY (id);


--
-- Name: character_memories character_memories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.character_memories
    ADD CONSTRAINT character_memories_pkey PRIMARY KEY (id);


--
-- Name: character_memories character_memories_user_id_character_id_journal_entry_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.character_memories
    ADD CONSTRAINT character_memories_user_id_character_id_journal_entry_id_key UNIQUE (user_id, character_id, journal_entry_id);


--
-- Name: character_relationships character_relationships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.character_relationships
    ADD CONSTRAINT character_relationships_pkey PRIMARY KEY (id);


--
-- Name: character_relationships character_relationships_user_id_source_character_id_target__key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.character_relationships
    ADD CONSTRAINT character_relationships_user_id_source_character_id_target__key UNIQUE (user_id, source_character_id, target_character_id, relationship_type);


--
-- Name: character_timeline_events character_timeline_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.character_timeline_events
    ADD CONSTRAINT character_timeline_events_pkey PRIMARY KEY (id);


--
-- Name: character_timeline_events character_timeline_events_user_id_character_id_event_id_tim_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.character_timeline_events
    ADD CONSTRAINT character_timeline_events_user_id_character_id_event_id_tim_key UNIQUE (user_id, character_id, event_id, timeline_type);


--
-- Name: characters characters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.characters
    ADD CONSTRAINT characters_pkey PRIMARY KEY (id);


--
-- Name: characters characters_user_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.characters
    ADD CONSTRAINT characters_user_id_name_key UNIQUE (user_id, name);


--
-- Name: chat_contexts chat_contexts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_contexts
    ADD CONSTRAINT chat_contexts_pkey PRIMARY KEY (id);


--
-- Name: chat_contexts chat_contexts_user_id_session_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_contexts
    ADD CONSTRAINT chat_contexts_user_id_session_id_key UNIQUE (user_id, session_id);


--
-- Name: chat_message_revisions chat_message_revisions_message_id_revision_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_message_revisions
    ADD CONSTRAINT chat_message_revisions_message_id_revision_key UNIQUE (message_id, revision);


--
-- Name: chat_message_revisions chat_message_revisions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_message_revisions
    ADD CONSTRAINT chat_message_revisions_pkey PRIMARY KEY (id);


--
-- Name: chat_messages chat_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_pkey PRIMARY KEY (id);


--
-- Name: chat_sessions chat_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_sessions
    ADD CONSTRAINT chat_sessions_pkey PRIMARY KEY (id);


--
-- Name: chat_sessions chat_sessions_user_id_session_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_sessions
    ADD CONSTRAINT chat_sessions_user_id_session_id_key UNIQUE (user_id, session_id);


--
-- Name: chronology_index chronology_index_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chronology_index
    ADD CONSTRAINT chronology_index_pkey PRIMARY KEY (id);


--
-- Name: chronology_index chronology_index_user_id_journal_entry_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chronology_index
    ADD CONSTRAINT chronology_index_user_id_journal_entry_id_key UNIQUE (user_id, journal_entry_id);


--
-- Name: chronology_order_corrections chronology_order_corrections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chronology_order_corrections
    ADD CONSTRAINT chronology_order_corrections_pkey PRIMARY KEY (id);


--
-- Name: chronology_snapshots chronology_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chronology_snapshots
    ADD CONSTRAINT chronology_snapshots_pkey PRIMARY KEY (id);


--
-- Name: chronology_snapshots chronology_snapshots_user_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chronology_snapshots
    ADD CONSTRAINT chronology_snapshots_user_unique UNIQUE (user_id);


--
-- Name: classifications classifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classifications
    ADD CONSTRAINT classifications_pkey PRIMARY KEY (id);


--
-- Name: continuity_events continuity_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.continuity_events
    ADD CONSTRAINT continuity_events_pkey PRIMARY KEY (id);


--
-- Name: continuity_snapshots continuity_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.continuity_snapshots
    ADD CONSTRAINT continuity_snapshots_pkey PRIMARY KEY (id);


--
-- Name: contradiction_signals contradiction_signals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contradiction_signals
    ADD CONSTRAINT contradiction_signals_pkey PRIMARY KEY (id);


--
-- Name: contradiction_signals contradiction_signals_user_id_type_category_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contradiction_signals
    ADD CONSTRAINT contradiction_signals_user_id_type_category_key_key UNIQUE (user_id, type, category_key);


--
-- Name: conversation_compactions conversation_compactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_compactions
    ADD CONSTRAINT conversation_compactions_pkey PRIMARY KEY (id);


--
-- Name: conversation_messages conversation_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_messages
    ADD CONSTRAINT conversation_messages_pkey PRIMARY KEY (id);


--
-- Name: conversation_sessions conversation_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_sessions
    ADD CONSTRAINT conversation_sessions_pkey PRIMARY KEY (id);


--
-- Name: correction_records correction_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.correction_records
    ADD CONSTRAINT correction_records_pkey PRIMARY KEY (id);


--
-- Name: crystallized_knowledge crystallized_knowledge_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crystallized_knowledge
    ADD CONSTRAINT crystallized_knowledge_pkey PRIMARY KEY (id);


--
-- Name: daily_summaries daily_summaries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_summaries
    ADD CONSTRAINT daily_summaries_pkey PRIMARY KEY (id);


--
-- Name: daily_summaries daily_summaries_user_id_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_summaries
    ADD CONSTRAINT daily_summaries_user_id_date_key UNIQUE (user_id, date);


--
-- Name: embedding_model_registry embedding_model_registry_model_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.embedding_model_registry
    ADD CONSTRAINT embedding_model_registry_model_name_key UNIQUE (model_name);


--
-- Name: embedding_model_registry embedding_model_registry_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.embedding_model_registry
    ADD CONSTRAINT embedding_model_registry_pkey PRIMARY KEY (id);


--
-- Name: engine_dependencies engine_dependencies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engine_dependencies
    ADD CONSTRAINT engine_dependencies_pkey PRIMARY KEY (engine_name, depends_on);


--
-- Name: engine_results engine_results_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engine_results
    ADD CONSTRAINT engine_results_pkey PRIMARY KEY (id);


--
-- Name: engine_results engine_results_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engine_results
    ADD CONSTRAINT engine_results_user_id_key UNIQUE (user_id);


--
-- Name: entity_aliases entity_aliases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_aliases
    ADD CONSTRAINT entity_aliases_pkey PRIMARY KEY (id);


--
-- Name: entity_authority_decisions entity_authority_decisions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_authority_decisions
    ADD CONSTRAINT entity_authority_decisions_pkey PRIMARY KEY (id);


--
-- Name: entity_conversation_links entity_conversation_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_conversation_links
    ADD CONSTRAINT entity_conversation_links_pkey PRIMARY KEY (id);


--
-- Name: entity_conversation_links entity_conversation_links_user_id_entity_type_entity_id_ses_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_conversation_links
    ADD CONSTRAINT entity_conversation_links_user_id_entity_type_entity_id_ses_key UNIQUE (user_id, entity_type, entity_id, session_id);


--
-- Name: entity_deletion_events entity_deletion_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_deletion_events
    ADD CONSTRAINT entity_deletion_events_pkey PRIMARY KEY (id);


--
-- Name: entity_facts entity_facts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_facts
    ADD CONSTRAINT entity_facts_pkey PRIMARY KEY (id);


--
-- Name: entity_gravity_scores entity_gravity_scores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_gravity_scores
    ADD CONSTRAINT entity_gravity_scores_pkey PRIMARY KEY (user_id, entity_id, entity_type);


--
-- Name: entity_merge_log entity_merge_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_merge_log
    ADD CONSTRAINT entity_merge_log_pkey PRIMARY KEY (id);


--
-- Name: entity_merge_records entity_merge_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_merge_records
    ADD CONSTRAINT entity_merge_records_pkey PRIMARY KEY (id);


--
-- Name: entity_questions entity_questions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_questions
    ADD CONSTRAINT entity_questions_pkey PRIMARY KEY (id);


--
-- Name: entity_resolution_cache entity_resolution_cache_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_resolution_cache
    ADD CONSTRAINT entity_resolution_cache_pkey PRIMARY KEY (id);


--
-- Name: entity_resolution_cache entity_resolution_cache_user_id_entity_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_resolution_cache
    ADD CONSTRAINT entity_resolution_cache_user_id_entity_name_key UNIQUE (user_id, entity_name);


--
-- Name: entry_dependencies entry_dependencies_entry_id_dependency_type_dependency_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entry_dependencies
    ADD CONSTRAINT entry_dependencies_entry_id_dependency_type_dependency_id_key UNIQUE (entry_id, dependency_type, dependency_id);


--
-- Name: entry_dependencies entry_dependencies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entry_dependencies
    ADD CONSTRAINT entry_dependencies_pkey PRIMARY KEY (id);


--
-- Name: entry_ir entry_ir_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entry_ir
    ADD CONSTRAINT entry_ir_pkey PRIMARY KEY (id);


--
-- Name: epiphany_insights epiphany_insights_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.epiphany_insights
    ADD CONSTRAINT epiphany_insights_pkey PRIMARY KEY (id);


--
-- Name: episodes episodes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.episodes
    ADD CONSTRAINT episodes_pkey PRIMARY KEY (id);


--
-- Name: episodes episodes_user_id_source_thread_id_episode_index_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.episodes
    ADD CONSTRAINT episodes_user_id_source_thread_id_episode_index_key UNIQUE (user_id, source_thread_id, episode_index);


--
-- Name: event_candidates event_candidates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_candidates
    ADD CONSTRAINT event_candidates_pkey PRIMARY KEY (id);


--
-- Name: event_causal_links event_causal_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_causal_links
    ADD CONSTRAINT event_causal_links_pkey PRIMARY KEY (id);


--
-- Name: event_causal_links event_causal_links_user_id_cause_event_id_effect_event_id_c_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_causal_links
    ADD CONSTRAINT event_causal_links_user_id_cause_event_id_effect_event_id_c_key UNIQUE (user_id, cause_event_id, effect_event_id, causal_type);


--
-- Name: event_cognitions event_cognitions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_cognitions
    ADD CONSTRAINT event_cognitions_pkey PRIMARY KEY (id);


--
-- Name: event_confidence_snapshots event_confidence_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_confidence_snapshots
    ADD CONSTRAINT event_confidence_snapshots_pkey PRIMARY KEY (id);


--
-- Name: event_continuity_links event_continuity_links_current_event_id_past_event_id_conti_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_continuity_links
    ADD CONSTRAINT event_continuity_links_current_event_id_past_event_id_conti_key UNIQUE (current_event_id, past_event_id, continuity_type);


--
-- Name: event_continuity_links event_continuity_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_continuity_links
    ADD CONSTRAINT event_continuity_links_pkey PRIMARY KEY (id);


--
-- Name: event_emotions event_emotions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_emotions
    ADD CONSTRAINT event_emotions_pkey PRIMARY KEY (id);


--
-- Name: event_identity_impacts event_identity_impacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_identity_impacts
    ADD CONSTRAINT event_identity_impacts_pkey PRIMARY KEY (id);


--
-- Name: event_impacts event_impacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_impacts
    ADD CONSTRAINT event_impacts_pkey PRIMARY KEY (id);


--
-- Name: event_impacts event_impacts_user_id_event_id_impact_type_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_impacts
    ADD CONSTRAINT event_impacts_user_id_event_id_impact_type_key UNIQUE (user_id, event_id, impact_type);


--
-- Name: event_meaning_cache event_meaning_cache_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_meaning_cache
    ADD CONSTRAINT event_meaning_cache_pkey PRIMARY KEY (id);


--
-- Name: event_meaning_cache event_meaning_cache_user_id_event_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_meaning_cache
    ADD CONSTRAINT event_meaning_cache_user_id_event_id_key UNIQUE (user_id, event_id);


--
-- Name: event_mentions event_mentions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_mentions
    ADD CONSTRAINT event_mentions_pkey PRIMARY KEY (id);


--
-- Name: event_records event_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_records
    ADD CONSTRAINT event_records_pkey PRIMARY KEY (id);


--
-- Name: event_unit_links event_unit_links_event_id_unit_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_unit_links
    ADD CONSTRAINT event_unit_links_event_id_unit_id_key UNIQUE (event_id, unit_id);


--
-- Name: event_unit_links event_unit_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_unit_links
    ADD CONSTRAINT event_unit_links_pkey PRIMARY KEY (id);


--
-- Name: external_account_connections external_account_connections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.external_account_connections
    ADD CONSTRAINT external_account_connections_pkey PRIMARY KEY (id);


--
-- Name: external_account_connections external_account_connections_user_id_provider_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.external_account_connections
    ADD CONSTRAINT external_account_connections_user_id_provider_key UNIQUE (user_id, provider);


--
-- Name: extracted_units extracted_units_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extracted_units
    ADD CONSTRAINT extracted_units_pkey PRIMARY KEY (id);


--
-- Name: goal_cognition_audit goal_cognition_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goal_cognition_audit
    ADD CONSTRAINT goal_cognition_audit_pkey PRIMARY KEY (id);


--
-- Name: goal_insights goal_insights_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goal_insights
    ADD CONSTRAINT goal_insights_pkey PRIMARY KEY (id);


--
-- Name: goals goals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goals
    ADD CONSTRAINT goals_pkey PRIMARY KEY (id);


--
-- Name: graph_edges graph_edges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.graph_edges
    ADD CONSTRAINT graph_edges_pkey PRIMARY KEY (id);


--
-- Name: graph_nodes graph_nodes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.graph_nodes
    ADD CONSTRAINT graph_nodes_pkey PRIMARY KEY (id);


--
-- Name: group_candidates group_candidates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_candidates
    ADD CONSTRAINT group_candidates_pkey PRIMARY KEY (id);


--
-- Name: group_evolution group_evolution_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_evolution
    ADD CONSTRAINT group_evolution_pkey PRIMARY KEY (id);


--
-- Name: identity_mutations identity_mutations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.identity_mutations
    ADD CONSTRAINT identity_mutations_pkey PRIMARY KEY (id);


--
-- Name: ingestion_dead_letter ingestion_dead_letter_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingestion_dead_letter
    ADD CONSTRAINT ingestion_dead_letter_pkey PRIMARY KEY (id);


--
-- Name: ingestion_jobs ingestion_jobs_idempotency_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingestion_jobs
    ADD CONSTRAINT ingestion_jobs_idempotency_key_key UNIQUE (idempotency_key);


--
-- Name: ingestion_jobs ingestion_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingestion_jobs
    ADD CONSTRAINT ingestion_jobs_pkey PRIMARY KEY (id);


--
-- Name: interest_mentions interest_mentions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interest_mentions
    ADD CONSTRAINT interest_mentions_pkey PRIMARY KEY (id);


--
-- Name: interest_scope_groups interest_scope_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interest_scope_groups
    ADD CONSTRAINT interest_scope_groups_pkey PRIMARY KEY (id);


--
-- Name: interest_scope_groups interest_scope_groups_user_id_scope_scope_context_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interest_scope_groups
    ADD CONSTRAINT interest_scope_groups_user_id_scope_scope_context_key UNIQUE (user_id, scope, scope_context);


--
-- Name: interest_scopes interest_scopes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interest_scopes
    ADD CONSTRAINT interest_scopes_pkey PRIMARY KEY (id);


--
-- Name: interest_scopes interest_scopes_user_id_interest_id_scope_scope_context_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interest_scopes
    ADD CONSTRAINT interest_scopes_user_id_interest_id_scope_scope_context_key UNIQUE (user_id, interest_id, scope, scope_context);


--
-- Name: interests interests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interests
    ADD CONSTRAINT interests_pkey PRIMARY KEY (id);


--
-- Name: interests interests_user_id_interest_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interests
    ADD CONSTRAINT interests_user_id_interest_name_key UNIQUE (user_id, interest_name);


--
-- Name: journal_entries journal_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT journal_entries_pkey PRIMARY KEY (id);


--
-- Name: knowledge_gaps knowledge_gaps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_gaps
    ADD CONSTRAINT knowledge_gaps_pkey PRIMARY KEY (id);


--
-- Name: knowledge_units knowledge_units_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_units
    ADD CONSTRAINT knowledge_units_pkey PRIMARY KEY (id);


--
-- Name: lexical_analysis_results lexical_analysis_results_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lexical_analysis_results
    ADD CONSTRAINT lexical_analysis_results_pkey PRIMARY KEY (id);


--
-- Name: life_arcs life_arcs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.life_arcs
    ADD CONSTRAINT life_arcs_pkey PRIMARY KEY (id);


--
-- Name: location_character_links location_character_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_character_links
    ADD CONSTRAINT location_character_links_pkey PRIMARY KEY (id);


--
-- Name: location_character_links location_character_links_user_location_character_relationship_k; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_character_links
    ADD CONSTRAINT location_character_links_user_location_character_relationship_k UNIQUE (user_id, location_id, character_id, relationship_type);


--
-- Name: location_mentions location_mentions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_mentions
    ADD CONSTRAINT location_mentions_pkey PRIMARY KEY (id);


--
-- Name: locations locations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_pkey PRIMARY KEY (id);


--
-- Name: locations locations_user_id_normalized_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_user_id_normalized_name_key UNIQUE (user_id, normalized_name);


--
-- Name: lore_agent_observations lore_agent_observations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lore_agent_observations
    ADD CONSTRAINT lore_agent_observations_pkey PRIMARY KEY (id);


--
-- Name: lore_agent_proposed_actions lore_agent_proposed_actions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lore_agent_proposed_actions
    ADD CONSTRAINT lore_agent_proposed_actions_pkey PRIMARY KEY (id);


--
-- Name: lore_agent_runs lore_agent_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lore_agent_runs
    ADD CONSTRAINT lore_agent_runs_pkey PRIMARY KEY (id);


--
-- Name: lore_topic_ledger lore_topic_ledger_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lore_topic_ledger
    ADD CONSTRAINT lore_topic_ledger_pkey PRIMARY KEY (id);


--
-- Name: lore_topic_ledger lore_topic_ledger_user_id_topic_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lore_topic_ledger
    ADD CONSTRAINT lore_topic_ledger_user_id_topic_key_key UNIQUE (user_id, topic_key);


--
-- Name: mcp_events mcp_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mcp_events
    ADD CONSTRAINT mcp_events_pkey PRIMARY KEY (id);


--
-- Name: mcp_oauth_authorization_codes mcp_oauth_authorization_codes_code_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mcp_oauth_authorization_codes
    ADD CONSTRAINT mcp_oauth_authorization_codes_code_hash_key UNIQUE (code_hash);


--
-- Name: mcp_oauth_authorization_codes mcp_oauth_authorization_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mcp_oauth_authorization_codes
    ADD CONSTRAINT mcp_oauth_authorization_codes_pkey PRIMARY KEY (id);


--
-- Name: mcp_oauth_clients mcp_oauth_clients_client_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mcp_oauth_clients
    ADD CONSTRAINT mcp_oauth_clients_client_id_key UNIQUE (client_id);


--
-- Name: mcp_oauth_clients mcp_oauth_clients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mcp_oauth_clients
    ADD CONSTRAINT mcp_oauth_clients_pkey PRIMARY KEY (id);


--
-- Name: mcp_oauth_refresh_tokens mcp_oauth_refresh_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mcp_oauth_refresh_tokens
    ADD CONSTRAINT mcp_oauth_refresh_tokens_pkey PRIMARY KEY (id);


--
-- Name: mcp_oauth_refresh_tokens mcp_oauth_refresh_tokens_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mcp_oauth_refresh_tokens
    ADD CONSTRAINT mcp_oauth_refresh_tokens_token_hash_key UNIQUE (token_hash);


--
-- Name: mcp_tool_audit_log mcp_tool_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mcp_tool_audit_log
    ADD CONSTRAINT mcp_tool_audit_log_pkey PRIMARY KEY (id);


--
-- Name: mcp_tool_versions mcp_tool_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mcp_tool_versions
    ADD CONSTRAINT mcp_tool_versions_pkey PRIMARY KEY (tool_name, version);


--
-- Name: meaning_resolution_results meaning_resolution_results_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meaning_resolution_results
    ADD CONSTRAINT meaning_resolution_results_pkey PRIMARY KEY (id);


--
-- Name: memoir_outlines memoir_outlines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memoir_outlines
    ADD CONSTRAINT memoir_outlines_pkey PRIMARY KEY (id);


--
-- Name: memoir_outlines memoir_outlines_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memoir_outlines
    ADD CONSTRAINT memoir_outlines_user_id_key UNIQUE (user_id);


--
-- Name: memory_components memory_components_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memory_components
    ADD CONSTRAINT memory_components_pkey PRIMARY KEY (id);


--
-- Name: memory_decisions memory_decisions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memory_decisions
    ADD CONSTRAINT memory_decisions_pkey PRIMARY KEY (id);


--
-- Name: memory_events memory_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memory_events
    ADD CONSTRAINT memory_events_pkey PRIMARY KEY (id);


--
-- Name: memory_proposals memory_proposals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memory_proposals
    ADD CONSTRAINT memory_proposals_pkey PRIMARY KEY (id);


--
-- Name: narrative_accounts narrative_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.narrative_accounts
    ADD CONSTRAINT narrative_accounts_pkey PRIMARY KEY (id);


--
-- Name: narrative_anchor_members narrative_anchor_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.narrative_anchor_members
    ADD CONSTRAINT narrative_anchor_members_pkey PRIMARY KEY (id);


--
-- Name: narrative_anchors narrative_anchors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.narrative_anchors
    ADD CONSTRAINT narrative_anchors_pkey PRIMARY KEY (id);


--
-- Name: narrative_chapters narrative_chapters_life_arc_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.narrative_chapters
    ADD CONSTRAINT narrative_chapters_life_arc_id_key UNIQUE (life_arc_id);


--
-- Name: narrative_chapters narrative_chapters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.narrative_chapters
    ADD CONSTRAINT narrative_chapters_pkey PRIMARY KEY (id);


--
-- Name: narrative_claim_edges narrative_claim_edges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.narrative_claim_edges
    ADD CONSTRAINT narrative_claim_edges_pkey PRIMARY KEY (id);


--
-- Name: narrative_claims narrative_claims_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.narrative_claims
    ADD CONSTRAINT narrative_claims_pkey PRIMARY KEY (id);


--
-- Name: narrative_life_chapters narrative_life_chapters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.narrative_life_chapters
    ADD CONSTRAINT narrative_life_chapters_pkey PRIMARY KEY (id);


--
-- Name: narrative_life_eras narrative_life_eras_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.narrative_life_eras
    ADD CONSTRAINT narrative_life_eras_pkey PRIMARY KEY (id);


--
-- Name: narrative_moments narrative_moments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.narrative_moments
    ADD CONSTRAINT narrative_moments_pkey PRIMARY KEY (id);


--
-- Name: narrative_scenes narrative_scenes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.narrative_scenes
    ADD CONSTRAINT narrative_scenes_pkey PRIMARY KEY (id);


--
-- Name: narrative_story_chapters narrative_story_chapters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.narrative_story_chapters
    ADD CONSTRAINT narrative_story_chapters_pkey PRIMARY KEY (id);


--
-- Name: omega_claims omega_claims_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.omega_claims
    ADD CONSTRAINT omega_claims_pkey PRIMARY KEY (id);


--
-- Name: omega_entities omega_entities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.omega_entities
    ADD CONSTRAINT omega_entities_pkey PRIMARY KEY (id);


--
-- Name: omega_entities omega_entities_user_id_primary_name_type_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.omega_entities
    ADD CONSTRAINT omega_entities_user_id_primary_name_type_key UNIQUE (user_id, primary_name, type);


--
-- Name: omega_evidence omega_evidence_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.omega_evidence
    ADD CONSTRAINT omega_evidence_pkey PRIMARY KEY (id);


--
-- Name: openai_cost_daily openai_cost_daily_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.openai_cost_daily
    ADD CONSTRAINT openai_cost_daily_pkey PRIMARY KEY (day, operation, model);


--
-- Name: organization_events organization_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_events
    ADD CONSTRAINT organization_events_pkey PRIMARY KEY (id);


--
-- Name: organization_locations organization_locations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_locations
    ADD CONSTRAINT organization_locations_pkey PRIMARY KEY (id);


--
-- Name: organization_members organization_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_members
    ADD CONSTRAINT organization_members_pkey PRIMARY KEY (id);


--
-- Name: organization_relationships organization_relationships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_relationships
    ADD CONSTRAINT organization_relationships_pkey PRIMARY KEY (id);


--
-- Name: organization_relationships organization_relationships_user_id_from_org_id_to_org_id_re_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_relationships
    ADD CONSTRAINT organization_relationships_user_id_from_org_id_to_org_id_re_key UNIQUE (user_id, from_org_id, to_org_id, relationship_type);


--
-- Name: organization_stories organization_stories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_stories
    ADD CONSTRAINT organization_stories_pkey PRIMARY KEY (id);


--
-- Name: organization_suggestions organization_suggestions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_suggestions
    ADD CONSTRAINT organization_suggestions_pkey PRIMARY KEY (id);


--
-- Name: organization_suggestions organization_suggestions_user_id_normalized_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_suggestions
    ADD CONSTRAINT organization_suggestions_user_id_normalized_name_key UNIQUE (user_id, normalized_name);


--
-- Name: organizations organizations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);


--
-- Name: original_documents original_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.original_documents
    ADD CONSTRAINT original_documents_pkey PRIMARY KEY (id);


--
-- Name: people_places people_places_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.people_places
    ADD CONSTRAINT people_places_pkey PRIMARY KEY (id);


--
-- Name: people_places people_places_user_id_name_type_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.people_places
    ADD CONSTRAINT people_places_user_id_name_type_key UNIQUE (user_id, name, type);


--
-- Name: perception_entries perception_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.perception_entries
    ADD CONSTRAINT perception_entries_pkey PRIMARY KEY (id);


--
-- Name: perspective_claims perspective_claims_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.perspective_claims
    ADD CONSTRAINT perspective_claims_pkey PRIMARY KEY (id);


--
-- Name: perspective_disputes perspective_disputes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.perspective_disputes
    ADD CONSTRAINT perspective_disputes_pkey PRIMARY KEY (id);


--
-- Name: perspectives perspectives_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.perspectives
    ADD CONSTRAINT perspectives_pkey PRIMARY KEY (id);


--
-- Name: perspectives perspectives_user_id_label_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.perspectives
    ADD CONSTRAINT perspectives_user_id_label_key UNIQUE (user_id, label);


--
-- Name: pipeline_runs pipeline_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pipeline_runs
    ADD CONSTRAINT pipeline_runs_pkey PRIMARY KEY (id);


--
-- Name: platform_openai_spend platform_openai_spend_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_openai_spend
    ADD CONSTRAINT platform_openai_spend_pkey PRIMARY KEY (month);


--
-- Name: preference_evidence preference_evidence_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.preference_evidence
    ADD CONSTRAINT preference_evidence_pkey PRIMARY KEY (id);


--
-- Name: preference_evidence preference_evidence_user_id_signal_id_source_source_id_sign_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.preference_evidence
    ADD CONSTRAINT preference_evidence_user_id_signal_id_source_source_id_sign_key UNIQUE (user_id, signal_id, source, source_id, signal_type);


--
-- Name: preference_signals preference_signals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.preference_signals
    ADD CONSTRAINT preference_signals_pkey PRIMARY KEY (id);


--
-- Name: preference_signals preference_signals_user_id_type_category_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.preference_signals
    ADD CONSTRAINT preference_signals_user_id_type_category_key_key UNIQUE (user_id, type, category_key);


--
-- Name: profile_claim_evidence profile_claim_evidence_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_claim_evidence
    ADD CONSTRAINT profile_claim_evidence_pkey PRIMARY KEY (id);


--
-- Name: profile_claims profile_claims_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_claims
    ADD CONSTRAINT profile_claims_pkey PRIMARY KEY (id);


--
-- Name: profile_claims profile_claims_user_id_claim_type_claim_text_source_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_claims
    ADD CONSTRAINT profile_claims_user_id_claim_type_claim_text_source_key UNIQUE (user_id, claim_type, claim_text, source);


--
-- Name: project_chronicle_meta project_chronicle_meta_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_chronicle_meta
    ADD CONSTRAINT project_chronicle_meta_pkey PRIMARY KEY (key);


--
-- Name: project_chronicle_milestones project_chronicle_milestones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_chronicle_milestones
    ADD CONSTRAINT project_chronicle_milestones_pkey PRIMARY KEY (id);


--
-- Name: project_chronicle_milestones project_chronicle_milestones_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_chronicle_milestones
    ADD CONSTRAINT project_chronicle_milestones_slug_key UNIQUE (slug);


--
-- Name: project_chronicle_pending_detections project_chronicle_pending_detections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_chronicle_pending_detections
    ADD CONSTRAINT project_chronicle_pending_detections_pkey PRIMARY KEY (id);


--
-- Name: project_suggestions project_suggestions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_suggestions
    ADD CONSTRAINT project_suggestions_pkey PRIMARY KEY (id);


--
-- Name: project_suggestions project_suggestions_user_id_normalized_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_suggestions
    ADD CONSTRAINT project_suggestions_user_id_normalized_name_key UNIQUE (user_id, normalized_name);


--
-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);


--
-- Name: projects projects_user_id_normalized_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_user_id_normalized_name_key UNIQUE (user_id, normalized_name);


--
-- Name: provenance_edges provenance_edges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provenance_edges
    ADD CONSTRAINT provenance_edges_pkey PRIMARY KEY (id);


--
-- Name: quest_achievements quest_achievements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quest_achievements
    ADD CONSTRAINT quest_achievements_pkey PRIMARY KEY (id);


--
-- Name: quest_dependencies quest_dependencies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quest_dependencies
    ADD CONSTRAINT quest_dependencies_pkey PRIMARY KEY (id);


--
-- Name: quest_dependencies quest_dependencies_quest_id_depends_on_quest_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quest_dependencies
    ADD CONSTRAINT quest_dependencies_quest_id_depends_on_quest_id_key UNIQUE (quest_id, depends_on_quest_id);


--
-- Name: quest_history quest_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quest_history
    ADD CONSTRAINT quest_history_pkey PRIMARY KEY (id);


--
-- Name: quest_suggestions quest_suggestions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quest_suggestions
    ADD CONSTRAINT quest_suggestions_pkey PRIMARY KEY (id);


--
-- Name: quest_suggestions quest_suggestions_user_id_title_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quest_suggestions
    ADD CONSTRAINT quest_suggestions_user_id_title_key UNIQUE (user_id, title);


--
-- Name: quests quests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quests
    ADD CONSTRAINT quests_pkey PRIMARY KEY (id);


--
-- Name: relationship_type_ontology relationship_type_ontology_category_role_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.relationship_type_ontology
    ADD CONSTRAINT relationship_type_ontology_category_role_key UNIQUE (category, role);


--
-- Name: relationship_type_ontology relationship_type_ontology_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.relationship_type_ontology
    ADD CONSTRAINT relationship_type_ontology_pkey PRIMARY KEY (id);


--
-- Name: resolved_events resolved_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resolved_events
    ADD CONSTRAINT resolved_events_pkey PRIMARY KEY (id);


--
-- Name: resume_documents resume_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resume_documents
    ADD CONSTRAINT resume_documents_pkey PRIMARY KEY (id);


--
-- Name: reversal_logs reversal_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reversal_logs
    ADD CONSTRAINT reversal_logs_pkey PRIMARY KEY (id);


--
-- Name: relationship_peripherals romantic_peripherals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.relationship_peripherals
    ADD CONSTRAINT romantic_peripherals_pkey PRIMARY KEY (id);


--
-- Name: romantic_peripherals romantic_peripherals_pkey1; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.romantic_peripherals
    ADD CONSTRAINT romantic_peripherals_pkey1 PRIMARY KEY (id);


--
-- Name: romantic_relationships romantic_relationships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.romantic_relationships
    ADD CONSTRAINT romantic_relationships_pkey PRIMARY KEY (id);


--
-- Name: romantic_relationships romantic_relationships_user_id_person_id_person_type_relati_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.romantic_relationships
    ADD CONSTRAINT romantic_relationships_user_id_person_id_person_type_relati_key UNIQUE (user_id, person_id, person_type, relationship_type, status);


--
-- Name: salience_scores salience_scores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salience_scores
    ADD CONSTRAINT salience_scores_pkey PRIMARY KEY (user_id, target_kind, target_id);


--
-- Name: shadow_extraction_log shadow_extraction_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shadow_extraction_log
    ADD CONSTRAINT shadow_extraction_log_pkey PRIMARY KEY (id);


--
-- Name: skill_clusters skill_clusters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_clusters
    ADD CONSTRAINT skill_clusters_pkey PRIMARY KEY (id);


--
-- Name: skill_clusters skill_clusters_user_id_cluster_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_clusters
    ADD CONSTRAINT skill_clusters_user_id_cluster_name_key UNIQUE (user_id, cluster_name);


--
-- Name: skill_evidence skill_evidence_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_evidence
    ADD CONSTRAINT skill_evidence_pkey PRIMARY KEY (id);


--
-- Name: skill_progress skill_progress_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_progress
    ADD CONSTRAINT skill_progress_pkey PRIMARY KEY (id);


--
-- Name: skill_relationships skill_relationships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_relationships
    ADD CONSTRAINT skill_relationships_pkey PRIMARY KEY (id);


--
-- Name: skill_relationships skill_relationships_user_id_from_skill_id_to_skill_id_relat_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_relationships
    ADD CONSTRAINT skill_relationships_user_id_from_skill_id_to_skill_id_relat_key UNIQUE (user_id, from_skill_id, to_skill_id, relationship_type);


--
-- Name: skill_suggestions skill_suggestions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_suggestions
    ADD CONSTRAINT skill_suggestions_pkey PRIMARY KEY (id);


--
-- Name: skill_suggestions skill_suggestions_user_id_skill_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_suggestions
    ADD CONSTRAINT skill_suggestions_user_id_skill_name_key UNIQUE (user_id, skill_name);


--
-- Name: skill_usage_events skill_usage_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_usage_events
    ADD CONSTRAINT skill_usage_events_pkey PRIMARY KEY (id);


--
-- Name: skills skills_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skills
    ADD CONSTRAINT skills_pkey PRIMARY KEY (id);


--
-- Name: skills skills_user_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skills
    ADD CONSTRAINT skills_user_id_name_key UNIQUE (user_id, skill_name);


--
-- Name: social_communities social_communities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_communities
    ADD CONSTRAINT social_communities_pkey PRIMARY KEY (id);


--
-- Name: subscription_usage subscription_usage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_usage
    ADD CONSTRAINT subscription_usage_pkey PRIMARY KEY (id);


--
-- Name: subscription_usage subscription_usage_user_id_month_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_usage
    ADD CONSTRAINT subscription_usage_user_id_month_key UNIQUE (user_id, month);


--
-- Name: subscriptions subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (id);


--
-- Name: subscriptions subscriptions_stripe_customer_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_stripe_customer_id_key UNIQUE (stripe_customer_id);


--
-- Name: subscriptions subscriptions_stripe_subscription_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_stripe_subscription_id_key UNIQUE (stripe_subscription_id);


--
-- Name: subscriptions subscriptions_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_user_id_key UNIQUE (user_id);


--
-- Name: suggestion_dismissal_stats suggestion_dismissal_stats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suggestion_dismissal_stats
    ADD CONSTRAINT suggestion_dismissal_stats_pkey PRIMARY KEY (user_id, book_domain, normalized_name);


--
-- Name: suggestion_thread_dismissals suggestion_thread_dismissals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suggestion_thread_dismissals
    ADD CONSTRAINT suggestion_thread_dismissals_pkey PRIMARY KEY (id);


--
-- Name: suggestion_thread_dismissals suggestion_thread_dismissals_user_id_book_domain_normalized_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suggestion_thread_dismissals
    ADD CONSTRAINT suggestion_thread_dismissals_user_id_book_domain_normalized_key UNIQUE (user_id, book_domain, normalized_name, thread_id);


--
-- Name: system_knowledge system_knowledge_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_knowledge
    ADD CONSTRAINT system_knowledge_pkey PRIMARY KEY (id);


--
-- Name: task_events task_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_events
    ADD CONSTRAINT task_events_pkey PRIMARY KEY (id);


--
-- Name: tasks tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);


--
-- Name: tasks tasks_user_id_external_source_external_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_user_id_external_source_external_id_key UNIQUE (user_id, external_source, external_id);


--
-- Name: terms_acceptance terms_acceptance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.terms_acceptance
    ADD CONSTRAINT terms_acceptance_pkey PRIMARY KEY (id);


--
-- Name: terms_acceptance terms_acceptance_user_id_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.terms_acceptance
    ADD CONSTRAINT terms_acceptance_user_id_version_key UNIQUE (user_id, version);


--
-- Name: text_message_uploads text_message_uploads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.text_message_uploads
    ADD CONSTRAINT text_message_uploads_pkey PRIMARY KEY (id);


--
-- Name: timeline_actions timeline_actions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timeline_actions
    ADD CONSTRAINT timeline_actions_pkey PRIMARY KEY (id);


--
-- Name: timeline_arcs timeline_arcs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timeline_arcs
    ADD CONSTRAINT timeline_arcs_pkey PRIMARY KEY (id);


--
-- Name: timeline_epochs timeline_epochs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timeline_epochs
    ADD CONSTRAINT timeline_epochs_pkey PRIMARY KEY (id);


--
-- Name: timeline_eras timeline_eras_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timeline_eras
    ADD CONSTRAINT timeline_eras_pkey PRIMARY KEY (id);


--
-- Name: timeline_memberships timeline_memberships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timeline_memberships
    ADD CONSTRAINT timeline_memberships_pkey PRIMARY KEY (id);


--
-- Name: timeline_memberships timeline_memberships_user_id_journal_entry_id_timeline_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timeline_memberships
    ADD CONSTRAINT timeline_memberships_user_id_journal_entry_id_timeline_id_key UNIQUE (user_id, journal_entry_id, timeline_id);


--
-- Name: timeline_microactions timeline_microactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timeline_microactions
    ADD CONSTRAINT timeline_microactions_pkey PRIMARY KEY (id);


--
-- Name: timeline_mythos timeline_mythos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timeline_mythos
    ADD CONSTRAINT timeline_mythos_pkey PRIMARY KEY (id);


--
-- Name: timeline_relationships timeline_relationships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timeline_relationships
    ADD CONSTRAINT timeline_relationships_pkey PRIMARY KEY (id);


--
-- Name: timeline_sagas timeline_sagas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timeline_sagas
    ADD CONSTRAINT timeline_sagas_pkey PRIMARY KEY (id);


--
-- Name: timeline_scenes timeline_scenes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timeline_scenes
    ADD CONSTRAINT timeline_scenes_pkey PRIMARY KEY (id);


--
-- Name: timeline_search_index timeline_search_index_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timeline_search_index
    ADD CONSTRAINT timeline_search_index_pkey PRIMARY KEY (id);


--
-- Name: timelines timelines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timelines
    ADD CONSTRAINT timelines_pkey PRIMARY KEY (id);


--
-- Name: user_activity_logs user_activity_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_activity_logs
    ADD CONSTRAINT user_activity_logs_pkey PRIMARY KEY (id);


--
-- Name: user_chronology_order user_chronology_order_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_chronology_order
    ADD CONSTRAINT user_chronology_order_pkey PRIMARY KEY (id);


--
-- Name: user_chronology_order user_chronology_order_user_id_scope_type_scope_id_item_kind_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_chronology_order
    ADD CONSTRAINT user_chronology_order_user_id_scope_type_scope_id_item_kind_key UNIQUE (user_id, scope_type, scope_id, item_kind, item_id);


--
-- Name: user_corrections user_corrections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_corrections
    ADD CONSTRAINT user_corrections_pkey PRIMARY KEY (id);


--
-- Name: user_files user_files_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_files
    ADD CONSTRAINT user_files_pkey PRIMARY KEY (id);


--
-- Name: user_files user_files_user_id_sha256_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_files
    ADD CONSTRAINT user_files_user_id_sha256_key UNIQUE (user_id, sha256);


--
-- Name: user_inference_state user_inference_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_inference_state
    ADD CONSTRAINT user_inference_state_pkey PRIMARY KEY (user_id);


--
-- Name: utterances utterances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.utterances
    ADD CONSTRAINT utterances_pkey PRIMARY KEY (id);


--
-- Name: achievements_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX achievements_type_idx ON public.achievements USING btree (achievement_type);


--
-- Name: achievements_unlocked_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX achievements_unlocked_at_idx ON public.achievements USING btree (user_id, unlocked_at);


--
-- Name: achievements_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX achievements_user_id_idx ON public.achievements USING btree (user_id);


--
-- Name: autobiographical_meaning_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX autobiographical_meaning_active_idx ON public.autobiographical_meaning_artifacts USING btree (user_id, updated_at DESC) WHERE (status = 'ACTIVE'::text);


--
-- Name: autobiographical_meaning_event_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX autobiographical_meaning_event_idx ON public.autobiographical_meaning_artifacts USING btree (user_id, source_event_id) WHERE (source_event_id IS NOT NULL);


--
-- Name: autobiographical_meaning_fingerprint_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX autobiographical_meaning_fingerprint_uidx ON public.autobiographical_meaning_artifacts USING btree (user_id, source_fingerprint) WHERE (status = ANY (ARRAY['ACTIVE'::text, 'USER_CORRECTED'::text]));


--
-- Name: autobiographical_meaning_message_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX autobiographical_meaning_message_idx ON public.autobiographical_meaning_artifacts USING btree (user_id, source_message_id) WHERE (source_message_id IS NOT NULL);


--
-- Name: autobiographical_meaning_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX autobiographical_meaning_type_idx ON public.autobiographical_meaning_artifacts USING btree (user_id, meaning_type, status);


--
-- Name: chapters_parent_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chapters_parent_id_idx ON public.chapters USING btree (parent_id);


--
-- Name: chapters_start_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chapters_start_date_idx ON public.chapters USING btree (start_date DESC);


--
-- Name: chapters_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chapters_user_id_idx ON public.chapters USING btree (user_id);


--
-- Name: character_identity_index_character_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX character_identity_index_character_idx ON public.character_identity_index USING btree (user_id, character_id);


--
-- Name: character_identity_index_unique_character_mention; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX character_identity_index_unique_character_mention ON public.character_identity_index USING btree (user_id, character_id, mention_key);


--
-- Name: character_identity_index_user_key_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX character_identity_index_user_key_idx ON public.character_identity_index USING btree (user_id, mention_key);


--
-- Name: character_identity_index_user_mention_trgm_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX character_identity_index_user_mention_trgm_idx ON public.character_identity_index USING gin (mention public.gin_trgm_ops);


--
-- Name: character_media_lookup_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX character_media_lookup_idx ON public.character_media USING btree (user_id, character_id, kind, created_at DESC);


--
-- Name: character_memories_character_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX character_memories_character_id_idx ON public.character_memories USING btree (character_id);


--
-- Name: character_memories_entry_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX character_memories_entry_id_idx ON public.character_memories USING btree (journal_entry_id);


--
-- Name: character_memories_user_character_recent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX character_memories_user_character_recent_idx ON public.character_memories USING btree (user_id, character_id, created_at DESC);


--
-- Name: character_memories_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX character_memories_user_id_idx ON public.character_memories USING btree (user_id);


--
-- Name: character_relationships_inference_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX character_relationships_inference_status_idx ON public.character_relationships USING btree (user_id, inference_status);


--
-- Name: character_relationships_source_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX character_relationships_source_idx ON public.character_relationships USING btree (source_character_id);


--
-- Name: character_relationships_target_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX character_relationships_target_idx ON public.character_relationships USING btree (target_character_id);


--
-- Name: character_relationships_user_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX character_relationships_user_category_idx ON public.character_relationships USING btree (user_id, relationship_category, relationship_role);


--
-- Name: character_relationships_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX character_relationships_user_id_idx ON public.character_relationships USING btree (user_id);


--
-- Name: character_relationships_user_pair_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX character_relationships_user_pair_idx ON public.character_relationships USING btree (user_id, source_character_id, target_character_id);


--
-- Name: characters_embedding_hnsw; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX characters_embedding_hnsw ON public.characters USING hnsw (embedding public.vector_cosine_ops) WITH (m='16', ef_construction='64');


--
-- Name: characters_metadata_gin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX characters_metadata_gin_idx ON public.characters USING gin (metadata);


--
-- Name: characters_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX characters_name_idx ON public.characters USING btree (name);


--
-- Name: characters_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX characters_user_id_idx ON public.characters USING btree (user_id);


--
-- Name: characters_user_pending_deletion_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX characters_user_pending_deletion_idx ON public.characters USING btree (user_id, updated_at DESC) WHERE (status = 'pending_deletion'::text);


--
-- Name: characters_user_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX characters_user_status_idx ON public.characters USING btree (user_id, status);


--
-- Name: characters_user_updated_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX characters_user_updated_idx ON public.characters USING btree (user_id, updated_at DESC);


--
-- Name: chat_message_revisions_message_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chat_message_revisions_message_idx ON public.chat_message_revisions USING btree (message_id);


--
-- Name: chat_message_revisions_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chat_message_revisions_user_idx ON public.chat_message_revisions USING btree (user_id);


--
-- Name: chat_messages_user_client_idempotency_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX chat_messages_user_client_idempotency_uidx ON public.chat_messages USING btree (user_id, client_idempotency_key) WHERE (client_idempotency_key IS NOT NULL);


--
-- Name: chronology_index_decade_bucket_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chronology_index_decade_bucket_idx ON public.chronology_index USING btree (user_id, decade_bucket);


--
-- Name: chronology_index_entry_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chronology_index_entry_id_idx ON public.chronology_index USING btree (journal_entry_id);


--
-- Name: chronology_index_month_bucket_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chronology_index_month_bucket_idx ON public.chronology_index USING btree (user_id, month_bucket);


--
-- Name: chronology_index_time_range_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chronology_index_time_range_idx ON public.chronology_index USING btree (user_id, start_time, end_time);


--
-- Name: chronology_index_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chronology_index_user_id_idx ON public.chronology_index USING btree (user_id);


--
-- Name: chronology_index_year_bucket_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chronology_index_year_bucket_idx ON public.chronology_index USING btree (user_id, year_bucket);


--
-- Name: chronology_order_corrections_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chronology_order_corrections_user_idx ON public.chronology_order_corrections USING btree (user_id, created_at DESC);


--
-- Name: contradiction_signals_epiphany_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contradiction_signals_epiphany_idx ON public.contradiction_signals USING btree (user_id, confidence DESC, evidence_count DESC) WHERE (status = 'open'::text);


--
-- Name: contradiction_signals_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contradiction_signals_user_idx ON public.contradiction_signals USING btree (user_id);


--
-- Name: contradiction_signals_user_section_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contradiction_signals_user_section_idx ON public.contradiction_signals USING btree (user_id, section);


--
-- Name: contradiction_signals_user_sev_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contradiction_signals_user_sev_idx ON public.contradiction_signals USING btree (user_id, severity);


--
-- Name: contradiction_signals_user_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contradiction_signals_user_status_idx ON public.contradiction_signals USING btree (user_id, status);


--
-- Name: conversation_sessions_user_chat_session_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX conversation_sessions_user_chat_session_uidx ON public.conversation_sessions USING btree (user_id, ((metadata ->> 'chat_session_id'::text))) WHERE ((metadata ->> 'chat_session_id'::text) IS NOT NULL);


--
-- Name: ead_canonical_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ead_canonical_idx ON public.entity_authority_decisions USING btree (user_id, canonical_entity_id);


--
-- Name: ead_source_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ead_source_idx ON public.entity_authority_decisions USING btree (user_id, source_id);


--
-- Name: ead_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ead_user_idx ON public.entity_authority_decisions USING btree (user_id, created_at DESC);


--
-- Name: entity_conversation_links_entity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX entity_conversation_links_entity_idx ON public.entity_conversation_links USING btree (user_id, entity_type, entity_id, last_linked_at DESC);


--
-- Name: entity_conversation_links_origin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX entity_conversation_links_origin_idx ON public.entity_conversation_links USING btree (user_id, entity_type, entity_id) WHERE (link_kind = 'origin'::text);


--
-- Name: entity_conversation_links_session_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX entity_conversation_links_session_idx ON public.entity_conversation_links USING btree (user_id, session_id);


--
-- Name: entity_facts_character_lookup_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX entity_facts_character_lookup_idx ON public.entity_facts USING btree (user_id, entity_type, entity_id, confidence DESC, updated_at DESC) WHERE (entity_type = 'character'::text);


--
-- Name: entity_facts_superseded_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX entity_facts_superseded_idx ON public.entity_facts USING btree (superseded_at);


--
-- Name: entity_questions_one_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX entity_questions_one_pending ON public.entity_questions USING btree (user_id, mention_lower) WHERE (status = 'pending'::text);


--
-- Name: entity_questions_user_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX entity_questions_user_status ON public.entity_questions USING btree (user_id, status);


--
-- Name: epiphany_insights_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX epiphany_insights_user_id_idx ON public.epiphany_insights USING btree (user_id, created_at DESC);


--
-- Name: episodes_source_messages_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX episodes_source_messages_gin ON public.episodes USING gin (source_message_ids);


--
-- Name: episodes_user_thread_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX episodes_user_thread_idx ON public.episodes USING btree (user_id, source_thread_id, episode_index);


--
-- Name: episodes_user_time_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX episodes_user_time_idx ON public.episodes USING btree (user_id, start_at DESC);


--
-- Name: event_cognitions_source_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX event_cognitions_source_uidx ON public.event_cognitions USING btree (user_id, event_record_id, cognition_type, source_message_id, md5(content)) WHERE ((source_message_id IS NOT NULL) AND (event_record_id IS NOT NULL));


--
-- Name: event_emotions_source_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX event_emotions_source_uidx ON public.event_emotions USING btree (user_id, event_record_id, emotion, source_message_id) WHERE ((source_message_id IS NOT NULL) AND (event_record_id IS NOT NULL));


--
-- Name: event_identity_impacts_source_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX event_identity_impacts_source_uidx ON public.event_identity_impacts USING btree (user_id, event_record_id, impact_type, source_message_id) WHERE ((source_message_id IS NOT NULL) AND (event_record_id IS NOT NULL));


--
-- Name: event_records_user_source_message_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX event_records_user_source_message_uidx ON public.event_records USING btree (user_id, source_message_id) WHERE (source_message_id IS NOT NULL);


--
-- Name: external_account_connections_provider_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX external_account_connections_provider_idx ON public.external_account_connections USING btree (provider, updated_at DESC);


--
-- Name: external_account_connections_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX external_account_connections_user_idx ON public.external_account_connections USING btree (user_id, provider);


--
-- Name: extracted_units_superseded_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX extracted_units_superseded_idx ON public.extracted_units USING btree (superseded_at);


--
-- Name: extracted_units_utterance_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX extracted_units_utterance_id_idx ON public.extracted_units USING btree (utterance_id);


--
-- Name: group_candidates_members_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX group_candidates_members_idx ON public.group_candidates USING gin (detected_members);


--
-- Name: group_candidates_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX group_candidates_status_idx ON public.group_candidates USING btree (user_id, status) WHERE (status = 'pending'::text);


--
-- Name: group_candidates_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX group_candidates_user_idx ON public.group_candidates USING btree (user_id);


--
-- Name: group_candidates_user_member_ids_gin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX group_candidates_user_member_ids_gin_idx ON public.group_candidates USING gin (detected_member_ids);


--
-- Name: group_candidates_user_source_ids_gin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX group_candidates_user_source_ids_gin_idx ON public.group_candidates USING gin (source_message_ids);


--
-- Name: group_candidates_user_status_updated_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX group_candidates_user_status_updated_idx ON public.group_candidates USING btree (user_id, status, updated_at DESC);


--
-- Name: identity_mutations_entity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX identity_mutations_entity_idx ON public.identity_mutations USING btree (user_id, entity_id, created_at DESC);


--
-- Name: identity_mutations_recent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX identity_mutations_recent_idx ON public.identity_mutations USING btree (user_id, created_at DESC);


--
-- Name: identity_mutations_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX identity_mutations_type_idx ON public.identity_mutations USING btree (user_id, mutation_type, created_at DESC);


--
-- Name: idx_api_rate_limit_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_api_rate_limit_expires ON public.api_rate_limit_buckets USING btree (expires_at);


--
-- Name: idx_arc_event_links_arc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_arc_event_links_arc ON public.arc_event_links USING btree (arc_id, sort_time);


--
-- Name: idx_arc_event_links_event; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_arc_event_links_event ON public.arc_event_links USING btree (arc_id, resolved_event_id) WHERE (resolved_event_id IS NOT NULL);


--
-- Name: idx_arc_event_links_journal; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_arc_event_links_journal ON public.arc_event_links USING btree (arc_id, journal_entry_id) WHERE (journal_entry_id IS NOT NULL);


--
-- Name: idx_arc_event_links_user_day; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_arc_event_links_user_day ON public.arc_event_links USING btree (user_id, sort_time);


--
-- Name: idx_arc_memberships_arc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_arc_memberships_arc ON public.arc_memberships USING btree (arc_id, importance_score DESC);


--
-- Name: idx_arc_memberships_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_arc_memberships_event ON public.arc_memberships USING btree (event_candidate_id);


--
-- Name: idx_arc_memberships_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_arc_memberships_unique ON public.arc_memberships USING btree (arc_id, event_candidate_id);


--
-- Name: idx_arc_relationships_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_arc_relationships_source ON public.arc_relationships USING btree (source_arc_id);


--
-- Name: idx_arc_relationships_target; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_arc_relationships_target ON public.arc_relationships USING btree (target_arc_id);


--
-- Name: idx_arc_relationships_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_arc_relationships_unique ON public.arc_relationships USING btree (source_arc_id, target_arc_id, relationship_type);


--
-- Name: idx_arc_relationships_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_arc_relationships_user ON public.arc_relationships USING btree (user_id);


--
-- Name: idx_assertion_evidence_target; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assertion_evidence_target ON public.assertion_evidence USING btree (user_id, target_kind, target_id);


--
-- Name: idx_assertion_evidence_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_assertion_evidence_unique ON public.assertion_evidence USING btree (user_id, target_kind, target_id, evidence_kind, evidence_id);


--
-- Name: idx_association_edges_user_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_association_edges_user_source ON public.association_edges USING btree (user_id, source_entity_id);


--
-- Name: idx_association_edges_user_target; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_association_edges_user_target ON public.association_edges USING btree (user_id, target_entity_id);


--
-- Name: idx_association_edges_user_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_association_edges_user_type ON public.association_edges USING btree (user_id, association_type);


--
-- Name: idx_character_authority_map_alias; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_character_authority_map_alias ON public.character_authority_map USING btree (user_id, alias_name) WHERE (alias_name IS NOT NULL);


--
-- Name: idx_character_authority_map_character; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_character_authority_map_character ON public.character_authority_map USING btree (canonical_character_id);


--
-- Name: idx_character_timeline_events_character; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_character_timeline_events_character ON public.character_timeline_events USING btree (character_id);


--
-- Name: idx_character_timeline_events_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_character_timeline_events_date ON public.character_timeline_events USING btree (event_date);


--
-- Name: idx_character_timeline_events_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_character_timeline_events_event ON public.character_timeline_events USING btree (event_id);


--
-- Name: idx_character_timeline_events_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_character_timeline_events_type ON public.character_timeline_events USING btree (timeline_type);


--
-- Name: idx_character_timeline_events_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_character_timeline_events_user ON public.character_timeline_events USING btree (user_id);


--
-- Name: idx_character_timeline_events_user_character; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_character_timeline_events_user_character ON public.character_timeline_events USING btree (user_id, character_id);


--
-- Name: idx_characters_user_canonical_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_characters_user_canonical_name ON public.characters USING btree (user_id, canonical_name);


--
-- Name: idx_characters_user_importance; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_characters_user_importance ON public.characters USING btree (user_id, importance_level);


--
-- Name: idx_chat_contexts_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_contexts_session ON public.chat_contexts USING btree (session_id);


--
-- Name: idx_chat_contexts_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_contexts_user ON public.chat_contexts USING btree (user_id);


--
-- Name: idx_chat_messages_content_fts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_messages_content_fts ON public.chat_messages USING gin (to_tsvector('english'::regconfig, content));


--
-- Name: idx_chat_messages_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_messages_created ON public.chat_messages USING btree (created_at DESC);


--
-- Name: idx_chat_messages_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_messages_session ON public.chat_messages USING btree (session_id);


--
-- Name: idx_chat_messages_session_turn; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_messages_session_turn ON public.chat_messages USING btree (session_id, turn_number, reply_seq);


--
-- Name: idx_chat_messages_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_messages_user ON public.chat_messages USING btree (user_id);


--
-- Name: idx_chat_sessions_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_sessions_user ON public.chat_sessions USING btree (user_id);


--
-- Name: idx_classifications_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_classifications_parent ON public.classifications USING btree (parent_id) WHERE (parent_id IS NOT NULL);


--
-- Name: idx_classifications_root_label_global; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_classifications_root_label_global ON public.classifications USING btree (root_type, lower(label)) WHERE (user_id IS NULL);


--
-- Name: idx_classifications_root_label_user; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_classifications_root_label_user ON public.classifications USING btree (user_id, root_type, lower(label)) WHERE (user_id IS NOT NULL);


--
-- Name: idx_classifications_root_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_classifications_root_type ON public.classifications USING btree (root_type, status);


--
-- Name: idx_classifications_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_classifications_user ON public.classifications USING btree (user_id) WHERE (user_id IS NOT NULL);


--
-- Name: idx_compactions_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_compactions_session ON public.conversation_compactions USING btree (user_id, session_id, created_at DESC);


--
-- Name: idx_components_entry_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_components_entry_type ON public.memory_components USING btree (journal_entry_id, component_type);


--
-- Name: idx_continuity_events_related_claims; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_continuity_events_related_claims ON public.continuity_events USING gin (related_claim_ids);


--
-- Name: idx_continuity_events_related_entities; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_continuity_events_related_entities ON public.continuity_events USING gin (related_entity_ids);


--
-- Name: idx_continuity_events_reversible; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_continuity_events_reversible ON public.continuity_events USING btree (reversible) WHERE (reversible = true);


--
-- Name: idx_continuity_events_severity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_continuity_events_severity ON public.continuity_events USING btree (severity);


--
-- Name: idx_continuity_events_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_continuity_events_type ON public.continuity_events USING btree (type);


--
-- Name: idx_continuity_events_user_timestamp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_continuity_events_user_timestamp ON public.continuity_events USING btree (user_id, "timestamp" DESC);


--
-- Name: idx_continuity_snapshots_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_continuity_snapshots_user ON public.continuity_snapshots USING btree (user_id, created_at DESC);


--
-- Name: idx_conversation_messages_content_fts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversation_messages_content_fts ON public.conversation_messages USING gin (to_tsvector('english'::regconfig, content));


--
-- Name: idx_conversation_messages_session_user_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversation_messages_session_user_time ON public.conversation_messages USING btree (session_id, user_id, created_at DESC);


--
-- Name: idx_correction_records_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_correction_records_user ON public.correction_records USING btree (user_id, created_at DESC);


--
-- Name: idx_crystallized_knowledge_dedup; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_crystallized_knowledge_dedup ON public.crystallized_knowledge USING btree (user_id, knowledge_type, machine_claim) WHERE (status <> ALL (ARRAY['HISTORICAL'::text, 'SUPERSEDED'::text]));


--
-- Name: idx_crystallized_knowledge_prompt; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crystallized_knowledge_prompt ON public.crystallized_knowledge USING btree (user_id, confidence DESC) WHERE (status = 'ACTIVE'::text);


--
-- Name: idx_crystallized_knowledge_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crystallized_knowledge_user ON public.crystallized_knowledge USING btree (user_id, status, updated_at DESC);


--
-- Name: idx_engine_dependencies_depends_on; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_engine_dependencies_depends_on ON public.engine_dependencies USING btree (depends_on);


--
-- Name: idx_engine_dependencies_engine_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_engine_dependencies_engine_name ON public.engine_dependencies USING btree (engine_name);


--
-- Name: idx_engine_results_updated_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_engine_results_updated_at ON public.engine_results USING btree (updated_at);


--
-- Name: idx_engine_results_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_engine_results_user_id ON public.engine_results USING btree (user_id);


--
-- Name: idx_entity_aliases_node; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_entity_aliases_node ON public.entity_aliases USING btree (user_id, node_id);


--
-- Name: idx_entity_aliases_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_entity_aliases_unique ON public.entity_aliases USING btree (user_id, lower(alias));


--
-- Name: idx_entity_deletion_events_entity_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_entity_deletion_events_entity_id ON public.entity_deletion_events USING btree (user_id, entity_id);


--
-- Name: idx_entity_deletion_events_normalized_keys; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_entity_deletion_events_normalized_keys ON public.entity_deletion_events USING gin (normalized_keys);


--
-- Name: idx_entity_deletion_events_user_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_entity_deletion_events_user_type ON public.entity_deletion_events USING btree (user_id, entity_type, created_at DESC);


--
-- Name: idx_entity_facts_entity_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_entity_facts_entity_category ON public.entity_facts USING btree (entity_id, entity_type, category);


--
-- Name: idx_entity_facts_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_entity_facts_status ON public.entity_facts USING btree (status);


--
-- Name: idx_entity_facts_user_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_entity_facts_user_entity ON public.entity_facts USING btree (user_id, entity_id, entity_type);


--
-- Name: idx_entity_gravity_scores_user_score; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_entity_gravity_scores_user_score ON public.entity_gravity_scores USING btree (user_id, gravity_score DESC);


--
-- Name: idx_entity_merge_log_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_entity_merge_log_user ON public.entity_merge_log USING btree (user_id, merged_at DESC);


--
-- Name: idx_entity_merge_records_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_entity_merge_records_source ON public.entity_merge_records USING btree (source_entity_id);


--
-- Name: idx_entity_merge_records_target; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_entity_merge_records_target ON public.entity_merge_records USING btree (target_entity_id);


--
-- Name: idx_entity_merge_records_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_entity_merge_records_user_created ON public.entity_merge_records USING btree (user_id, created_at DESC);


--
-- Name: idx_entity_resolution_entity_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_entity_resolution_entity_id ON public.entity_resolution_cache USING btree (resolved_entity_id);


--
-- Name: idx_entity_resolution_user_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_entity_resolution_user_type ON public.entity_resolution_cache USING btree (user_id, entity_type);


--
-- Name: idx_entry_ir_consolidated_to; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_entry_ir_consolidated_to ON public.entry_ir USING btree (consolidated_to) WHERE (consolidated_to IS NOT NULL);


--
-- Name: idx_entry_ir_knowledge_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_entry_ir_knowledge_type ON public.entry_ir USING btree (knowledge_type);


--
-- Name: idx_entry_ir_pending_consolidation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_entry_ir_pending_consolidation ON public.entry_ir USING btree (user_id, created_at) WHERE (consolidation_status = 'PENDING'::text);


--
-- Name: idx_entry_ir_thread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_entry_ir_thread ON public.entry_ir USING btree (thread_id);


--
-- Name: idx_entry_ir_timestamp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_entry_ir_timestamp ON public.entry_ir USING btree ("timestamp" DESC);


--
-- Name: idx_entry_ir_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_entry_ir_user ON public.entry_ir USING btree (user_id);


--
-- Name: idx_entry_ir_utterance; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_entry_ir_utterance ON public.entry_ir USING btree (source_utterance_id);


--
-- Name: idx_event_candidates_entities; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_candidates_entities ON public.event_candidates USING gin (dominant_entities);


--
-- Name: idx_event_candidates_source_events; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_candidates_source_events ON public.event_candidates USING gin (source_event_ids);


--
-- Name: idx_event_candidates_strength; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_candidates_strength ON public.event_candidates USING btree (user_id, continuity_strength DESC) WHERE (timeline_candidate = true);


--
-- Name: idx_event_candidates_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_candidates_user ON public.event_candidates USING btree (user_id);


--
-- Name: idx_event_causal_links_cause; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_causal_links_cause ON public.event_causal_links USING btree (cause_event_id);


--
-- Name: idx_event_causal_links_effect; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_causal_links_effect ON public.event_causal_links USING btree (effect_event_id);


--
-- Name: idx_event_causal_links_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_causal_links_type ON public.event_causal_links USING btree (causal_type);


--
-- Name: idx_event_causal_links_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_causal_links_user ON public.event_causal_links USING btree (user_id);


--
-- Name: idx_event_causal_links_user_cause; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_causal_links_user_cause ON public.event_causal_links USING btree (user_id, cause_event_id);


--
-- Name: idx_event_causal_links_user_effect; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_causal_links_user_effect ON public.event_causal_links USING btree (user_id, effect_event_id);


--
-- Name: idx_event_cognitions_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_cognitions_event ON public.event_cognitions USING btree (event_record_id);


--
-- Name: idx_event_cognitions_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_cognitions_type ON public.event_cognitions USING btree (user_id, cognition_type);


--
-- Name: idx_event_cognitions_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_cognitions_user ON public.event_cognitions USING btree (user_id, created_at DESC);


--
-- Name: idx_event_confidence_snapshots_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_confidence_snapshots_event ON public.event_confidence_snapshots USING btree (event_id);


--
-- Name: idx_event_confidence_snapshots_recorded; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_confidence_snapshots_recorded ON public.event_confidence_snapshots USING btree (recorded_at DESC);


--
-- Name: idx_event_confidence_snapshots_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_confidence_snapshots_user ON public.event_confidence_snapshots USING btree (user_id);


--
-- Name: idx_event_continuity_links_current; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_continuity_links_current ON public.event_continuity_links USING btree (current_event_id);


--
-- Name: idx_event_continuity_links_past; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_continuity_links_past ON public.event_continuity_links USING btree (past_event_id);


--
-- Name: idx_event_continuity_links_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_continuity_links_type ON public.event_continuity_links USING btree (continuity_type);


--
-- Name: idx_event_continuity_links_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_continuity_links_user ON public.event_continuity_links USING btree (user_id);


--
-- Name: idx_event_emotions_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_emotions_event ON public.event_emotions USING btree (event_record_id);


--
-- Name: idx_event_emotions_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_emotions_user ON public.event_emotions USING btree (user_id, created_at DESC);


--
-- Name: idx_event_identity_impacts_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_identity_impacts_event ON public.event_identity_impacts USING btree (event_record_id);


--
-- Name: idx_event_identity_impacts_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_identity_impacts_type ON public.event_identity_impacts USING btree (user_id, impact_type);


--
-- Name: idx_event_identity_impacts_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_identity_impacts_user ON public.event_identity_impacts USING btree (user_id, created_at DESC);


--
-- Name: idx_event_impacts_connection; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_impacts_connection ON public.event_impacts USING btree (connection_character_id);


--
-- Name: idx_event_impacts_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_impacts_event ON public.event_impacts USING btree (event_id);


--
-- Name: idx_event_impacts_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_impacts_type ON public.event_impacts USING btree (impact_type);


--
-- Name: idx_event_impacts_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_impacts_user ON public.event_impacts USING btree (user_id);


--
-- Name: idx_event_impacts_user_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_impacts_user_type ON public.event_impacts USING btree (user_id, impact_type);


--
-- Name: idx_event_meaning_cache_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_meaning_cache_user ON public.event_meaning_cache USING btree (user_id, updated_at DESC);


--
-- Name: idx_event_mentions_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_mentions_event ON public.event_mentions USING btree (event_id);


--
-- Name: idx_event_mentions_memory; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_mentions_memory ON public.event_mentions USING btree (memory_id);


--
-- Name: idx_event_records_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_records_date ON public.event_records USING btree (user_id, event_date);


--
-- Name: idx_event_records_participants; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_records_participants ON public.event_records USING gin (participant_ids);


--
-- Name: idx_event_records_resolved_event_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_records_resolved_event_user ON public.event_records USING btree (user_id, resolved_event_id) WHERE (resolved_event_id IS NOT NULL);


--
-- Name: idx_event_records_tags; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_records_tags ON public.event_records USING gin (tags);


--
-- Name: idx_event_records_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_records_user ON public.event_records USING btree (user_id, event_date DESC);


--
-- Name: idx_event_unit_links_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_unit_links_event ON public.event_unit_links USING btree (event_id);


--
-- Name: idx_event_unit_links_unit_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_unit_links_unit_id ON public.event_unit_links USING btree (unit_id);


--
-- Name: idx_extracted_units_entities_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_extracted_units_entities_gin ON public.extracted_units USING gin (entity_ids);


--
-- Name: idx_extracted_units_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_extracted_units_type ON public.extracted_units USING btree (type);


--
-- Name: idx_extracted_units_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_extracted_units_user ON public.extracted_units USING btree (user_id);


--
-- Name: idx_extracted_units_user_type_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_extracted_units_user_type_created ON public.extracted_units USING btree (user_id, type, created_at DESC);


--
-- Name: idx_goal_cognition_audit_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_goal_cognition_audit_user_created ON public.goal_cognition_audit USING btree (user_id, created_at DESC);


--
-- Name: idx_goal_insights_timestamp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_goal_insights_timestamp ON public.goal_insights USING btree (user_id, "timestamp" DESC);


--
-- Name: idx_goal_insights_user_goal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_goal_insights_user_goal ON public.goal_insights USING btree (user_id, related_goal_id);


--
-- Name: idx_goal_insights_user_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_goal_insights_user_type ON public.goal_insights USING btree (user_id, type);


--
-- Name: idx_goals_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_goals_source ON public.goals USING btree (user_id, source, source_id);


--
-- Name: idx_goals_user_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_goals_user_status ON public.goals USING btree (user_id, status);


--
-- Name: idx_goals_user_updated; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_goals_user_updated ON public.goals USING btree (user_id, updated_at DESC);


--
-- Name: idx_graph_edges_from; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_graph_edges_from ON public.graph_edges USING btree (user_id, from_node_id);


--
-- Name: idx_graph_edges_to; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_graph_edges_to ON public.graph_edges USING btree (user_id, to_node_id);


--
-- Name: idx_graph_edges_unique_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_graph_edges_unique_active ON public.graph_edges USING btree (user_id, from_node_id, to_node_id, relation_kind) WHERE (valid_to IS NULL);


--
-- Name: idx_graph_nodes_active_machine_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_graph_nodes_active_machine_key ON public.graph_nodes USING btree (user_id, node_kind, machine_key) WHERE ((machine_key IS NOT NULL) AND (valid_to IS NULL));


--
-- Name: idx_graph_nodes_source_bridge; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_graph_nodes_source_bridge ON public.graph_nodes USING btree (user_id, source_table, source_id) WHERE ((source_table IS NOT NULL) AND (source_id IS NOT NULL));


--
-- Name: idx_graph_nodes_user_kind; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_graph_nodes_user_kind ON public.graph_nodes USING btree (user_id, node_kind, created_at DESC);


--
-- Name: idx_group_evolution_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_group_evolution_date ON public.group_evolution USING btree (event_date);


--
-- Name: idx_group_evolution_group; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_group_evolution_group ON public.group_evolution USING btree (group_id);


--
-- Name: idx_group_evolution_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_group_evolution_user ON public.group_evolution USING btree (user_id);


--
-- Name: idx_ingestion_dead_letter_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ingestion_dead_letter_user ON public.ingestion_dead_letter USING btree (user_id, created_at DESC);


--
-- Name: idx_journal_entries_content_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_journal_entries_content_type ON public.journal_entries USING btree (user_id, content_type) WHERE (content_type <> 'standard'::text);


--
-- Name: idx_journal_entries_no_embedding; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_journal_entries_no_embedding ON public.journal_entries USING btree (user_id, created_at) WHERE (embedding IS NULL);


--
-- Name: idx_journal_entries_preserve_original; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_journal_entries_preserve_original ON public.journal_entries USING btree (user_id, preserve_original_language) WHERE (preserve_original_language = true);


--
-- Name: idx_knowledge_units_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_knowledge_units_user ON public.knowledge_units USING btree (user_id);


--
-- Name: idx_lexical_analysis_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lexical_analysis_created_at ON public.lexical_analysis_results USING btree (created_at DESC);


--
-- Name: idx_lexical_analysis_message_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lexical_analysis_message_id ON public.lexical_analysis_results USING btree (message_id) WHERE (message_id IS NOT NULL);


--
-- Name: idx_lexical_analysis_result_json; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lexical_analysis_result_json ON public.lexical_analysis_results USING gin (result_json);


--
-- Name: idx_lexical_analysis_thread_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lexical_analysis_thread_id ON public.lexical_analysis_results USING btree (thread_id) WHERE (thread_id IS NOT NULL);


--
-- Name: idx_lexical_analysis_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lexical_analysis_user_id ON public.lexical_analysis_results USING btree (user_id);


--
-- Name: idx_life_arcs_dates; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_life_arcs_dates ON public.life_arcs USING btree (user_id, start_date, end_date);


--
-- Name: idx_life_arcs_occasion_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_life_arcs_occasion_key ON public.life_arcs USING btree (user_id, ((metadata ->> 'occasion_key'::text))) WHERE ((arc_type = 'occasion'::text) AND ((metadata ->> 'occasion_key'::text) IS NOT NULL));


--
-- Name: idx_life_arcs_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_life_arcs_parent ON public.life_arcs USING btree (parent_id) WHERE (parent_id IS NOT NULL);


--
-- Name: idx_life_arcs_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_life_arcs_user ON public.life_arcs USING btree (user_id);


--
-- Name: idx_life_arcs_user_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_life_arcs_user_type ON public.life_arcs USING btree (user_id, arc_type);


--
-- Name: idx_location_character_links_relationship; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_location_character_links_relationship ON public.location_character_links USING btree (user_id, relationship_type);


--
-- Name: idx_location_character_links_user_character; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_location_character_links_user_character ON public.location_character_links USING btree (user_id, character_id);


--
-- Name: idx_location_character_links_user_location; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_location_character_links_user_location ON public.location_character_links USING btree (user_id, location_id);


--
-- Name: idx_location_mentions_location; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_location_mentions_location ON public.location_mentions USING btree (location_id);


--
-- Name: idx_location_mentions_memory; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_location_mentions_memory ON public.location_mentions USING btree (memory_id);


--
-- Name: idx_location_mentions_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_location_mentions_user ON public.location_mentions USING btree (user_id);


--
-- Name: idx_locations_associated_character_ids; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_locations_associated_character_ids ON public.locations USING gin (associated_character_ids);


--
-- Name: idx_locations_associated_location_ids; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_locations_associated_location_ids ON public.locations USING gin (associated_location_ids);


--
-- Name: idx_locations_importance_score; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_locations_importance_score ON public.locations USING btree (user_id, importance_score DESC);


--
-- Name: idx_locations_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_locations_parent ON public.locations USING btree (parent_location_id) WHERE (parent_location_id IS NOT NULL);


--
-- Name: idx_locations_place_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_locations_place_type ON public.locations USING btree (user_id, type);


--
-- Name: idx_locations_spatial_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_locations_spatial_category ON public.locations USING btree (user_id, spatial_category);


--
-- Name: idx_locations_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_locations_type ON public.locations USING btree (user_id, type);


--
-- Name: idx_locations_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_locations_user ON public.locations USING btree (user_id);


--
-- Name: idx_meaning_resolution_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meaning_resolution_created_at ON public.meaning_resolution_results USING btree (created_at DESC);


--
-- Name: idx_meaning_resolution_factuality; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meaning_resolution_factuality ON public.meaning_resolution_results USING btree (factuality);


--
-- Name: idx_meaning_resolution_lexical_result_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meaning_resolution_lexical_result_id ON public.meaning_resolution_results USING btree (lexical_result_id) WHERE (lexical_result_id IS NOT NULL);


--
-- Name: idx_meaning_resolution_message_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meaning_resolution_message_id ON public.meaning_resolution_results USING btree (message_id) WHERE (message_id IS NOT NULL);


--
-- Name: idx_meaning_resolution_result_json; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meaning_resolution_result_json ON public.meaning_resolution_results USING gin (result_json);


--
-- Name: idx_meaning_resolution_thread_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meaning_resolution_thread_id ON public.meaning_resolution_results USING btree (thread_id) WHERE (thread_id IS NOT NULL);


--
-- Name: idx_meaning_resolution_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meaning_resolution_user_id ON public.meaning_resolution_results USING btree (user_id);


--
-- Name: idx_memory_decisions_proposal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_memory_decisions_proposal ON public.memory_decisions USING btree (proposal_id);


--
-- Name: idx_memory_decisions_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_memory_decisions_user ON public.memory_decisions USING btree (user_id);


--
-- Name: idx_memory_proposals_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_memory_proposals_created ON public.memory_proposals USING btree (created_at DESC) WHERE (status = 'PENDING'::text);


--
-- Name: idx_memory_proposals_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_memory_proposals_entity ON public.memory_proposals USING btree (entity_id);


--
-- Name: idx_memory_proposals_group_key_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_memory_proposals_group_key_pending ON public.memory_proposals USING btree (user_id, ((metadata ->> 'group_key'::text))) WHERE (status = 'PENDING'::text);


--
-- Name: idx_memory_proposals_integrity_fingerprint_v1; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_memory_proposals_integrity_fingerprint_v1 ON public.memory_proposals USING btree (user_id, ((metadata ->> 'proposal_fingerprint'::text))) WHERE ((status = 'PENDING'::text) AND (((metadata -> 'proposal_integrity'::text) ->> 'policy_version'::text) = 'v1'::text) AND ((metadata ->> 'proposal_fingerprint'::text) IS NOT NULL));


--
-- Name: INDEX idx_memory_proposals_integrity_fingerprint_v1; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON INDEX public.idx_memory_proposals_integrity_fingerprint_v1 IS 'Prevents duplicate normalized pending beliefs while leaving legacy proposals available for audited cleanup.';


--
-- Name: idx_memory_proposals_risk_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_memory_proposals_risk_status ON public.memory_proposals USING btree (risk_level, status) WHERE (status = 'PENDING'::text);


--
-- Name: idx_memory_proposals_user_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_memory_proposals_user_status ON public.memory_proposals USING btree (user_id, status);


--
-- Name: idx_messages_session_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_session_time ON public.conversation_messages USING btree (session_id, created_at);


--
-- Name: idx_messages_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_user_id ON public.conversation_messages USING btree (user_id);


--
-- Name: idx_narrative_accounts_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_narrative_accounts_event ON public.narrative_accounts USING btree (event_record_id);


--
-- Name: idx_narrative_accounts_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_narrative_accounts_type ON public.narrative_accounts USING btree (user_id, account_type);


--
-- Name: idx_narrative_accounts_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_narrative_accounts_user ON public.narrative_accounts USING btree (user_id, recorded_at DESC);


--
-- Name: idx_narrative_anchor_members_anchor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_narrative_anchor_members_anchor ON public.narrative_anchor_members USING btree (anchor_id);


--
-- Name: idx_narrative_anchor_members_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_narrative_anchor_members_entity ON public.narrative_anchor_members USING btree (user_id, member_id, member_kind) WHERE (member_id IS NOT NULL);


--
-- Name: idx_narrative_anchors_user_consolidation; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_narrative_anchors_user_consolidation ON public.narrative_anchors USING btree (user_id, consolidation_key) WHERE (consolidation_key IS NOT NULL);


--
-- Name: idx_narrative_anchors_user_gravity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_narrative_anchors_user_gravity ON public.narrative_anchors USING btree (user_id, gravity_score DESC);


--
-- Name: idx_narrative_anchors_user_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_narrative_anchors_user_type ON public.narrative_anchors USING btree (user_id, anchor_type);


--
-- Name: idx_narrative_chapters_supporting_events; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_narrative_chapters_supporting_events ON public.narrative_chapters USING gin (supporting_event_ids);


--
-- Name: idx_narrative_chapters_user_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_narrative_chapters_user_time ON public.narrative_chapters USING btree (user_id, start_date, end_date);


--
-- Name: idx_narrative_claim_edges_from; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_narrative_claim_edges_from ON public.narrative_claim_edges USING btree (user_id, from_claim_id, relation);


--
-- Name: idx_narrative_claim_edges_to; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_narrative_claim_edges_to ON public.narrative_claim_edges USING btree (user_id, to_claim_id, relation);


--
-- Name: idx_narrative_claim_edges_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_narrative_claim_edges_unique ON public.narrative_claim_edges USING btree (user_id, from_claim_id, to_claim_id, relation);


--
-- Name: idx_narrative_claims_epistemic; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_narrative_claims_epistemic ON public.narrative_claims USING btree (user_id, epistemic_state) WHERE (epistemic_state <> 'DEPRECATED'::text);


--
-- Name: idx_narrative_claims_source_bridge; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_narrative_claims_source_bridge ON public.narrative_claims USING btree (user_id, source_table, source_id) WHERE ((source_table IS NOT NULL) AND (source_id IS NOT NULL));


--
-- Name: idx_narrative_claims_user_kind; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_narrative_claims_user_kind ON public.narrative_claims USING btree (user_id, claim_kind, created_at DESC);


--
-- Name: idx_narrative_claims_user_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_narrative_claims_user_status ON public.narrative_claims USING btree (user_id, status) WHERE (status = 'active'::text);


--
-- Name: idx_narrative_life_chapters_era; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_narrative_life_chapters_era ON public.narrative_life_chapters USING btree (user_id, era_id) WHERE (era_id IS NOT NULL);


--
-- Name: idx_narrative_life_chapters_storylines; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_narrative_life_chapters_storylines ON public.narrative_life_chapters USING gin (storyline_ids);


--
-- Name: idx_narrative_life_chapters_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_narrative_life_chapters_user_created ON public.narrative_life_chapters USING btree (user_id, created_at DESC);


--
-- Name: idx_narrative_life_chapters_user_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_narrative_life_chapters_user_time ON public.narrative_life_chapters USING btree (user_id, time_start DESC NULLS LAST);


--
-- Name: idx_narrative_life_eras_chapters; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_narrative_life_eras_chapters ON public.narrative_life_eras USING gin (chapter_ids);


--
-- Name: idx_narrative_life_eras_user_current; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_narrative_life_eras_user_current ON public.narrative_life_eras USING btree (user_id, is_current) WHERE (is_current = true);


--
-- Name: idx_narrative_life_eras_user_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_narrative_life_eras_user_time ON public.narrative_life_eras USING btree (user_id, time_start DESC NULLS LAST);


--
-- Name: idx_narrative_moments_evidence; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_narrative_moments_evidence ON public.narrative_moments USING gin (evidence_unit_ids);


--
-- Name: idx_narrative_moments_prev; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_narrative_moments_prev ON public.narrative_moments USING btree (previous_moment_id) WHERE (previous_moment_id IS NOT NULL);


--
-- Name: idx_narrative_moments_promoted; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_narrative_moments_promoted ON public.narrative_moments USING btree (user_id, promoted_event_id) WHERE (promoted_event_id IS NOT NULL);


--
-- Name: idx_narrative_moments_scene; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_narrative_moments_scene ON public.narrative_moments USING btree (user_id, scene_id) WHERE (scene_id IS NOT NULL);


--
-- Name: idx_narrative_moments_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_narrative_moments_user_created ON public.narrative_moments USING btree (user_id, created_at DESC);


--
-- Name: idx_narrative_moments_user_occurred; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_narrative_moments_user_occurred ON public.narrative_moments USING btree (user_id, occurred_at DESC NULLS LAST);


--
-- Name: idx_narrative_scenes_chapter; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_narrative_scenes_chapter ON public.narrative_scenes USING btree (user_id, chapter_id) WHERE (chapter_id IS NOT NULL);


--
-- Name: idx_narrative_scenes_promoted; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_narrative_scenes_promoted ON public.narrative_scenes USING btree (user_id, promoted_event_id) WHERE (promoted_event_id IS NOT NULL);


--
-- Name: idx_narrative_scenes_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_narrative_scenes_user_created ON public.narrative_scenes USING btree (user_id, created_at DESC);


--
-- Name: idx_narrative_scenes_user_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_narrative_scenes_user_time ON public.narrative_scenes USING btree (user_id, time_start DESC NULLS LAST);


--
-- Name: idx_narrative_story_chapters_era; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_narrative_story_chapters_era ON public.narrative_story_chapters USING btree (user_id, era_id) WHERE (era_id IS NOT NULL);


--
-- Name: idx_narrative_story_chapters_life_chapter; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_narrative_story_chapters_life_chapter ON public.narrative_story_chapters USING btree (user_id, life_chapter_id) WHERE (life_chapter_id IS NOT NULL);


--
-- Name: idx_narrative_story_chapters_scenes; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_narrative_story_chapters_scenes ON public.narrative_story_chapters USING gin (scene_ids);


--
-- Name: idx_narrative_story_chapters_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_narrative_story_chapters_user_created ON public.narrative_story_chapters USING btree (user_id, created_at DESC);


--
-- Name: idx_narrative_story_chapters_user_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_narrative_story_chapters_user_time ON public.narrative_story_chapters USING btree (user_id, time_start DESC NULLS LAST);


--
-- Name: idx_omega_claims_entity_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_omega_claims_entity_active ON public.omega_claims USING btree (entity_id, is_active);


--
-- Name: idx_omega_claims_user_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_omega_claims_user_entity ON public.omega_claims USING btree (user_id, entity_id);


--
-- Name: idx_omega_entities_aliases; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_omega_entities_aliases ON public.omega_entities USING gin (aliases);


--
-- Name: idx_omega_entities_user_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_omega_entities_user_type ON public.omega_entities USING btree (user_id, type);


--
-- Name: idx_omega_evidence_claim; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_omega_evidence_claim ON public.omega_evidence USING btree (claim_id);


--
-- Name: idx_organization_suggestions_user_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_organization_suggestions_user_status ON public.organization_suggestions USING btree (user_id, status_row);


--
-- Name: idx_organizations_parent_group; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_organizations_parent_group ON public.organizations USING btree (parent_group_id) WHERE (parent_group_id IS NOT NULL);


--
-- Name: idx_organizations_social_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_organizations_social_category ON public.organizations USING btree (user_id, social_category);


--
-- Name: idx_project_chronicle_milestones_occurred; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_project_chronicle_milestones_occurred ON public.project_chronicle_milestones USING btree (occurred_at DESC);


--
-- Name: idx_project_chronicle_pending_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_project_chronicle_pending_status ON public.project_chronicle_pending_detections USING btree (status, detected_at DESC);


--
-- Name: idx_project_suggestions_user_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_project_suggestions_user_status ON public.project_suggestions USING btree (user_id, status_row);


--
-- Name: idx_quest_achievements_quest; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quest_achievements_quest ON public.quest_achievements USING btree (quest_id);


--
-- Name: idx_quest_achievements_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quest_achievements_user ON public.quest_achievements USING btree (user_id, unlocked_at DESC);


--
-- Name: idx_quest_dependencies_depends; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quest_dependencies_depends ON public.quest_dependencies USING btree (depends_on_quest_id);


--
-- Name: idx_quest_dependencies_quest; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quest_dependencies_quest ON public.quest_dependencies USING btree (quest_id);


--
-- Name: idx_quest_history_quest; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quest_history_quest ON public.quest_history USING btree (quest_id, created_at DESC);


--
-- Name: idx_quest_history_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quest_history_type ON public.quest_history USING btree (user_id, event_type);


--
-- Name: idx_quest_history_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quest_history_user ON public.quest_history USING btree (user_id, created_at DESC);


--
-- Name: idx_quest_suggestions_item_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quest_suggestions_item_type ON public.quest_suggestions USING btree (user_id, item_type) WHERE (item_type IS NOT NULL);


--
-- Name: idx_quest_suggestions_user_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quest_suggestions_user_status ON public.quest_suggestions USING btree (user_id, status);


--
-- Name: idx_quests_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quests_category ON public.quests USING btree (user_id, category) WHERE (category IS NOT NULL);


--
-- Name: idx_quests_chain; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quests_chain ON public.quests USING btree (user_id, quest_chain_id) WHERE (quest_chain_id IS NOT NULL);


--
-- Name: idx_quests_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quests_created ON public.quests USING btree (user_id, created_at DESC);


--
-- Name: idx_quests_goal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quests_goal ON public.quests USING btree (related_goal_id) WHERE (related_goal_id IS NOT NULL);


--
-- Name: idx_quests_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quests_parent ON public.quests USING btree (parent_quest_id);


--
-- Name: idx_quests_tags; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quests_tags ON public.quests USING gin (tags);


--
-- Name: idx_quests_task; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quests_task ON public.quests USING btree (related_task_id) WHERE (related_task_id IS NOT NULL);


--
-- Name: idx_quests_user_completed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quests_user_completed ON public.quests USING btree (user_id, completed_at DESC) WHERE (status = 'completed'::text);


--
-- Name: idx_quests_user_priority; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quests_user_priority ON public.quests USING btree (user_id, priority DESC, importance DESC, impact DESC);


--
-- Name: idx_quests_user_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quests_user_status ON public.quests USING btree (user_id, status);


--
-- Name: idx_quests_user_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quests_user_type ON public.quests USING btree (user_id, quest_type);


--
-- Name: idx_resolved_events_activities_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_resolved_events_activities_gin ON public.resolved_events USING gin (activities);


--
-- Name: idx_resolved_events_embedding; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_resolved_events_embedding ON public.resolved_events USING hnsw (embedding public.vector_cosine_ops) WHERE (embedding IS NOT NULL);


--
-- Name: idx_resolved_events_locations_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_resolved_events_locations_gin ON public.resolved_events USING gin (locations);


--
-- Name: idx_resolved_events_people_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_resolved_events_people_gin ON public.resolved_events USING gin (people);


--
-- Name: idx_resolved_events_significance; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_resolved_events_significance ON public.resolved_events USING btree (user_id, significance_score DESC);


--
-- Name: idx_resolved_events_start_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_resolved_events_start_time ON public.resolved_events USING btree (user_id, start_time DESC);


--
-- Name: idx_resolved_events_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_resolved_events_type ON public.resolved_events USING btree (user_id, type);


--
-- Name: idx_reversal_logs_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reversal_logs_event ON public.reversal_logs USING btree (event_id);


--
-- Name: idx_reversal_logs_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reversal_logs_user ON public.reversal_logs USING btree (user_id);


--
-- Name: idx_romantic_rel_person; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_romantic_rel_person ON public.romantic_relationships USING btree (user_id, person_id);


--
-- Name: idx_romantic_rel_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_romantic_rel_user ON public.romantic_relationships USING btree (user_id);


--
-- Name: idx_salience_scores_rank; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_salience_scores_rank ON public.salience_scores USING btree (user_id, score DESC);


--
-- Name: idx_sessions_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sessions_user_id ON public.conversation_sessions USING btree (user_id);


--
-- Name: idx_sessions_user_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sessions_user_time ON public.conversation_sessions USING btree (user_id, started_at DESC);


--
-- Name: idx_shadow_entity_f1; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shadow_entity_f1 ON public.shadow_extraction_log USING btree (entity_f1 DESC) WHERE (entity_f1 IS NOT NULL);


--
-- Name: idx_shadow_extraction_message; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shadow_extraction_message ON public.shadow_extraction_log USING btree (message_id);


--
-- Name: idx_shadow_extraction_success; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shadow_extraction_success ON public.shadow_extraction_log USING btree (created_at DESC) WHERE (merged_extraction IS NOT NULL);


--
-- Name: idx_shadow_extraction_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shadow_extraction_user_created ON public.shadow_extraction_log USING btree (user_id, created_at DESC);


--
-- Name: idx_shadow_novel_entities; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shadow_novel_entities ON public.shadow_extraction_log USING btree (novel_entity_count DESC) WHERE (novel_entity_count > 0);


--
-- Name: idx_shadow_readiness; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shadow_readiness ON public.shadow_extraction_log USING btree (created_at DESC, entity_f1, token_reduction_pct) WHERE (merged_extraction IS NOT NULL);


--
-- Name: idx_shadow_token_reduction; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shadow_token_reduction ON public.shadow_extraction_log USING btree (token_reduction_pct DESC) WHERE (token_reduction_pct IS NOT NULL);


--
-- Name: idx_skill_clusters_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_skill_clusters_user ON public.skill_clusters USING btree (user_id);


--
-- Name: idx_skill_evidence_skill; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_skill_evidence_skill ON public.skill_evidence USING btree (skill_id);


--
-- Name: idx_skill_relationships_from; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_skill_relationships_from ON public.skill_relationships USING btree (from_skill_id);


--
-- Name: idx_skill_relationships_to; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_skill_relationships_to ON public.skill_relationships USING btree (to_skill_id);


--
-- Name: idx_skill_relationships_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_skill_relationships_type ON public.skill_relationships USING btree (relationship_type);


--
-- Name: idx_skill_relationships_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_skill_relationships_user ON public.skill_relationships USING btree (user_id);


--
-- Name: idx_skill_suggestions_user_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_skill_suggestions_user_status ON public.skill_suggestions USING btree (user_id, status);


--
-- Name: idx_skill_usage_events_skill; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_skill_usage_events_skill ON public.skill_usage_events USING btree (skill_id, used_at DESC);


--
-- Name: idx_suggestion_dismissal_stats_user_domain; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_suggestion_dismissal_stats_user_domain ON public.suggestion_dismissal_stats USING btree (user_id, book_domain);


--
-- Name: idx_suggestion_thread_dismissals_user_domain; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_suggestion_thread_dismissals_user_domain ON public.suggestion_thread_dismissals USING btree (user_id, book_domain);


--
-- Name: idx_user_corrections_training; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_corrections_training ON public.user_corrections USING btree (used_for_training) WHERE (used_for_training = false);


--
-- Name: idx_user_corrections_user_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_corrections_user_type ON public.user_corrections USING btree (user_id, correction_type);


--
-- Name: idx_user_files_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_files_status ON public.user_files USING btree (user_id, processing_status);


--
-- Name: idx_user_files_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_files_user_id ON public.user_files USING btree (user_id);


--
-- Name: idx_user_inference_state_updated; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_inference_state_updated ON public.user_inference_state USING btree (updated_at);


--
-- Name: idx_utterances_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_utterances_user ON public.utterances USING btree (user_id);


--
-- Name: ingestion_jobs_lease_token_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ingestion_jobs_lease_token_idx ON public.ingestion_jobs USING btree (lease_token) WHERE (lease_token IS NOT NULL);


--
-- Name: ingestion_jobs_logical_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ingestion_jobs_logical_status_idx ON public.ingestion_jobs USING btree (logical_status, next_retry_at) WHERE ((logical_status IS NOT NULL) AND (logical_status = ANY (ARRAY['QUEUED'::text, 'PROCESSING'::text, 'PARTIAL'::text, 'RETRYABLE_FAILED'::text])));


--
-- Name: ingestion_jobs_resumable_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ingestion_jobs_resumable_idx ON public.ingestion_jobs USING btree (created_at) WHERE (status = ANY (ARRAY['pending'::text, 'processing'::text]));


--
-- Name: ingestion_jobs_stale_lock_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ingestion_jobs_stale_lock_idx ON public.ingestion_jobs USING btree (locked_at) WHERE ((locked_at IS NOT NULL) AND (status = ANY (ARRAY['pending'::text, 'processing'::text])));


--
-- Name: ingestion_jobs_status_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ingestion_jobs_status_user_idx ON public.ingestion_jobs USING btree (user_id, status, updated_at DESC);


--
-- Name: interest_mentions_interest_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX interest_mentions_interest_id_idx ON public.interest_mentions USING btree (interest_id);


--
-- Name: interest_mentions_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX interest_mentions_user_id_idx ON public.interest_mentions USING btree (user_id);


--
-- Name: interest_scope_groups_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX interest_scope_groups_user_id_idx ON public.interest_scope_groups USING btree (user_id);


--
-- Name: interest_scopes_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX interest_scopes_user_id_idx ON public.interest_scopes USING btree (user_id);


--
-- Name: interests_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX interests_category_idx ON public.interests USING btree (user_id, interest_category);


--
-- Name: interests_interest_level_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX interests_interest_level_idx ON public.interests USING btree (user_id, interest_level DESC);


--
-- Name: interests_interest_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX interests_interest_name_idx ON public.interests USING btree (user_id, interest_name);


--
-- Name: interests_last_mentioned_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX interests_last_mentioned_idx ON public.interests USING btree (user_id, last_mentioned_at DESC);


--
-- Name: interests_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX interests_user_id_idx ON public.interests USING btree (user_id);


--
-- Name: journal_entries_accessibility_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX journal_entries_accessibility_idx ON public.journal_entries USING btree (accessibility_score) WHERE (accessibility_score > (0.1)::double precision);


--
-- Name: journal_entries_chapter_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX journal_entries_chapter_id_idx ON public.journal_entries USING btree (chapter_id);


--
-- Name: journal_entries_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX journal_entries_date_idx ON public.journal_entries USING btree (date DESC);


--
-- Name: journal_entries_embedding_hnsw; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX journal_entries_embedding_hnsw ON public.journal_entries USING hnsw (embedding public.vector_cosine_ops) WITH (m='16', ef_construction='64');


--
-- Name: journal_entries_tags_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX journal_entries_tags_idx ON public.journal_entries USING gin (tags);


--
-- Name: journal_entries_time_precision_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX journal_entries_time_precision_idx ON public.journal_entries USING btree (user_id, time_precision);


--
-- Name: journal_entries_time_range_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX journal_entries_time_range_idx ON public.journal_entries USING btree (user_id, date, end_time) WHERE (end_time IS NOT NULL);


--
-- Name: journal_entries_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX journal_entries_user_id_idx ON public.journal_entries USING btree (user_id);


--
-- Name: knowledge_gaps_one_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX knowledge_gaps_one_pending ON public.knowledge_gaps USING btree (user_id, gap_type, lower(label)) WHERE (status = 'pending'::text);


--
-- Name: knowledge_gaps_user_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX knowledge_gaps_user_status ON public.knowledge_gaps USING btree (user_id, status);


--
-- Name: life_arcs_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX life_arcs_active_idx ON public.life_arcs USING btree (user_id, is_active) WHERE (is_active = true);


--
-- Name: life_arcs_track_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX life_arcs_track_idx ON public.life_arcs USING btree (user_id, track) WHERE (track IS NOT NULL);


--
-- Name: lore_agent_observations_run_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lore_agent_observations_run_idx ON public.lore_agent_observations USING btree (user_id, run_id);


--
-- Name: lore_agent_proposed_actions_run_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lore_agent_proposed_actions_run_idx ON public.lore_agent_proposed_actions USING btree (user_id, run_id);


--
-- Name: lore_agent_proposed_actions_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lore_agent_proposed_actions_status_idx ON public.lore_agent_proposed_actions USING btree (user_id, status, created_at DESC);


--
-- Name: lore_agent_runs_message_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lore_agent_runs_message_idx ON public.lore_agent_runs USING btree (user_id, message_id, created_at DESC);


--
-- Name: lore_agent_runs_run_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lore_agent_runs_run_idx ON public.lore_agent_runs USING btree (user_id, run_id);


--
-- Name: lore_topic_ledger_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lore_topic_ledger_user_idx ON public.lore_topic_ledger USING btree (user_id, updated_at DESC);


--
-- Name: lore_topic_ledger_user_snapshot_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lore_topic_ledger_user_snapshot_idx ON public.lore_topic_ledger USING btree (user_id, total_atoms_snapshot);


--
-- Name: mcp_audit_tool_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mcp_audit_tool_idx ON public.mcp_tool_audit_log USING btree (tool_name, created_at DESC);


--
-- Name: mcp_audit_user_time_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mcp_audit_user_time_idx ON public.mcp_tool_audit_log USING btree (user_id, created_at DESC);


--
-- Name: mcp_events_aggregate_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mcp_events_aggregate_idx ON public.mcp_events USING btree (user_id, aggregate_type, aggregate_id, created_at);


--
-- Name: mcp_oauth_codes_client_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mcp_oauth_codes_client_idx ON public.mcp_oauth_authorization_codes USING btree (client_id, created_at DESC);


--
-- Name: mcp_oauth_codes_expires_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mcp_oauth_codes_expires_idx ON public.mcp_oauth_authorization_codes USING btree (expires_at);


--
-- Name: mcp_oauth_refresh_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mcp_oauth_refresh_user_idx ON public.mcp_oauth_refresh_tokens USING btree (user_id, client_id);


--
-- Name: memory_events_entity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX memory_events_entity_idx ON public.memory_events USING btree (entity_id) WHERE (entity_id IS NOT NULL);


--
-- Name: memory_events_session_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX memory_events_session_idx ON public.memory_events USING btree (session_id) WHERE (session_id IS NOT NULL);


--
-- Name: memory_events_source_message_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX memory_events_source_message_idx ON public.memory_events USING btree (source_message_id) WHERE (source_message_id IS NOT NULL);


--
-- Name: memory_events_supersedes_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX memory_events_supersedes_idx ON public.memory_events USING btree (supersedes_event_id) WHERE (supersedes_event_id IS NOT NULL);


--
-- Name: memory_events_user_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX memory_events_user_created_idx ON public.memory_events USING btree (user_id, created_at DESC);


--
-- Name: memory_events_user_kind_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX memory_events_user_kind_idx ON public.memory_events USING btree (user_id, kind);


--
-- Name: narrative_accounts_source_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX narrative_accounts_source_uidx ON public.narrative_accounts USING btree (user_id, event_record_id, account_type, source_message_id) WHERE ((source_message_id IS NOT NULL) AND (event_record_id IS NOT NULL));


--
-- Name: omega_claims_embedding_hnsw; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX omega_claims_embedding_hnsw ON public.omega_claims USING hnsw (embedding public.vector_cosine_ops) WITH (m='16', ef_construction='64');


--
-- Name: omega_claims_lifecycle_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX omega_claims_lifecycle_idx ON public.omega_claims USING btree (user_id, lifecycle_state);


--
-- Name: omega_claims_source_event_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX omega_claims_source_event_idx ON public.omega_claims USING btree (source_event_id) WHERE (source_event_id IS NOT NULL);


--
-- Name: omega_entities_embedding_hnsw; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX omega_entities_embedding_hnsw ON public.omega_entities USING hnsw (embedding public.vector_cosine_ops) WITH (m='16', ef_construction='64');


--
-- Name: openai_cost_daily_day_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX openai_cost_daily_day_idx ON public.openai_cost_daily USING btree (day DESC);


--
-- Name: org_rel_from_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX org_rel_from_idx ON public.organization_relationships USING btree (from_org_id);


--
-- Name: org_rel_to_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX org_rel_to_idx ON public.organization_relationships USING btree (to_org_id);


--
-- Name: org_rel_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX org_rel_type_idx ON public.organization_relationships USING btree (relationship_type);


--
-- Name: org_rel_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX org_rel_user_idx ON public.organization_relationships USING btree (user_id);


--
-- Name: organization_events_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organization_events_date_idx ON public.organization_events USING btree (date DESC);


--
-- Name: organization_events_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organization_events_org_idx ON public.organization_events USING btree (organization_id);


--
-- Name: organization_locations_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organization_locations_org_idx ON public.organization_locations USING btree (organization_id);


--
-- Name: organization_members_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organization_members_org_idx ON public.organization_members USING btree (organization_id);


--
-- Name: organization_members_unique_character_member_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX organization_members_unique_character_member_idx ON public.organization_members USING btree (organization_id, character_id) WHERE (character_id IS NOT NULL);


--
-- Name: organization_members_user_character_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organization_members_user_character_idx ON public.organization_members USING btree (user_id, character_id) WHERE (character_id IS NOT NULL);


--
-- Name: organization_members_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organization_members_user_idx ON public.organization_members USING btree (user_id);


--
-- Name: organization_members_user_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organization_members_user_org_idx ON public.organization_members USING btree (user_id, organization_id);


--
-- Name: organization_stories_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organization_stories_date_idx ON public.organization_stories USING btree (date DESC);


--
-- Name: organization_stories_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organization_stories_org_idx ON public.organization_stories USING btree (organization_id);


--
-- Name: organizations_group_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organizations_group_type_idx ON public.organizations USING btree (group_type);


--
-- Name: organizations_public_entity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organizations_public_entity_idx ON public.organizations USING btree (is_public_entity) WHERE (is_public_entity = true);


--
-- Name: organizations_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organizations_status_idx ON public.organizations USING btree (status);


--
-- Name: organizations_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organizations_type_idx ON public.organizations USING btree (type);


--
-- Name: organizations_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organizations_user_id_idx ON public.organizations USING btree (user_id);


--
-- Name: organizations_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organizations_user_idx ON public.organizations USING btree (user_id);


--
-- Name: organizations_user_name_key_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX organizations_user_name_key_idx ON public.organizations USING btree (user_id, lower(name));


--
-- Name: organizations_user_relationship_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organizations_user_relationship_idx ON public.organizations USING btree (user_relationship);


--
-- Name: organizations_user_updated_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organizations_user_updated_idx ON public.organizations USING btree (user_id, updated_at DESC);


--
-- Name: original_documents_source_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX original_documents_source_idx ON public.original_documents USING btree (source);


--
-- Name: original_documents_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX original_documents_user_id_idx ON public.original_documents USING btree (user_id);


--
-- Name: people_places_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX people_places_type_idx ON public.people_places USING btree (type);


--
-- Name: people_places_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX people_places_user_id_idx ON public.people_places USING btree (user_id);


--
-- Name: perception_entries_high_emotion_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX perception_entries_high_emotion_idx ON public.perception_entries USING btree (user_id, created_in_high_emotion, created_at) WHERE (created_in_high_emotion = true);


--
-- Name: perception_entries_retracted_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX perception_entries_retracted_idx ON public.perception_entries USING btree (user_id, retracted);


--
-- Name: perception_entries_review_reminder_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX perception_entries_review_reminder_idx ON public.perception_entries USING btree (user_id, review_reminder_at) WHERE (review_reminder_at IS NOT NULL);


--
-- Name: perception_entries_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX perception_entries_status_idx ON public.perception_entries USING btree (user_id, status);


--
-- Name: perception_entries_subject_alias_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX perception_entries_subject_alias_idx ON public.perception_entries USING btree (user_id, subject_alias);


--
-- Name: perception_entries_subject_person_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX perception_entries_subject_person_id_idx ON public.perception_entries USING btree (subject_person_id);


--
-- Name: perception_entries_timestamp_heard_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX perception_entries_timestamp_heard_idx ON public.perception_entries USING btree (timestamp_heard DESC);


--
-- Name: perception_entries_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX perception_entries_user_id_idx ON public.perception_entries USING btree (user_id);


--
-- Name: perspective_claims_active_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX perspective_claims_active_unique ON public.perspective_claims USING btree (base_claim_id, perspective_id) WHERE (is_active = true);


--
-- Name: pipeline_runs_message_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pipeline_runs_message_idx ON public.pipeline_runs USING btree (user_id, chat_message_id);


--
-- Name: pipeline_runs_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pipeline_runs_status_idx ON public.pipeline_runs USING btree (user_id, status, started_at DESC);


--
-- Name: pipeline_runs_timeline_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pipeline_runs_timeline_idx ON public.pipeline_runs USING btree (user_id, started_at DESC);


--
-- Name: preference_evidence_signal_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX preference_evidence_signal_idx ON public.preference_evidence USING btree (signal_id, occurred_at DESC);


--
-- Name: preference_evidence_user_cat_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX preference_evidence_user_cat_idx ON public.preference_evidence USING btree (user_id, category_key);


--
-- Name: preference_signals_user_align_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX preference_signals_user_align_idx ON public.preference_signals USING btree (user_id, alignment_label);


--
-- Name: preference_signals_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX preference_signals_user_idx ON public.preference_signals USING btree (user_id);


--
-- Name: preference_signals_user_reveal_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX preference_signals_user_reveal_idx ON public.preference_signals USING btree (user_id, revealed_count DESC);


--
-- Name: preference_signals_user_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX preference_signals_user_type_idx ON public.preference_signals USING btree (user_id, type);


--
-- Name: profile_claim_evidence_claim_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX profile_claim_evidence_claim_id_idx ON public.profile_claim_evidence USING btree (claim_id);


--
-- Name: profile_claim_evidence_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX profile_claim_evidence_user_id_idx ON public.profile_claim_evidence USING btree (user_id);


--
-- Name: profile_claims_confidence_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX profile_claims_confidence_idx ON public.profile_claims USING btree (user_id, confidence DESC);


--
-- Name: profile_claims_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX profile_claims_status_idx ON public.profile_claims USING btree (user_id, verified_status);


--
-- Name: profile_claims_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX profile_claims_type_idx ON public.profile_claims USING btree (user_id, claim_type);


--
-- Name: profile_claims_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX profile_claims_user_id_idx ON public.profile_claims USING btree (user_id);


--
-- Name: projects_normalized_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX projects_normalized_name_idx ON public.projects USING btree (user_id, normalized_name);


--
-- Name: projects_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX projects_status_idx ON public.projects USING btree (user_id, status);


--
-- Name: projects_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX projects_user_id_idx ON public.projects USING btree (user_id);


--
-- Name: provenance_edges_entity_mentions_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX provenance_edges_entity_mentions_idx ON public.provenance_edges USING btree (user_id, target_id) WHERE (relation = 'MENTIONED_ENTITY'::text);


--
-- Name: provenance_edges_relation_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX provenance_edges_relation_idx ON public.provenance_edges USING btree (user_id, relation, created_at DESC);


--
-- Name: provenance_edges_source_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX provenance_edges_source_idx ON public.provenance_edges USING btree (user_id, source_id, source_type, created_at DESC);


--
-- Name: provenance_edges_target_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX provenance_edges_target_idx ON public.provenance_edges USING btree (user_id, target_id, target_type, created_at DESC);


--
-- Name: relationship_peripherals_dedup_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX relationship_peripherals_dedup_idx ON public.relationship_peripherals USING btree (user_id, anchor_person_id, anchor_person_type, domain, lower(peripheral_surface)) WHERE (tier <> 'dismissed'::text);


--
-- Name: relationship_peripherals_user_anchor_person_domain_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX relationship_peripherals_user_anchor_person_domain_idx ON public.relationship_peripherals USING btree (user_id, anchor_person_id, domain, tier);


--
-- Name: relationship_peripherals_user_anchor_rel_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX relationship_peripherals_user_anchor_rel_idx ON public.relationship_peripherals USING btree (user_id, anchor_relationship_id);


--
-- Name: resolved_events_source_message_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX resolved_events_source_message_idx ON public.resolved_events USING btree (user_id, source_message_id) WHERE (source_message_id IS NOT NULL);


--
-- Name: resolved_events_temporal_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX resolved_events_temporal_status_idx ON public.resolved_events USING btree (user_id, temporal_status);


--
-- Name: resolved_events_user_source_fingerprint_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX resolved_events_user_source_fingerprint_uidx ON public.resolved_events USING btree (user_id, source_fingerprint) WHERE (source_fingerprint IS NOT NULL);


--
-- Name: resume_documents_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX resume_documents_status_idx ON public.resume_documents USING btree (user_id, processing_status);


--
-- Name: resume_documents_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX resume_documents_user_id_idx ON public.resume_documents USING btree (user_id);


--
-- Name: romantic_peripherals_dedup_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX romantic_peripherals_dedup_idx ON public.romantic_peripherals USING btree (user_id, anchor_person_id, anchor_person_type, lower(peripheral_surface), tier) WHERE (tier <> 'dismissed'::text);


--
-- Name: romantic_peripherals_user_anchor_person_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX romantic_peripherals_user_anchor_person_idx ON public.relationship_peripherals USING btree (user_id, anchor_person_id, tier);


--
-- Name: romantic_peripherals_user_anchor_rel_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX romantic_peripherals_user_anchor_rel_idx ON public.romantic_peripherals USING btree (user_id, anchor_relationship_id);


--
-- Name: skill_progress_skill_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX skill_progress_skill_id_idx ON public.skill_progress USING btree (skill_id);


--
-- Name: skill_progress_timestamp_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX skill_progress_timestamp_idx ON public.skill_progress USING btree ("timestamp");


--
-- Name: skill_progress_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX skill_progress_user_id_idx ON public.skill_progress USING btree (user_id);


--
-- Name: skills_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX skills_active_idx ON public.skills USING btree (user_id, is_active) WHERE (is_active = true);


--
-- Name: skills_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX skills_category_idx ON public.skills USING btree (skill_category);


--
-- Name: skills_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX skills_user_id_idx ON public.skills USING btree (user_id);


--
-- Name: subscriptions_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX subscriptions_status_idx ON public.subscriptions USING btree (status);


--
-- Name: system_knowledge_concept_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX system_knowledge_concept_idx ON public.system_knowledge USING btree (concept);


--
-- Name: task_events_task_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX task_events_task_idx ON public.task_events USING btree (task_id);


--
-- Name: task_events_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX task_events_user_idx ON public.task_events USING btree (user_id, created_at DESC);


--
-- Name: tasks_due_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tasks_due_idx ON public.tasks USING btree (user_id, due_date);


--
-- Name: tasks_priority_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tasks_priority_idx ON public.tasks USING btree (priority);


--
-- Name: tasks_user_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tasks_user_status_idx ON public.tasks USING btree (user_id, status);


--
-- Name: terms_acceptance_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX terms_acceptance_user_id_idx ON public.terms_acceptance USING btree (user_id);


--
-- Name: text_message_uploads_character_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX text_message_uploads_character_idx ON public.text_message_uploads USING btree (user_id, character_id, created_at DESC);


--
-- Name: text_message_uploads_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX text_message_uploads_user_idx ON public.text_message_uploads USING btree (user_id, created_at DESC);


--
-- Name: timeline_actions_dates_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX timeline_actions_dates_idx ON public.timeline_actions USING btree (start_date, end_date);


--
-- Name: timeline_actions_parent_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX timeline_actions_parent_id_idx ON public.timeline_actions USING btree (parent_id);


--
-- Name: timeline_actions_tags_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX timeline_actions_tags_idx ON public.timeline_actions USING gin (tags);


--
-- Name: timeline_actions_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX timeline_actions_user_id_idx ON public.timeline_actions USING btree (user_id);


--
-- Name: timeline_arcs_dates_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX timeline_arcs_dates_idx ON public.timeline_arcs USING btree (start_date, end_date);


--
-- Name: timeline_arcs_parent_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX timeline_arcs_parent_id_idx ON public.timeline_arcs USING btree (parent_id);


--
-- Name: timeline_arcs_tags_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX timeline_arcs_tags_idx ON public.timeline_arcs USING gin (tags);


--
-- Name: timeline_arcs_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX timeline_arcs_user_id_idx ON public.timeline_arcs USING btree (user_id);


--
-- Name: timeline_epochs_dates_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX timeline_epochs_dates_idx ON public.timeline_epochs USING btree (start_date, end_date);


--
-- Name: timeline_epochs_parent_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX timeline_epochs_parent_id_idx ON public.timeline_epochs USING btree (parent_id);


--
-- Name: timeline_epochs_tags_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX timeline_epochs_tags_idx ON public.timeline_epochs USING gin (tags);


--
-- Name: timeline_epochs_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX timeline_epochs_user_id_idx ON public.timeline_epochs USING btree (user_id);


--
-- Name: timeline_eras_dates_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX timeline_eras_dates_idx ON public.timeline_eras USING btree (start_date, end_date);


--
-- Name: timeline_eras_parent_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX timeline_eras_parent_id_idx ON public.timeline_eras USING btree (parent_id);


--
-- Name: timeline_eras_tags_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX timeline_eras_tags_idx ON public.timeline_eras USING gin (tags);


--
-- Name: timeline_eras_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX timeline_eras_user_id_idx ON public.timeline_eras USING btree (user_id);


--
-- Name: timeline_memberships_entry_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX timeline_memberships_entry_id_idx ON public.timeline_memberships USING btree (journal_entry_id);


--
-- Name: timeline_memberships_entry_timeline_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX timeline_memberships_entry_timeline_idx ON public.timeline_memberships USING btree (journal_entry_id, timeline_id);


--
-- Name: timeline_memberships_timeline_entry_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX timeline_memberships_timeline_entry_idx ON public.timeline_memberships USING btree (timeline_id, journal_entry_id);


--
-- Name: timeline_memberships_timeline_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX timeline_memberships_timeline_id_idx ON public.timeline_memberships USING btree (timeline_id);


--
-- Name: timeline_memberships_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX timeline_memberships_user_id_idx ON public.timeline_memberships USING btree (user_id);


--
-- Name: timeline_microactions_dates_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX timeline_microactions_dates_idx ON public.timeline_microactions USING btree (start_date, end_date);


--
-- Name: timeline_microactions_parent_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX timeline_microactions_parent_id_idx ON public.timeline_microactions USING btree (parent_id);


--
-- Name: timeline_microactions_tags_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX timeline_microactions_tags_idx ON public.timeline_microactions USING gin (tags);


--
-- Name: timeline_microactions_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX timeline_microactions_user_id_idx ON public.timeline_microactions USING btree (user_id);


--
-- Name: timeline_mythos_dates_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX timeline_mythos_dates_idx ON public.timeline_mythos USING btree (start_date, end_date);


--
-- Name: timeline_mythos_tags_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX timeline_mythos_tags_idx ON public.timeline_mythos USING gin (tags);


--
-- Name: timeline_mythos_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX timeline_mythos_user_id_idx ON public.timeline_mythos USING btree (user_id);


--
-- Name: timeline_relationships_source_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX timeline_relationships_source_idx ON public.timeline_relationships USING btree (source_timeline_id);


--
-- Name: timeline_relationships_target_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX timeline_relationships_target_idx ON public.timeline_relationships USING btree (target_timeline_id);


--
-- Name: timeline_relationships_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX timeline_relationships_type_idx ON public.timeline_relationships USING btree (relationship_type);


--
-- Name: timeline_relationships_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX timeline_relationships_user_id_idx ON public.timeline_relationships USING btree (user_id);


--
-- Name: timeline_sagas_dates_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX timeline_sagas_dates_idx ON public.timeline_sagas USING btree (start_date, end_date);


--
-- Name: timeline_sagas_parent_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX timeline_sagas_parent_id_idx ON public.timeline_sagas USING btree (parent_id);


--
-- Name: timeline_sagas_tags_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX timeline_sagas_tags_idx ON public.timeline_sagas USING gin (tags);


--
-- Name: timeline_sagas_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX timeline_sagas_user_id_idx ON public.timeline_sagas USING btree (user_id);


--
-- Name: timeline_scenes_dates_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX timeline_scenes_dates_idx ON public.timeline_scenes USING btree (start_date, end_date);


--
-- Name: timeline_scenes_parent_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX timeline_scenes_parent_id_idx ON public.timeline_scenes USING btree (parent_id);


--
-- Name: timeline_scenes_tags_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX timeline_scenes_tags_idx ON public.timeline_scenes USING gin (tags);


--
-- Name: timeline_scenes_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX timeline_scenes_user_id_idx ON public.timeline_scenes USING btree (user_id);


--
-- Name: timeline_search_index_layer_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX timeline_search_index_layer_idx ON public.timeline_search_index USING btree (layer_type, layer_id);


--
-- Name: timeline_search_index_tags_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX timeline_search_index_tags_idx ON public.timeline_search_index USING gin (tags);


--
-- Name: timeline_search_index_text_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX timeline_search_index_text_idx ON public.timeline_search_index USING gin (to_tsvector('english'::regconfig, search_text));


--
-- Name: timeline_search_index_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX timeline_search_index_user_id_idx ON public.timeline_search_index USING btree (user_id);


--
-- Name: timelines_dates_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX timelines_dates_idx ON public.timelines USING btree (user_id, start_date, end_date);


--
-- Name: timelines_metadata_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX timelines_metadata_idx ON public.timelines USING gin (metadata);


--
-- Name: timelines_parent_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX timelines_parent_id_idx ON public.timelines USING btree (parent_id);


--
-- Name: timelines_tags_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX timelines_tags_idx ON public.timelines USING gin (tags);


--
-- Name: timelines_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX timelines_type_idx ON public.timelines USING btree (user_id, timeline_type);


--
-- Name: timelines_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX timelines_user_id_idx ON public.timelines USING btree (user_id);


--
-- Name: uniq_one_self_character_per_user; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uniq_one_self_character_per_user ON public.characters USING btree (user_id) WHERE ((metadata ->> 'is_self'::text) = 'true'::text);


--
-- Name: uq_conversation_sessions_user_thread_no; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_conversation_sessions_user_thread_no ON public.conversation_sessions USING btree (user_id, thread_number) WHERE (thread_number IS NOT NULL);


--
-- Name: user_activity_logs_timestamp_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_activity_logs_timestamp_idx ON public.user_activity_logs USING btree ("timestamp" DESC);


--
-- Name: user_activity_logs_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_activity_logs_user_id_idx ON public.user_activity_logs USING btree (user_id);


--
-- Name: user_chronology_order_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_chronology_order_scope_idx ON public.user_chronology_order USING btree (user_id, scope_type, scope_id, sort_index);


--
-- Name: utterances_message_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX utterances_message_id_idx ON public.utterances USING btree (message_id);


--
-- Name: omega_claims_with_evidence _RETURN; Type: RULE; Schema: public; Owner: -
--

CREATE OR REPLACE VIEW public.omega_claims_with_evidence WITH (security_invoker='on') AS
 SELECT c.id,
    c.user_id,
    c.entity_id,
    c.text,
    c.source,
    c.confidence,
    c.sentiment,
    c.start_time,
    c.end_time,
    c.is_active,
    c.created_at,
    c.updated_at,
    c.metadata,
    c.embedding,
    c.temporal_context,
    c.temporal_confidence,
    COALESCE((sum(e.reliability_score) / (NULLIF(count(e.id), 0))::double precision), (0.5)::double precision) AS evidence_weighted_score,
    count(e.id) AS evidence_count
   FROM (public.omega_claims c
     LEFT JOIN public.omega_evidence e ON ((e.claim_id = c.id)))
  WHERE (c.is_active = true)
  GROUP BY c.id;


--
-- Name: event_candidates event_candidates_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER event_candidates_updated_at BEFORE UPDATE ON public.event_candidates FOR EACH ROW EXECUTE FUNCTION public.set_event_candidates_updated_at();


--
-- Name: identity_mutations identity_mutations_no_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER identity_mutations_no_delete BEFORE DELETE ON public.identity_mutations FOR EACH ROW EXECUTE FUNCTION public.identity_mutations_block_mutate();


--
-- Name: identity_mutations identity_mutations_no_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER identity_mutations_no_update BEFORE UPDATE ON public.identity_mutations FOR EACH ROW EXECUTE FUNCTION public.identity_mutations_block_mutate();


--
-- Name: interest_scope_groups interest_scope_groups_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER interest_scope_groups_updated_at BEFORE UPDATE ON public.interest_scope_groups FOR EACH ROW EXECUTE FUNCTION public.update_interests_updated_at();


--
-- Name: interest_scopes interest_scopes_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER interest_scopes_updated_at BEFORE UPDATE ON public.interest_scopes FOR EACH ROW EXECUTE FUNCTION public.update_interests_updated_at();


--
-- Name: interests interests_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER interests_updated_at BEFORE UPDATE ON public.interests FOR EACH ROW EXECUTE FUNCTION public.update_interests_updated_at();


--
-- Name: life_arcs life_arcs_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER life_arcs_updated_at BEFORE UPDATE ON public.life_arcs FOR EACH ROW EXECUTE FUNCTION public.set_life_arcs_updated_at();


--
-- Name: memory_events memory_events_no_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER memory_events_no_delete BEFORE DELETE ON public.memory_events FOR EACH ROW EXECUTE FUNCTION public.memory_events_block_mutate();


--
-- Name: memory_events memory_events_no_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER memory_events_no_update BEFORE UPDATE ON public.memory_events FOR EACH ROW EXECUTE FUNCTION public.memory_events_block_mutate();


--
-- Name: omega_entities omega_entities_sync_entity_type; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER omega_entities_sync_entity_type BEFORE INSERT OR UPDATE ON public.omega_entities FOR EACH ROW EXECUTE FUNCTION public.sync_omega_entity_type();


--
-- Name: organizations organizations_updated_at_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER organizations_updated_at_trigger BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.update_organizations_updated_at();


--
-- Name: perception_entries perception_entries_character_stats; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER perception_entries_character_stats AFTER INSERT OR DELETE OR UPDATE ON public.perception_entries FOR EACH ROW EXECUTE FUNCTION public.update_character_perception_stats();


--
-- Name: perception_entries perception_entries_preserve_original; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER perception_entries_preserve_original BEFORE UPDATE ON public.perception_entries FOR EACH ROW EXECUTE FUNCTION public.preserve_perception_original_content();


--
-- Name: perception_entries perception_entries_sync_retraction; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER perception_entries_sync_retraction BEFORE INSERT OR UPDATE ON public.perception_entries FOR EACH ROW EXECUTE FUNCTION public.sync_perception_retraction_status();


--
-- Name: perception_entries perception_entries_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER perception_entries_updated_at BEFORE UPDATE ON public.perception_entries FOR EACH ROW EXECUTE FUNCTION public.update_perception_entries_updated_at();


--
-- Name: characters sync_character_identity_index_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER sync_character_identity_index_trigger AFTER INSERT OR UPDATE OF name, alias, metadata ON public.characters FOR EACH ROW EXECUTE FUNCTION public.sync_character_identity_index();


--
-- Name: journal_entries sync_chronology_index_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER sync_chronology_index_trigger AFTER INSERT OR UPDATE OF date, end_time, time_precision ON public.journal_entries FOR EACH ROW EXECUTE FUNCTION public.sync_chronology_index();


--
-- Name: chat_messages trg_assign_chat_message_refs; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_assign_chat_message_refs BEFORE INSERT ON public.chat_messages FOR EACH ROW EXECUTE FUNCTION public.assign_chat_message_refs();


--
-- Name: conversation_sessions trg_assign_thread_number; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_assign_thread_number BEFORE INSERT ON public.conversation_sessions FOR EACH ROW EXECUTE FUNCTION public.assign_thread_number();


--
-- Name: chat_messages trg_assign_thread_number_on_first_message; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_assign_thread_number_on_first_message AFTER INSERT ON public.chat_messages FOR EACH ROW EXECUTE FUNCTION public.assign_thread_number_on_first_message();


--
-- Name: chapters update_chapters_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_chapters_updated_at BEFORE UPDATE ON public.chapters FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: characters update_characters_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_characters_updated_at BEFORE UPDATE ON public.characters FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: chat_contexts update_chat_contexts_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_chat_contexts_updated_at BEFORE UPDATE ON public.chat_contexts FOR EACH ROW EXECUTE FUNCTION public.update_chat_updated_at();


--
-- Name: chat_sessions update_chat_sessions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_chat_sessions_updated_at BEFORE UPDATE ON public.chat_sessions FOR EACH ROW EXECUTE FUNCTION public.update_chat_updated_at();


--
-- Name: conversation_sessions update_conversation_sessions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_conversation_sessions_updated_at BEFORE UPDATE ON public.conversation_sessions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: journal_entries update_journal_entries_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_journal_entries_updated_at BEFORE UPDATE ON public.journal_entries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: memory_components update_memory_components_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_memory_components_updated_at BEFORE UPDATE ON public.memory_components FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: omega_claims update_omega_claims_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_omega_claims_updated_at BEFORE UPDATE ON public.omega_claims FOR EACH ROW EXECUTE FUNCTION public.update_omega_updated_at();


--
-- Name: omega_entities update_omega_entities_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_omega_entities_updated_at BEFORE UPDATE ON public.omega_entities FOR EACH ROW EXECUTE FUNCTION public.update_omega_updated_at();


--
-- Name: resolved_events update_resolved_events_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_resolved_events_updated_at BEFORE UPDATE ON public.resolved_events FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: tasks update_tasks_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: timeline_actions update_timeline_actions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_timeline_actions_updated_at BEFORE UPDATE ON public.timeline_actions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: timeline_arcs update_timeline_arcs_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_timeline_arcs_updated_at BEFORE UPDATE ON public.timeline_arcs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: timeline_epochs update_timeline_epochs_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_timeline_epochs_updated_at BEFORE UPDATE ON public.timeline_epochs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: timeline_eras update_timeline_eras_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_timeline_eras_updated_at BEFORE UPDATE ON public.timeline_eras FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: timeline_microactions update_timeline_microactions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_timeline_microactions_updated_at BEFORE UPDATE ON public.timeline_microactions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: timeline_mythos update_timeline_mythos_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_timeline_mythos_updated_at BEFORE UPDATE ON public.timeline_mythos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: timeline_sagas update_timeline_sagas_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_timeline_sagas_updated_at BEFORE UPDATE ON public.timeline_sagas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: timeline_scenes update_timeline_scenes_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_timeline_scenes_updated_at BEFORE UPDATE ON public.timeline_scenes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: timelines update_timelines_timestamp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_timelines_timestamp BEFORE UPDATE ON public.timelines FOR EACH ROW EXECUTE FUNCTION public.update_timelines_updated_at();


--
-- Name: achievements achievements_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.achievements
    ADD CONSTRAINT achievements_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: arc_event_links arc_event_links_arc_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.arc_event_links
    ADD CONSTRAINT arc_event_links_arc_id_fkey FOREIGN KEY (arc_id) REFERENCES public.life_arcs(id) ON DELETE CASCADE;


--
-- Name: arc_event_links arc_event_links_journal_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.arc_event_links
    ADD CONSTRAINT arc_event_links_journal_entry_id_fkey FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id) ON DELETE CASCADE;


--
-- Name: arc_event_links arc_event_links_resolved_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.arc_event_links
    ADD CONSTRAINT arc_event_links_resolved_event_id_fkey FOREIGN KEY (resolved_event_id) REFERENCES public.resolved_events(id) ON DELETE CASCADE;


--
-- Name: arc_event_links arc_event_links_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.arc_event_links
    ADD CONSTRAINT arc_event_links_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: arc_memberships arc_memberships_arc_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.arc_memberships
    ADD CONSTRAINT arc_memberships_arc_id_fkey FOREIGN KEY (arc_id) REFERENCES public.life_arcs(id) ON DELETE CASCADE;


--
-- Name: arc_memberships arc_memberships_event_candidate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.arc_memberships
    ADD CONSTRAINT arc_memberships_event_candidate_id_fkey FOREIGN KEY (event_candidate_id) REFERENCES public.event_candidates(id) ON DELETE CASCADE;


--
-- Name: arc_memberships arc_memberships_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.arc_memberships
    ADD CONSTRAINT arc_memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: arc_relationships arc_relationships_source_arc_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.arc_relationships
    ADD CONSTRAINT arc_relationships_source_arc_id_fkey FOREIGN KEY (source_arc_id) REFERENCES public.life_arcs(id) ON DELETE CASCADE;


--
-- Name: arc_relationships arc_relationships_target_arc_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.arc_relationships
    ADD CONSTRAINT arc_relationships_target_arc_id_fkey FOREIGN KEY (target_arc_id) REFERENCES public.life_arcs(id) ON DELETE CASCADE;


--
-- Name: arc_relationships arc_relationships_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.arc_relationships
    ADD CONSTRAINT arc_relationships_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: assertion_evidence assertion_evidence_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assertion_evidence
    ADD CONSTRAINT assertion_evidence_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: association_edges association_edges_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.association_edges
    ADD CONSTRAINT association_edges_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: autobiographical_meaning_artifacts autobiographical_meaning_artifacts_supersedes_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.autobiographical_meaning_artifacts
    ADD CONSTRAINT autobiographical_meaning_artifacts_supersedes_id_fkey FOREIGN KEY (supersedes_id) REFERENCES public.autobiographical_meaning_artifacts(id) ON DELETE SET NULL;


--
-- Name: autobiographical_meaning_artifacts autobiographical_meaning_artifacts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.autobiographical_meaning_artifacts
    ADD CONSTRAINT autobiographical_meaning_artifacts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: chapters chapters_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chapters
    ADD CONSTRAINT chapters_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.timeline_arcs(id) ON DELETE SET NULL;


--
-- Name: character_authority_map character_authority_map_canonical_character_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.character_authority_map
    ADD CONSTRAINT character_authority_map_canonical_character_id_fkey FOREIGN KEY (canonical_character_id) REFERENCES public.characters(id) ON DELETE CASCADE;


--
-- Name: character_authority_map character_authority_map_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.character_authority_map
    ADD CONSTRAINT character_authority_map_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: character_identity_index character_identity_index_character_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.character_identity_index
    ADD CONSTRAINT character_identity_index_character_id_fkey FOREIGN KEY (character_id) REFERENCES public.characters(id) ON DELETE CASCADE;


--
-- Name: character_identity_index character_identity_index_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.character_identity_index
    ADD CONSTRAINT character_identity_index_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: character_media character_media_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.character_media
    ADD CONSTRAINT character_media_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: character_memories character_memories_chapter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.character_memories
    ADD CONSTRAINT character_memories_chapter_id_fkey FOREIGN KEY (chapter_id) REFERENCES public.chapters(id);


--
-- Name: character_memories character_memories_character_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.character_memories
    ADD CONSTRAINT character_memories_character_id_fkey FOREIGN KEY (character_id) REFERENCES public.characters(id) ON DELETE CASCADE;


--
-- Name: character_memories character_memories_journal_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.character_memories
    ADD CONSTRAINT character_memories_journal_entry_id_fkey FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id) ON DELETE CASCADE;


--
-- Name: character_relationships character_relationships_last_shared_memory_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.character_relationships
    ADD CONSTRAINT character_relationships_last_shared_memory_id_fkey FOREIGN KEY (last_shared_memory_id) REFERENCES public.journal_entries(id);


--
-- Name: character_relationships character_relationships_source_character_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.character_relationships
    ADD CONSTRAINT character_relationships_source_character_id_fkey FOREIGN KEY (source_character_id) REFERENCES public.characters(id) ON DELETE CASCADE;


--
-- Name: character_relationships character_relationships_target_character_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.character_relationships
    ADD CONSTRAINT character_relationships_target_character_id_fkey FOREIGN KEY (target_character_id) REFERENCES public.characters(id) ON DELETE CASCADE;


--
-- Name: character_timeline_events character_timeline_events_character_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.character_timeline_events
    ADD CONSTRAINT character_timeline_events_character_id_fkey FOREIGN KEY (character_id) REFERENCES public.characters(id) ON DELETE CASCADE;


--
-- Name: character_timeline_events character_timeline_events_connection_character_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.character_timeline_events
    ADD CONSTRAINT character_timeline_events_connection_character_id_fkey FOREIGN KEY (connection_character_id) REFERENCES public.characters(id);


--
-- Name: character_timeline_events character_timeline_events_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.character_timeline_events
    ADD CONSTRAINT character_timeline_events_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.resolved_events(id) ON DELETE CASCADE;


--
-- Name: character_timeline_events character_timeline_events_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.character_timeline_events
    ADD CONSTRAINT character_timeline_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: chat_contexts chat_contexts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_contexts
    ADD CONSTRAINT chat_contexts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: chat_message_revisions chat_message_revisions_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_message_revisions
    ADD CONSTRAINT chat_message_revisions_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.chat_messages(id) ON DELETE CASCADE;


--
-- Name: chat_message_revisions chat_message_revisions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_message_revisions
    ADD CONSTRAINT chat_message_revisions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: chat_messages chat_messages_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: chat_sessions chat_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_sessions
    ADD CONSTRAINT chat_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: chronology_index chronology_index_journal_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chronology_index
    ADD CONSTRAINT chronology_index_journal_entry_id_fkey FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id) ON DELETE CASCADE;


--
-- Name: chronology_index chronology_index_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chronology_index
    ADD CONSTRAINT chronology_index_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: chronology_order_corrections chronology_order_corrections_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chronology_order_corrections
    ADD CONSTRAINT chronology_order_corrections_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: chronology_snapshots chronology_snapshots_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chronology_snapshots
    ADD CONSTRAINT chronology_snapshots_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: classifications classifications_canonical_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classifications
    ADD CONSTRAINT classifications_canonical_id_fkey FOREIGN KEY (canonical_id) REFERENCES public.classifications(id) ON DELETE SET NULL;


--
-- Name: classifications classifications_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classifications
    ADD CONSTRAINT classifications_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.classifications(id) ON DELETE SET NULL;


--
-- Name: classifications classifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classifications
    ADD CONSTRAINT classifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: continuity_events continuity_events_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.continuity_events
    ADD CONSTRAINT continuity_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: continuity_snapshots continuity_snapshots_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.continuity_snapshots
    ADD CONSTRAINT continuity_snapshots_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: contradiction_signals contradiction_signals_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contradiction_signals
    ADD CONSTRAINT contradiction_signals_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: conversation_compactions conversation_compactions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_compactions
    ADD CONSTRAINT conversation_compactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: conversation_messages conversation_messages_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_messages
    ADD CONSTRAINT conversation_messages_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.conversation_sessions(id) ON DELETE CASCADE;


--
-- Name: conversation_messages conversation_messages_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_messages
    ADD CONSTRAINT conversation_messages_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: conversation_sessions conversation_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_sessions
    ADD CONSTRAINT conversation_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: correction_records correction_records_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.correction_records
    ADD CONSTRAINT correction_records_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: crystallized_knowledge crystallized_knowledge_superseded_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crystallized_knowledge
    ADD CONSTRAINT crystallized_knowledge_superseded_by_id_fkey FOREIGN KEY (superseded_by_id) REFERENCES public.crystallized_knowledge(id) ON DELETE SET NULL;


--
-- Name: crystallized_knowledge crystallized_knowledge_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crystallized_knowledge
    ADD CONSTRAINT crystallized_knowledge_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: engine_results engine_results_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engine_results
    ADD CONSTRAINT engine_results_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: entity_aliases entity_aliases_node_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_aliases
    ADD CONSTRAINT entity_aliases_node_id_fkey FOREIGN KEY (node_id) REFERENCES public.graph_nodes(id) ON DELETE CASCADE;


--
-- Name: entity_aliases entity_aliases_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_aliases
    ADD CONSTRAINT entity_aliases_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: entity_authority_decisions entity_authority_decisions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_authority_decisions
    ADD CONSTRAINT entity_authority_decisions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: entity_conversation_links entity_conversation_links_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_conversation_links
    ADD CONSTRAINT entity_conversation_links_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.conversation_sessions(id) ON DELETE RESTRICT;


--
-- Name: entity_conversation_links entity_conversation_links_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_conversation_links
    ADD CONSTRAINT entity_conversation_links_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: entity_deletion_events entity_deletion_events_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_deletion_events
    ADD CONSTRAINT entity_deletion_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: entity_facts entity_facts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_facts
    ADD CONSTRAINT entity_facts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: entity_gravity_scores entity_gravity_scores_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_gravity_scores
    ADD CONSTRAINT entity_gravity_scores_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: entity_merge_log entity_merge_log_survivor_node_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_merge_log
    ADD CONSTRAINT entity_merge_log_survivor_node_id_fkey FOREIGN KEY (survivor_node_id) REFERENCES public.graph_nodes(id) ON DELETE CASCADE;


--
-- Name: entity_merge_log entity_merge_log_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_merge_log
    ADD CONSTRAINT entity_merge_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: entity_merge_records entity_merge_records_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_merge_records
    ADD CONSTRAINT entity_merge_records_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: entity_questions entity_questions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_questions
    ADD CONSTRAINT entity_questions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: entity_resolution_cache entity_resolution_cache_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_resolution_cache
    ADD CONSTRAINT entity_resolution_cache_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: entry_dependencies entry_dependencies_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entry_dependencies
    ADD CONSTRAINT entry_dependencies_entry_id_fkey FOREIGN KEY (entry_id) REFERENCES public.entry_ir(id) ON DELETE CASCADE;


--
-- Name: entry_dependencies entry_dependencies_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entry_dependencies
    ADD CONSTRAINT entry_dependencies_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: entry_ir entry_ir_consolidated_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entry_ir
    ADD CONSTRAINT entry_ir_consolidated_to_fkey FOREIGN KEY (consolidated_to) REFERENCES public.journal_entries(id) ON DELETE SET NULL;


--
-- Name: entry_ir entry_ir_source_utterance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entry_ir
    ADD CONSTRAINT entry_ir_source_utterance_id_fkey FOREIGN KEY (source_utterance_id) REFERENCES public.utterances(id) ON DELETE SET NULL;


--
-- Name: entry_ir entry_ir_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entry_ir
    ADD CONSTRAINT entry_ir_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: epiphany_insights epiphany_insights_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.epiphany_insights
    ADD CONSTRAINT epiphany_insights_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: episodes episodes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.episodes
    ADD CONSTRAINT episodes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: event_candidates event_candidates_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_candidates
    ADD CONSTRAINT event_candidates_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: event_causal_links event_causal_links_cause_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_causal_links
    ADD CONSTRAINT event_causal_links_cause_event_id_fkey FOREIGN KEY (cause_event_id) REFERENCES public.resolved_events(id) ON DELETE CASCADE;


--
-- Name: event_causal_links event_causal_links_effect_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_causal_links
    ADD CONSTRAINT event_causal_links_effect_event_id_fkey FOREIGN KEY (effect_event_id) REFERENCES public.resolved_events(id) ON DELETE CASCADE;


--
-- Name: event_causal_links event_causal_links_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_causal_links
    ADD CONSTRAINT event_causal_links_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: event_cognitions event_cognitions_event_record_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_cognitions
    ADD CONSTRAINT event_cognitions_event_record_id_fkey FOREIGN KEY (event_record_id) REFERENCES public.event_records(id) ON DELETE CASCADE;


--
-- Name: event_cognitions event_cognitions_source_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_cognitions
    ADD CONSTRAINT event_cognitions_source_message_id_fkey FOREIGN KEY (source_message_id) REFERENCES public.chat_messages(id) ON DELETE SET NULL;


--
-- Name: event_cognitions event_cognitions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_cognitions
    ADD CONSTRAINT event_cognitions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: event_confidence_snapshots event_confidence_snapshots_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_confidence_snapshots
    ADD CONSTRAINT event_confidence_snapshots_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.resolved_events(id) ON DELETE CASCADE;


--
-- Name: event_confidence_snapshots event_confidence_snapshots_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_confidence_snapshots
    ADD CONSTRAINT event_confidence_snapshots_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: event_continuity_links event_continuity_links_current_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_continuity_links
    ADD CONSTRAINT event_continuity_links_current_event_id_fkey FOREIGN KEY (current_event_id) REFERENCES public.resolved_events(id) ON DELETE CASCADE;


--
-- Name: event_continuity_links event_continuity_links_past_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_continuity_links
    ADD CONSTRAINT event_continuity_links_past_event_id_fkey FOREIGN KEY (past_event_id) REFERENCES public.resolved_events(id) ON DELETE CASCADE;


--
-- Name: event_continuity_links event_continuity_links_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_continuity_links
    ADD CONSTRAINT event_continuity_links_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: event_emotions event_emotions_event_record_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_emotions
    ADD CONSTRAINT event_emotions_event_record_id_fkey FOREIGN KEY (event_record_id) REFERENCES public.event_records(id) ON DELETE CASCADE;


--
-- Name: event_emotions event_emotions_source_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_emotions
    ADD CONSTRAINT event_emotions_source_message_id_fkey FOREIGN KEY (source_message_id) REFERENCES public.chat_messages(id) ON DELETE SET NULL;


--
-- Name: event_emotions event_emotions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_emotions
    ADD CONSTRAINT event_emotions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: event_identity_impacts event_identity_impacts_event_record_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_identity_impacts
    ADD CONSTRAINT event_identity_impacts_event_record_id_fkey FOREIGN KEY (event_record_id) REFERENCES public.event_records(id) ON DELETE CASCADE;


--
-- Name: event_identity_impacts event_identity_impacts_source_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_identity_impacts
    ADD CONSTRAINT event_identity_impacts_source_message_id_fkey FOREIGN KEY (source_message_id) REFERENCES public.chat_messages(id) ON DELETE SET NULL;


--
-- Name: event_identity_impacts event_identity_impacts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_identity_impacts
    ADD CONSTRAINT event_identity_impacts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: event_impacts event_impacts_connection_character_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_impacts
    ADD CONSTRAINT event_impacts_connection_character_id_fkey FOREIGN KEY (connection_character_id) REFERENCES public.characters(id);


--
-- Name: event_impacts event_impacts_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_impacts
    ADD CONSTRAINT event_impacts_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.resolved_events(id) ON DELETE CASCADE;


--
-- Name: event_impacts event_impacts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_impacts
    ADD CONSTRAINT event_impacts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: event_meaning_cache event_meaning_cache_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_meaning_cache
    ADD CONSTRAINT event_meaning_cache_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.resolved_events(id) ON DELETE CASCADE;


--
-- Name: event_meaning_cache event_meaning_cache_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_meaning_cache
    ADD CONSTRAINT event_meaning_cache_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: event_mentions event_mentions_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_mentions
    ADD CONSTRAINT event_mentions_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.resolved_events(id) ON DELETE CASCADE;


--
-- Name: event_mentions event_mentions_memory_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_mentions
    ADD CONSTRAINT event_mentions_memory_id_fkey FOREIGN KEY (memory_id) REFERENCES public.journal_entries(id) ON DELETE CASCADE;


--
-- Name: event_records event_records_resolved_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_records
    ADD CONSTRAINT event_records_resolved_event_id_fkey FOREIGN KEY (resolved_event_id) REFERENCES public.resolved_events(id) ON DELETE SET NULL;


--
-- Name: event_records event_records_source_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_records
    ADD CONSTRAINT event_records_source_entry_id_fkey FOREIGN KEY (source_entry_id) REFERENCES public.journal_entries(id) ON DELETE SET NULL;


--
-- Name: event_records event_records_source_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_records
    ADD CONSTRAINT event_records_source_message_id_fkey FOREIGN KEY (source_message_id) REFERENCES public.chat_messages(id) ON DELETE SET NULL;


--
-- Name: event_records event_records_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_records
    ADD CONSTRAINT event_records_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: event_unit_links event_unit_links_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_unit_links
    ADD CONSTRAINT event_unit_links_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.resolved_events(id) ON DELETE CASCADE;


--
-- Name: event_unit_links event_unit_links_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_unit_links
    ADD CONSTRAINT event_unit_links_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.extracted_units(id) ON DELETE CASCADE;


--
-- Name: external_account_connections external_account_connections_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.external_account_connections
    ADD CONSTRAINT external_account_connections_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: extracted_units extracted_units_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extracted_units
    ADD CONSTRAINT extracted_units_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: extracted_units extracted_units_utterance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extracted_units
    ADD CONSTRAINT extracted_units_utterance_id_fkey FOREIGN KEY (utterance_id) REFERENCES public.utterances(id) ON DELETE CASCADE;


--
-- Name: goal_cognition_audit goal_cognition_audit_suggestion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goal_cognition_audit
    ADD CONSTRAINT goal_cognition_audit_suggestion_id_fkey FOREIGN KEY (suggestion_id) REFERENCES public.quest_suggestions(id) ON DELETE SET NULL;


--
-- Name: goal_cognition_audit goal_cognition_audit_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goal_cognition_audit
    ADD CONSTRAINT goal_cognition_audit_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: goal_insights goal_insights_related_goal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goal_insights
    ADD CONSTRAINT goal_insights_related_goal_id_fkey FOREIGN KEY (related_goal_id) REFERENCES public.goals(id) ON DELETE CASCADE;


--
-- Name: goal_insights goal_insights_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goal_insights
    ADD CONSTRAINT goal_insights_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: goals goals_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goals
    ADD CONSTRAINT goals_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: graph_edges graph_edges_from_node_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.graph_edges
    ADD CONSTRAINT graph_edges_from_node_id_fkey FOREIGN KEY (from_node_id) REFERENCES public.graph_nodes(id) ON DELETE CASCADE;


--
-- Name: graph_edges graph_edges_to_node_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.graph_edges
    ADD CONSTRAINT graph_edges_to_node_id_fkey FOREIGN KEY (to_node_id) REFERENCES public.graph_nodes(id) ON DELETE CASCADE;


--
-- Name: graph_edges graph_edges_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.graph_edges
    ADD CONSTRAINT graph_edges_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: graph_nodes graph_nodes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.graph_nodes
    ADD CONSTRAINT graph_nodes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: group_candidates group_candidates_created_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_candidates
    ADD CONSTRAINT group_candidates_created_organization_id_fkey FOREIGN KEY (created_organization_id) REFERENCES public.organizations(id) ON DELETE SET NULL;


--
-- Name: group_evolution group_evolution_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_evolution
    ADD CONSTRAINT group_evolution_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.social_communities(id) ON DELETE CASCADE;


--
-- Name: group_evolution group_evolution_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_evolution
    ADD CONSTRAINT group_evolution_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: identity_mutations identity_mutations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.identity_mutations
    ADD CONSTRAINT identity_mutations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: ingestion_dead_letter ingestion_dead_letter_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingestion_dead_letter
    ADD CONSTRAINT ingestion_dead_letter_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: interest_mentions interest_mentions_interest_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interest_mentions
    ADD CONSTRAINT interest_mentions_interest_id_fkey FOREIGN KEY (interest_id) REFERENCES public.interests(id) ON DELETE CASCADE;


--
-- Name: interest_mentions interest_mentions_mentioned_at_location_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interest_mentions
    ADD CONSTRAINT interest_mentions_mentioned_at_location_fkey FOREIGN KEY (mentioned_at_location) REFERENCES public.locations(id);


--
-- Name: interest_mentions interest_mentions_source_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interest_mentions
    ADD CONSTRAINT interest_mentions_source_entry_id_fkey FOREIGN KEY (source_entry_id) REFERENCES public.journal_entries(id);


--
-- Name: interest_mentions interest_mentions_source_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interest_mentions
    ADD CONSTRAINT interest_mentions_source_message_id_fkey FOREIGN KEY (source_message_id) REFERENCES public.chat_messages(id);


--
-- Name: interest_mentions interest_mentions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interest_mentions
    ADD CONSTRAINT interest_mentions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: interest_scope_groups interest_scope_groups_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interest_scope_groups
    ADD CONSTRAINT interest_scope_groups_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: interest_scopes interest_scopes_interest_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interest_scopes
    ADD CONSTRAINT interest_scopes_interest_id_fkey FOREIGN KEY (interest_id) REFERENCES public.interests(id) ON DELETE CASCADE;


--
-- Name: interest_scopes interest_scopes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interest_scopes
    ADD CONSTRAINT interest_scopes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: interests interests_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interests
    ADD CONSTRAINT interests_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: journal_entries journal_entries_derived_from_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT journal_entries_derived_from_entry_id_fkey FOREIGN KEY (derived_from_entry_id) REFERENCES public.journal_entries(id) ON DELETE SET NULL;


--
-- Name: knowledge_gaps knowledge_gaps_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_gaps
    ADD CONSTRAINT knowledge_gaps_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: knowledge_units knowledge_units_source_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_units
    ADD CONSTRAINT knowledge_units_source_entry_id_fkey FOREIGN KEY (source_entry_id) REFERENCES public.journal_entries(id) ON DELETE SET NULL;


--
-- Name: knowledge_units knowledge_units_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_units
    ADD CONSTRAINT knowledge_units_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: lexical_analysis_results lexical_analysis_results_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lexical_analysis_results
    ADD CONSTRAINT lexical_analysis_results_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: life_arcs life_arcs_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.life_arcs
    ADD CONSTRAINT life_arcs_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.life_arcs(id) ON DELETE SET NULL;


--
-- Name: life_arcs life_arcs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.life_arcs
    ADD CONSTRAINT life_arcs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: location_character_links location_character_links_character_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_character_links
    ADD CONSTRAINT location_character_links_character_id_fkey FOREIGN KEY (character_id) REFERENCES public.characters(id) ON DELETE CASCADE;


--
-- Name: location_character_links location_character_links_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_character_links
    ADD CONSTRAINT location_character_links_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE;


--
-- Name: location_character_links location_character_links_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_character_links
    ADD CONSTRAINT location_character_links_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: location_mentions location_mentions_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_mentions
    ADD CONSTRAINT location_mentions_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE;


--
-- Name: location_mentions location_mentions_memory_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_mentions
    ADD CONSTRAINT location_mentions_memory_id_fkey FOREIGN KEY (memory_id) REFERENCES public.journal_entries(id) ON DELETE CASCADE;


--
-- Name: location_mentions location_mentions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_mentions
    ADD CONSTRAINT location_mentions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: locations locations_parent_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_parent_location_id_fkey FOREIGN KEY (parent_location_id) REFERENCES public.locations(id) ON DELETE SET NULL;


--
-- Name: locations locations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: lore_agent_observations lore_agent_observations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lore_agent_observations
    ADD CONSTRAINT lore_agent_observations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: lore_agent_proposed_actions lore_agent_proposed_actions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lore_agent_proposed_actions
    ADD CONSTRAINT lore_agent_proposed_actions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: lore_agent_runs lore_agent_runs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lore_agent_runs
    ADD CONSTRAINT lore_agent_runs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: lore_topic_ledger lore_topic_ledger_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lore_topic_ledger
    ADD CONSTRAINT lore_topic_ledger_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: mcp_events mcp_events_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mcp_events
    ADD CONSTRAINT mcp_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: mcp_oauth_authorization_codes mcp_oauth_authorization_codes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mcp_oauth_authorization_codes
    ADD CONSTRAINT mcp_oauth_authorization_codes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: mcp_oauth_clients mcp_oauth_clients_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mcp_oauth_clients
    ADD CONSTRAINT mcp_oauth_clients_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES auth.users(id);


--
-- Name: mcp_oauth_refresh_tokens mcp_oauth_refresh_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mcp_oauth_refresh_tokens
    ADD CONSTRAINT mcp_oauth_refresh_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: mcp_tool_audit_log mcp_tool_audit_log_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mcp_tool_audit_log
    ADD CONSTRAINT mcp_tool_audit_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: meaning_resolution_results meaning_resolution_results_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meaning_resolution_results
    ADD CONSTRAINT meaning_resolution_results_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: memory_components memory_components_journal_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memory_components
    ADD CONSTRAINT memory_components_journal_entry_id_fkey FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id) ON DELETE CASCADE;


--
-- Name: memory_decisions memory_decisions_proposal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memory_decisions
    ADD CONSTRAINT memory_decisions_proposal_id_fkey FOREIGN KEY (proposal_id) REFERENCES public.memory_proposals(id) ON DELETE CASCADE;


--
-- Name: memory_decisions memory_decisions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memory_decisions
    ADD CONSTRAINT memory_decisions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: memory_events memory_events_supersedes_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memory_events
    ADD CONSTRAINT memory_events_supersedes_event_id_fkey FOREIGN KEY (supersedes_event_id) REFERENCES public.memory_events(id) ON DELETE SET NULL;


--
-- Name: memory_events memory_events_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memory_events
    ADD CONSTRAINT memory_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: memory_proposals memory_proposals_entity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memory_proposals
    ADD CONSTRAINT memory_proposals_entity_id_fkey FOREIGN KEY (entity_id) REFERENCES public.omega_entities(id) ON DELETE CASCADE;


--
-- Name: memory_proposals memory_proposals_perspective_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memory_proposals
    ADD CONSTRAINT memory_proposals_perspective_id_fkey FOREIGN KEY (perspective_id) REFERENCES public.perspectives(id) ON DELETE SET NULL;


--
-- Name: memory_proposals memory_proposals_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memory_proposals
    ADD CONSTRAINT memory_proposals_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: narrative_accounts narrative_accounts_event_record_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.narrative_accounts
    ADD CONSTRAINT narrative_accounts_event_record_id_fkey FOREIGN KEY (event_record_id) REFERENCES public.event_records(id) ON DELETE CASCADE;


--
-- Name: narrative_accounts narrative_accounts_source_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.narrative_accounts
    ADD CONSTRAINT narrative_accounts_source_entry_id_fkey FOREIGN KEY (source_entry_id) REFERENCES public.journal_entries(id) ON DELETE SET NULL;


--
-- Name: narrative_accounts narrative_accounts_source_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.narrative_accounts
    ADD CONSTRAINT narrative_accounts_source_message_id_fkey FOREIGN KEY (source_message_id) REFERENCES public.chat_messages(id) ON DELETE SET NULL;


--
-- Name: narrative_accounts narrative_accounts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.narrative_accounts
    ADD CONSTRAINT narrative_accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: narrative_anchor_members narrative_anchor_members_anchor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.narrative_anchor_members
    ADD CONSTRAINT narrative_anchor_members_anchor_id_fkey FOREIGN KEY (anchor_id) REFERENCES public.narrative_anchors(id) ON DELETE CASCADE;


--
-- Name: narrative_anchor_members narrative_anchor_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.narrative_anchor_members
    ADD CONSTRAINT narrative_anchor_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: narrative_anchors narrative_anchors_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.narrative_anchors
    ADD CONSTRAINT narrative_anchors_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: narrative_chapters narrative_chapters_life_arc_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.narrative_chapters
    ADD CONSTRAINT narrative_chapters_life_arc_id_fkey FOREIGN KEY (life_arc_id) REFERENCES public.life_arcs(id) ON DELETE CASCADE;


--
-- Name: narrative_chapters narrative_chapters_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.narrative_chapters
    ADD CONSTRAINT narrative_chapters_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: narrative_claim_edges narrative_claim_edges_from_claim_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.narrative_claim_edges
    ADD CONSTRAINT narrative_claim_edges_from_claim_id_fkey FOREIGN KEY (from_claim_id) REFERENCES public.narrative_claims(id) ON DELETE CASCADE;


--
-- Name: narrative_claim_edges narrative_claim_edges_to_claim_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.narrative_claim_edges
    ADD CONSTRAINT narrative_claim_edges_to_claim_id_fkey FOREIGN KEY (to_claim_id) REFERENCES public.narrative_claims(id) ON DELETE CASCADE;


--
-- Name: narrative_claim_edges narrative_claim_edges_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.narrative_claim_edges
    ADD CONSTRAINT narrative_claim_edges_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: narrative_claims narrative_claims_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.narrative_claims
    ADD CONSTRAINT narrative_claims_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: narrative_life_chapters narrative_life_chapters_era_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.narrative_life_chapters
    ADD CONSTRAINT narrative_life_chapters_era_id_fkey FOREIGN KEY (era_id) REFERENCES public.narrative_life_eras(id) ON DELETE SET NULL;


--
-- Name: narrative_life_chapters narrative_life_chapters_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.narrative_life_chapters
    ADD CONSTRAINT narrative_life_chapters_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: narrative_life_eras narrative_life_eras_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.narrative_life_eras
    ADD CONSTRAINT narrative_life_eras_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: narrative_moments narrative_moments_caused_by_moment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.narrative_moments
    ADD CONSTRAINT narrative_moments_caused_by_moment_id_fkey FOREIGN KEY (caused_by_moment_id) REFERENCES public.narrative_moments(id) ON DELETE SET NULL;


--
-- Name: narrative_moments narrative_moments_leads_to_moment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.narrative_moments
    ADD CONSTRAINT narrative_moments_leads_to_moment_id_fkey FOREIGN KEY (leads_to_moment_id) REFERENCES public.narrative_moments(id) ON DELETE SET NULL;


--
-- Name: narrative_moments narrative_moments_next_moment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.narrative_moments
    ADD CONSTRAINT narrative_moments_next_moment_id_fkey FOREIGN KEY (next_moment_id) REFERENCES public.narrative_moments(id) ON DELETE SET NULL;


--
-- Name: narrative_moments narrative_moments_previous_moment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.narrative_moments
    ADD CONSTRAINT narrative_moments_previous_moment_id_fkey FOREIGN KEY (previous_moment_id) REFERENCES public.narrative_moments(id) ON DELETE SET NULL;


--
-- Name: narrative_moments narrative_moments_promoted_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.narrative_moments
    ADD CONSTRAINT narrative_moments_promoted_event_id_fkey FOREIGN KEY (promoted_event_id) REFERENCES public.resolved_events(id) ON DELETE SET NULL;


--
-- Name: narrative_moments narrative_moments_scene_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.narrative_moments
    ADD CONSTRAINT narrative_moments_scene_id_fkey FOREIGN KEY (scene_id) REFERENCES public.narrative_scenes(id) ON DELETE SET NULL;


--
-- Name: narrative_moments narrative_moments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.narrative_moments
    ADD CONSTRAINT narrative_moments_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: narrative_scenes narrative_scenes_chapter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.narrative_scenes
    ADD CONSTRAINT narrative_scenes_chapter_id_fkey FOREIGN KEY (chapter_id) REFERENCES public.narrative_story_chapters(id) ON DELETE SET NULL;


--
-- Name: narrative_scenes narrative_scenes_promoted_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.narrative_scenes
    ADD CONSTRAINT narrative_scenes_promoted_event_id_fkey FOREIGN KEY (promoted_event_id) REFERENCES public.resolved_events(id) ON DELETE SET NULL;


--
-- Name: narrative_scenes narrative_scenes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.narrative_scenes
    ADD CONSTRAINT narrative_scenes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: narrative_story_chapters narrative_story_chapters_era_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.narrative_story_chapters
    ADD CONSTRAINT narrative_story_chapters_era_id_fkey FOREIGN KEY (era_id) REFERENCES public.narrative_life_eras(id) ON DELETE SET NULL;


--
-- Name: narrative_story_chapters narrative_story_chapters_life_chapter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.narrative_story_chapters
    ADD CONSTRAINT narrative_story_chapters_life_chapter_id_fkey FOREIGN KEY (life_chapter_id) REFERENCES public.narrative_life_chapters(id) ON DELETE SET NULL;


--
-- Name: narrative_story_chapters narrative_story_chapters_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.narrative_story_chapters
    ADD CONSTRAINT narrative_story_chapters_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: omega_claims omega_claims_entity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.omega_claims
    ADD CONSTRAINT omega_claims_entity_id_fkey FOREIGN KEY (entity_id) REFERENCES public.omega_entities(id) ON DELETE CASCADE;


--
-- Name: omega_claims omega_claims_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.omega_claims
    ADD CONSTRAINT omega_claims_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: omega_entities omega_entities_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.omega_entities
    ADD CONSTRAINT omega_entities_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: omega_evidence omega_evidence_claim_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.omega_evidence
    ADD CONSTRAINT omega_evidence_claim_id_fkey FOREIGN KEY (claim_id) REFERENCES public.omega_claims(id) ON DELETE CASCADE;


--
-- Name: omega_evidence omega_evidence_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.omega_evidence
    ADD CONSTRAINT omega_evidence_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: organization_events organization_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_events
    ADD CONSTRAINT organization_events_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: organization_locations organization_locations_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_locations
    ADD CONSTRAINT organization_locations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: organization_members organization_members_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_members
    ADD CONSTRAINT organization_members_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: organization_relationships organization_relationships_from_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_relationships
    ADD CONSTRAINT organization_relationships_from_org_id_fkey FOREIGN KEY (from_org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: organization_relationships organization_relationships_to_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_relationships
    ADD CONSTRAINT organization_relationships_to_org_id_fkey FOREIGN KEY (to_org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: organization_stories organization_stories_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_stories
    ADD CONSTRAINT organization_stories_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: organization_suggestions organization_suggestions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_suggestions
    ADD CONSTRAINT organization_suggestions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: organizations organizations_parent_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_parent_group_id_fkey FOREIGN KEY (parent_group_id) REFERENCES public.organizations(id) ON DELETE SET NULL;


--
-- Name: perception_entries perception_entries_related_memory_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.perception_entries
    ADD CONSTRAINT perception_entries_related_memory_id_fkey FOREIGN KEY (related_memory_id) REFERENCES public.journal_entries(id) ON DELETE SET NULL;


--
-- Name: perception_entries perception_entries_source_character_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.perception_entries
    ADD CONSTRAINT perception_entries_source_character_id_fkey FOREIGN KEY (source_character_id) REFERENCES public.characters(id) ON DELETE SET NULL;


--
-- Name: perception_entries perception_entries_subject_person_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.perception_entries
    ADD CONSTRAINT perception_entries_subject_person_id_fkey FOREIGN KEY (subject_person_id) REFERENCES public.characters(id) ON DELETE SET NULL;


--
-- Name: perception_entries perception_entries_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.perception_entries
    ADD CONSTRAINT perception_entries_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: perspective_claims perspective_claims_base_claim_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.perspective_claims
    ADD CONSTRAINT perspective_claims_base_claim_id_fkey FOREIGN KEY (base_claim_id) REFERENCES public.omega_claims(id) ON DELETE CASCADE;


--
-- Name: perspective_claims perspective_claims_perspective_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.perspective_claims
    ADD CONSTRAINT perspective_claims_perspective_id_fkey FOREIGN KEY (perspective_id) REFERENCES public.perspectives(id) ON DELETE CASCADE;


--
-- Name: perspective_claims perspective_claims_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.perspective_claims
    ADD CONSTRAINT perspective_claims_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: perspective_disputes perspective_disputes_base_claim_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.perspective_disputes
    ADD CONSTRAINT perspective_disputes_base_claim_id_fkey FOREIGN KEY (base_claim_id) REFERENCES public.omega_claims(id) ON DELETE CASCADE;


--
-- Name: perspective_disputes perspective_disputes_perspective_claim_a_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.perspective_disputes
    ADD CONSTRAINT perspective_disputes_perspective_claim_a_id_fkey FOREIGN KEY (perspective_claim_a_id) REFERENCES public.perspective_claims(id) ON DELETE CASCADE;


--
-- Name: perspective_disputes perspective_disputes_perspective_claim_b_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.perspective_disputes
    ADD CONSTRAINT perspective_disputes_perspective_claim_b_id_fkey FOREIGN KEY (perspective_claim_b_id) REFERENCES public.perspective_claims(id) ON DELETE CASCADE;


--
-- Name: perspective_disputes perspective_disputes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.perspective_disputes
    ADD CONSTRAINT perspective_disputes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: perspectives perspectives_owner_entity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.perspectives
    ADD CONSTRAINT perspectives_owner_entity_id_fkey FOREIGN KEY (owner_entity_id) REFERENCES public.omega_entities(id) ON DELETE SET NULL;


--
-- Name: perspectives perspectives_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.perspectives
    ADD CONSTRAINT perspectives_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: pipeline_runs pipeline_runs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pipeline_runs
    ADD CONSTRAINT pipeline_runs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: preference_evidence preference_evidence_signal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.preference_evidence
    ADD CONSTRAINT preference_evidence_signal_id_fkey FOREIGN KEY (signal_id) REFERENCES public.preference_signals(id) ON DELETE CASCADE;


--
-- Name: preference_evidence preference_evidence_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.preference_evidence
    ADD CONSTRAINT preference_evidence_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: preference_signals preference_signals_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.preference_signals
    ADD CONSTRAINT preference_signals_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: profile_claim_evidence profile_claim_evidence_claim_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_claim_evidence
    ADD CONSTRAINT profile_claim_evidence_claim_id_fkey FOREIGN KEY (claim_id) REFERENCES public.profile_claims(id) ON DELETE CASCADE;


--
-- Name: profile_claim_evidence profile_claim_evidence_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_claim_evidence
    ADD CONSTRAINT profile_claim_evidence_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: profile_claims profile_claims_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_claims
    ADD CONSTRAINT profile_claims_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: project_suggestions project_suggestions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_suggestions
    ADD CONSTRAINT project_suggestions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: projects projects_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: provenance_edges provenance_edges_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provenance_edges
    ADD CONSTRAINT provenance_edges_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: quest_achievements quest_achievements_quest_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quest_achievements
    ADD CONSTRAINT quest_achievements_quest_id_fkey FOREIGN KEY (quest_id) REFERENCES public.quests(id) ON DELETE CASCADE;


--
-- Name: quest_achievements quest_achievements_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quest_achievements
    ADD CONSTRAINT quest_achievements_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: quest_dependencies quest_dependencies_depends_on_quest_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quest_dependencies
    ADD CONSTRAINT quest_dependencies_depends_on_quest_id_fkey FOREIGN KEY (depends_on_quest_id) REFERENCES public.quests(id) ON DELETE CASCADE;


--
-- Name: quest_dependencies quest_dependencies_quest_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quest_dependencies
    ADD CONSTRAINT quest_dependencies_quest_id_fkey FOREIGN KEY (quest_id) REFERENCES public.quests(id) ON DELETE CASCADE;


--
-- Name: quest_history quest_history_journal_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quest_history
    ADD CONSTRAINT quest_history_journal_entry_id_fkey FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id);


--
-- Name: quest_history quest_history_quest_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quest_history
    ADD CONSTRAINT quest_history_quest_id_fkey FOREIGN KEY (quest_id) REFERENCES public.quests(id) ON DELETE CASCADE;


--
-- Name: quest_history quest_history_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quest_history
    ADD CONSTRAINT quest_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: quest_suggestions quest_suggestions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quest_suggestions
    ADD CONSTRAINT quest_suggestions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: quests quests_parent_quest_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quests
    ADD CONSTRAINT quests_parent_quest_id_fkey FOREIGN KEY (parent_quest_id) REFERENCES public.quests(id);


--
-- Name: quests quests_related_goal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quests
    ADD CONSTRAINT quests_related_goal_id_fkey FOREIGN KEY (related_goal_id) REFERENCES public.goals(id);


--
-- Name: quests quests_related_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quests
    ADD CONSTRAINT quests_related_task_id_fkey FOREIGN KEY (related_task_id) REFERENCES public.tasks(id);


--
-- Name: quests quests_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quests
    ADD CONSTRAINT quests_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: resolved_events resolved_events_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resolved_events
    ADD CONSTRAINT resolved_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: resume_documents resume_documents_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resume_documents
    ADD CONSTRAINT resume_documents_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: reversal_logs reversal_logs_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reversal_logs
    ADD CONSTRAINT reversal_logs_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.continuity_events(id) ON DELETE CASCADE;


--
-- Name: reversal_logs reversal_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reversal_logs
    ADD CONSTRAINT reversal_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: relationship_peripherals romantic_peripherals_anchor_relationship_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.relationship_peripherals
    ADD CONSTRAINT romantic_peripherals_anchor_relationship_id_fkey FOREIGN KEY (anchor_relationship_id) REFERENCES public.romantic_relationships(id) ON DELETE CASCADE;


--
-- Name: romantic_peripherals romantic_peripherals_anchor_relationship_id_fkey1; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.romantic_peripherals
    ADD CONSTRAINT romantic_peripherals_anchor_relationship_id_fkey1 FOREIGN KEY (anchor_relationship_id) REFERENCES public.romantic_relationships(id) ON DELETE CASCADE;


--
-- Name: relationship_peripherals romantic_peripherals_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.relationship_peripherals
    ADD CONSTRAINT romantic_peripherals_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: romantic_peripherals romantic_peripherals_user_id_fkey1; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.romantic_peripherals
    ADD CONSTRAINT romantic_peripherals_user_id_fkey1 FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: romantic_relationships romantic_relationships_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.romantic_relationships
    ADD CONSTRAINT romantic_relationships_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: salience_scores salience_scores_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salience_scores
    ADD CONSTRAINT salience_scores_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: skill_clusters skill_clusters_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_clusters
    ADD CONSTRAINT skill_clusters_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: skill_evidence skill_evidence_skill_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_evidence
    ADD CONSTRAINT skill_evidence_skill_id_fkey FOREIGN KEY (skill_id) REFERENCES public.skills(id) ON DELETE CASCADE;


--
-- Name: skill_evidence skill_evidence_suggestion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_evidence
    ADD CONSTRAINT skill_evidence_suggestion_id_fkey FOREIGN KEY (suggestion_id) REFERENCES public.skill_suggestions(id) ON DELETE CASCADE;


--
-- Name: skill_evidence skill_evidence_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_evidence
    ADD CONSTRAINT skill_evidence_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: skill_progress skill_progress_skill_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_progress
    ADD CONSTRAINT skill_progress_skill_id_fkey FOREIGN KEY (skill_id) REFERENCES public.skills(id) ON DELETE CASCADE;


--
-- Name: skill_progress skill_progress_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_progress
    ADD CONSTRAINT skill_progress_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: skill_relationships skill_relationships_from_skill_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_relationships
    ADD CONSTRAINT skill_relationships_from_skill_id_fkey FOREIGN KEY (from_skill_id) REFERENCES public.skills(id) ON DELETE CASCADE;


--
-- Name: skill_relationships skill_relationships_to_skill_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_relationships
    ADD CONSTRAINT skill_relationships_to_skill_id_fkey FOREIGN KEY (to_skill_id) REFERENCES public.skills(id) ON DELETE CASCADE;


--
-- Name: skill_relationships skill_relationships_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_relationships
    ADD CONSTRAINT skill_relationships_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: skill_suggestions skill_suggestions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_suggestions
    ADD CONSTRAINT skill_suggestions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: skill_usage_events skill_usage_events_skill_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_usage_events
    ADD CONSTRAINT skill_usage_events_skill_id_fkey FOREIGN KEY (skill_id) REFERENCES public.skills(id) ON DELETE CASCADE;


--
-- Name: skill_usage_events skill_usage_events_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_usage_events
    ADD CONSTRAINT skill_usage_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: skills skills_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skills
    ADD CONSTRAINT skills_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: social_communities social_communities_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_communities
    ADD CONSTRAINT social_communities_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: subscription_usage subscription_usage_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_usage
    ADD CONSTRAINT subscription_usage_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: subscriptions subscriptions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: suggestion_dismissal_stats suggestion_dismissal_stats_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suggestion_dismissal_stats
    ADD CONSTRAINT suggestion_dismissal_stats_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: suggestion_thread_dismissals suggestion_thread_dismissals_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suggestion_thread_dismissals
    ADD CONSTRAINT suggestion_thread_dismissals_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: task_events task_events_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_events
    ADD CONSTRAINT task_events_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;


--
-- Name: terms_acceptance terms_acceptance_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.terms_acceptance
    ADD CONSTRAINT terms_acceptance_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: text_message_uploads text_message_uploads_character_media_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.text_message_uploads
    ADD CONSTRAINT text_message_uploads_character_media_id_fkey FOREIGN KEY (character_media_id) REFERENCES public.character_media(id) ON DELETE SET NULL;


--
-- Name: text_message_uploads text_message_uploads_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.text_message_uploads
    ADD CONSTRAINT text_message_uploads_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: timeline_actions timeline_actions_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timeline_actions
    ADD CONSTRAINT timeline_actions_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.timeline_scenes(id) ON DELETE CASCADE;


--
-- Name: timeline_arcs timeline_arcs_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timeline_arcs
    ADD CONSTRAINT timeline_arcs_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.timeline_sagas(id) ON DELETE CASCADE;


--
-- Name: timeline_epochs timeline_epochs_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timeline_epochs
    ADD CONSTRAINT timeline_epochs_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.timeline_mythos(id) ON DELETE CASCADE;


--
-- Name: timeline_eras timeline_eras_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timeline_eras
    ADD CONSTRAINT timeline_eras_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.timeline_epochs(id) ON DELETE CASCADE;


--
-- Name: timeline_memberships timeline_memberships_journal_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timeline_memberships
    ADD CONSTRAINT timeline_memberships_journal_entry_id_fkey FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id) ON DELETE CASCADE;


--
-- Name: timeline_memberships timeline_memberships_timeline_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timeline_memberships
    ADD CONSTRAINT timeline_memberships_timeline_id_fkey FOREIGN KEY (timeline_id) REFERENCES public.timelines(id) ON DELETE CASCADE;


--
-- Name: timeline_memberships timeline_memberships_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timeline_memberships
    ADD CONSTRAINT timeline_memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: timeline_microactions timeline_microactions_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timeline_microactions
    ADD CONSTRAINT timeline_microactions_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.timeline_actions(id) ON DELETE CASCADE;


--
-- Name: timeline_relationships timeline_relationships_source_timeline_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timeline_relationships
    ADD CONSTRAINT timeline_relationships_source_timeline_id_fkey FOREIGN KEY (source_timeline_id) REFERENCES public.timelines(id) ON DELETE CASCADE;


--
-- Name: timeline_relationships timeline_relationships_target_timeline_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timeline_relationships
    ADD CONSTRAINT timeline_relationships_target_timeline_id_fkey FOREIGN KEY (target_timeline_id) REFERENCES public.timelines(id) ON DELETE CASCADE;


--
-- Name: timeline_relationships timeline_relationships_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timeline_relationships
    ADD CONSTRAINT timeline_relationships_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: timeline_sagas timeline_sagas_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timeline_sagas
    ADD CONSTRAINT timeline_sagas_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.timeline_eras(id) ON DELETE CASCADE;


--
-- Name: timeline_scenes timeline_scenes_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timeline_scenes
    ADD CONSTRAINT timeline_scenes_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.chapters(id) ON DELETE CASCADE;


--
-- Name: timelines timelines_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timelines
    ADD CONSTRAINT timelines_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.timelines(id) ON DELETE CASCADE;


--
-- Name: timelines timelines_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timelines
    ADD CONSTRAINT timelines_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_activity_logs user_activity_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_activity_logs
    ADD CONSTRAINT user_activity_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_chronology_order user_chronology_order_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_chronology_order
    ADD CONSTRAINT user_chronology_order_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_corrections user_corrections_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_corrections
    ADD CONSTRAINT user_corrections_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_files user_files_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_files
    ADD CONSTRAINT user_files_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_inference_state user_inference_state_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_inference_state
    ADD CONSTRAINT user_inference_state_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: utterances utterances_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.utterances
    ADD CONSTRAINT utterances_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.conversation_messages(id) ON DELETE CASCADE;


--
-- Name: utterances utterances_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.utterances
    ADD CONSTRAINT utterances_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: achievement_templates Authenticated users can view achievement templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view achievement templates" ON public.achievement_templates FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: relationship_type_ontology Authenticated users can view relationship ontology; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view relationship ontology" ON public.relationship_type_ontology FOR SELECT TO authenticated USING (true);


--
-- Name: epiphany_insights Service role can insert epiphany insights; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can insert epiphany insights" ON public.epiphany_insights FOR INSERT WITH CHECK (true);


--
-- Name: arc_memberships Service role full access to arc_memberships; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access to arc_memberships" ON public.arc_memberships USING ((auth.role() = 'service_role'::text));


--
-- Name: arc_relationships Service role full access to arc_relationships; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access to arc_relationships" ON public.arc_relationships USING ((auth.role() = 'service_role'::text));


--
-- Name: chronology_snapshots Service role full access to chronology snapshots; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access to chronology snapshots" ON public.chronology_snapshots USING ((auth.role() = 'service_role'::text));


--
-- Name: continuity_snapshots Service role full access to continuity snapshots; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access to continuity snapshots" ON public.continuity_snapshots USING ((auth.role() = 'service_role'::text));


--
-- Name: event_candidates Service role full access to event candidates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access to event candidates" ON public.event_candidates USING ((auth.role() = 'service_role'::text));


--
-- Name: life_arcs Service role full access to life_arcs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access to life_arcs" ON public.life_arcs USING ((auth.role() = 'service_role'::text));


--
-- Name: narrative_chapters Service role manages narrative chapters; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role manages narrative chapters" ON public.narrative_chapters TO service_role USING (true) WITH CHECK (true);


--
-- Name: narrative_life_chapters Service role manages narrative life chapters; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role manages narrative life chapters" ON public.narrative_life_chapters TO service_role USING (true) WITH CHECK (true);


--
-- Name: narrative_life_eras Service role manages narrative life eras; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role manages narrative life eras" ON public.narrative_life_eras TO service_role USING (true) WITH CHECK (true);


--
-- Name: narrative_story_chapters Service role manages narrative story chapters; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role manages narrative story chapters" ON public.narrative_story_chapters TO service_role USING (true) WITH CHECK (true);


--
-- Name: arc_memberships Users can delete own arc memberships; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own arc memberships" ON public.arc_memberships FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: arc_relationships Users can delete own arc relationships; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own arc relationships" ON public.arc_relationships FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: life_arcs Users can delete own arcs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own arcs" ON public.life_arcs FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: event_causal_links Users can delete own causal links; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own causal links" ON public.event_causal_links FOR DELETE USING ((user_id = auth.uid()));


--
-- Name: character_timeline_events Users can delete own character timeline events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own character timeline events" ON public.character_timeline_events FOR DELETE USING ((user_id = auth.uid()));


--
-- Name: event_continuity_links Users can delete own continuity links; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own continuity links" ON public.event_continuity_links FOR DELETE USING ((user_id = auth.uid()));


--
-- Name: event_candidates Users can delete own event candidates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own event candidates" ON public.event_candidates FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: event_impacts Users can delete own event impacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own event impacts" ON public.event_impacts FOR DELETE USING ((user_id = auth.uid()));


--
-- Name: event_mentions Users can delete own event mentions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own event mentions" ON public.event_mentions FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.resolved_events
  WHERE ((resolved_events.id = event_mentions.event_id) AND (resolved_events.user_id = auth.uid())))));


--
-- Name: external_account_connections Users can delete own external account connections; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own external account connections" ON public.external_account_connections FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: goal_insights Users can delete own goal insights; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own goal insights" ON public.goal_insights FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: goals Users can delete own goals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own goals" ON public.goals FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: narrative_chapters Users can delete own narrative chapters; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own narrative chapters" ON public.narrative_chapters FOR DELETE TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: narrative_life_chapters Users can delete own narrative life chapters; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own narrative life chapters" ON public.narrative_life_chapters FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: narrative_life_eras Users can delete own narrative life eras; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own narrative life eras" ON public.narrative_life_eras FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: narrative_moments Users can delete own narrative moments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own narrative moments" ON public.narrative_moments FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: narrative_scenes Users can delete own narrative scenes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own narrative scenes" ON public.narrative_scenes FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: narrative_story_chapters Users can delete own narrative story chapters; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own narrative story chapters" ON public.narrative_story_chapters FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: quest_dependencies Users can delete own quest dependencies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own quest dependencies" ON public.quest_dependencies FOR DELETE USING ((auth.uid() IN ( SELECT quests.user_id
   FROM public.quests
  WHERE (quests.id = quest_dependencies.quest_id))));


--
-- Name: quests Users can delete own quests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own quests" ON public.quests FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: skill_clusters Users can delete own skill clusters; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own skill clusters" ON public.skill_clusters FOR DELETE USING ((user_id = auth.uid()));


--
-- Name: skill_relationships Users can delete own skill relationships; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own skill relationships" ON public.skill_relationships FOR DELETE USING ((user_id = auth.uid()));


--
-- Name: chapters Users can delete their own chapters; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own chapters" ON public.chapters FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: characters Users can delete their own characters; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own characters" ON public.characters FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: omega_claims Users can delete their own claims; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own claims" ON public.omega_claims FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: omega_entities Users can delete their own entities; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own entities" ON public.omega_entities FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: journal_entries Users can delete their own journal entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own journal entries" ON public.journal_entries FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: people_places Users can delete their own people places; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own people places" ON public.people_places FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: profile_claims Users can delete their own profile claims; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own profile claims" ON public.profile_claims FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: resume_documents Users can delete their own resume documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own resume documents" ON public.resume_documents FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: tasks Users can delete their own tasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own tasks" ON public.tasks FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: arc_memberships Users can insert own arc memberships; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own arc memberships" ON public.arc_memberships FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: arc_relationships Users can insert own arc relationships; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own arc relationships" ON public.arc_relationships FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: life_arcs Users can insert own arcs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own arcs" ON public.life_arcs FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: event_causal_links Users can insert own causal links; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own causal links" ON public.event_causal_links FOR INSERT WITH CHECK ((user_id = auth.uid()));


--
-- Name: character_timeline_events Users can insert own character timeline events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own character timeline events" ON public.character_timeline_events FOR INSERT WITH CHECK ((user_id = auth.uid()));


--
-- Name: event_confidence_snapshots Users can insert own confidence snapshots; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own confidence snapshots" ON public.event_confidence_snapshots FOR INSERT WITH CHECK ((user_id = auth.uid()));


--
-- Name: event_continuity_links Users can insert own continuity links; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own continuity links" ON public.event_continuity_links FOR INSERT WITH CHECK ((user_id = auth.uid()));


--
-- Name: entity_merge_records Users can insert own entity merge records; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own entity merge records" ON public.entity_merge_records FOR INSERT TO authenticated WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: entry_ir Users can insert own entry IR; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own entry IR" ON public.entry_ir FOR INSERT WITH CHECK ((user_id = auth.uid()));


--
-- Name: entry_dependencies Users can insert own entry dependencies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own entry dependencies" ON public.entry_dependencies FOR INSERT WITH CHECK ((user_id = auth.uid()));


--
-- Name: event_candidates Users can insert own event candidates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own event candidates" ON public.event_candidates FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: event_cognitions Users can insert own event cognitions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own event cognitions" ON public.event_cognitions FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: event_emotions Users can insert own event emotions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own event emotions" ON public.event_emotions FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: event_identity_impacts Users can insert own event identity impacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own event identity impacts" ON public.event_identity_impacts FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: event_impacts Users can insert own event impacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own event impacts" ON public.event_impacts FOR INSERT WITH CHECK ((user_id = auth.uid()));


--
-- Name: event_mentions Users can insert own event mentions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own event mentions" ON public.event_mentions FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.resolved_events
  WHERE ((resolved_events.id = event_mentions.event_id) AND (resolved_events.user_id = auth.uid())))));


--
-- Name: event_records Users can insert own event records; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own event records" ON public.event_records FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: external_account_connections Users can insert own external account connections; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own external account connections" ON public.external_account_connections FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: goal_insights Users can insert own goal insights; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own goal insights" ON public.goal_insights FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: goals Users can insert own goals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own goals" ON public.goals FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: narrative_accounts Users can insert own narrative accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own narrative accounts" ON public.narrative_accounts FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: narrative_chapters Users can insert own narrative chapters; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own narrative chapters" ON public.narrative_chapters FOR INSERT TO authenticated WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: narrative_life_chapters Users can insert own narrative life chapters; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own narrative life chapters" ON public.narrative_life_chapters FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: narrative_life_eras Users can insert own narrative life eras; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own narrative life eras" ON public.narrative_life_eras FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: narrative_moments Users can insert own narrative moments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own narrative moments" ON public.narrative_moments FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: narrative_scenes Users can insert own narrative scenes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own narrative scenes" ON public.narrative_scenes FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: narrative_story_chapters Users can insert own narrative story chapters; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own narrative story chapters" ON public.narrative_story_chapters FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: quest_achievements Users can insert own quest achievements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own quest achievements" ON public.quest_achievements FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: quest_dependencies Users can insert own quest dependencies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own quest dependencies" ON public.quest_dependencies FOR INSERT WITH CHECK ((auth.uid() IN ( SELECT quests.user_id
   FROM public.quests
  WHERE (quests.id = quest_dependencies.quest_id))));


--
-- Name: quest_history Users can insert own quest history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own quest history" ON public.quest_history FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: quests Users can insert own quests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own quests" ON public.quests FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: skill_clusters Users can insert own skill clusters; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own skill clusters" ON public.skill_clusters FOR INSERT WITH CHECK ((user_id = auth.uid()));


--
-- Name: skill_relationships Users can insert own skill relationships; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own skill relationships" ON public.skill_relationships FOR INSERT WITH CHECK ((user_id = auth.uid()));


--
-- Name: achievements Users can insert their own achievements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own achievements" ON public.achievements FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: chapters Users can insert their own chapters; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own chapters" ON public.chapters FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: characters Users can insert their own characters; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own characters" ON public.characters FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: chat_contexts Users can insert their own chat contexts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own chat contexts" ON public.chat_contexts FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: chat_messages Users can insert their own chat messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own chat messages" ON public.chat_messages FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: chat_sessions Users can insert their own chat sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own chat sessions" ON public.chat_sessions FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: profile_claim_evidence Users can insert their own claim evidence; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own claim evidence" ON public.profile_claim_evidence FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: omega_claims Users can insert their own claims; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own claims" ON public.omega_claims FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: continuity_events Users can insert their own continuity events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own continuity events" ON public.continuity_events FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: omega_entities Users can insert their own entities; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own entities" ON public.omega_entities FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: omega_evidence Users can insert their own evidence; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own evidence" ON public.omega_evidence FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: journal_entries Users can insert their own journal entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own journal entries" ON public.journal_entries FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: memory_decisions Users can insert their own memory decisions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own memory decisions" ON public.memory_decisions FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: memory_proposals Users can insert their own memory proposals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own memory proposals" ON public.memory_proposals FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: people_places Users can insert their own people places; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own people places" ON public.people_places FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: profile_claims Users can insert their own profile claims; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own profile claims" ON public.profile_claims FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: resume_documents Users can insert their own resume documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own resume documents" ON public.resume_documents FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: reversal_logs Users can insert their own reversal logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own reversal logs" ON public.reversal_logs FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: skill_progress Users can insert their own skill progress; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own skill progress" ON public.skill_progress FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: tasks Users can insert their own tasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own tasks" ON public.tasks FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: entity_facts Users can manage their own entity facts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage their own entity facts" ON public.entity_facts USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: user_activity_logs Users can read own activity logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read own activity logs" ON public.user_activity_logs FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: arc_memberships Users can read own arc memberships; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read own arc memberships" ON public.arc_memberships FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: arc_relationships Users can read own arc relationships; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read own arc relationships" ON public.arc_relationships FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: life_arcs Users can read own arcs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read own arcs" ON public.life_arcs FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: chronology_snapshots Users can read own chronology snapshots; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read own chronology snapshots" ON public.chronology_snapshots FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: continuity_snapshots Users can read own continuity snapshots; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read own continuity snapshots" ON public.continuity_snapshots FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: epiphany_insights Users can read own epiphany insights; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read own epiphany insights" ON public.epiphany_insights FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: event_candidates Users can read own event candidates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read own event candidates" ON public.event_candidates FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: external_account_connections Users can read own external account connections; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read own external account connections" ON public.external_account_connections FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: narrative_chapters Users can read own narrative chapters; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read own narrative chapters" ON public.narrative_chapters FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: narrative_life_chapters Users can read own narrative life chapters; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read own narrative life chapters" ON public.narrative_life_chapters FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: narrative_life_eras Users can read own narrative life eras; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read own narrative life eras" ON public.narrative_life_eras FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: narrative_moments Users can read own narrative moments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read own narrative moments" ON public.narrative_moments FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: narrative_scenes Users can read own narrative scenes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read own narrative scenes" ON public.narrative_scenes FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: narrative_story_chapters Users can read own narrative story chapters; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read own narrative story chapters" ON public.narrative_story_chapters FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: arc_memberships Users can update own arc memberships; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own arc memberships" ON public.arc_memberships FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: arc_relationships Users can update own arc relationships; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own arc relationships" ON public.arc_relationships FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: life_arcs Users can update own arcs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own arcs" ON public.life_arcs FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: event_causal_links Users can update own causal links; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own causal links" ON public.event_causal_links FOR UPDATE USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: character_timeline_events Users can update own character timeline events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own character timeline events" ON public.character_timeline_events FOR UPDATE USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: entity_merge_records Users can update own entity merge records; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own entity merge records" ON public.entity_merge_records FOR UPDATE TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: entry_ir Users can update own entry IR; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own entry IR" ON public.entry_ir FOR UPDATE USING ((user_id = auth.uid()));


--
-- Name: event_candidates Users can update own event candidates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own event candidates" ON public.event_candidates FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: event_impacts Users can update own event impacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own event impacts" ON public.event_impacts FOR UPDATE USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: event_records Users can update own event records; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own event records" ON public.event_records FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: external_account_connections Users can update own external account connections; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own external account connections" ON public.external_account_connections FOR UPDATE USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: goal_insights Users can update own goal insights; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own goal insights" ON public.goal_insights FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: goals Users can update own goals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own goals" ON public.goals FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: narrative_chapters Users can update own narrative chapters; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own narrative chapters" ON public.narrative_chapters FOR UPDATE TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: narrative_life_chapters Users can update own narrative life chapters; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own narrative life chapters" ON public.narrative_life_chapters FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: narrative_life_eras Users can update own narrative life eras; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own narrative life eras" ON public.narrative_life_eras FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: narrative_moments Users can update own narrative moments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own narrative moments" ON public.narrative_moments FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: narrative_scenes Users can update own narrative scenes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own narrative scenes" ON public.narrative_scenes FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: narrative_story_chapters Users can update own narrative story chapters; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own narrative story chapters" ON public.narrative_story_chapters FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: quests Users can update own quests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own quests" ON public.quests FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: skill_clusters Users can update own skill clusters; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own skill clusters" ON public.skill_clusters FOR UPDATE USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: skill_relationships Users can update own skill relationships; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own skill relationships" ON public.skill_relationships FOR UPDATE USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: chapters Users can update their own chapters; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own chapters" ON public.chapters FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: characters Users can update their own characters; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own characters" ON public.characters FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: chat_contexts Users can update their own chat contexts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own chat contexts" ON public.chat_contexts FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: chat_sessions Users can update their own chat sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own chat sessions" ON public.chat_sessions FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: omega_claims Users can update their own claims; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own claims" ON public.omega_claims FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: continuity_events Users can update their own continuity events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own continuity events" ON public.continuity_events FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: omega_entities Users can update their own entities; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own entities" ON public.omega_entities FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: journal_entries Users can update their own journal entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own journal entries" ON public.journal_entries FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: memory_proposals Users can update their own memory proposals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own memory proposals" ON public.memory_proposals FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: people_places Users can update their own people places; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own people places" ON public.people_places FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: profile_claims Users can update their own profile claims; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own profile claims" ON public.profile_claims FOR UPDATE USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: resume_documents Users can update their own resume documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own resume documents" ON public.resume_documents FOR UPDATE USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: tasks Users can update their own tasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own tasks" ON public.tasks FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: event_causal_links Users can view own causal links; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own causal links" ON public.event_causal_links FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: character_timeline_events Users can view own character timeline events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own character timeline events" ON public.character_timeline_events FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: event_confidence_snapshots Users can view own confidence snapshots; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own confidence snapshots" ON public.event_confidence_snapshots FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: event_continuity_links Users can view own continuity links; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own continuity links" ON public.event_continuity_links FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: entity_deletion_events Users can view own entity deletion events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own entity deletion events" ON public.entity_deletion_events FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: entity_merge_records Users can view own entity merge records; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own entity merge records" ON public.entity_merge_records FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: entry_ir Users can view own entry IR; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own entry IR" ON public.entry_ir FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: entry_dependencies Users can view own entry dependencies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own entry dependencies" ON public.entry_dependencies FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: event_cognitions Users can view own event cognitions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own event cognitions" ON public.event_cognitions FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: event_emotions Users can view own event emotions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own event emotions" ON public.event_emotions FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: event_identity_impacts Users can view own event identity impacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own event identity impacts" ON public.event_identity_impacts FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: event_impacts Users can view own event impacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own event impacts" ON public.event_impacts FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: event_mentions Users can view own event mentions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own event mentions" ON public.event_mentions FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.resolved_events
  WHERE ((resolved_events.id = event_mentions.event_id) AND (resolved_events.user_id = auth.uid())))));


--
-- Name: event_records Users can view own event records; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own event records" ON public.event_records FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: goal_insights Users can view own goal insights; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own goal insights" ON public.goal_insights FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: goals Users can view own goals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own goals" ON public.goals FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: narrative_accounts Users can view own narrative accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own narrative accounts" ON public.narrative_accounts FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: narrative_claim_edges Users can view own narrative claim edges; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own narrative claim edges" ON public.narrative_claim_edges FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: narrative_claims Users can view own narrative claims; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own narrative claims" ON public.narrative_claims FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: quest_achievements Users can view own quest achievements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own quest achievements" ON public.quest_achievements FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: quest_dependencies Users can view own quest dependencies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own quest dependencies" ON public.quest_dependencies FOR SELECT USING ((auth.uid() IN ( SELECT quests.user_id
   FROM public.quests
  WHERE (quests.id = quest_dependencies.quest_id))));


--
-- Name: quest_history Users can view own quest history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own quest history" ON public.quest_history FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: quests Users can view own quests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own quests" ON public.quests FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: skill_clusters Users can view own skill clusters; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own skill clusters" ON public.skill_clusters FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: skill_relationships Users can view own skill relationships; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own skill relationships" ON public.skill_relationships FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: achievements Users can view their own achievements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own achievements" ON public.achievements FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: chapters Users can view their own chapters; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own chapters" ON public.chapters FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: characters Users can view their own characters; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own characters" ON public.characters FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: chat_contexts Users can view their own chat contexts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own chat contexts" ON public.chat_contexts FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: chat_messages Users can view their own chat messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own chat messages" ON public.chat_messages FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: chat_sessions Users can view their own chat sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own chat sessions" ON public.chat_sessions FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: profile_claim_evidence Users can view their own claim evidence; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own claim evidence" ON public.profile_claim_evidence FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: omega_claims Users can view their own claims; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own claims" ON public.omega_claims FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: continuity_events Users can view their own continuity events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own continuity events" ON public.continuity_events FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: omega_entities Users can view their own entities; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own entities" ON public.omega_entities FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: omega_evidence Users can view their own evidence; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own evidence" ON public.omega_evidence FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: journal_entries Users can view their own journal entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own journal entries" ON public.journal_entries FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: memory_decisions Users can view their own memory decisions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own memory decisions" ON public.memory_decisions FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: memory_proposals Users can view their own memory proposals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own memory proposals" ON public.memory_proposals FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: people_places Users can view their own people places; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own people places" ON public.people_places FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: profile_claims Users can view their own profile claims; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own profile claims" ON public.profile_claims FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: resume_documents Users can view their own resume documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own resume documents" ON public.resume_documents FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: reversal_logs Users can view their own reversal logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own reversal logs" ON public.reversal_logs FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: skill_progress Users can view their own skill progress; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own skill progress" ON public.skill_progress FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: tasks Users can view their own tasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own tasks" ON public.tasks FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: event_meaning_cache Users delete own event meaning cache; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users delete own event meaning cache" ON public.event_meaning_cache FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: event_meaning_cache Users insert own event meaning cache; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users insert own event meaning cache" ON public.event_meaning_cache FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: event_meaning_cache Users update own event meaning cache; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users update own event meaning cache" ON public.event_meaning_cache FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: event_meaning_cache Users view own event meaning cache; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users view own event meaning cache" ON public.event_meaning_cache FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: achievement_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.achievement_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: achievements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;

--
-- Name: api_rate_limit_buckets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.api_rate_limit_buckets ENABLE ROW LEVEL SECURITY;

--
-- Name: arc_event_links; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.arc_event_links ENABLE ROW LEVEL SECURITY;

--
-- Name: arc_event_links arc_event_links_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY arc_event_links_delete ON public.arc_event_links FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: arc_event_links arc_event_links_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY arc_event_links_insert ON public.arc_event_links FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: arc_event_links arc_event_links_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY arc_event_links_select ON public.arc_event_links FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: arc_event_links arc_event_links_service; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY arc_event_links_service ON public.arc_event_links USING ((auth.role() = 'service_role'::text));


--
-- Name: arc_event_links arc_event_links_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY arc_event_links_update ON public.arc_event_links FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: arc_memberships; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.arc_memberships ENABLE ROW LEVEL SECURITY;

--
-- Name: arc_relationships; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.arc_relationships ENABLE ROW LEVEL SECURITY;

--
-- Name: assertion_evidence; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.assertion_evidence ENABLE ROW LEVEL SECURITY;

--
-- Name: assertion_evidence assertion_evidence_user; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY assertion_evidence_user ON public.assertion_evidence USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: association_edges; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.association_edges ENABLE ROW LEVEL SECURITY;

--
-- Name: association_edges association_edges_user; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY association_edges_user ON public.association_edges USING ((auth.uid() = user_id));


--
-- Name: system_knowledge authenticated_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY authenticated_read ON public.system_knowledge FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: autobiographical_meaning_artifacts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.autobiographical_meaning_artifacts ENABLE ROW LEVEL SECURITY;

--
-- Name: autobiographical_meaning_artifacts autobiographical_meaning_owner_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY autobiographical_meaning_owner_read ON public.autobiographical_meaning_artifacts FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: chapters; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chapters ENABLE ROW LEVEL SECURITY;

--
-- Name: chapters chapters: owner delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "chapters: owner delete" ON public.chapters FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: chapters chapters: owner insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "chapters: owner insert" ON public.chapters FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: chapters chapters: owner read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "chapters: owner read" ON public.chapters FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: chapters chapters: owner update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "chapters: owner update" ON public.chapters FOR UPDATE USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: character_authority_map; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.character_authority_map ENABLE ROW LEVEL SECURITY;

--
-- Name: character_authority_map character_authority_map_user; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY character_authority_map_user ON public.character_authority_map USING ((auth.uid() = user_id));


--
-- Name: character_identity_index; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.character_identity_index ENABLE ROW LEVEL SECURITY;

--
-- Name: character_identity_index character_identity_index_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY character_identity_index_delete_own ON public.character_identity_index FOR DELETE TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: character_identity_index character_identity_index_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY character_identity_index_insert_own ON public.character_identity_index FOR INSERT TO authenticated WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: character_identity_index character_identity_index_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY character_identity_index_select_own ON public.character_identity_index FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: character_identity_index character_identity_index_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY character_identity_index_update_own ON public.character_identity_index FOR UPDATE TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: character_media; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.character_media ENABLE ROW LEVEL SECURITY;

--
-- Name: character_media character_media_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY character_media_delete ON public.character_media FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: character_media character_media_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY character_media_insert ON public.character_media FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: character_media character_media_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY character_media_select ON public.character_media FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: character_media character_media_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY character_media_update ON public.character_media FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: character_memories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.character_memories ENABLE ROW LEVEL SECURITY;

--
-- Name: character_relationships; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.character_relationships ENABLE ROW LEVEL SECURITY;

--
-- Name: character_timeline_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.character_timeline_events ENABLE ROW LEVEL SECURITY;

--
-- Name: characters; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.characters ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_contexts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chat_contexts ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_message_revisions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chat_message_revisions ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_message_revisions chat_message_revisions_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY chat_message_revisions_insert ON public.chat_message_revisions FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: chat_message_revisions chat_message_revisions_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY chat_message_revisions_select ON public.chat_message_revisions FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: chat_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: chronology_index; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chronology_index ENABLE ROW LEVEL SECURITY;

--
-- Name: chronology_index chronology_index_user_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY chronology_index_user_select ON public.chronology_index FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: chronology_order_corrections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chronology_order_corrections ENABLE ROW LEVEL SECURITY;

--
-- Name: chronology_order_corrections chronology_order_corrections_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY chronology_order_corrections_insert ON public.chronology_order_corrections FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: chronology_order_corrections chronology_order_corrections_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY chronology_order_corrections_select ON public.chronology_order_corrections FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: chronology_snapshots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chronology_snapshots ENABLE ROW LEVEL SECURITY;

--
-- Name: crystallized_knowledge ck_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ck_insert ON public.crystallized_knowledge FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: crystallized_knowledge ck_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ck_select ON public.crystallized_knowledge FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: crystallized_knowledge ck_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ck_update ON public.crystallized_knowledge FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: classifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.classifications ENABLE ROW LEVEL SECURITY;

--
-- Name: classifications classifications_global_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY classifications_global_read ON public.classifications FOR SELECT USING ((user_id IS NULL));


--
-- Name: classifications classifications_user; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY classifications_user ON public.classifications USING ((user_id = auth.uid()));


--
-- Name: continuity_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.continuity_events ENABLE ROW LEVEL SECURITY;

--
-- Name: continuity_snapshots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.continuity_snapshots ENABLE ROW LEVEL SECURITY;

--
-- Name: contradiction_signals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contradiction_signals ENABLE ROW LEVEL SECURITY;

--
-- Name: contradiction_signals contradiction_signals_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY contradiction_signals_select ON public.contradiction_signals FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: conversation_compactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.conversation_compactions ENABLE ROW LEVEL SECURITY;

--
-- Name: conversation_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.conversation_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: conversation_messages conversation_messages_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY conversation_messages_delete ON public.conversation_messages FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: conversation_messages conversation_messages_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY conversation_messages_insert ON public.conversation_messages FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: conversation_messages conversation_messages_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY conversation_messages_select ON public.conversation_messages FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: conversation_messages conversation_messages_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY conversation_messages_update ON public.conversation_messages FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: conversation_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.conversation_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: conversation_sessions conversation_sessions_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY conversation_sessions_delete ON public.conversation_sessions FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: conversation_sessions conversation_sessions_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY conversation_sessions_insert ON public.conversation_sessions FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: conversation_sessions conversation_sessions_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY conversation_sessions_select ON public.conversation_sessions FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: conversation_sessions conversation_sessions_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY conversation_sessions_update ON public.conversation_sessions FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: correction_records; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.correction_records ENABLE ROW LEVEL SECURITY;

--
-- Name: correction_records correction_records_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY correction_records_insert ON public.correction_records FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: correction_records correction_records_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY correction_records_select ON public.correction_records FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: crystallized_knowledge; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crystallized_knowledge ENABLE ROW LEVEL SECURITY;

--
-- Name: daily_summaries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.daily_summaries ENABLE ROW LEVEL SECURITY;

--
-- Name: daily_summaries daily_summaries: owner delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "daily_summaries: owner delete" ON public.daily_summaries FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: daily_summaries daily_summaries: owner insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "daily_summaries: owner insert" ON public.daily_summaries FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: daily_summaries daily_summaries: owner read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "daily_summaries: owner read" ON public.daily_summaries FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: daily_summaries daily_summaries: owner update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "daily_summaries: owner update" ON public.daily_summaries FOR UPDATE USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: entity_authority_decisions ead_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ead_insert ON public.entity_authority_decisions FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: entity_authority_decisions ead_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ead_select ON public.entity_authority_decisions FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: entity_authority_decisions ead_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ead_update ON public.entity_authority_decisions FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: embedding_model_registry; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.embedding_model_registry ENABLE ROW LEVEL SECURITY;

--
-- Name: engine_dependencies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.engine_dependencies ENABLE ROW LEVEL SECURITY;

--
-- Name: engine_results; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.engine_results ENABLE ROW LEVEL SECURITY;

--
-- Name: engine_results engine_results_self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY engine_results_self ON public.engine_results USING ((auth.uid() = user_id));


--
-- Name: entity_aliases; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.entity_aliases ENABLE ROW LEVEL SECURITY;

--
-- Name: entity_aliases entity_aliases_user; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY entity_aliases_user ON public.entity_aliases USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: entity_authority_decisions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.entity_authority_decisions ENABLE ROW LEVEL SECURITY;

--
-- Name: entity_conversation_links; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.entity_conversation_links ENABLE ROW LEVEL SECURITY;

--
-- Name: entity_conversation_links entity_conversation_links_owner_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY entity_conversation_links_owner_delete ON public.entity_conversation_links FOR DELETE TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: entity_conversation_links entity_conversation_links_owner_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY entity_conversation_links_owner_insert ON public.entity_conversation_links FOR INSERT TO authenticated WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: entity_conversation_links entity_conversation_links_owner_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY entity_conversation_links_owner_select ON public.entity_conversation_links FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: entity_conversation_links entity_conversation_links_owner_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY entity_conversation_links_owner_update ON public.entity_conversation_links FOR UPDATE TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: entity_deletion_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.entity_deletion_events ENABLE ROW LEVEL SECURITY;

--
-- Name: entity_facts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.entity_facts ENABLE ROW LEVEL SECURITY;

--
-- Name: entity_gravity_scores; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.entity_gravity_scores ENABLE ROW LEVEL SECURITY;

--
-- Name: entity_gravity_scores entity_gravity_scores_user_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY entity_gravity_scores_user_select ON public.entity_gravity_scores FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: entity_merge_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.entity_merge_log ENABLE ROW LEVEL SECURITY;

--
-- Name: entity_merge_log entity_merge_log_user; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY entity_merge_log_user ON public.entity_merge_log USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: entity_merge_records; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.entity_merge_records ENABLE ROW LEVEL SECURITY;

--
-- Name: entity_questions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.entity_questions ENABLE ROW LEVEL SECURITY;

--
-- Name: entity_questions entity_questions_owner_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY entity_questions_owner_insert ON public.entity_questions FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: entity_questions entity_questions_owner_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY entity_questions_owner_select ON public.entity_questions FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: entity_questions entity_questions_owner_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY entity_questions_owner_update ON public.entity_questions FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: entity_resolution_cache; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.entity_resolution_cache ENABLE ROW LEVEL SECURITY;

--
-- Name: entry_dependencies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.entry_dependencies ENABLE ROW LEVEL SECURITY;

--
-- Name: entry_ir; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.entry_ir ENABLE ROW LEVEL SECURITY;

--
-- Name: epiphany_insights; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.epiphany_insights ENABLE ROW LEVEL SECURITY;

--
-- Name: episodes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.episodes ENABLE ROW LEVEL SECURITY;

--
-- Name: episodes episodes_owner_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY episodes_owner_delete ON public.episodes FOR DELETE TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: episodes episodes_owner_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY episodes_owner_insert ON public.episodes FOR INSERT TO authenticated WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: episodes episodes_owner_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY episodes_owner_select ON public.episodes FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: episodes episodes_owner_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY episodes_owner_update ON public.episodes FOR UPDATE TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: event_candidates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_candidates ENABLE ROW LEVEL SECURITY;

--
-- Name: event_causal_links; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_causal_links ENABLE ROW LEVEL SECURITY;

--
-- Name: event_cognitions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_cognitions ENABLE ROW LEVEL SECURITY;

--
-- Name: event_confidence_snapshots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_confidence_snapshots ENABLE ROW LEVEL SECURITY;

--
-- Name: event_continuity_links; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_continuity_links ENABLE ROW LEVEL SECURITY;

--
-- Name: event_emotions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_emotions ENABLE ROW LEVEL SECURITY;

--
-- Name: event_identity_impacts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_identity_impacts ENABLE ROW LEVEL SECURITY;

--
-- Name: event_impacts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_impacts ENABLE ROW LEVEL SECURITY;

--
-- Name: event_meaning_cache; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_meaning_cache ENABLE ROW LEVEL SECURITY;

--
-- Name: event_mentions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_mentions ENABLE ROW LEVEL SECURITY;

--
-- Name: event_records; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_records ENABLE ROW LEVEL SECURITY;

--
-- Name: event_unit_links; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_unit_links ENABLE ROW LEVEL SECURITY;

--
-- Name: event_unit_links event_unit_links_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY event_unit_links_insert ON public.event_unit_links FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.extracted_units eu
  WHERE ((eu.id = event_unit_links.unit_id) AND (eu.user_id = auth.uid())))));


--
-- Name: event_unit_links event_unit_links_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY event_unit_links_select ON public.event_unit_links FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.extracted_units eu
  WHERE ((eu.id = event_unit_links.unit_id) AND (eu.user_id = auth.uid())))));


--
-- Name: external_account_connections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.external_account_connections ENABLE ROW LEVEL SECURITY;

--
-- Name: extracted_units; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.extracted_units ENABLE ROW LEVEL SECURITY;

--
-- Name: extracted_units extracted_units_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY extracted_units_insert ON public.extracted_units FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: extracted_units extracted_units_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY extracted_units_select ON public.extracted_units FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: goal_cognition_audit; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.goal_cognition_audit ENABLE ROW LEVEL SECURITY;

--
-- Name: goal_cognition_audit goal_cognition_audit_user; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY goal_cognition_audit_user ON public.goal_cognition_audit USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: goal_insights; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.goal_insights ENABLE ROW LEVEL SECURITY;

--
-- Name: goals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;

--
-- Name: graph_edges; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.graph_edges ENABLE ROW LEVEL SECURITY;

--
-- Name: graph_edges graph_edges_user; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY graph_edges_user ON public.graph_edges USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: graph_nodes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.graph_nodes ENABLE ROW LEVEL SECURITY;

--
-- Name: graph_nodes graph_nodes_user; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY graph_nodes_user ON public.graph_nodes USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: group_candidates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.group_candidates ENABLE ROW LEVEL SECURITY;

--
-- Name: group_candidates group_candidates_user_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY group_candidates_user_isolation ON public.group_candidates USING ((user_id = auth.uid()));


--
-- Name: group_evolution; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.group_evolution ENABLE ROW LEVEL SECURITY;

--
-- Name: group_evolution group_evolution_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY group_evolution_insert ON public.group_evolution FOR INSERT WITH CHECK ((user_id = auth.uid()));


--
-- Name: group_evolution group_evolution_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY group_evolution_select ON public.group_evolution FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: identity_mutations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.identity_mutations ENABLE ROW LEVEL SECURITY;

--
-- Name: identity_mutations identity_mutations_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY identity_mutations_insert ON public.identity_mutations FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: identity_mutations identity_mutations_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY identity_mutations_select ON public.identity_mutations FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: ingestion_dead_letter; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ingestion_dead_letter ENABLE ROW LEVEL SECURITY;

--
-- Name: ingestion_dead_letter ingestion_dead_letter_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ingestion_dead_letter_insert ON public.ingestion_dead_letter FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: ingestion_dead_letter ingestion_dead_letter_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ingestion_dead_letter_select ON public.ingestion_dead_letter FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: ingestion_jobs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ingestion_jobs ENABLE ROW LEVEL SECURITY;

--
-- Name: interest_mentions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.interest_mentions ENABLE ROW LEVEL SECURITY;

--
-- Name: interest_scope_groups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.interest_scope_groups ENABLE ROW LEVEL SECURITY;

--
-- Name: interest_scopes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.interest_scopes ENABLE ROW LEVEL SECURITY;

--
-- Name: interests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.interests ENABLE ROW LEVEL SECURITY;

--
-- Name: journal_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: knowledge_gaps; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.knowledge_gaps ENABLE ROW LEVEL SECURITY;

--
-- Name: knowledge_gaps knowledge_gaps_owner_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY knowledge_gaps_owner_insert ON public.knowledge_gaps FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: knowledge_gaps knowledge_gaps_owner_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY knowledge_gaps_owner_select ON public.knowledge_gaps FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: knowledge_gaps knowledge_gaps_owner_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY knowledge_gaps_owner_update ON public.knowledge_gaps FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: knowledge_units; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.knowledge_units ENABLE ROW LEVEL SECURITY;

--
-- Name: knowledge_units knowledge_units_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY knowledge_units_insert ON public.knowledge_units FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: knowledge_units knowledge_units_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY knowledge_units_select ON public.knowledge_units FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: knowledge_units knowledge_units_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY knowledge_units_update ON public.knowledge_units FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: lexical_analysis_results; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lexical_analysis_results ENABLE ROW LEVEL SECURITY;

--
-- Name: lexical_analysis_results lexical_analysis_results_user; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lexical_analysis_results_user ON public.lexical_analysis_results USING ((auth.uid() = user_id));


--
-- Name: life_arcs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.life_arcs ENABLE ROW LEVEL SECURITY;

--
-- Name: location_character_links; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.location_character_links ENABLE ROW LEVEL SECURITY;

--
-- Name: location_character_links location_character_links_owner_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY location_character_links_owner_delete ON public.location_character_links FOR DELETE TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: location_character_links location_character_links_owner_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY location_character_links_owner_insert ON public.location_character_links FOR INSERT TO authenticated WITH CHECK (((( SELECT auth.uid() AS uid) = user_id) AND (EXISTS ( SELECT 1
   FROM public.locations l
  WHERE ((l.id = location_character_links.location_id) AND (l.user_id = location_character_links.user_id)))) AND (EXISTS ( SELECT 1
   FROM public.characters c
  WHERE ((c.id = location_character_links.character_id) AND (c.user_id = location_character_links.user_id))))));


--
-- Name: location_character_links location_character_links_owner_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY location_character_links_owner_select ON public.location_character_links FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: location_character_links location_character_links_owner_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY location_character_links_owner_update ON public.location_character_links FOR UPDATE TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK (((( SELECT auth.uid() AS uid) = user_id) AND (EXISTS ( SELECT 1
   FROM public.locations l
  WHERE ((l.id = location_character_links.location_id) AND (l.user_id = location_character_links.user_id)))) AND (EXISTS ( SELECT 1
   FROM public.characters c
  WHERE ((c.id = location_character_links.character_id) AND (c.user_id = location_character_links.user_id))))));


--
-- Name: location_mentions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.location_mentions ENABLE ROW LEVEL SECURITY;

--
-- Name: location_mentions location_mentions_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY location_mentions_delete ON public.location_mentions FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: location_mentions location_mentions_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY location_mentions_insert ON public.location_mentions FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: location_mentions location_mentions_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY location_mentions_select ON public.location_mentions FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: locations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;

--
-- Name: locations locations_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY locations_delete ON public.locations FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: locations locations_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY locations_insert ON public.locations FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: locations locations_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY locations_select ON public.locations FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: locations locations_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY locations_update ON public.locations FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: lore_agent_observations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lore_agent_observations ENABLE ROW LEVEL SECURITY;

--
-- Name: lore_agent_proposed_actions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lore_agent_proposed_actions ENABLE ROW LEVEL SECURITY;

--
-- Name: lore_agent_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lore_agent_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: lore_topic_ledger; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lore_topic_ledger ENABLE ROW LEVEL SECURITY;

--
-- Name: mcp_tool_audit_log mcp_audit_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mcp_audit_own ON public.mcp_tool_audit_log FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: mcp_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mcp_events ENABLE ROW LEVEL SECURITY;

--
-- Name: mcp_events mcp_events_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mcp_events_own ON public.mcp_events FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: mcp_oauth_authorization_codes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mcp_oauth_authorization_codes ENABLE ROW LEVEL SECURITY;

--
-- Name: mcp_oauth_clients; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mcp_oauth_clients ENABLE ROW LEVEL SECURITY;

--
-- Name: mcp_oauth_refresh_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mcp_oauth_refresh_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: mcp_tool_audit_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mcp_tool_audit_log ENABLE ROW LEVEL SECURITY;

--
-- Name: mcp_tool_versions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mcp_tool_versions ENABLE ROW LEVEL SECURITY;

--
-- Name: meaning_resolution_results; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.meaning_resolution_results ENABLE ROW LEVEL SECURITY;

--
-- Name: meaning_resolution_results meaning_resolution_results_user; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY meaning_resolution_results_user ON public.meaning_resolution_results USING ((auth.uid() = user_id));


--
-- Name: memoir_outlines; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.memoir_outlines ENABLE ROW LEVEL SECURITY;

--
-- Name: memory_components; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.memory_components ENABLE ROW LEVEL SECURITY;

--
-- Name: memory_decisions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.memory_decisions ENABLE ROW LEVEL SECURITY;

--
-- Name: memory_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.memory_events ENABLE ROW LEVEL SECURITY;

--
-- Name: memory_events memory_events_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY memory_events_insert ON public.memory_events FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: memory_events memory_events_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY memory_events_select ON public.memory_events FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: memory_proposals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.memory_proposals ENABLE ROW LEVEL SECURITY;

--
-- Name: narrative_accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.narrative_accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: narrative_anchor_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.narrative_anchor_members ENABLE ROW LEVEL SECURITY;

--
-- Name: narrative_anchor_members narrative_anchor_members_user_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY narrative_anchor_members_user_select ON public.narrative_anchor_members FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: narrative_anchors; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.narrative_anchors ENABLE ROW LEVEL SECURITY;

--
-- Name: narrative_anchors narrative_anchors_user_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY narrative_anchors_user_select ON public.narrative_anchors FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: narrative_chapters; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.narrative_chapters ENABLE ROW LEVEL SECURITY;

--
-- Name: narrative_claim_edges; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.narrative_claim_edges ENABLE ROW LEVEL SECURITY;

--
-- Name: narrative_claims; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.narrative_claims ENABLE ROW LEVEL SECURITY;

--
-- Name: narrative_life_chapters; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.narrative_life_chapters ENABLE ROW LEVEL SECURITY;

--
-- Name: narrative_life_eras; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.narrative_life_eras ENABLE ROW LEVEL SECURITY;

--
-- Name: narrative_moments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.narrative_moments ENABLE ROW LEVEL SECURITY;

--
-- Name: narrative_scenes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.narrative_scenes ENABLE ROW LEVEL SECURITY;

--
-- Name: narrative_story_chapters; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.narrative_story_chapters ENABLE ROW LEVEL SECURITY;

--
-- Name: omega_claims; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.omega_claims ENABLE ROW LEVEL SECURITY;

--
-- Name: omega_entities; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.omega_entities ENABLE ROW LEVEL SECURITY;

--
-- Name: omega_evidence; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.omega_evidence ENABLE ROW LEVEL SECURITY;

--
-- Name: openai_cost_daily; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.openai_cost_daily ENABLE ROW LEVEL SECURITY;

--
-- Name: organization_relationships org_relationships_user_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_relationships_user_isolation ON public.organization_relationships USING ((user_id = auth.uid()));


--
-- Name: organization_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organization_events ENABLE ROW LEVEL SECURITY;

--
-- Name: organization_events organization_events_user_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organization_events_user_isolation ON public.organization_events USING ((user_id = auth.uid()));


--
-- Name: organization_locations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organization_locations ENABLE ROW LEVEL SECURITY;

--
-- Name: organization_locations organization_locations_user_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organization_locations_user_isolation ON public.organization_locations USING ((user_id = auth.uid()));


--
-- Name: organization_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

--
-- Name: organization_members organization_members_user_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organization_members_user_isolation ON public.organization_members USING ((user_id = auth.uid()));


--
-- Name: organization_relationships; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organization_relationships ENABLE ROW LEVEL SECURITY;

--
-- Name: organization_stories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organization_stories ENABLE ROW LEVEL SECURITY;

--
-- Name: organization_stories organization_stories_user_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organization_stories_user_isolation ON public.organization_stories USING ((user_id = auth.uid()));


--
-- Name: organization_suggestions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organization_suggestions ENABLE ROW LEVEL SECURITY;

--
-- Name: organization_suggestions organization_suggestions_user; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organization_suggestions_user ON public.organization_suggestions USING ((auth.uid() = user_id));


--
-- Name: organizations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

--
-- Name: organizations organizations_user_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organizations_user_isolation ON public.organizations USING ((user_id = auth.uid()));


--
-- Name: original_documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.original_documents ENABLE ROW LEVEL SECURITY;

--
-- Name: user_inference_state owner_all_user_inference_state; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY owner_all_user_inference_state ON public.user_inference_state TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: lore_agent_observations owner_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY owner_read ON public.lore_agent_observations FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: lore_agent_proposed_actions owner_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY owner_read ON public.lore_agent_proposed_actions FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: lore_agent_runs owner_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY owner_read ON public.lore_agent_runs FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: entity_resolution_cache owner_read_entity_resolution_cache; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY owner_read_entity_resolution_cache ON public.entity_resolution_cache FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: interest_mentions owner_read_interest_mentions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY owner_read_interest_mentions ON public.interest_mentions FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: interest_scope_groups owner_read_interest_scope_groups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY owner_read_interest_scope_groups ON public.interest_scope_groups FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: interest_scopes owner_read_interest_scopes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY owner_read_interest_scopes ON public.interest_scopes FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: interests owner_read_interests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY owner_read_interests ON public.interests FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: lore_topic_ledger owner_read_lore_topic_ledger; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY owner_read_lore_topic_ledger ON public.lore_topic_ledger FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: pipeline_runs owner_read_pipeline_runs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY owner_read_pipeline_runs ON public.pipeline_runs FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: provenance_edges owner_read_provenance_edges; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY owner_read_provenance_edges ON public.provenance_edges FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: user_corrections owner_rw; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY owner_rw ON public.user_corrections USING ((auth.uid() = user_id));


--
-- Name: people_places; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.people_places ENABLE ROW LEVEL SECURITY;

--
-- Name: people_places people_places: owner delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "people_places: owner delete" ON public.people_places FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: people_places people_places: owner insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "people_places: owner insert" ON public.people_places FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: people_places people_places: owner read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "people_places: owner read" ON public.people_places FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: people_places people_places: owner update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "people_places: owner update" ON public.people_places FOR UPDATE USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: perception_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.perception_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: perception_entries perception_entries_user_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY perception_entries_user_isolation ON public.perception_entries USING ((user_id = auth.uid()));


--
-- Name: perspective_claims; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.perspective_claims ENABLE ROW LEVEL SECURITY;

--
-- Name: perspective_disputes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.perspective_disputes ENABLE ROW LEVEL SECURITY;

--
-- Name: perspectives; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.perspectives ENABLE ROW LEVEL SECURITY;

--
-- Name: pipeline_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pipeline_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: platform_openai_spend; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.platform_openai_spend ENABLE ROW LEVEL SECURITY;

--
-- Name: preference_evidence; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.preference_evidence ENABLE ROW LEVEL SECURITY;

--
-- Name: preference_evidence preference_evidence_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY preference_evidence_select ON public.preference_evidence FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: preference_signals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.preference_signals ENABLE ROW LEVEL SECURITY;

--
-- Name: preference_signals preference_signals_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY preference_signals_select ON public.preference_signals FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: profile_claim_evidence; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profile_claim_evidence ENABLE ROW LEVEL SECURITY;

--
-- Name: profile_claims; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profile_claims ENABLE ROW LEVEL SECURITY;

--
-- Name: project_chronicle_meta; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.project_chronicle_meta ENABLE ROW LEVEL SECURITY;

--
-- Name: project_chronicle_milestones; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.project_chronicle_milestones ENABLE ROW LEVEL SECURITY;

--
-- Name: project_chronicle_pending_detections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.project_chronicle_pending_detections ENABLE ROW LEVEL SECURITY;

--
-- Name: project_suggestions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.project_suggestions ENABLE ROW LEVEL SECURITY;

--
-- Name: project_suggestions project_suggestions_user; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_suggestions_user ON public.project_suggestions USING ((auth.uid() = user_id));


--
-- Name: projects; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

--
-- Name: projects projects_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY projects_delete ON public.projects FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: projects projects_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY projects_insert ON public.projects FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: projects projects_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY projects_select ON public.projects FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: projects projects_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY projects_update ON public.projects FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: provenance_edges; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.provenance_edges ENABLE ROW LEVEL SECURITY;

--
-- Name: quest_achievements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.quest_achievements ENABLE ROW LEVEL SECURITY;

--
-- Name: quest_dependencies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.quest_dependencies ENABLE ROW LEVEL SECURITY;

--
-- Name: quest_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.quest_history ENABLE ROW LEVEL SECURITY;

--
-- Name: quest_suggestions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.quest_suggestions ENABLE ROW LEVEL SECURITY;

--
-- Name: quest_suggestions quest_suggestions_user; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY quest_suggestions_user ON public.quest_suggestions USING ((auth.uid() = user_id));


--
-- Name: quests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.quests ENABLE ROW LEVEL SECURITY;

--
-- Name: relationship_peripherals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.relationship_peripherals ENABLE ROW LEVEL SECURITY;

--
-- Name: relationship_peripherals relationship_peripherals_user_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY relationship_peripherals_user_policy ON public.relationship_peripherals TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: relationship_type_ontology; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.relationship_type_ontology ENABLE ROW LEVEL SECURITY;

--
-- Name: resolved_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.resolved_events ENABLE ROW LEVEL SECURITY;

--
-- Name: resolved_events resolved_events_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY resolved_events_delete ON public.resolved_events FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: resolved_events resolved_events_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY resolved_events_insert ON public.resolved_events FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: resolved_events resolved_events_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY resolved_events_select ON public.resolved_events FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: resolved_events resolved_events_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY resolved_events_update ON public.resolved_events FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: resume_documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.resume_documents ENABLE ROW LEVEL SECURITY;

--
-- Name: reversal_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reversal_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: romantic_peripherals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.romantic_peripherals ENABLE ROW LEVEL SECURITY;

--
-- Name: romantic_peripherals romantic_peripherals_user_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY romantic_peripherals_user_policy ON public.romantic_peripherals USING ((auth.uid() = user_id));


--
-- Name: romantic_relationships romantic_rel_owner_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY romantic_rel_owner_delete ON public.romantic_relationships FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: romantic_relationships romantic_rel_owner_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY romantic_rel_owner_insert ON public.romantic_relationships FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: romantic_relationships romantic_rel_owner_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY romantic_rel_owner_select ON public.romantic_relationships FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: romantic_relationships romantic_rel_owner_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY romantic_rel_owner_update ON public.romantic_relationships FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: romantic_relationships; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.romantic_relationships ENABLE ROW LEVEL SECURITY;

--
-- Name: salience_scores; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.salience_scores ENABLE ROW LEVEL SECURITY;

--
-- Name: salience_scores salience_scores_user; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY salience_scores_user ON public.salience_scores USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: embedding_model_registry service_role_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_only ON public.embedding_model_registry USING ((auth.role() = 'service_role'::text));


--
-- Name: shadow_extraction_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.shadow_extraction_log ENABLE ROW LEVEL SECURITY;

--
-- Name: shadow_extraction_log shadow_extraction_log_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY shadow_extraction_log_insert ON public.shadow_extraction_log FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: shadow_extraction_log shadow_extraction_log_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY shadow_extraction_log_select ON public.shadow_extraction_log FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: skill_clusters; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.skill_clusters ENABLE ROW LEVEL SECURITY;

--
-- Name: skill_evidence; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.skill_evidence ENABLE ROW LEVEL SECURITY;

--
-- Name: skill_evidence skill_evidence_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY skill_evidence_insert ON public.skill_evidence FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: skill_evidence skill_evidence_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY skill_evidence_select ON public.skill_evidence FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: skill_progress; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.skill_progress ENABLE ROW LEVEL SECURITY;

--
-- Name: skill_relationships; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.skill_relationships ENABLE ROW LEVEL SECURITY;

--
-- Name: skill_suggestions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.skill_suggestions ENABLE ROW LEVEL SECURITY;

--
-- Name: skill_suggestions skill_suggestions_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY skill_suggestions_delete ON public.skill_suggestions FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: skill_suggestions skill_suggestions_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY skill_suggestions_insert ON public.skill_suggestions FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: skill_suggestions skill_suggestions_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY skill_suggestions_select ON public.skill_suggestions FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: skill_suggestions skill_suggestions_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY skill_suggestions_update ON public.skill_suggestions FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: skill_usage_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.skill_usage_events ENABLE ROW LEVEL SECURITY;

--
-- Name: skill_usage_events skill_usage_events_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY skill_usage_events_insert ON public.skill_usage_events FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: skill_usage_events skill_usage_events_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY skill_usage_events_select ON public.skill_usage_events FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: skills; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.skills ENABLE ROW LEVEL SECURITY;

--
-- Name: skills skills_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY skills_delete ON public.skills FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: skills skills_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY skills_insert ON public.skills FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: skills skills_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY skills_select ON public.skills FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: skills skills_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY skills_update ON public.skills FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: social_communities; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.social_communities ENABLE ROW LEVEL SECURITY;

--
-- Name: social_communities social_communities_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY social_communities_insert ON public.social_communities FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: social_communities social_communities_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY social_communities_select ON public.social_communities FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: social_communities social_communities_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY social_communities_update ON public.social_communities FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: subscription_usage; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.subscription_usage ENABLE ROW LEVEL SECURITY;

--
-- Name: subscription_usage subscription_usage_owner_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY subscription_usage_owner_insert ON public.subscription_usage FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: subscription_usage subscription_usage_owner_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY subscription_usage_owner_select ON public.subscription_usage FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: subscription_usage subscription_usage_owner_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY subscription_usage_owner_update ON public.subscription_usage FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: subscriptions subscriptions_owner_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY subscriptions_owner_insert ON public.subscriptions FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: subscriptions subscriptions_owner_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY subscriptions_owner_select ON public.subscriptions FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: subscriptions subscriptions_owner_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY subscriptions_owner_update ON public.subscriptions FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: suggestion_dismissal_stats; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.suggestion_dismissal_stats ENABLE ROW LEVEL SECURITY;

--
-- Name: suggestion_dismissal_stats suggestion_dismissal_stats_user; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY suggestion_dismissal_stats_user ON public.suggestion_dismissal_stats USING ((auth.uid() = user_id));


--
-- Name: suggestion_thread_dismissals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.suggestion_thread_dismissals ENABLE ROW LEVEL SECURITY;

--
-- Name: suggestion_thread_dismissals suggestion_thread_dismissals_user; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY suggestion_thread_dismissals_user ON public.suggestion_thread_dismissals USING ((auth.uid() = user_id));


--
-- Name: system_knowledge; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.system_knowledge ENABLE ROW LEVEL SECURITY;

--
-- Name: task_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.task_events ENABLE ROW LEVEL SECURITY;

--
-- Name: task_events task_events: owner delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "task_events: owner delete" ON public.task_events FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: task_events task_events: owner insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "task_events: owner insert" ON public.task_events FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: task_events task_events: owner read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "task_events: owner read" ON public.task_events FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: task_events task_events: owner update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "task_events: owner update" ON public.task_events FOR UPDATE USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: tasks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

--
-- Name: terms_acceptance; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.terms_acceptance ENABLE ROW LEVEL SECURITY;

--
-- Name: terms_acceptance terms_acceptance_owner_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY terms_acceptance_owner_insert ON public.terms_acceptance FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: terms_acceptance terms_acceptance_owner_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY terms_acceptance_owner_select ON public.terms_acceptance FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: text_message_uploads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.text_message_uploads ENABLE ROW LEVEL SECURITY;

--
-- Name: text_message_uploads text_message_uploads_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY text_message_uploads_delete ON public.text_message_uploads FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: text_message_uploads text_message_uploads_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY text_message_uploads_insert ON public.text_message_uploads FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: text_message_uploads text_message_uploads_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY text_message_uploads_select ON public.text_message_uploads FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: timeline_actions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.timeline_actions ENABLE ROW LEVEL SECURITY;

--
-- Name: timeline_actions timeline_actions_user_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY timeline_actions_user_delete ON public.timeline_actions FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: timeline_actions timeline_actions_user_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY timeline_actions_user_insert ON public.timeline_actions FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: timeline_actions timeline_actions_user_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY timeline_actions_user_select ON public.timeline_actions FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: timeline_actions timeline_actions_user_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY timeline_actions_user_update ON public.timeline_actions FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: timeline_arcs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.timeline_arcs ENABLE ROW LEVEL SECURITY;

--
-- Name: timeline_arcs timeline_arcs_user_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY timeline_arcs_user_delete ON public.timeline_arcs FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: timeline_arcs timeline_arcs_user_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY timeline_arcs_user_insert ON public.timeline_arcs FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: timeline_arcs timeline_arcs_user_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY timeline_arcs_user_select ON public.timeline_arcs FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: timeline_arcs timeline_arcs_user_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY timeline_arcs_user_update ON public.timeline_arcs FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: timeline_epochs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.timeline_epochs ENABLE ROW LEVEL SECURITY;

--
-- Name: timeline_epochs timeline_epochs_user_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY timeline_epochs_user_delete ON public.timeline_epochs FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: timeline_epochs timeline_epochs_user_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY timeline_epochs_user_insert ON public.timeline_epochs FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: timeline_epochs timeline_epochs_user_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY timeline_epochs_user_select ON public.timeline_epochs FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: timeline_epochs timeline_epochs_user_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY timeline_epochs_user_update ON public.timeline_epochs FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: timeline_eras; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.timeline_eras ENABLE ROW LEVEL SECURITY;

--
-- Name: timeline_eras timeline_eras_user_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY timeline_eras_user_delete ON public.timeline_eras FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: timeline_eras timeline_eras_user_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY timeline_eras_user_insert ON public.timeline_eras FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: timeline_eras timeline_eras_user_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY timeline_eras_user_select ON public.timeline_eras FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: timeline_eras timeline_eras_user_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY timeline_eras_user_update ON public.timeline_eras FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: timeline_memberships; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.timeline_memberships ENABLE ROW LEVEL SECURITY;

--
-- Name: timeline_memberships timeline_memberships_user_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY timeline_memberships_user_delete ON public.timeline_memberships FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: timeline_memberships timeline_memberships_user_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY timeline_memberships_user_insert ON public.timeline_memberships FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: timeline_memberships timeline_memberships_user_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY timeline_memberships_user_select ON public.timeline_memberships FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: timeline_memberships timeline_memberships_user_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY timeline_memberships_user_update ON public.timeline_memberships FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: timeline_microactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.timeline_microactions ENABLE ROW LEVEL SECURITY;

--
-- Name: timeline_microactions timeline_microactions_user_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY timeline_microactions_user_delete ON public.timeline_microactions FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: timeline_microactions timeline_microactions_user_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY timeline_microactions_user_insert ON public.timeline_microactions FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: timeline_microactions timeline_microactions_user_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY timeline_microactions_user_select ON public.timeline_microactions FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: timeline_microactions timeline_microactions_user_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY timeline_microactions_user_update ON public.timeline_microactions FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: timeline_mythos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.timeline_mythos ENABLE ROW LEVEL SECURITY;

--
-- Name: timeline_mythos timeline_mythos_user_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY timeline_mythos_user_delete ON public.timeline_mythos FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: timeline_mythos timeline_mythos_user_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY timeline_mythos_user_insert ON public.timeline_mythos FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: timeline_mythos timeline_mythos_user_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY timeline_mythos_user_select ON public.timeline_mythos FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: timeline_mythos timeline_mythos_user_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY timeline_mythos_user_update ON public.timeline_mythos FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: timeline_relationships; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.timeline_relationships ENABLE ROW LEVEL SECURITY;

--
-- Name: timeline_relationships timeline_relationships_user_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY timeline_relationships_user_delete ON public.timeline_relationships FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: timeline_relationships timeline_relationships_user_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY timeline_relationships_user_insert ON public.timeline_relationships FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: timeline_relationships timeline_relationships_user_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY timeline_relationships_user_select ON public.timeline_relationships FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: timeline_relationships timeline_relationships_user_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY timeline_relationships_user_update ON public.timeline_relationships FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: timeline_sagas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.timeline_sagas ENABLE ROW LEVEL SECURITY;

--
-- Name: timeline_sagas timeline_sagas_user_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY timeline_sagas_user_delete ON public.timeline_sagas FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: timeline_sagas timeline_sagas_user_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY timeline_sagas_user_insert ON public.timeline_sagas FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: timeline_sagas timeline_sagas_user_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY timeline_sagas_user_select ON public.timeline_sagas FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: timeline_sagas timeline_sagas_user_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY timeline_sagas_user_update ON public.timeline_sagas FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: timeline_scenes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.timeline_scenes ENABLE ROW LEVEL SECURITY;

--
-- Name: timeline_scenes timeline_scenes_user_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY timeline_scenes_user_delete ON public.timeline_scenes FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: timeline_scenes timeline_scenes_user_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY timeline_scenes_user_insert ON public.timeline_scenes FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: timeline_scenes timeline_scenes_user_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY timeline_scenes_user_select ON public.timeline_scenes FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: timeline_scenes timeline_scenes_user_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY timeline_scenes_user_update ON public.timeline_scenes FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: timeline_search_index; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.timeline_search_index ENABLE ROW LEVEL SECURITY;

--
-- Name: timeline_search_index timeline_search_index_user_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY timeline_search_index_user_delete ON public.timeline_search_index FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: timeline_search_index timeline_search_index_user_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY timeline_search_index_user_insert ON public.timeline_search_index FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: timeline_search_index timeline_search_index_user_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY timeline_search_index_user_select ON public.timeline_search_index FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: timeline_search_index timeline_search_index_user_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY timeline_search_index_user_update ON public.timeline_search_index FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: timelines; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.timelines ENABLE ROW LEVEL SECURITY;

--
-- Name: timelines timelines_user_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY timelines_user_delete ON public.timelines FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: timelines timelines_user_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY timelines_user_insert ON public.timelines FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: timelines timelines_user_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY timelines_user_select ON public.timelines FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: timelines timelines_user_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY timelines_user_update ON public.timelines FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: user_activity_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_activity_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: user_chronology_order; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_chronology_order ENABLE ROW LEVEL SECURITY;

--
-- Name: user_chronology_order user_chronology_order_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_chronology_order_delete ON public.user_chronology_order FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: user_chronology_order user_chronology_order_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_chronology_order_insert ON public.user_chronology_order FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: user_chronology_order user_chronology_order_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_chronology_order_select ON public.user_chronology_order FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: user_chronology_order user_chronology_order_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_chronology_order_update ON public.user_chronology_order FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: user_corrections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_corrections ENABLE ROW LEVEL SECURITY;

--
-- Name: user_files; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_files ENABLE ROW LEVEL SECURITY;

--
-- Name: user_files user_files_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_files_delete ON public.user_files FOR DELETE TO authenticated USING ((auth.uid() = user_id));


--
-- Name: user_files user_files_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_files_insert ON public.user_files FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: user_files user_files_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_files_select ON public.user_files FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: user_files user_files_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_files_update ON public.user_files FOR UPDATE TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: user_inference_state; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_inference_state ENABLE ROW LEVEL SECURITY;

--
-- Name: conversation_compactions users_own_compactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_own_compactions ON public.conversation_compactions USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: utterances; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.utterances ENABLE ROW LEVEL SECURITY;

--
-- Name: utterances utterances_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY utterances_insert ON public.utterances FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: utterances utterances_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY utterances_select ON public.utterances FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION applied_migrations(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.applied_migrations() FROM PUBLIC;
GRANT ALL ON FUNCTION public.applied_migrations() TO service_role;


--
-- Name: FUNCTION assign_chat_message_refs(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.assign_chat_message_refs() TO anon;
GRANT ALL ON FUNCTION public.assign_chat_message_refs() TO authenticated;
GRANT ALL ON FUNCTION public.assign_chat_message_refs() TO service_role;


--
-- Name: FUNCTION assign_thread_number(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.assign_thread_number() TO anon;
GRANT ALL ON FUNCTION public.assign_thread_number() TO authenticated;
GRANT ALL ON FUNCTION public.assign_thread_number() TO service_role;


--
-- Name: FUNCTION assign_thread_number_on_first_message(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.assign_thread_number_on_first_message() TO anon;
GRANT ALL ON FUNCTION public.assign_thread_number_on_first_message() TO authenticated;
GRANT ALL ON FUNCTION public.assign_thread_number_on_first_message() TO service_role;


--
-- Name: FUNCTION can_reverse_event(event_id_param uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.can_reverse_event(event_id_param uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.can_reverse_event(event_id_param uuid) TO service_role;


--
-- Name: FUNCTION check_api_rate_limit(p_bucket_key text, p_max integer, p_window_ms integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.check_api_rate_limit(p_bucket_key text, p_max integer, p_window_ms integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.check_api_rate_limit(p_bucket_key text, p_max integer, p_window_ms integer) TO service_role;


--
-- Name: FUNCTION compute_chronology_buckets(p_start_time timestamp with time zone, p_end_time timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.compute_chronology_buckets(p_start_time timestamp with time zone, p_end_time timestamp with time zone) TO anon;
GRANT ALL ON FUNCTION public.compute_chronology_buckets(p_start_time timestamp with time zone, p_end_time timestamp with time zone) TO authenticated;
GRANT ALL ON FUNCTION public.compute_chronology_buckets(p_start_time timestamp with time zone, p_end_time timestamp with time zone) TO service_role;


--
-- Name: FUNCTION detect_temporal_contradiction(claim1_id uuid, claim2_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.detect_temporal_contradiction(claim1_id uuid, claim2_id uuid) TO anon;
GRANT ALL ON FUNCTION public.detect_temporal_contradiction(claim1_id uuid, claim2_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.detect_temporal_contradiction(claim1_id uuid, claim2_id uuid) TO service_role;


--
-- Name: FUNCTION get_database_storage_stats(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_database_storage_stats() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_database_storage_stats() TO anon;
GRANT ALL ON FUNCTION public.get_database_storage_stats() TO authenticated;
GRANT ALL ON FUNCTION public.get_database_storage_stats() TO service_role;


--
-- Name: FUNCTION get_event_explanation(event_id_param uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_event_explanation(event_id_param uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_event_explanation(event_id_param uuid) TO service_role;


--
-- Name: FUNCTION get_pending_mrq(user_id_param uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_pending_mrq(user_id_param uuid) TO anon;
GRANT ALL ON FUNCTION public.get_pending_mrq(user_id_param uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_pending_mrq(user_id_param uuid) TO service_role;


--
-- Name: FUNCTION has_accepted_latest_terms(p_user_id uuid, p_version text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.has_accepted_latest_terms(p_user_id uuid, p_version text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.has_accepted_latest_terms(p_user_id uuid, p_version text) TO service_role;


--
-- Name: FUNCTION identity_mutations_block_mutate(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.identity_mutations_block_mutate() TO anon;
GRANT ALL ON FUNCTION public.identity_mutations_block_mutate() TO authenticated;
GRANT ALL ON FUNCTION public.identity_mutations_block_mutate() TO service_role;


--
-- Name: FUNCTION initialize_free_subscription(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.initialize_free_subscription() FROM PUBLIC;
GRANT ALL ON FUNCTION public.initialize_free_subscription() TO service_role;


--
-- Name: FUNCTION match_journal_entries(user_uuid uuid, query_embedding public.vector, match_threshold double precision, match_count integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.match_journal_entries(user_uuid uuid, query_embedding public.vector, match_threshold double precision, match_count integer) TO anon;
GRANT ALL ON FUNCTION public.match_journal_entries(user_uuid uuid, query_embedding public.vector, match_threshold double precision, match_count integer) TO authenticated;
GRANT ALL ON FUNCTION public.match_journal_entries(user_uuid uuid, query_embedding public.vector, match_threshold double precision, match_count integer) TO service_role;


--
-- Name: FUNCTION match_omega_claims(query_embedding public.vector, user_id_param uuid, match_threshold double precision, match_count integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.match_omega_claims(query_embedding public.vector, user_id_param uuid, match_threshold double precision, match_count integer) TO anon;
GRANT ALL ON FUNCTION public.match_omega_claims(query_embedding public.vector, user_id_param uuid, match_threshold double precision, match_count integer) TO authenticated;
GRANT ALL ON FUNCTION public.match_omega_claims(query_embedding public.vector, user_id_param uuid, match_threshold double precision, match_count integer) TO service_role;


--
-- Name: FUNCTION memory_events_block_mutate(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.memory_events_block_mutate() TO anon;
GRANT ALL ON FUNCTION public.memory_events_block_mutate() TO authenticated;
GRANT ALL ON FUNCTION public.memory_events_block_mutate() TO service_role;


--
-- Name: FUNCTION normalize_character_registry_key(value text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.normalize_character_registry_key(value text) TO anon;
GRANT ALL ON FUNCTION public.normalize_character_registry_key(value text) TO authenticated;
GRANT ALL ON FUNCTION public.normalize_character_registry_key(value text) TO service_role;


--
-- Name: FUNCTION preserve_perception_original_content(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.preserve_perception_original_content() TO anon;
GRANT ALL ON FUNCTION public.preserve_perception_original_content() TO authenticated;
GRANT ALL ON FUNCTION public.preserve_perception_original_content() TO service_role;


--
-- Name: FUNCTION record_openai_cost_daily(p_day date, p_operation text, p_model text, p_calls integer, p_input_tokens bigint, p_output_tokens bigint, p_usd numeric); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.record_openai_cost_daily(p_day date, p_operation text, p_model text, p_calls integer, p_input_tokens bigint, p_output_tokens bigint, p_usd numeric) TO anon;
GRANT ALL ON FUNCTION public.record_openai_cost_daily(p_day date, p_operation text, p_model text, p_calls integer, p_input_tokens bigint, p_output_tokens bigint, p_usd numeric) TO authenticated;
GRANT ALL ON FUNCTION public.record_openai_cost_daily(p_day date, p_operation text, p_model text, p_calls integer, p_input_tokens bigint, p_output_tokens bigint, p_usd numeric) TO service_role;


--
-- Name: FUNCTION rls_auto_enable(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.rls_auto_enable() TO anon;
GRANT ALL ON FUNCTION public.rls_auto_enable() TO authenticated;
GRANT ALL ON FUNCTION public.rls_auto_enable() TO service_role;


--
-- Name: FUNCTION set_event_candidates_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_event_candidates_updated_at() TO anon;
GRANT ALL ON FUNCTION public.set_event_candidates_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.set_event_candidates_updated_at() TO service_role;


--
-- Name: FUNCTION set_life_arcs_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_life_arcs_updated_at() TO anon;
GRANT ALL ON FUNCTION public.set_life_arcs_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.set_life_arcs_updated_at() TO service_role;


--
-- Name: FUNCTION sync_character_identity_index(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.sync_character_identity_index() TO anon;
GRANT ALL ON FUNCTION public.sync_character_identity_index() TO authenticated;
GRANT ALL ON FUNCTION public.sync_character_identity_index() TO service_role;


--
-- Name: FUNCTION sync_chronology_index(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.sync_chronology_index() TO anon;
GRANT ALL ON FUNCTION public.sync_chronology_index() TO authenticated;
GRANT ALL ON FUNCTION public.sync_chronology_index() TO service_role;


--
-- Name: FUNCTION sync_omega_entity_type(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.sync_omega_entity_type() TO anon;
GRANT ALL ON FUNCTION public.sync_omega_entity_type() TO authenticated;
GRANT ALL ON FUNCTION public.sync_omega_entity_type() TO service_role;


--
-- Name: FUNCTION sync_perception_retraction_status(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.sync_perception_retraction_status() TO anon;
GRANT ALL ON FUNCTION public.sync_perception_retraction_status() TO authenticated;
GRANT ALL ON FUNCTION public.sync_perception_retraction_status() TO service_role;


--
-- Name: FUNCTION temporal_overlap(start1 timestamp with time zone, end1 timestamp with time zone, start2 timestamp with time zone, end2 timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.temporal_overlap(start1 timestamp with time zone, end1 timestamp with time zone, start2 timestamp with time zone, end2 timestamp with time zone) TO anon;
GRANT ALL ON FUNCTION public.temporal_overlap(start1 timestamp with time zone, end1 timestamp with time zone, start2 timestamp with time zone, end2 timestamp with time zone) TO authenticated;
GRANT ALL ON FUNCTION public.temporal_overlap(start1 timestamp with time zone, end1 timestamp with time zone, start2 timestamp with time zone, end2 timestamp with time zone) TO service_role;


--
-- Name: FUNCTION update_character_perception_stats(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_character_perception_stats() TO anon;
GRANT ALL ON FUNCTION public.update_character_perception_stats() TO authenticated;
GRANT ALL ON FUNCTION public.update_character_perception_stats() TO service_role;


--
-- Name: FUNCTION update_chat_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_chat_updated_at() TO anon;
GRANT ALL ON FUNCTION public.update_chat_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.update_chat_updated_at() TO service_role;


--
-- Name: FUNCTION update_interests_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_interests_updated_at() TO anon;
GRANT ALL ON FUNCTION public.update_interests_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.update_interests_updated_at() TO service_role;


--
-- Name: FUNCTION update_omega_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_omega_updated_at() TO anon;
GRANT ALL ON FUNCTION public.update_omega_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.update_omega_updated_at() TO service_role;


--
-- Name: FUNCTION update_organizations_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_organizations_updated_at() TO anon;
GRANT ALL ON FUNCTION public.update_organizations_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.update_organizations_updated_at() TO service_role;


--
-- Name: FUNCTION update_perception_entries_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_perception_entries_updated_at() TO anon;
GRANT ALL ON FUNCTION public.update_perception_entries_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.update_perception_entries_updated_at() TO service_role;


--
-- Name: FUNCTION update_timeline_events_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_timeline_events_updated_at() TO anon;
GRANT ALL ON FUNCTION public.update_timeline_events_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.update_timeline_events_updated_at() TO service_role;


--
-- Name: FUNCTION update_timelines_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_timelines_updated_at() TO anon;
GRANT ALL ON FUNCTION public.update_timelines_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.update_timelines_updated_at() TO service_role;


--
-- Name: FUNCTION update_updated_at_column(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_updated_at_column() TO anon;
GRANT ALL ON FUNCTION public.update_updated_at_column() TO authenticated;
GRANT ALL ON FUNCTION public.update_updated_at_column() TO service_role;


--
-- Name: TABLE achievement_templates; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.achievement_templates TO anon;
GRANT ALL ON TABLE public.achievement_templates TO authenticated;
GRANT ALL ON TABLE public.achievement_templates TO service_role;


--
-- Name: TABLE achievements; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.achievements TO anon;
GRANT ALL ON TABLE public.achievements TO authenticated;
GRANT ALL ON TABLE public.achievements TO service_role;


--
-- Name: TABLE api_rate_limit_buckets; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.api_rate_limit_buckets TO service_role;


--
-- Name: TABLE arc_event_links; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.arc_event_links TO anon;
GRANT ALL ON TABLE public.arc_event_links TO authenticated;
GRANT ALL ON TABLE public.arc_event_links TO service_role;


--
-- Name: TABLE arc_memberships; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.arc_memberships TO anon;
GRANT ALL ON TABLE public.arc_memberships TO authenticated;
GRANT ALL ON TABLE public.arc_memberships TO service_role;


--
-- Name: TABLE arc_relationships; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.arc_relationships TO anon;
GRANT ALL ON TABLE public.arc_relationships TO authenticated;
GRANT ALL ON TABLE public.arc_relationships TO service_role;


--
-- Name: TABLE assertion_evidence; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.assertion_evidence TO anon;
GRANT ALL ON TABLE public.assertion_evidence TO authenticated;
GRANT ALL ON TABLE public.assertion_evidence TO service_role;


--
-- Name: TABLE association_edges; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.association_edges TO anon;
GRANT ALL ON TABLE public.association_edges TO authenticated;
GRANT ALL ON TABLE public.association_edges TO service_role;


--
-- Name: TABLE autobiographical_meaning_artifacts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.autobiographical_meaning_artifacts TO anon;
GRANT ALL ON TABLE public.autobiographical_meaning_artifacts TO authenticated;
GRANT ALL ON TABLE public.autobiographical_meaning_artifacts TO service_role;


--
-- Name: TABLE chapters; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.chapters TO anon;
GRANT ALL ON TABLE public.chapters TO authenticated;
GRANT ALL ON TABLE public.chapters TO service_role;


--
-- Name: TABLE character_authority_map; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.character_authority_map TO anon;
GRANT ALL ON TABLE public.character_authority_map TO authenticated;
GRANT ALL ON TABLE public.character_authority_map TO service_role;


--
-- Name: TABLE character_identity_index; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.character_identity_index TO anon;
GRANT ALL ON TABLE public.character_identity_index TO authenticated;
GRANT ALL ON TABLE public.character_identity_index TO service_role;


--
-- Name: TABLE character_media; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.character_media TO anon;
GRANT ALL ON TABLE public.character_media TO authenticated;
GRANT ALL ON TABLE public.character_media TO service_role;


--
-- Name: TABLE character_memories; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.character_memories TO anon;
GRANT ALL ON TABLE public.character_memories TO authenticated;
GRANT ALL ON TABLE public.character_memories TO service_role;


--
-- Name: TABLE character_relationships; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.character_relationships TO anon;
GRANT ALL ON TABLE public.character_relationships TO authenticated;
GRANT ALL ON TABLE public.character_relationships TO service_role;


--
-- Name: TABLE character_timeline_events; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.character_timeline_events TO anon;
GRANT ALL ON TABLE public.character_timeline_events TO authenticated;
GRANT ALL ON TABLE public.character_timeline_events TO service_role;


--
-- Name: TABLE characters; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.characters TO anon;
GRANT ALL ON TABLE public.characters TO authenticated;
GRANT ALL ON TABLE public.characters TO service_role;


--
-- Name: TABLE chat_contexts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.chat_contexts TO anon;
GRANT ALL ON TABLE public.chat_contexts TO authenticated;
GRANT ALL ON TABLE public.chat_contexts TO service_role;


--
-- Name: TABLE chat_message_revisions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.chat_message_revisions TO anon;
GRANT ALL ON TABLE public.chat_message_revisions TO authenticated;
GRANT ALL ON TABLE public.chat_message_revisions TO service_role;


--
-- Name: TABLE chat_messages; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.chat_messages TO anon;
GRANT ALL ON TABLE public.chat_messages TO authenticated;
GRANT ALL ON TABLE public.chat_messages TO service_role;


--
-- Name: TABLE chat_sessions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.chat_sessions TO anon;
GRANT ALL ON TABLE public.chat_sessions TO authenticated;
GRANT ALL ON TABLE public.chat_sessions TO service_role;


--
-- Name: TABLE chronology_index; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.chronology_index TO anon;
GRANT ALL ON TABLE public.chronology_index TO authenticated;
GRANT ALL ON TABLE public.chronology_index TO service_role;


--
-- Name: TABLE chronology_order_corrections; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.chronology_order_corrections TO anon;
GRANT ALL ON TABLE public.chronology_order_corrections TO authenticated;
GRANT ALL ON TABLE public.chronology_order_corrections TO service_role;


--
-- Name: TABLE chronology_snapshots; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.chronology_snapshots TO anon;
GRANT ALL ON TABLE public.chronology_snapshots TO authenticated;
GRANT ALL ON TABLE public.chronology_snapshots TO service_role;


--
-- Name: TABLE classifications; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.classifications TO anon;
GRANT ALL ON TABLE public.classifications TO authenticated;
GRANT ALL ON TABLE public.classifications TO service_role;


--
-- Name: TABLE continuity_events; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.continuity_events TO anon;
GRANT ALL ON TABLE public.continuity_events TO authenticated;
GRANT ALL ON TABLE public.continuity_events TO service_role;


--
-- Name: TABLE continuity_snapshots; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.continuity_snapshots TO anon;
GRANT ALL ON TABLE public.continuity_snapshots TO authenticated;
GRANT ALL ON TABLE public.continuity_snapshots TO service_role;


--
-- Name: TABLE contradiction_signals; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.contradiction_signals TO anon;
GRANT ALL ON TABLE public.contradiction_signals TO authenticated;
GRANT ALL ON TABLE public.contradiction_signals TO service_role;


--
-- Name: TABLE conversation_compactions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.conversation_compactions TO anon;
GRANT ALL ON TABLE public.conversation_compactions TO authenticated;
GRANT ALL ON TABLE public.conversation_compactions TO service_role;


--
-- Name: TABLE conversation_messages; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.conversation_messages TO anon;
GRANT ALL ON TABLE public.conversation_messages TO authenticated;
GRANT ALL ON TABLE public.conversation_messages TO service_role;


--
-- Name: TABLE conversation_sessions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.conversation_sessions TO anon;
GRANT ALL ON TABLE public.conversation_sessions TO authenticated;
GRANT ALL ON TABLE public.conversation_sessions TO service_role;


--
-- Name: TABLE correction_records; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.correction_records TO anon;
GRANT ALL ON TABLE public.correction_records TO authenticated;
GRANT ALL ON TABLE public.correction_records TO service_role;


--
-- Name: TABLE crystallized_knowledge; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.crystallized_knowledge TO anon;
GRANT ALL ON TABLE public.crystallized_knowledge TO authenticated;
GRANT ALL ON TABLE public.crystallized_knowledge TO service_role;


--
-- Name: TABLE daily_summaries; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.daily_summaries TO anon;
GRANT ALL ON TABLE public.daily_summaries TO authenticated;
GRANT ALL ON TABLE public.daily_summaries TO service_role;


--
-- Name: TABLE embedding_model_registry; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.embedding_model_registry TO anon;
GRANT ALL ON TABLE public.embedding_model_registry TO authenticated;
GRANT ALL ON TABLE public.embedding_model_registry TO service_role;


--
-- Name: TABLE engine_dependencies; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.engine_dependencies TO service_role;


--
-- Name: TABLE engine_results; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.engine_results TO anon;
GRANT ALL ON TABLE public.engine_results TO authenticated;
GRANT ALL ON TABLE public.engine_results TO service_role;


--
-- Name: TABLE entity_aliases; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.entity_aliases TO anon;
GRANT ALL ON TABLE public.entity_aliases TO authenticated;
GRANT ALL ON TABLE public.entity_aliases TO service_role;


--
-- Name: TABLE entity_authority_decisions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.entity_authority_decisions TO anon;
GRANT ALL ON TABLE public.entity_authority_decisions TO authenticated;
GRANT ALL ON TABLE public.entity_authority_decisions TO service_role;


--
-- Name: TABLE entity_conversation_links; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.entity_conversation_links TO anon;
GRANT ALL ON TABLE public.entity_conversation_links TO authenticated;
GRANT ALL ON TABLE public.entity_conversation_links TO service_role;


--
-- Name: TABLE entity_deletion_events; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.entity_deletion_events TO anon;
GRANT ALL ON TABLE public.entity_deletion_events TO authenticated;
GRANT ALL ON TABLE public.entity_deletion_events TO service_role;


--
-- Name: TABLE entity_facts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.entity_facts TO anon;
GRANT ALL ON TABLE public.entity_facts TO authenticated;
GRANT ALL ON TABLE public.entity_facts TO service_role;


--
-- Name: TABLE entity_gravity_scores; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.entity_gravity_scores TO anon;
GRANT ALL ON TABLE public.entity_gravity_scores TO authenticated;
GRANT ALL ON TABLE public.entity_gravity_scores TO service_role;


--
-- Name: TABLE entity_merge_log; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.entity_merge_log TO anon;
GRANT ALL ON TABLE public.entity_merge_log TO authenticated;
GRANT ALL ON TABLE public.entity_merge_log TO service_role;


--
-- Name: TABLE entity_merge_records; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.entity_merge_records TO anon;
GRANT ALL ON TABLE public.entity_merge_records TO authenticated;
GRANT ALL ON TABLE public.entity_merge_records TO service_role;


--
-- Name: TABLE entity_questions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.entity_questions TO anon;
GRANT ALL ON TABLE public.entity_questions TO authenticated;
GRANT ALL ON TABLE public.entity_questions TO service_role;


--
-- Name: TABLE entity_resolution_cache; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.entity_resolution_cache TO anon;
GRANT ALL ON TABLE public.entity_resolution_cache TO authenticated;
GRANT ALL ON TABLE public.entity_resolution_cache TO service_role;


--
-- Name: TABLE entry_dependencies; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.entry_dependencies TO anon;
GRANT ALL ON TABLE public.entry_dependencies TO authenticated;
GRANT ALL ON TABLE public.entry_dependencies TO service_role;


--
-- Name: TABLE entry_ir; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.entry_ir TO anon;
GRANT ALL ON TABLE public.entry_ir TO authenticated;
GRANT ALL ON TABLE public.entry_ir TO service_role;


--
-- Name: TABLE epiphany_insights; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.epiphany_insights TO anon;
GRANT ALL ON TABLE public.epiphany_insights TO authenticated;
GRANT ALL ON TABLE public.epiphany_insights TO service_role;


--
-- Name: TABLE episodes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.episodes TO anon;
GRANT ALL ON TABLE public.episodes TO authenticated;
GRANT ALL ON TABLE public.episodes TO service_role;


--
-- Name: TABLE event_candidates; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.event_candidates TO anon;
GRANT ALL ON TABLE public.event_candidates TO authenticated;
GRANT ALL ON TABLE public.event_candidates TO service_role;


--
-- Name: TABLE event_causal_links; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.event_causal_links TO anon;
GRANT ALL ON TABLE public.event_causal_links TO authenticated;
GRANT ALL ON TABLE public.event_causal_links TO service_role;


--
-- Name: TABLE event_cognitions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.event_cognitions TO anon;
GRANT ALL ON TABLE public.event_cognitions TO authenticated;
GRANT ALL ON TABLE public.event_cognitions TO service_role;


--
-- Name: TABLE event_confidence_snapshots; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.event_confidence_snapshots TO anon;
GRANT ALL ON TABLE public.event_confidence_snapshots TO authenticated;
GRANT ALL ON TABLE public.event_confidence_snapshots TO service_role;


--
-- Name: TABLE event_continuity_links; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.event_continuity_links TO anon;
GRANT ALL ON TABLE public.event_continuity_links TO authenticated;
GRANT ALL ON TABLE public.event_continuity_links TO service_role;


--
-- Name: TABLE event_emotions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.event_emotions TO anon;
GRANT ALL ON TABLE public.event_emotions TO authenticated;
GRANT ALL ON TABLE public.event_emotions TO service_role;


--
-- Name: TABLE event_identity_impacts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.event_identity_impacts TO anon;
GRANT ALL ON TABLE public.event_identity_impacts TO authenticated;
GRANT ALL ON TABLE public.event_identity_impacts TO service_role;


--
-- Name: TABLE event_impacts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.event_impacts TO anon;
GRANT ALL ON TABLE public.event_impacts TO authenticated;
GRANT ALL ON TABLE public.event_impacts TO service_role;


--
-- Name: TABLE event_meaning_cache; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.event_meaning_cache TO anon;
GRANT ALL ON TABLE public.event_meaning_cache TO authenticated;
GRANT ALL ON TABLE public.event_meaning_cache TO service_role;


--
-- Name: TABLE event_mentions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.event_mentions TO anon;
GRANT ALL ON TABLE public.event_mentions TO authenticated;
GRANT ALL ON TABLE public.event_mentions TO service_role;


--
-- Name: TABLE event_records; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.event_records TO anon;
GRANT ALL ON TABLE public.event_records TO authenticated;
GRANT ALL ON TABLE public.event_records TO service_role;


--
-- Name: TABLE event_unit_links; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.event_unit_links TO anon;
GRANT ALL ON TABLE public.event_unit_links TO authenticated;
GRANT ALL ON TABLE public.event_unit_links TO service_role;


--
-- Name: TABLE external_account_connections; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.external_account_connections TO anon;
GRANT ALL ON TABLE public.external_account_connections TO authenticated;
GRANT ALL ON TABLE public.external_account_connections TO service_role;


--
-- Name: TABLE extracted_units; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.extracted_units TO anon;
GRANT ALL ON TABLE public.extracted_units TO authenticated;
GRANT ALL ON TABLE public.extracted_units TO service_role;


--
-- Name: TABLE goal_cognition_audit; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.goal_cognition_audit TO anon;
GRANT ALL ON TABLE public.goal_cognition_audit TO authenticated;
GRANT ALL ON TABLE public.goal_cognition_audit TO service_role;


--
-- Name: TABLE goal_insights; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.goal_insights TO anon;
GRANT ALL ON TABLE public.goal_insights TO authenticated;
GRANT ALL ON TABLE public.goal_insights TO service_role;


--
-- Name: TABLE goals; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.goals TO anon;
GRANT ALL ON TABLE public.goals TO authenticated;
GRANT ALL ON TABLE public.goals TO service_role;


--
-- Name: TABLE graph_edges; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.graph_edges TO anon;
GRANT ALL ON TABLE public.graph_edges TO authenticated;
GRANT ALL ON TABLE public.graph_edges TO service_role;


--
-- Name: TABLE graph_nodes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.graph_nodes TO anon;
GRANT ALL ON TABLE public.graph_nodes TO authenticated;
GRANT ALL ON TABLE public.graph_nodes TO service_role;


--
-- Name: TABLE group_candidates; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.group_candidates TO anon;
GRANT ALL ON TABLE public.group_candidates TO authenticated;
GRANT ALL ON TABLE public.group_candidates TO service_role;


--
-- Name: TABLE group_evolution; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.group_evolution TO anon;
GRANT ALL ON TABLE public.group_evolution TO authenticated;
GRANT ALL ON TABLE public.group_evolution TO service_role;


--
-- Name: TABLE identity_mutations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.identity_mutations TO anon;
GRANT ALL ON TABLE public.identity_mutations TO authenticated;
GRANT ALL ON TABLE public.identity_mutations TO service_role;


--
-- Name: TABLE ingestion_dead_letter; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.ingestion_dead_letter TO anon;
GRANT ALL ON TABLE public.ingestion_dead_letter TO authenticated;
GRANT ALL ON TABLE public.ingestion_dead_letter TO service_role;


--
-- Name: TABLE ingestion_jobs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.ingestion_jobs TO anon;
GRANT ALL ON TABLE public.ingestion_jobs TO authenticated;
GRANT ALL ON TABLE public.ingestion_jobs TO service_role;


--
-- Name: TABLE interest_mentions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.interest_mentions TO anon;
GRANT ALL ON TABLE public.interest_mentions TO authenticated;
GRANT ALL ON TABLE public.interest_mentions TO service_role;


--
-- Name: TABLE interest_scope_groups; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.interest_scope_groups TO anon;
GRANT ALL ON TABLE public.interest_scope_groups TO authenticated;
GRANT ALL ON TABLE public.interest_scope_groups TO service_role;


--
-- Name: TABLE interest_scopes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.interest_scopes TO anon;
GRANT ALL ON TABLE public.interest_scopes TO authenticated;
GRANT ALL ON TABLE public.interest_scopes TO service_role;


--
-- Name: TABLE interests; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.interests TO anon;
GRANT ALL ON TABLE public.interests TO authenticated;
GRANT ALL ON TABLE public.interests TO service_role;


--
-- Name: TABLE journal_entries; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.journal_entries TO anon;
GRANT ALL ON TABLE public.journal_entries TO authenticated;
GRANT ALL ON TABLE public.journal_entries TO service_role;


--
-- Name: TABLE knowledge_gaps; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.knowledge_gaps TO anon;
GRANT ALL ON TABLE public.knowledge_gaps TO authenticated;
GRANT ALL ON TABLE public.knowledge_gaps TO service_role;


--
-- Name: TABLE knowledge_units; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.knowledge_units TO anon;
GRANT ALL ON TABLE public.knowledge_units TO authenticated;
GRANT ALL ON TABLE public.knowledge_units TO service_role;


--
-- Name: TABLE lexical_analysis_results; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.lexical_analysis_results TO anon;
GRANT ALL ON TABLE public.lexical_analysis_results TO authenticated;
GRANT ALL ON TABLE public.lexical_analysis_results TO service_role;


--
-- Name: TABLE life_arcs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.life_arcs TO anon;
GRANT ALL ON TABLE public.life_arcs TO authenticated;
GRANT ALL ON TABLE public.life_arcs TO service_role;


--
-- Name: TABLE location_character_links; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.location_character_links TO anon;
GRANT ALL ON TABLE public.location_character_links TO authenticated;
GRANT ALL ON TABLE public.location_character_links TO service_role;


--
-- Name: TABLE location_mentions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.location_mentions TO anon;
GRANT ALL ON TABLE public.location_mentions TO authenticated;
GRANT ALL ON TABLE public.location_mentions TO service_role;


--
-- Name: TABLE locations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.locations TO anon;
GRANT ALL ON TABLE public.locations TO authenticated;
GRANT ALL ON TABLE public.locations TO service_role;


--
-- Name: TABLE lore_agent_observations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.lore_agent_observations TO anon;
GRANT ALL ON TABLE public.lore_agent_observations TO authenticated;
GRANT ALL ON TABLE public.lore_agent_observations TO service_role;


--
-- Name: TABLE lore_agent_proposed_actions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.lore_agent_proposed_actions TO anon;
GRANT ALL ON TABLE public.lore_agent_proposed_actions TO authenticated;
GRANT ALL ON TABLE public.lore_agent_proposed_actions TO service_role;


--
-- Name: TABLE lore_agent_runs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.lore_agent_runs TO anon;
GRANT ALL ON TABLE public.lore_agent_runs TO authenticated;
GRANT ALL ON TABLE public.lore_agent_runs TO service_role;


--
-- Name: TABLE lore_topic_ledger; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.lore_topic_ledger TO anon;
GRANT ALL ON TABLE public.lore_topic_ledger TO authenticated;
GRANT ALL ON TABLE public.lore_topic_ledger TO service_role;


--
-- Name: TABLE mcp_events; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.mcp_events TO anon;
GRANT ALL ON TABLE public.mcp_events TO authenticated;
GRANT ALL ON TABLE public.mcp_events TO service_role;


--
-- Name: TABLE mcp_oauth_authorization_codes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.mcp_oauth_authorization_codes TO anon;
GRANT ALL ON TABLE public.mcp_oauth_authorization_codes TO authenticated;
GRANT ALL ON TABLE public.mcp_oauth_authorization_codes TO service_role;


--
-- Name: TABLE mcp_oauth_clients; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.mcp_oauth_clients TO anon;
GRANT ALL ON TABLE public.mcp_oauth_clients TO authenticated;
GRANT ALL ON TABLE public.mcp_oauth_clients TO service_role;


--
-- Name: TABLE mcp_oauth_refresh_tokens; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.mcp_oauth_refresh_tokens TO anon;
GRANT ALL ON TABLE public.mcp_oauth_refresh_tokens TO authenticated;
GRANT ALL ON TABLE public.mcp_oauth_refresh_tokens TO service_role;


--
-- Name: TABLE mcp_tool_audit_log; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.mcp_tool_audit_log TO anon;
GRANT ALL ON TABLE public.mcp_tool_audit_log TO authenticated;
GRANT ALL ON TABLE public.mcp_tool_audit_log TO service_role;


--
-- Name: TABLE mcp_tool_versions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.mcp_tool_versions TO anon;
GRANT ALL ON TABLE public.mcp_tool_versions TO authenticated;
GRANT ALL ON TABLE public.mcp_tool_versions TO service_role;


--
-- Name: TABLE meaning_resolution_results; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.meaning_resolution_results TO anon;
GRANT ALL ON TABLE public.meaning_resolution_results TO authenticated;
GRANT ALL ON TABLE public.meaning_resolution_results TO service_role;


--
-- Name: TABLE memoir_outlines; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.memoir_outlines TO anon;
GRANT ALL ON TABLE public.memoir_outlines TO authenticated;
GRANT ALL ON TABLE public.memoir_outlines TO service_role;


--
-- Name: TABLE memory_components; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.memory_components TO anon;
GRANT ALL ON TABLE public.memory_components TO authenticated;
GRANT ALL ON TABLE public.memory_components TO service_role;


--
-- Name: TABLE memory_decisions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.memory_decisions TO anon;
GRANT ALL ON TABLE public.memory_decisions TO authenticated;
GRANT ALL ON TABLE public.memory_decisions TO service_role;


--
-- Name: TABLE memory_events; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.memory_events TO anon;
GRANT ALL ON TABLE public.memory_events TO authenticated;
GRANT ALL ON TABLE public.memory_events TO service_role;


--
-- Name: TABLE memory_health; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.memory_health TO service_role;


--
-- Name: TABLE memory_proposals; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.memory_proposals TO anon;
GRANT ALL ON TABLE public.memory_proposals TO authenticated;
GRANT ALL ON TABLE public.memory_proposals TO service_role;


--
-- Name: TABLE narrative_accounts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.narrative_accounts TO anon;
GRANT ALL ON TABLE public.narrative_accounts TO authenticated;
GRANT ALL ON TABLE public.narrative_accounts TO service_role;


--
-- Name: TABLE narrative_anchor_members; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.narrative_anchor_members TO anon;
GRANT ALL ON TABLE public.narrative_anchor_members TO authenticated;
GRANT ALL ON TABLE public.narrative_anchor_members TO service_role;


--
-- Name: TABLE narrative_anchors; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.narrative_anchors TO anon;
GRANT ALL ON TABLE public.narrative_anchors TO authenticated;
GRANT ALL ON TABLE public.narrative_anchors TO service_role;


--
-- Name: TABLE narrative_chapters; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.narrative_chapters TO anon;
GRANT ALL ON TABLE public.narrative_chapters TO authenticated;
GRANT ALL ON TABLE public.narrative_chapters TO service_role;


--
-- Name: TABLE narrative_claim_edges; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.narrative_claim_edges TO anon;
GRANT ALL ON TABLE public.narrative_claim_edges TO authenticated;
GRANT ALL ON TABLE public.narrative_claim_edges TO service_role;


--
-- Name: TABLE narrative_claims; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.narrative_claims TO anon;
GRANT ALL ON TABLE public.narrative_claims TO authenticated;
GRANT ALL ON TABLE public.narrative_claims TO service_role;


--
-- Name: TABLE narrative_life_chapters; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.narrative_life_chapters TO anon;
GRANT ALL ON TABLE public.narrative_life_chapters TO authenticated;
GRANT ALL ON TABLE public.narrative_life_chapters TO service_role;


--
-- Name: TABLE narrative_life_eras; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.narrative_life_eras TO anon;
GRANT ALL ON TABLE public.narrative_life_eras TO authenticated;
GRANT ALL ON TABLE public.narrative_life_eras TO service_role;


--
-- Name: TABLE narrative_moments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.narrative_moments TO anon;
GRANT ALL ON TABLE public.narrative_moments TO authenticated;
GRANT ALL ON TABLE public.narrative_moments TO service_role;


--
-- Name: TABLE narrative_scenes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.narrative_scenes TO anon;
GRANT ALL ON TABLE public.narrative_scenes TO authenticated;
GRANT ALL ON TABLE public.narrative_scenes TO service_role;


--
-- Name: TABLE narrative_story_chapters; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.narrative_story_chapters TO anon;
GRANT ALL ON TABLE public.narrative_story_chapters TO authenticated;
GRANT ALL ON TABLE public.narrative_story_chapters TO service_role;


--
-- Name: TABLE omega_claims; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.omega_claims TO anon;
GRANT ALL ON TABLE public.omega_claims TO authenticated;
GRANT ALL ON TABLE public.omega_claims TO service_role;


--
-- Name: TABLE omega_claims_with_evidence; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.omega_claims_with_evidence TO anon;
GRANT ALL ON TABLE public.omega_claims_with_evidence TO authenticated;
GRANT ALL ON TABLE public.omega_claims_with_evidence TO service_role;


--
-- Name: TABLE omega_entities; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.omega_entities TO anon;
GRANT ALL ON TABLE public.omega_entities TO authenticated;
GRANT ALL ON TABLE public.omega_entities TO service_role;


--
-- Name: TABLE omega_evidence; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.omega_evidence TO anon;
GRANT ALL ON TABLE public.omega_evidence TO authenticated;
GRANT ALL ON TABLE public.omega_evidence TO service_role;


--
-- Name: TABLE openai_cost_daily; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.openai_cost_daily TO anon;
GRANT ALL ON TABLE public.openai_cost_daily TO authenticated;
GRANT ALL ON TABLE public.openai_cost_daily TO service_role;


--
-- Name: TABLE organization_events; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.organization_events TO anon;
GRANT ALL ON TABLE public.organization_events TO authenticated;
GRANT ALL ON TABLE public.organization_events TO service_role;


--
-- Name: TABLE organization_locations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.organization_locations TO anon;
GRANT ALL ON TABLE public.organization_locations TO authenticated;
GRANT ALL ON TABLE public.organization_locations TO service_role;


--
-- Name: TABLE organization_members; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.organization_members TO anon;
GRANT ALL ON TABLE public.organization_members TO authenticated;
GRANT ALL ON TABLE public.organization_members TO service_role;


--
-- Name: TABLE organization_relationships; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.organization_relationships TO anon;
GRANT ALL ON TABLE public.organization_relationships TO authenticated;
GRANT ALL ON TABLE public.organization_relationships TO service_role;


--
-- Name: TABLE organization_stories; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.organization_stories TO anon;
GRANT ALL ON TABLE public.organization_stories TO authenticated;
GRANT ALL ON TABLE public.organization_stories TO service_role;


--
-- Name: TABLE organization_suggestions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.organization_suggestions TO anon;
GRANT ALL ON TABLE public.organization_suggestions TO authenticated;
GRANT ALL ON TABLE public.organization_suggestions TO service_role;


--
-- Name: TABLE organizations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.organizations TO anon;
GRANT ALL ON TABLE public.organizations TO authenticated;
GRANT ALL ON TABLE public.organizations TO service_role;


--
-- Name: TABLE original_documents; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.original_documents TO anon;
GRANT ALL ON TABLE public.original_documents TO authenticated;
GRANT ALL ON TABLE public.original_documents TO service_role;


--
-- Name: TABLE people_places; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.people_places TO anon;
GRANT ALL ON TABLE public.people_places TO authenticated;
GRANT ALL ON TABLE public.people_places TO service_role;


--
-- Name: TABLE perception_entries; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.perception_entries TO anon;
GRANT ALL ON TABLE public.perception_entries TO authenticated;
GRANT ALL ON TABLE public.perception_entries TO service_role;


--
-- Name: TABLE perspective_claims; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.perspective_claims TO anon;
GRANT ALL ON TABLE public.perspective_claims TO authenticated;
GRANT ALL ON TABLE public.perspective_claims TO service_role;


--
-- Name: TABLE perspective_disputes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.perspective_disputes TO anon;
GRANT ALL ON TABLE public.perspective_disputes TO authenticated;
GRANT ALL ON TABLE public.perspective_disputes TO service_role;


--
-- Name: TABLE perspectives; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.perspectives TO anon;
GRANT ALL ON TABLE public.perspectives TO authenticated;
GRANT ALL ON TABLE public.perspectives TO service_role;


--
-- Name: TABLE pipeline_runs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.pipeline_runs TO anon;
GRANT ALL ON TABLE public.pipeline_runs TO authenticated;
GRANT ALL ON TABLE public.pipeline_runs TO service_role;


--
-- Name: TABLE pipeline_runs_incomplete; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.pipeline_runs_incomplete TO anon;
GRANT ALL ON TABLE public.pipeline_runs_incomplete TO authenticated;
GRANT ALL ON TABLE public.pipeline_runs_incomplete TO service_role;


--
-- Name: TABLE platform_openai_spend; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.platform_openai_spend TO anon;
GRANT ALL ON TABLE public.platform_openai_spend TO authenticated;
GRANT ALL ON TABLE public.platform_openai_spend TO service_role;


--
-- Name: TABLE preference_evidence; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.preference_evidence TO anon;
GRANT ALL ON TABLE public.preference_evidence TO authenticated;
GRANT ALL ON TABLE public.preference_evidence TO service_role;


--
-- Name: TABLE preference_signals; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.preference_signals TO anon;
GRANT ALL ON TABLE public.preference_signals TO authenticated;
GRANT ALL ON TABLE public.preference_signals TO service_role;


--
-- Name: TABLE profile_claim_evidence; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.profile_claim_evidence TO anon;
GRANT ALL ON TABLE public.profile_claim_evidence TO authenticated;
GRANT ALL ON TABLE public.profile_claim_evidence TO service_role;


--
-- Name: TABLE profile_claims; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.profile_claims TO anon;
GRANT ALL ON TABLE public.profile_claims TO authenticated;
GRANT ALL ON TABLE public.profile_claims TO service_role;


--
-- Name: TABLE project_chronicle_meta; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.project_chronicle_meta TO service_role;


--
-- Name: TABLE project_chronicle_milestones; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.project_chronicle_milestones TO service_role;


--
-- Name: TABLE project_chronicle_pending_detections; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.project_chronicle_pending_detections TO service_role;


--
-- Name: TABLE project_suggestions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.project_suggestions TO anon;
GRANT ALL ON TABLE public.project_suggestions TO authenticated;
GRANT ALL ON TABLE public.project_suggestions TO service_role;


--
-- Name: TABLE projects; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.projects TO anon;
GRANT ALL ON TABLE public.projects TO authenticated;
GRANT ALL ON TABLE public.projects TO service_role;


--
-- Name: TABLE provenance_edges; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.provenance_edges TO anon;
GRANT ALL ON TABLE public.provenance_edges TO authenticated;
GRANT ALL ON TABLE public.provenance_edges TO service_role;


--
-- Name: TABLE provenance_edges_export; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.provenance_edges_export TO anon;
GRANT ALL ON TABLE public.provenance_edges_export TO authenticated;
GRANT ALL ON TABLE public.provenance_edges_export TO service_role;


--
-- Name: TABLE quest_achievements; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.quest_achievements TO anon;
GRANT ALL ON TABLE public.quest_achievements TO authenticated;
GRANT ALL ON TABLE public.quest_achievements TO service_role;


--
-- Name: TABLE quest_dependencies; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.quest_dependencies TO anon;
GRANT ALL ON TABLE public.quest_dependencies TO authenticated;
GRANT ALL ON TABLE public.quest_dependencies TO service_role;


--
-- Name: TABLE quest_history; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.quest_history TO anon;
GRANT ALL ON TABLE public.quest_history TO authenticated;
GRANT ALL ON TABLE public.quest_history TO service_role;


--
-- Name: TABLE quest_suggestions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.quest_suggestions TO anon;
GRANT ALL ON TABLE public.quest_suggestions TO authenticated;
GRANT ALL ON TABLE public.quest_suggestions TO service_role;


--
-- Name: TABLE quests; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.quests TO anon;
GRANT ALL ON TABLE public.quests TO authenticated;
GRANT ALL ON TABLE public.quests TO service_role;


--
-- Name: TABLE relationship_arcs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.relationship_arcs TO anon;
GRANT ALL ON TABLE public.relationship_arcs TO authenticated;
GRANT ALL ON TABLE public.relationship_arcs TO service_role;


--
-- Name: TABLE relationship_peripherals; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.relationship_peripherals TO anon;
GRANT ALL ON TABLE public.relationship_peripherals TO authenticated;
GRANT ALL ON TABLE public.relationship_peripherals TO service_role;


--
-- Name: TABLE relationship_type_ontology; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.relationship_type_ontology TO anon;
GRANT ALL ON TABLE public.relationship_type_ontology TO authenticated;
GRANT ALL ON TABLE public.relationship_type_ontology TO service_role;


--
-- Name: TABLE resolved_events; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.resolved_events TO anon;
GRANT ALL ON TABLE public.resolved_events TO authenticated;
GRANT ALL ON TABLE public.resolved_events TO service_role;


--
-- Name: TABLE resume_documents; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.resume_documents TO anon;
GRANT ALL ON TABLE public.resume_documents TO authenticated;
GRANT ALL ON TABLE public.resume_documents TO service_role;


--
-- Name: TABLE reversal_logs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.reversal_logs TO anon;
GRANT ALL ON TABLE public.reversal_logs TO authenticated;
GRANT ALL ON TABLE public.reversal_logs TO service_role;


--
-- Name: TABLE romantic_peripherals; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.romantic_peripherals TO anon;
GRANT ALL ON TABLE public.romantic_peripherals TO authenticated;
GRANT ALL ON TABLE public.romantic_peripherals TO service_role;


--
-- Name: TABLE romantic_relationships; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.romantic_relationships TO anon;
GRANT ALL ON TABLE public.romantic_relationships TO authenticated;
GRANT ALL ON TABLE public.romantic_relationships TO service_role;


--
-- Name: TABLE salience_scores; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.salience_scores TO anon;
GRANT ALL ON TABLE public.salience_scores TO authenticated;
GRANT ALL ON TABLE public.salience_scores TO service_role;


--
-- Name: TABLE shadow_extraction_log; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.shadow_extraction_log TO anon;
GRANT ALL ON TABLE public.shadow_extraction_log TO authenticated;
GRANT ALL ON TABLE public.shadow_extraction_log TO service_role;


--
-- Name: TABLE skill_clusters; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.skill_clusters TO anon;
GRANT ALL ON TABLE public.skill_clusters TO authenticated;
GRANT ALL ON TABLE public.skill_clusters TO service_role;


--
-- Name: TABLE skill_evidence; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.skill_evidence TO anon;
GRANT ALL ON TABLE public.skill_evidence TO authenticated;
GRANT ALL ON TABLE public.skill_evidence TO service_role;


--
-- Name: TABLE skill_progress; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.skill_progress TO anon;
GRANT ALL ON TABLE public.skill_progress TO authenticated;
GRANT ALL ON TABLE public.skill_progress TO service_role;


--
-- Name: TABLE skill_relationships; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.skill_relationships TO anon;
GRANT ALL ON TABLE public.skill_relationships TO authenticated;
GRANT ALL ON TABLE public.skill_relationships TO service_role;


--
-- Name: TABLE skill_suggestions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.skill_suggestions TO anon;
GRANT ALL ON TABLE public.skill_suggestions TO authenticated;
GRANT ALL ON TABLE public.skill_suggestions TO service_role;


--
-- Name: TABLE skill_usage_events; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.skill_usage_events TO anon;
GRANT ALL ON TABLE public.skill_usage_events TO authenticated;
GRANT ALL ON TABLE public.skill_usage_events TO service_role;


--
-- Name: TABLE skills; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.skills TO anon;
GRANT ALL ON TABLE public.skills TO authenticated;
GRANT ALL ON TABLE public.skills TO service_role;


--
-- Name: TABLE social_communities; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.social_communities TO anon;
GRANT ALL ON TABLE public.social_communities TO authenticated;
GRANT ALL ON TABLE public.social_communities TO service_role;


--
-- Name: TABLE subscription_usage; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.subscription_usage TO anon;
GRANT ALL ON TABLE public.subscription_usage TO authenticated;
GRANT ALL ON TABLE public.subscription_usage TO service_role;


--
-- Name: TABLE subscriptions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.subscriptions TO anon;
GRANT ALL ON TABLE public.subscriptions TO authenticated;
GRANT ALL ON TABLE public.subscriptions TO service_role;


--
-- Name: TABLE suggestion_dismissal_stats; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.suggestion_dismissal_stats TO anon;
GRANT ALL ON TABLE public.suggestion_dismissal_stats TO authenticated;
GRANT ALL ON TABLE public.suggestion_dismissal_stats TO service_role;


--
-- Name: TABLE suggestion_thread_dismissals; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.suggestion_thread_dismissals TO anon;
GRANT ALL ON TABLE public.suggestion_thread_dismissals TO authenticated;
GRANT ALL ON TABLE public.suggestion_thread_dismissals TO service_role;


--
-- Name: TABLE system_knowledge; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.system_knowledge TO anon;
GRANT ALL ON TABLE public.system_knowledge TO authenticated;
GRANT ALL ON TABLE public.system_knowledge TO service_role;


--
-- Name: TABLE task_events; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.task_events TO anon;
GRANT ALL ON TABLE public.task_events TO authenticated;
GRANT ALL ON TABLE public.task_events TO service_role;


--
-- Name: TABLE tasks; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.tasks TO anon;
GRANT ALL ON TABLE public.tasks TO authenticated;
GRANT ALL ON TABLE public.tasks TO service_role;


--
-- Name: TABLE terms_acceptance; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.terms_acceptance TO anon;
GRANT ALL ON TABLE public.terms_acceptance TO authenticated;
GRANT ALL ON TABLE public.terms_acceptance TO service_role;


--
-- Name: TABLE text_message_uploads; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.text_message_uploads TO anon;
GRANT ALL ON TABLE public.text_message_uploads TO authenticated;
GRANT ALL ON TABLE public.text_message_uploads TO service_role;


--
-- Name: TABLE timeline_actions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.timeline_actions TO anon;
GRANT ALL ON TABLE public.timeline_actions TO authenticated;
GRANT ALL ON TABLE public.timeline_actions TO service_role;


--
-- Name: TABLE timeline_arcs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.timeline_arcs TO anon;
GRANT ALL ON TABLE public.timeline_arcs TO authenticated;
GRANT ALL ON TABLE public.timeline_arcs TO service_role;


--
-- Name: TABLE timeline_epochs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.timeline_epochs TO anon;
GRANT ALL ON TABLE public.timeline_epochs TO authenticated;
GRANT ALL ON TABLE public.timeline_epochs TO service_role;


--
-- Name: TABLE timeline_eras; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.timeline_eras TO anon;
GRANT ALL ON TABLE public.timeline_eras TO authenticated;
GRANT ALL ON TABLE public.timeline_eras TO service_role;


--
-- Name: TABLE timeline_memberships; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.timeline_memberships TO anon;
GRANT ALL ON TABLE public.timeline_memberships TO authenticated;
GRANT ALL ON TABLE public.timeline_memberships TO service_role;


--
-- Name: TABLE timeline_microactions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.timeline_microactions TO anon;
GRANT ALL ON TABLE public.timeline_microactions TO authenticated;
GRANT ALL ON TABLE public.timeline_microactions TO service_role;


--
-- Name: TABLE timeline_mythos; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.timeline_mythos TO anon;
GRANT ALL ON TABLE public.timeline_mythos TO authenticated;
GRANT ALL ON TABLE public.timeline_mythos TO service_role;


--
-- Name: TABLE timeline_relationships; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.timeline_relationships TO anon;
GRANT ALL ON TABLE public.timeline_relationships TO authenticated;
GRANT ALL ON TABLE public.timeline_relationships TO service_role;


--
-- Name: TABLE timeline_sagas; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.timeline_sagas TO anon;
GRANT ALL ON TABLE public.timeline_sagas TO authenticated;
GRANT ALL ON TABLE public.timeline_sagas TO service_role;


--
-- Name: TABLE timeline_scenes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.timeline_scenes TO anon;
GRANT ALL ON TABLE public.timeline_scenes TO authenticated;
GRANT ALL ON TABLE public.timeline_scenes TO service_role;


--
-- Name: TABLE timeline_search_index; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.timeline_search_index TO anon;
GRANT ALL ON TABLE public.timeline_search_index TO authenticated;
GRANT ALL ON TABLE public.timeline_search_index TO service_role;


--
-- Name: TABLE timelines; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.timelines TO anon;
GRANT ALL ON TABLE public.timelines TO authenticated;
GRANT ALL ON TABLE public.timelines TO service_role;


--
-- Name: TABLE user_activity_logs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_activity_logs TO anon;
GRANT ALL ON TABLE public.user_activity_logs TO authenticated;
GRANT ALL ON TABLE public.user_activity_logs TO service_role;


--
-- Name: TABLE user_chronology_order; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_chronology_order TO anon;
GRANT ALL ON TABLE public.user_chronology_order TO authenticated;
GRANT ALL ON TABLE public.user_chronology_order TO service_role;


--
-- Name: TABLE user_corrections; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_corrections TO anon;
GRANT ALL ON TABLE public.user_corrections TO authenticated;
GRANT ALL ON TABLE public.user_corrections TO service_role;


--
-- Name: TABLE user_files; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_files TO anon;
GRANT ALL ON TABLE public.user_files TO authenticated;
GRANT ALL ON TABLE public.user_files TO service_role;


--
-- Name: TABLE user_inference_state; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_inference_state TO anon;
GRANT ALL ON TABLE public.user_inference_state TO authenticated;
GRANT ALL ON TABLE public.user_inference_state TO service_role;


--
-- Name: TABLE utterances; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.utterances TO anon;
GRANT ALL ON TABLE public.utterances TO authenticated;
GRANT ALL ON TABLE public.utterances TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- PostgreSQL database dump complete
--
