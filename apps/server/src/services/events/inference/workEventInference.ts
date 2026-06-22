import { normalizeNameKey } from '../../../utils/nameNormalization';
import type { EventCandidate } from './eventInferenceTypes';
import { buildEventContext } from './eventProvenanceService';

const WORK_INTERVIEW_RE =
  /\b((?:Amazon|Google|Meta|Apple|Microsoft|Ring|Kelly|Vanguard(?:\s+Robotics)?)\s+(?:Interview|Onboarding(?:\s+Call)?|Deployment))\b/gi;

const ONBOARDING_CALL_RE =
  /\b([A-Z][A-Za-z]+)\s+onboarding\s+call\b/gi;

export function inferWorkEvents(text: string): EventCandidate[] {
  const out: EventCandidate[] = [];
  const seen = new Set<string>();

  let match: RegExpExecArray | null;
  const workRe = new RegExp(WORK_INTERVIEW_RE.source, 'gi');
  while ((match = workRe.exec(text)) !== null) {
    const displayName = match[1].trim();
    const key = normalizeNameKey(displayName);
    if (seen.has(key)) continue;
    seen.add(key);

    const org = displayName.split(/\s+(?:Interview|Onboarding|Deployment)/i)[0]?.trim();
    const eventType: EventCandidate['eventType'] = /interview/i.test(displayName)
      ? 'interview'
      : 'work_event';

    out.push({
      displayName,
      eventType,
      titleParts: { organization: org, action: eventType },
      context: buildEventContext(text, displayName, {
        organization: org ? { displayName: org } : undefined,
      }),
      evidencePhrases: [match[0]],
      sourceMessageIds: [],
      confidence: 0.9,
      needsResolution: false,
      requiresReview: false,
      promotionStatus: 'suggested_event',
    });
  }

  const onboardRe = new RegExp(ONBOARDING_CALL_RE.source, 'gi');
  while ((match = onboardRe.exec(text)) !== null) {
    const org = match[1].trim();
    const displayName = `${org} Onboarding Call`;
    const key = normalizeNameKey(displayName);
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      displayName,
      eventType: 'work_event',
      titleParts: { organization: org, action: 'onboarding' },
      context: buildEventContext(text, displayName, {
        organization: { displayName: org },
      }),
      evidencePhrases: [match[0]],
      sourceMessageIds: [],
      confidence: 0.86,
      needsResolution: false,
      requiresReview: false,
      promotionStatus: 'suggested_event',
    });
  }

  return out;
}
