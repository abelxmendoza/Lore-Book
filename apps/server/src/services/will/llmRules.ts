/**
 * LLM Rules for Will Engine
 * Defines what LLM can and cannot do when processing will events
 */

export const WILL_LLM_RULES = {
  MAY_DO: [
    'Infer impulse from emotion/identity/past patterns',
    'Extract action from entry text',
    'Generate meaning reflection',
    'Summarize will events',
  ],

  MAY_NOT_DO: [
    'Fabricate will events',
    'Alter stored will events',
    'Create will events without evidence',
    'Override user corrections',
  ],

  GROUND_TRUTH: [
    'Will events are ONLY created when action != impulse',
    'All will events must reference source_entry_id',
    'Confidence must be computed, not assumed',
  ],
};

export const CONTINUITY_LLM_RULES = {
  MAY_DO: [
    'Summarize continuity profiles',
    'Generate reflections on drift',
    'Surface persistent patterns',
    'Challenge inconsistencies',
  ],

  MAY_NOT_DO: [
    'Fabricate continuity data',
    'Alter stored profiles',
    'Create values without evidence',
    'Override computed metrics',
  ],

  GROUND_TRUTH: [
    'Continuity profiles are computed from data, not generated',
    'All patterns must have evidence',
    'Drift flags are diagnostic, not corrective',
  ],
};
