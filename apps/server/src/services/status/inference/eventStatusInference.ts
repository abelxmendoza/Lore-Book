import type { StatusSignal } from './statusInferenceTypes';

function makeEventSignal(
  title: string,
  status: StatusSignal['status'],
  evidence: string,
  confidence: number,
  timeHint?: string,
  transition?: StatusSignal['transition'],
): StatusSignal {
  return {
    attachedToType: 'event',
    inferredTitle: title,
    status,
    transition,
    timeHint,
    evidencePhrases: [evidence],
    sourceMessageIds: [],
    confidence,
    inferredNotConfirmed: true,
    requiresReview: false,
  };
}

export function inferEventStatus(text: string): StatusSignal[] {
  const out: StatusSignal[] = [];
  const eventTitle = /\bSka Prom\b/i.test(text)
    ? 'Ska Prom'
    : /\bGothicumbia\b/i.test(text)
      ? 'Gothicumbia'
      : 'event';

  if (/\b(?:happened|went to|was at)\b/i.test(text) && /\b(?:prom|show|event)\b/i.test(text)) {
    out.push(makeEventSignal(eventTitle, 'completed', 'happened', 0.86, undefined, 'completed'));
  }

  if (/\b(?:didn'?t go|skipped|missed)\b/i.test(text)) {
    out.push(makeEventSignal(eventTitle, 'ended', "didn't go", 0.88, 'skipped', 'ended'));
  }

  if (/\b(?:supposed to|planned to)\b/i.test(text) && /\b(?:go|attend)\b/i.test(text)) {
    out.push(makeEventSignal(eventTitle, 'planned', 'supposed to', 0.8));
  }

  if (/\b(?:upcoming|next week|this weekend)\b/i.test(text) && /\b(?:event|show|prom)\b/i.test(text)) {
    out.push(makeEventSignal(eventTitle, 'planned', 'upcoming', 0.78));
  }

  if (/\b(?:cancelled|canceled)\b/i.test(text)) {
    out.push(makeEventSignal(eventTitle, 'ended', 'cancelled', 0.86, 'cancelled', 'ended'));
  }

  return out;
}

export function isSkippedEvent(signal: StatusSignal): boolean {
  return signal.timeHint === 'skipped' || signal.evidencePhrases.some((e) => /didn't go|skipped/i.test(e));
}
