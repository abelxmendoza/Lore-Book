-- Temporal user↔organization relationship state: richer roles beyond
-- founder/leader/member/..., start/end timestamps for the CURRENT relationship
-- (distinct from organizations.status/founded_date/dissolved_year, which
-- describe the organization itself, not the user's relationship to it), and
-- an append-only history table for every transition.
--
-- The history table is modeled on group_evolution's shape (event-sourced,
-- previous/new state) but scoped correctly to `organizations` — group_evolution
-- is wired to `social_communities` and has no live writers.
--
-- NOTE: written for review only — not applied in this session.

ALTER TABLE public.organizations
  DROP CONSTRAINT organizations_user_relationship_check;

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_user_relationship_check CHECK (
    user_relationship = ANY (ARRAY[
      'founder'::text, 'leader'::text, 'member'::text, 'former_member'::text,
      'collaborator'::text, 'adjacent'::text, 'fan'::text, 'aware_of'::text,
      'referenced'::text, 'alumnus'::text,
      'employee'::text, 'former_employee'::text, 'applicant'::text,
      'interview_candidate'::text, 'recruiter'::text, 'hiring_manager'::text,
      'customer'::text, 'volunteer'::text, 'contractor'::text, 'investor'::text,
      'advisor'::text, 'mentor'::text, 'vendor'::text, 'client'::text,
      'sponsor'::text, 'organizer'::text, 'moderator'::text, 'performer'::text,
      'student'::text
    ])
  );

ALTER TABLE public.group_candidates
  DROP CONSTRAINT group_candidates_relationship_check;

ALTER TABLE public.group_candidates
  ADD CONSTRAINT group_candidates_relationship_check CHECK (
    suggested_user_relationship = ANY (ARRAY[
      'founder'::text, 'leader'::text, 'member'::text, 'former_member'::text,
      'collaborator'::text, 'adjacent'::text, 'fan'::text, 'aware_of'::text,
      'referenced'::text, 'alumnus'::text,
      'employee'::text, 'former_employee'::text, 'applicant'::text,
      'interview_candidate'::text, 'recruiter'::text, 'hiring_manager'::text,
      'customer'::text, 'volunteer'::text, 'contractor'::text, 'investor'::text,
      'advisor'::text, 'mentor'::text, 'vendor'::text, 'client'::text,
      'sponsor'::text, 'organizer'::text, 'moderator'::text, 'performer'::text,
      'student'::text
    ])
  );

ALTER TABLE public.organizations
  ADD COLUMN user_relationship_started_at timestamptz,
  ADD COLUMN user_relationship_ended_at timestamptz;

CREATE TABLE public.organization_relationship_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid NOT NULL,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    from_relationship text,
    to_relationship text NOT NULL,
    changed_at timestamptz NOT NULL DEFAULT now(),
    evidence text,
    confidence real,
    source_message_id text,
    created_at timestamptz DEFAULT now()
);

CREATE INDEX organization_relationship_history_org_idx
  ON public.organization_relationship_history (organization_id, changed_at DESC);

CREATE INDEX organization_relationship_history_user_idx
  ON public.organization_relationship_history (user_id);

COMMENT ON TABLE public.organization_relationship_history IS
  'Append-only log of user_relationship transitions on organizations (e.g. applicant -> interview_candidate -> employee -> former_employee). Never updated in place — see organizationRelationshipStateService.ts.';
