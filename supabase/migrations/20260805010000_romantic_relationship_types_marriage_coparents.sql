-- Marriage / divorce / co-parent roles for Dating & Romance.
-- Lifecycle status stays separate (active/ended/…); these are relationship_type values.

ALTER TABLE public.romantic_relationships DROP CONSTRAINT IF EXISTS romantic_relationships_relationship_type_check;
ALTER TABLE public.romantic_relationships ADD CONSTRAINT romantic_relationships_relationship_type_check
  CHECK (relationship_type IN (
    'boyfriend', 'girlfriend', 'wife', 'husband', 'fiancé', 'fiancée',
    'lover', 'fuck_buddy', 'crush', 'obsession', 'infatuation', 'lust',
    'ex_boyfriend', 'ex_girlfriend', 'ex_wife', 'ex_husband', 'ex_lover',
    'divorced', 'co_parent', 'baby_mama', 'baby_daddy',
    'situationship', 'dating', 'talking', 'hooking_up', 'one_night_stand',
    'complicated', 'on_break', 'friends_with_benefits', 'in_love'
  ));
