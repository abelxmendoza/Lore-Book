/**
 * Affiliation Inference (Rule 4) — "I hang out in the ska scene", "I'm part of
 * the goth scene", "I'm into the LA punk community" express identification with
 * a SCENE/movement, which is `affiliated_with` — stronger than a single visit
 * but explicitly NOT `member_of`. A scene has no roster to belong to.
 */
import { associationEvidenceService } from './associationEvidenceService';
import {
  BASE_CONFIDENCE,
  SELF_SUBJECT,
  entityRef,
  type AssociationObservation,
  type InferenceContext,
} from './associationTypes';

// "the ska scene", "LA goth scene", "punk community", "skinhead movement"
const SCENE_RE =
  /\b(?:hang(?:ing)?\s+out\s+in|part of|into|involved in|run\s+in|roll\s+with|down with|repping)\s+(?:the\s+)?([a-z0-9][\w'’\s-]*?\b(?:scene|community|crew|circle|movement|subculture|underground))\b/gi;

// Also catch a bare "the X scene" mention as a weaker affiliation signal.
const BARE_SCENE_RE = /\b(?:the\s+)?([a-z0-9][\w'’\s-]*?\b(?:ska|goth|punk|metal|hardcore|hip\s*hop|rave|skater?)\s+scene)\b/gi;

function clean(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').replace(/^the\s+/i, '').trim();
}

export const affiliationInferenceService = {
  rule: 'affiliation',

  detect(ctx: InferenceContext): AssociationObservation[] {
    const subject = ctx.subject ?? SELF_SUBJECT;
    const text = ctx.text ?? '';
    const out: AssociationObservation[] = [];
    const seen = new Set<string>();

    const push = (name: string, quote: string) => {
      const key = name.toLowerCase();
      if (!name || name.length < 3 || seen.has(key)) return;
      seen.add(key);
      out.push({
        source: subject,
        target: entityRef(name, 'scene'),
        associationType: 'affiliated_with',
        evidence: associationEvidenceService.build({
          text,
          quote,
          sourceMessageId: ctx.sourceMessageId,
          timestamp: ctx.timestamp,
          rulesFired: [`${this.rule}:affiliated_with`],
          confidence: BASE_CONFIDENCE.affiliated_with,
        }),
      });
    };

    for (const m of text.matchAll(SCENE_RE)) push(clean(m[1] ?? ''), m[0]);
    for (const m of text.matchAll(BARE_SCENE_RE)) push(clean(m[1] ?? ''), m[0]);

    return out;
  },
};
