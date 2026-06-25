-- Cross-process backstop for duplicate "self" cards.
--
-- entityAttributeDetector.getOrCreateUserCharacter previously inserted a "Me"
-- protagonist without a lock, so concurrent ingests created duplicate self cards
-- (commit 45afaae1 added the in-process characterRegistry.runExclusive lock).
-- This partial unique index enforces AT MOST ONE is_self card per user even
-- across processes, so the race can never re-materialize duplicates.

create unique index if not exists uniq_one_self_character_per_user
  on public.characters (user_id)
  where ((metadata->>'is_self') = 'true');
