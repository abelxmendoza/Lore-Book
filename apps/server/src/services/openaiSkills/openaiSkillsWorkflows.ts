/** OpenAI Agent Skills — workflow keys and skill reference wiring. */

export type OpenAiSkillsWorkflow =
  | 'character_card_audit'
  | 'rescan_ops'
  | 'lorebook_ops';

export type OpenAiSkillReference = {
  type: 'skill_reference';
  skill_id: string;
  version?: number | 'latest';
};

export const WORKFLOW_SKILL_KEYS: Record<OpenAiSkillsWorkflow, Array<'characterCardAudit' | 'rescanOps'>> = {
  character_card_audit: ['characterCardAudit'],
  rescan_ops: ['rescanOps'],
  lorebook_ops: ['characterCardAudit', 'rescanOps'],
};

export const WORKFLOW_LABELS: Record<OpenAiSkillsWorkflow, string> = {
  character_card_audit: 'Character card audit analysis',
  rescan_ops: 'Conversation rescan operations analysis',
  lorebook_ops: 'Full LoreBook card audit + rescan analysis',
};
