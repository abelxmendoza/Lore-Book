import type { AttachedToType, StitchAttachmentTarget } from './timelineStitchingTypes';

const ATTACHMENT_PATTERNS: Array<{
  pattern: RegExp;
  type: AttachedToType;
  labelFrom: (m: RegExpExecArray) => string;
}> = [
  {
    pattern: /\b(detention)\s+yesterday\b/i,
    type: 'event',
    labelFrom: (m) => titleCase(m[1]),
  },
  {
    pattern: /\b(fight)\b[^.!?]*\b(?:yesterday|lunch\s+break)\b/i,
    type: 'event',
    labelFrom: (m) => titleCase(m[1]),
  },
  {
    pattern: /\b(haven'?t\s+seen|lost\s+contact|since)\b[^.!?]*\b(before\s+covid)\b/i,
    type: 'relationship_arc',
    labelFrom: () => 'Lost Contact',
  },
  {
    pattern: /\b(went\s+to\s+Japan)\s+last\s+summer\b/i,
    type: 'event',
    labelFrom: () => 'Japan Trip',
  },
  {
    pattern: /\b(practiced?\s+in\s+band)\s+every\s+Wednesday\b/i,
    type: 'event',
    labelFrom: () => 'Wednesday Band Practice',
  },
  {
    pattern: /\blearning\s+kickboxing\b[^.!?]*(?:since\s+\w+|for\s+\d+\s+months?)/i,
    type: 'skill',
    labelFrom: () => 'Kickboxing',
  },
  {
    pattern: /\b(Oscar)\b[^.!?]*(?:haven'?t\s+seen\s+since|before\s+covid)/i,
    type: 'relationship_arc',
    labelFrom: (m) => m[1].trim(),
  },
  {
    pattern: /\b(Bryan)\b[^.!?]*\b(?:best\s+friend|middle\s+school)\b/i,
    type: 'relationship',
    labelFrom: (m) => m[1].trim(),
  },
  {
    pattern: /\b(Whittier\s+Christian\s+Middle\s+School)\b/i,
    type: 'school_period',
    labelFrom: (m) => m[1].trim(),
  },
  {
    pattern: /\b(Vanguard\s+Robotics)\b/i,
    type: 'work_period',
    labelFrom: (m) => m[1].trim(),
  },
  {
    pattern: /\b(Amazon)\b[^.!?]*\b(?:started|onboard|hired|work)\b/i,
    type: 'work_period',
    labelFrom: (m) => `${m[1]} Era`,
  },
];

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function findAttachmentTargets(text: string): StitchAttachmentTarget[] {
  const out: StitchAttachmentTarget[] = [];
  const seen = new Set<string>();

  for (const { pattern, type, labelFrom } of ATTACHMENT_PATTERNS) {
    const match = pattern.exec(text);
    if (!match) continue;
    const label = labelFrom(match);
    const key = `${type}:${label.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      attachedToType: type,
      attachedToLabel: label,
      confidence: 0.88,
    });
  }

  return out;
}

export function pickNearestAttachment(
  phrase: string,
  text: string,
  candidates: StitchAttachmentTarget[],
): StitchAttachmentTarget | undefined {
  if (candidates.length === 0) return findAttachmentTargets(text)[0];

  let best: StitchAttachmentTarget | undefined;
  let bestDistance = Infinity;

  for (const candidate of candidates) {
    const idx = text.toLowerCase().indexOf(candidate.attachedToLabel.toLowerCase());
    const phraseIdx = text.toLowerCase().indexOf(phrase.toLowerCase());
    if (idx < 0) continue;
    const distance = Math.abs(idx - phraseIdx);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }

  return best ?? candidates[0];
}
