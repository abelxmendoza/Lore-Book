/**
 * Association Inference Service — the orchestrator for the Association Graph
 * layer. Given an utterance, it produces association OBSERVATIONS (never groups)
 * by running every rule service, folds them into an AssociationGraph, then asks
 * the promotion service whether any accumulated evidence has earned a stronger
 * tie or a group.
 *
 * It owns the relational-verb rules that are person↔person or explicit by
 * nature:
 *
 *   Rule 5  "I worked with Gary and Jeff"      → worked_with Gary, worked_with Jeff
 *   Rule 6  "Bryan and I went to Whittier …"   → studied_with Bryan (+ attended_school)
 *   Rule 7  "I live with Abuela"               → lived_with Abuela
 *   Rule 10 "I work at Vanguard Robotics"     → member_of Vanguard Robotics (EXPLICIT)
 *   Rule 11 "our Coding Club"                  → member_of Coding Club        (EXPLICIT)
 *
 * Everything weaker (attended/visited/participated/affiliated/proximity) is
 * delegated to the dedicated rule services. Membership is only ever asserted
 * here when the statement itself is explicit; otherwise it must be earned via
 * the promotion service.
 */
import { classifyGroup } from '../ontology/groupIntelligence';
import { associationEvidenceService } from './associationEvidenceService';
import { attendanceInferenceService } from './attendanceInferenceService';
import { participationInferenceService } from './participationInferenceService';
import { affiliationInferenceService } from './affiliationInferenceService';
import { proximityInferenceService, type ProximityContext } from './proximityInferenceService';
import { associationPromotionService, type GroupCandidate, type PromotionDecision } from './associationPromotionService';
import { AssociationGraph, associationGraphService } from './associationGraphService';
import { semanticAssociationAdapter } from './semanticAssociationAdapter';
import type { SemanticAnalysis } from '../lorebook/semantic/semanticAnalysisTypes';
import {
  BASE_CONFIDENCE,
  SELF_SUBJECT,
  edgeKey,
  entityRef,
  type AssociationObservation,
  type AssociationType,
  type EntityRef,
  type InferenceContext,
} from './associationTypes';

const titleCase = (s: string) =>
  s.trim().replace(/\s+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const PERSON_TOKEN = /^[A-Z][a-zà-ÿ'’]+(?:\s+[A-Z][a-zà-ÿ'’]+)?$/;

/** Split "Gary and Jeff", "Gary, Jeff and Bob" into clean person names. */
function splitPeople(raw: string): string[] {
  return raw
    .split(/\s*,\s*|\s+and\s+|\s*&\s*/i)
    .map((p) => p.trim().replace(/[.,;!?]+$/g, '').trim())
    .filter((p) => PERSON_TOKEN.test(p));
}

interface RelationalPattern {
  re: RegExp;
  type: AssociationType;
  kind: EntityRef['kind'];
  multi?: boolean; // capture group may be a list of people
}

const RELATIONAL: RelationalPattern[] = [
  // Rule 5 — worked WITH colleagues (note: "work at/for" is handled separately as membership)
  { re: /\bwork(?:ed|s|ing)?\s+with\s+([^.;!?\n]+)/gi, type: 'worked_with', kind: 'person', multi: true },
  // Rule 6 — "X and I went to <school>" / "studied with X" / "went to school with X"
  { re: /\b([A-Z][a-zà-ÿ'’]+(?:\s+[A-Z][a-zà-ÿ'’]+)?)\s+and\s+I\s+(?:went to|go to|attended|studied at)\s+[A-Z]/g, type: 'studied_with', kind: 'person' },
  { re: /\b(?:studied|graduated)\s+with\s+([^.;!?\n]+)/gi, type: 'studied_with', kind: 'person', multi: true },
  { re: /\bwent to school\s+with\s+([^.;!?\n]+)/gi, type: 'studied_with', kind: 'person', multi: true },
  // Rule 7 — household co-residence
  { re: /\b(?:live|lived|living|stay(?:ed)?)\s+with\s+([^.;!?\n]+)/gi, type: 'lived_with', kind: 'person', multi: true },
  // light related_to: "my brother Marcus"
  { re: /\bmy\s+(?:brother|sister|mom|mother|dad|father|cousin|uncle|aunt|grandma|grandpa|abuela|abuelo|t[íi]o|t[íi]a)\s+([A-Z][a-zà-ÿ'’]+)/gi, type: 'related_to', kind: 'person' },
];

// Rule 10 — explicit employment → member_of
const EMPLOYMENT_RE = /\bwork(?:ed|s|ing)?\s+(?:at|for)\s+(?:the\s+)?([A-Z][\w&'’.\s-]+?)(?=[.,;!?\n]|\s+(?:as|and|with|in|where|since|for|because)\b|$)/g;
// Rule 11 — explicit ownership/membership of a club/team/band
const CLUB_RE = /\b(?:our|my)\s+([\w'’\s-]*?\b(?:club|team|band|crew|society|guild|collective|order|league|squad|chapter))\b/gi;
const JOINED_RE = /\bjoined\s+(?:the\s+)?([A-Z][\w&'’.\s-]+?\b(?:club|team|band|company|crew|society|guild|league|union|chapter))\b/gi;
// ownership / organizing of a group/venue
const OWN_RE = /\bI\s+own\s+(?:the\s+|a\s+|my\s+)?([A-Z][\w&'’.\s-]+)/g;
const ORGANIZE_RE = /\bI\s+(?:run|founded|started|organize|lead|manage)\s+(?:the\s+|a\s+|my\s+)?([A-Z][\w&'’.\s-]+)/g;

function clampName(raw: string): string {
  return titleCase(raw.replace(/[.,;!?]+$/g, '').trim());
}

export interface AssociationInferenceResult {
  observations: AssociationObservation[];
  rulesFired: string[];
}

export interface IngestResult extends AssociationInferenceResult {
  promotions: PromotionDecision[];
  groups: GroupCandidate[];
}

export const associationInferenceService = {
  /**
   * Produce association observations from one utterance WITHOUT mutating any
   * graph. This is the pure, testable core: the same text always yields the same
   * observations, and never yields a group.
   */
  infer(ctx: ProximityContext): AssociationInferenceResult {
    const subject = ctx.subject ?? SELF_SUBJECT;
    const text = ctx.text ?? '';
    const baseCtx: InferenceContext = { ...ctx, subject };

    const observations: AssociationObservation[] = [
      ...attendanceInferenceService.detect(baseCtx),
      ...participationInferenceService.detect(baseCtx),
      ...affiliationInferenceService.detect(baseCtx),
    ];

    // --- Relational verbs (person ↔ person / explicit) ---
    for (const pat of RELATIONAL) {
      for (const m of text.matchAll(pat.re)) {
        const captured = m[1] ?? '';
        const names = pat.multi ? splitPeople(captured) : [captured].filter((n) => PERSON_TOKEN.test(n.trim()));
        for (const name of names) {
          observations.push({
            source: subject,
            target: entityRef(clampName(name), pat.kind),
            associationType: pat.type,
            evidence: associationEvidenceService.build({
              text,
              quote: m[0],
              sourceMessageId: ctx.sourceMessageId,
              timestamp: ctx.timestamp,
              rulesFired: [`relational:${pat.type}`],
              confidence: BASE_CONFIDENCE[pat.type],
            }),
          });
        }
      }
    }

    // --- Explicit membership / ownership (the only place member_of is asserted) ---
    const pushExplicit = (name: string, type: AssociationType, kind: EntityRef['kind'], quote: string, rule: string) => {
      const clean = clampName(name);
      if (clean.length < 2) return;
      observations.push({
        source: subject,
        target: entityRef(clean, kind),
        associationType: type,
        explicit: true,
        evidence: associationEvidenceService.build({
          text,
          quote,
          sourceMessageId: ctx.sourceMessageId,
          timestamp: ctx.timestamp,
          rulesFired: [rule],
          confidence: BASE_CONFIDENCE[type],
        }),
      });
    };

    for (const m of text.matchAll(EMPLOYMENT_RE)) {
      const name = clampName(m[1] ?? '');
      const g = classifyGroup(name, text);
      // Employment is explicit membership in an organization.
      pushExplicit(name, 'member_of', 'organization', m[0], `explicit-membership:employment:${g.category}`);
    }
    for (const m of text.matchAll(CLUB_RE)) {
      pushExplicit(m[1] ?? '', 'member_of', 'group', m[0], 'explicit-membership:club-possessive');
    }
    for (const m of text.matchAll(JOINED_RE)) {
      pushExplicit(m[1] ?? '', 'member_of', 'group', m[0], 'explicit-membership:joined');
    }
    for (const m of text.matchAll(OWN_RE)) {
      pushExplicit(m[1] ?? '', 'owns', 'group', m[0], 'explicit-ownership');
    }
    for (const m of text.matchAll(ORGANIZE_RE)) {
      pushExplicit(m[1] ?? '', 'organizes', 'group', m[0], 'explicit-organizes');
    }

    // --- Proximity / co-mention: the weakest default tie (runs last) ---
    // Proximity is only a FALLBACK. If a stronger rule already produced a tie to
    // an entity, the weak co-mention edge to that same entity is just noise, so
    // we drop it. Genuinely-unconnected co-mentions (e.g. "Leslie and Tio") are
    // the only ones that survive as weak `associated_with`.
    const covered = new Set(observations.map((o) => o.target.id));
    for (const prox of proximityInferenceService.detect(ctx)) {
      if (covered.has(prox.target.id)) continue;
      observations.push(prox);
    }

    const rulesFired = Array.from(new Set(observations.flatMap((o) => o.evidence.rulesFired)));
    return { observations: dedupeObservations(observations), rulesFired };
  },

  /**
   * Preferred entry point: derive associations from a structured
   * SemanticAnalysis. The analyzer's resolved relationships are the PRIMARY
   * source (canonical endpoints, robust extraction); the raw-text regex rules
   * run as a FALLBACK for predicate associations the analyzer doesn't yet emit
   * as edges (attended/visited/worked_with…), with their detected entities
   * upgraded to canonical identity via the analyzer's resolution table.
   */
  inferFromAnalysis(analysis: SemanticAnalysis, subject: EntityRef = SELF_SUBJECT): AssociationInferenceResult {
    const semantic = semanticAssociationAdapter.fromAnalysis(analysis);
    const resolve = semanticAssociationAdapter.buildResolver(analysis);

    // Regex fallback over the same text, with entities resolved to canon.
    const fallbackRaw = this.infer({
      text: analysis.text,
      subject,
      sourceMessageId: analysis.messageId,
    }).observations;
    const fallback = fallbackRaw.map((o) => resolveObservation(o, resolve));

    // Semantic edges win: a fallback observation is dropped when a semantic
    // observation already covers the same (source, type, target).
    const taken = new Set(semantic.map((o) => edgeKey(o.source.id, o.target.id, o.associationType)));
    const merged = [...semantic];
    for (const o of fallback) {
      const key = edgeKey(o.source.id, o.target.id, o.associationType);
      if (taken.has(key)) continue;
      taken.add(key);
      merged.push(o);
    }

    const observations = dedupeObservations(merged);
    const rulesFired = Array.from(new Set(observations.flatMap((o) => o.evidence.rulesFired)));
    return { observations, rulesFired };
  },

  /**
   * Full pipeline: infer → fold into a graph → run promotion. Returns the
   * observations plus any promotions and group candidates the accumulated
   * evidence now supports. Uses the shared default graph unless one is passed.
   */
  ingest(ctx: ProximityContext, graph: AssociationGraph = associationGraphService): IngestResult {
    const { observations, rulesFired } = this.infer(ctx);
    return this.fold(observations, rulesFired, (ctx.subject ?? SELF_SUBJECT).id, graph);
  },

  /** Like `ingest`, but sourced from a structured SemanticAnalysis. */
  ingestFromAnalysis(
    analysis: SemanticAnalysis,
    subject: EntityRef = SELF_SUBJECT,
    graph: AssociationGraph = associationGraphService,
  ): IngestResult {
    const { observations, rulesFired } = this.inferFromAnalysis(analysis, subject);
    return this.fold(observations, rulesFired, subject.id, graph);
  },

  /** Shared tail: fold observations into a graph and run promotion. */
  fold(
    observations: AssociationObservation[],
    rulesFired: string[],
    subjectId: string,
    graph: AssociationGraph,
  ): IngestResult {
    graph.observeAll(observations);
    const promotions = associationPromotionService.promoteEdges(graph);
    const groups = associationPromotionService.evaluateGroupFormation(graph, subjectId);
    return { observations, rulesFired, promotions, groups };
  },
};

/** Remap an observation's source/target through a canonical resolver. */
function resolveObservation(
  obs: AssociationObservation,
  resolve: (name: string) => EntityRef | undefined,
): AssociationObservation {
  const source = resolve(obs.source.name) ?? obs.source;
  const target = resolve(obs.target.name) ?? obs.target;
  if (source === obs.source && target === obs.target) return obs;
  return { ...obs, source, target };
}

/** Drop exact-duplicate observations (same source/target/type/quote). */
function dedupeObservations(obs: AssociationObservation[]): AssociationObservation[] {
  const seen = new Set<string>();
  const out: AssociationObservation[] = [];
  for (const o of obs) {
    const key = `${o.source.id}|${o.associationType}|${o.target.id}|${o.evidence.quote}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(o);
  }
  return out;
}
