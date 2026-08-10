-- Real endings aren't all clean breakups: ghosted/blocked are distinct
-- end-states, unrequited/fading/rekindled are real mid-states. The
-- classifier now infers these from context ("she blocked me on insta").

ALTER TABLE public.romantic_relationships DROP CONSTRAINT IF EXISTS romantic_relationships_status_check;
ALTER TABLE public.romantic_relationships ADD CONSTRAINT romantic_relationships_status_check
  CHECK (status IN ('active', 'on_break', 'ended', 'complicated', 'paused', 'ghosted', 'blocked', 'unrequited', 'fading', 'rekindled'));
