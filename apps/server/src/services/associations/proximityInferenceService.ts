/**
 * Proximity Inference (the DEFAULT, weakest layer) — when two entities are
 * merely co-mentioned ("Leslie and Tio", "I saw Daisy at Club Nova"), the only
 * thing we can honestly assert is a *weak* `associated_with` at MENTION
 * confidence (0.2). This is deliberately the floor: co-mention is NOT
 * membership, NOT a family, NOT a friend group.
 *
 * This is the service that stops LoreBook from inventing "Leslie & Tio Family"
 * or "Daisy + Juan Group" out of a single sentence. Those bad groups only ever
 * formed because co-mention was treated as membership. Here it is treated as
 * the weakest possible tie, which the promotion service will (correctly) refuse
 * to turn into a group without far more evidence.
 */
import { classifyPlace } from '../ontology/placeIntelligence';
import { scoreKinshipInContext } from '../ontology/lexicalIntelligence';
import { associationEvidenceService } from './associationEvidenceService';
import {
  MENTION_CONFIDENCE,
  SELF_SUBJECT,
  entityRef,
  type AssociationObservation,
  type EntityRef,
  type InferenceContext,
} from './associationTypes';

export interface ProximityContext extends InferenceContext {
  /**
   * Optionally supply already-resolved co-present entities (people/venues). When
   * omitted, a conservative proper-noun scan is used.
   */
  coPresent?: EntityRef[];
}

const STOPWORDS = new Set([
  'I', 'A', 'An', 'The', 'And', 'But', 'Or', 'So', 'We', 'My', 'Our', 'They',
  'He', 'She', 'It', 'You', 'Me', 'Him', 'Her', 'Them', 'This', 'That',
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
  'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December',
]);

/** Conservative proper-noun extraction; capitalized tokens not at sentence start filler. */
function extractProperNouns(text: string): string[] {
  const found = new Set<string>();
  const re = /\b([A-Z][a-zà-ÿ'’]+(?:\s+[A-Z][a-zà-ÿ'’]+)?)\b/g;
  for (const m of text.matchAll(re)) {
    const name = m[1].trim();
    if (STOPWORDS.has(name)) continue;
    if (name.split(/\s+/).every((w) => STOPWORDS.has(w))) continue;
    found.add(name);
  }
  return [...found];
}

function classifyRef(name: string, text: string): EntityRef {
  const place = classifyPlace(name, text);
  if (place.rootType === 'EVENT' || place.category === 'EVENT_LOCATION') {
    return entityRef(name, 'event');
  }
  if (['VENUE', 'BUSINESS', 'CITY', 'REGION', 'LANDMARK', 'HOUSEHOLD', 'PROPERTY', 'ROOM'].includes(place.category)) {
    return entityRef(name, place.category === 'VENUE' || place.category === 'BUSINESS' ? 'venue' : 'place');
  }
  return entityRef(name, 'person');
}

export const proximityInferenceService = {
  rule: 'proximity',

  detect(ctx: ProximityContext): AssociationObservation[] {
    const subject = ctx.subject ?? SELF_SUBJECT;
    const text = ctx.text ?? '';

    const refs = ctx.coPresent ?? extractProperNouns(text).map((n) => classifyRef(n, text));
    const out: AssociationObservation[] = [];

    const makeEvidence = () =>
      associationEvidenceService.build({
        text,
        quote: text,
        sourceMessageId: ctx.sourceMessageId,
        timestamp: ctx.timestamp,
        rulesFired: [`${this.rule}:associated_with`],
        confidence: MENTION_CONFIDENCE,
      });

    // subject ↔ each co-present entity: weakest possible tie.
    for (const ref of refs) {
      if (ref.id === subject.id) continue;
      out.push({
        source: subject,
        target: ref,
        associationType: 'associated_with',
        evidence: makeEvidence(),
      });
    }

    // person ↔ person co-mention: still only the floor tie. Crucially this does
    // NOT emit related_to / member_of, so kin-sounding co-mentions like
    // "Leslie and Tio" never become a family group here.
    const people = refs.filter((r) => r.kind === 'person');
    for (let i = 0; i < people.length; i += 1) {
      for (let j = i + 1; j < people.length; j += 1) {
        out.push({
          source: people[i],
          target: people[j],
          associationType: 'associated_with',
          evidence: makeEvidence(),
        });
      }
    }

    return out;
  },

  /** Helper exposed for callers/tests: is a name a kinship *title* (Tio, Abuela)?
   *  Used to ensure co-mention of a kin title alone is not over-promoted. */
  isKinTitle(name: string, context = ''): boolean {
    return scoreKinshipInContext(name, context).isKin;
  },
};
