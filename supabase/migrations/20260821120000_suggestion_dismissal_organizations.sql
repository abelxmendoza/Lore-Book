-- Additive: allow Groups/Organizations book dismissals in existing
-- suggestion_dismissal_stats / suggestion_thread_dismissals.
-- DO NOT APPLY in this task — written for the next schema deploy.
-- Runtime already persists org rejections via identity_mutations + group_candidates.

ALTER TABLE public.suggestion_dismissal_stats
  DROP CONSTRAINT IF EXISTS suggestion_dismissal_stats_book_domain_check;

ALTER TABLE public.suggestion_dismissal_stats
  ADD CONSTRAINT suggestion_dismissal_stats_book_domain_check
  CHECK (book_domain = ANY (ARRAY[
    'projects'::text,
    'skills'::text,
    'quests'::text,
    'locations'::text,
    'characters'::text,
    'organizations'::text
  ]));

ALTER TABLE public.suggestion_thread_dismissals
  DROP CONSTRAINT IF EXISTS suggestion_thread_dismissals_book_domain_check;

ALTER TABLE public.suggestion_thread_dismissals
  ADD CONSTRAINT suggestion_thread_dismissals_book_domain_check
  CHECK (book_domain = ANY (ARRAY[
    'projects'::text,
    'skills'::text,
    'quests'::text,
    'locations'::text,
    'characters'::text,
    'organizations'::text
  ]));
