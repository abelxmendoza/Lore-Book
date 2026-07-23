import { resolveTemporalWindow } from '../../utils/temporalResolver';
import type { TemporalGoalState } from './goalTypes';

export function resolveGoalTemporalState(text: string, now = new Date()): TemporalGoalState {
  const lower = text.toLowerCase();
  if (/\b(?:finished|completed|already did|got done|ran yesterday|went to|used to)\b/.test(lower)) {
    return 'PAST_COMPLETED';
  }
  if (/\b(?:at the time|back then|was going to|wanted to)\b/.test(lower) && !/\bstill\b/.test(lower)) {
    return 'PAST_UNRESOLVED';
  }
  if (/\b(?:still|currently|keep|continue|working on|in progress)\b/.test(lower)) return 'ONGOING';
  if (/\b(?:going to|plan(?:ning)? to|will|today|tomorrow|next week|need to|have to)\b/.test(lower)) {
    return 'FUTURE_PLANNED';
  }
  if (/\b(?:maybe|might|could|someday|if I)\b/i.test(text)) return 'FUTURE_POSSIBLE';
  if (/\b(?:want to|trying to|my goal|I should|every day|every week|per week)\b/i.test(text)) {
    return 'PRESENT_ACTIVE';
  }
  const window = resolveTemporalWindow(text, now);
  if (window?.end && window.end.getTime() < now.getTime() - 86_400_000) return 'PAST_COMPLETED';
  return 'TIME_UNKNOWN';
}
