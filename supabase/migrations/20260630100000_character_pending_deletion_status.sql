-- Character lifecycle: active → archived → pending_deletion → (app DELETE)
-- pending_deletion is a review queue before permanent removal.

COMMENT ON COLUMN public.characters.status IS
  'Lifecycle: active, inactive, unmet, archived (hidden from book), pending_deletion (queued for permanent delete review)';

CREATE INDEX IF NOT EXISTS characters_user_pending_deletion_idx
  ON public.characters (user_id, updated_at DESC)
  WHERE status = 'pending_deletion';
