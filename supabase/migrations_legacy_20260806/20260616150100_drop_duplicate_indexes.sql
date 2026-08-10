-- Drop redundant duplicate indexes (plain indexes duplicating another plain index
-- or a unique-constraint-backed index). Never drops a _key/_unique constraint
-- index. Reduces write overhead + disk. Reversible via CREATE INDEX.
DROP INDEX IF EXISTS public.idx_extracted_units_utterance;        -- dup of extracted_units_utterance_id_idx
DROP INDEX IF EXISTS public.idx_utterances_message;               -- dup of utterances_message_id_idx
DROP INDEX IF EXISTS public.idx_locations_place_type;             -- dup of idx_locations_type
DROP INDEX IF EXISTS public.idx_locations_normalized;             -- dup of locations_user_id_normalized_name_key
DROP INDEX IF EXISTS public.daily_summaries_user_date_idx;        -- dup of daily_summaries_user_id_date_key
DROP INDEX IF EXISTS public.memoir_outlines_user_id_idx;          -- dup of memoir_outlines_user_id_key
DROP INDEX IF EXISTS public.subscriptions_user_id_idx;            -- dup of subscriptions_user_id_key
DROP INDEX IF EXISTS public.subscriptions_stripe_customer_id_idx; -- dup of subscriptions_stripe_customer_id_key
DROP INDEX IF EXISTS public.subscription_usage_user_month_idx;    -- dup of subscription_usage_user_id_month_key
DROP INDEX IF EXISTS public.idx_chronology_snapshots_user;        -- dup of chronology_snapshots_user_unique
DROP INDEX IF EXISTS public.idx_entity_resolution_user_name;      -- dup of entity_resolution_cache_user_id_entity_name_key
