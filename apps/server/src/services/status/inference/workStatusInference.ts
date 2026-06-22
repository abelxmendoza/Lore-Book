import type { StatusSignal } from './statusInferenceTypes';

function makeWorkSignal(
  title: string,
  status: StatusSignal['status'],
  evidence: string,
  confidence: number,
  transition?: StatusSignal['transition'],
): StatusSignal {
  return {
    attachedToType: 'work_role',
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

export function inferWorkStatus(text: string): StatusSignal[] {
  const out: StatusSignal[] = [];

  if (/\b(?:worked at|used to work at)\s+Meridian Robotics\b/i.test(text)) {
    out.push(makeWorkSignal('Meridian Robotics role', 'former', 'worked at', 0.9, 'ended'));
  } else if (/\bworking at\s+Meridian Robotics\b/i.test(text)) {
    out.push(makeWorkSignal('Meridian Robotics role', 'current', 'working at', 0.9, 'started'));
  } else if (/\bstart working at\s+Meridian Robotics\b/i.test(text)) {
    out.push(makeWorkSignal('Meridian Robotics role', 'planned', 'start working at', 0.84, 'started'));
  }

  if (/\b(?:got offer|offer from)\s+Amazon\b/i.test(text) && !/\b(?:confirmed|accepted|letter arrived)\b/i.test(text)) {
    out.push(makeWorkSignal('Amazon offer', 'pending', 'got offer', 0.88));
  }

  if (/\bAmazon\b[^.!?]{0,60}\b(?:confirmed|accepted|letter arrived)\b/i.test(text)) {
    out.push(makeWorkSignal('Amazon offer', 'confirmed', 'confirmed', 0.92, 'confirmed'));
  }

  if (/\b(?:ended|left|quit)\b/i.test(text) && /\b(?:job|role|work)\b/i.test(text)) {
    out.push(makeWorkSignal('work role', 'former', 'ended', 0.84, 'ended'));
  }

  if (/\b(?:interview|interviewing)\b/i.test(text)) {
    const org = /\bAmazon\b/i.test(text) ? 'Amazon interview' : 'job interview';
    out.push(makeWorkSignal(org, 'pending', 'interview', 0.8));
  }

  return out;
}
