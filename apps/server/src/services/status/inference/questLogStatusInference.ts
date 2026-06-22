import type { StatusSignal } from './statusInferenceTypes';

function makeQuestSignal(
  title: string,
  status: StatusSignal['status'],
  evidence: string,
  confidence: number,
  transition?: StatusSignal['transition'],
): StatusSignal {
  return {
    attachedToType: 'quest_log_item',
    inferredTitle: title,
    status,
    transition,
    evidencePhrases: [evidence],
    sourceMessageIds: [],
    confidence,
    inferredNotConfirmed: true,
    requiresReview: false,
  };
}

export function inferQuestLogStatus(text: string): StatusSignal[] {
  const out: StatusSignal[] = [];

  if (/\bwaiting for\b/i.test(text)) {
    out.push(makeQuestSignal('quest item', 'pending', 'waiting for', 0.82));
  }
  if (/\b(?:finished|done)\b/i.test(text)) {
    out.push(makeQuestSignal('quest item', 'completed', 'finished', 0.88, 'completed'));
  }
  if (/\bneed to\b/i.test(text)) {
    out.push(makeQuestSignal('quest item', 'planned', 'need to', 0.8));
  }
  if (/\bstuck on\b/i.test(text)) {
    out.push(makeQuestSignal('quest item', 'blocked', 'stuck on', 0.84, 'blocked'));
  }
  if (/\b(?:next up|next:|next step)\b/i.test(text)) {
    out.push(makeQuestSignal('quest item', 'planned', 'next', 0.78));
  }

  return out;
}
