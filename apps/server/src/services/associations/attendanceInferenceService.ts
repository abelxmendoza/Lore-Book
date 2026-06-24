/**
 * Attendance Inference (Rules 1, 2, 6) — turns "I went to X" into the WEAKEST
 * defensible association, never membership:
 *
 *   "I went to Ska Prom"      → attended  Ska Prom        (event)
 *   "I went to Club Nova"    → visited   Club Nova      (venue/place)
 *   "I went to Whittier Christian" → attended_school Whittier Christian
 *
 * It does NOT emit `member_of`. A single visit/attendance is exactly one
 * observation; promotion to `associated_with` only happens later, once the
 * graph has seen the same target recur (see associationPromotionService).
 */
import { classifyPlace } from '../ontology/placeIntelligence';
import { associationEvidenceService } from './associationEvidenceService';
import {
  BASE_CONFIDENCE,
  SELF_SUBJECT,
  entityRef,
  type AssociationObservation,
  type AssociationTargetKind,
  type InferenceContext,
} from './associationTypes';

const GO_VERBS = '(?:went to|going to|gone to|attended|hit up|hit|was at|were at|checked out|stopped by|swung by)';
const ATTEND_RE = new RegExp(`\\b${GO_VERBS}\\s+(?:the\\s+|a\\s+|an\\s+)?([^.,;!?\\n]+)`, 'gi');

const CLAUSE_STOP = /\b(?:and|but|with|because|since|so|then|where|when|to\b)\b/i;

const SCHOOL_RE =
  /\b(school|high\s*school|elementary|middle\s*school|academy|college|university|institute|prep|christian|catholic|lutheran)\b/i;

// Event words classifyPlace() doesn't cover (its EVENT_KW omits proms/dances/etc.).
const EVENT_AUGMENT_RE =
  /\b(prom|dance|homecoming|formal|fest|showcase|fundraiser|mixer|social|rave|open\s*mic|recital|fair)\b/i;

function cleanTarget(raw: string): string {
  let t = raw.trim();
  // Cut at the first subordinate clause boundary ("Club Nova and ...", "the show with ...").
  const m = CLAUSE_STOP.exec(t);
  if (m && m.index > 0) t = t.slice(0, m.index).trim();
  // Strip trailing temporal/filler words.
  t = t
    .replace(/\b(last|this|next)\s+(night|week|weekend|month|year|friday|saturday|sunday|monday|tuesday|wednesday|thursday)\b.*$/i, '')
    .replace(/\b(yesterday|today|tonight|earlier|recently|again)\b.*$/i, '')
    .replace(/[\s,]+$/g, '')
    .trim();
  return t;
}

function looksLikeSchool(name: string, context: string): boolean {
  return SCHOOL_RE.test(name) || /\b(school|class|grade|campus|semester)\b/i.test(context);
}

export const attendanceInferenceService = {
  rule: 'attendance',

  detect(ctx: InferenceContext): AssociationObservation[] {
    const subject = ctx.subject ?? SELF_SUBJECT;
    const text = ctx.text ?? '';
    const out: AssociationObservation[] = [];

    for (const match of text.matchAll(ATTEND_RE)) {
      const name = cleanTarget(match[1] ?? '');
      if (name.length < 2) continue;
      if (/^(?:the\s+)?(?:gym|bathroom|store|bed|sleep|work|school)$/i.test(name)) {
        // Generic destinations carry no associable identity on their own.
        if (!looksLikeSchool(name, text)) continue;
      }

      let associationType: AssociationObservation['associationType'];
      let kind: AssociationTargetKind;

      if (looksLikeSchool(name, text)) {
        associationType = 'attended_school';
        kind = 'school';
      } else {
        const place = classifyPlace(name, text);
        const isEvent =
          place.rootType === 'EVENT' || place.category === 'EVENT_LOCATION' || EVENT_AUGMENT_RE.test(name);
        associationType = isEvent ? 'attended' : 'visited';
        kind = isEvent ? 'event' : 'venue';
      }

      const confidence = BASE_CONFIDENCE[associationType];
      out.push({
        source: subject,
        target: entityRef(name, kind),
        associationType,
        evidence: associationEvidenceService.build({
          text,
          quote: match[0],
          sourceMessageId: ctx.sourceMessageId,
          timestamp: ctx.timestamp,
          rulesFired: [`${this.rule}:${associationType}`],
          confidence,
        }),
      });
    }

    return out;
  },
};
