/**
 * Participation Inference (Rule 3) — "I played with the band", "I performed
 * with …", "I sat in on …" become `participated_in` / `performed_with`, NOT
 * membership. A musician who plays one gig with a band has participated; they
 * are only promoted toward `performed_with`/`associated_with` once the same
 * activity recurs (handled by the promotion service).
 */
import { associationEvidenceService } from './associationEvidenceService';
import {
  BASE_CONFIDENCE,
  SELF_SUBJECT,
  entityRef,
  type AssociationObservation,
  type AssociationType,
  type InferenceContext,
} from './associationTypes';

interface ParticipationPattern {
  re: RegExp;
  type: AssociationType;
  /** band/team/scene activity word implies an "<X> Event" target. */
  eventize?: boolean;
}

const PATTERNS: ParticipationPattern[] = [
  // performed/played WITH a band or group
  { re: /\b(?:performed|played|jammed|sang|gigged|sat in)\s+with\s+(?:the\s+)?([^.,;!?\n]+)/gi, type: 'performed_with', eventize: true },
  // participated/took part in an activity or event
  { re: /\b(?:participated in|took part in|joined in on|sat in on|competed in)\s+(?:the\s+|a\s+|an\s+)?([^.,;!?\n]+)/gi, type: 'participated_in', eventize: true },
  // "I played a show/set/gig" — participated in an event
  { re: /\b(?:played|did)\s+(?:a|the|my|our)\s+(show|set|gig|match|game|tournament|practice)\b/gi, type: 'participated_in', eventize: false },
];

const CLAUSE_STOP = /\b(?:and|but|because|since|so|then|at|where|when)\b/i;

function cleanName(raw: string): string {
  let t = raw.trim();
  const m = CLAUSE_STOP.exec(t);
  if (m && m.index > 0) t = t.slice(0, m.index).trim();
  return t.replace(/[\s,]+$/g, '').trim();
}

export const participationInferenceService = {
  rule: 'participation',

  detect(ctx: InferenceContext): AssociationObservation[] {
    const subject = ctx.subject ?? SELF_SUBJECT;
    const text = ctx.text ?? '';
    const out: AssociationObservation[] = [];

    for (const pat of PATTERNS) {
      for (const match of text.matchAll(pat.re)) {
        const name = cleanName(match[1] ?? '');
        if (name.length < 2) continue;

        // "played with the band" → participation in a "band" event, not the band group itself.
        const targetName = pat.eventize ? `${name} (event)` : name;
        const confidence = BASE_CONFIDENCE[pat.type];
        out.push({
          source: subject,
          target: entityRef(targetName, 'event'),
          associationType: pat.type,
          evidence: associationEvidenceService.build({
            text,
            quote: match[0],
            sourceMessageId: ctx.sourceMessageId,
            timestamp: ctx.timestamp,
            rulesFired: [`${this.rule}:${pat.type}`],
            confidence,
          }),
        });
      }
    }

    return out;
  },
};
