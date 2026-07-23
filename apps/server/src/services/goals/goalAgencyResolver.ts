import type { AgencyLevel } from './goalTypes';

export function resolveGoalAgency(text: string): AgencyLevel {
  if (/\b(?:I|I'?m|I am|I will|I want|I need|my goal|we|us|our)\b/i.test(text)) {
    return /\b(?:we|us|our)\b/i.test(text) ? 'SHARED' : 'USER';
  }
  if (/\b[A-Z][a-z]+\s+(?:wants?|plans?|needs?|told me|asked me)\b/.test(text)) {
    return /\b(?:told me|asked me)\b/i.test(text) ? 'THIRD_PARTY' : 'THIRD_PARTY';
  }
  if (/\b(?:was|is|were)\s+(?:run|built|led|managed)\s+by\b/i.test(text)) return 'NONE';
  return 'UNKNOWN';
}
