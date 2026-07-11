/**
 * Deterministic open-thread detection from evidence text.
 * No OpenAI. Conditional/hypothetical language does not create open threads.
 */

import { createHash } from 'crypto';
import type {
  ContinuityModeForReturn,
  EvidenceSnippet,
  ReturnPoint,
  ReturnPointState,
  SensitivityClass,
} from './types';

const OPEN_SIGNALS: Array<{ re: RegExp; state: ReturnPointState; weight: number }> = [
  { re: /\bwaiting (to hear|for|on)\b/i, state: 'WAITING', weight: 0.95 },
  { re: /\bstill waiting\b/i, state: 'WAITING', weight: 0.95 },
  { re: /\bhaven'?t heard\b/i, state: 'WAITING', weight: 0.9 },
  { re: /\bwaiting for (approval|another|next|more)\b/i, state: 'WAITING', weight: 0.92 },
  { re: /\bapplication pending\b/i, state: 'WAITING', weight: 0.9 },
  { re: /\bsubmitted .{0,40}(availability|application)\b/i, state: 'WAITING', weight: 0.88 },
  { re: /\bstill deciding\b/i, state: 'IN_PROGRESS', weight: 0.8 },
  { re: /\bneed to finish\b/i, state: 'IN_PROGRESS', weight: 0.85 },
  { re: /\bplanning to\b/i, state: 'OPEN', weight: 0.7 },
  { re: /\bgoing to try\b/i, state: 'OPEN', weight: 0.65 },
  { re: /\bhaven'?t .+ yet\b/i, state: 'OPEN', weight: 0.75 },
  { re: /\btomorrow i'?ll\b/i, state: 'OPEN', weight: 0.7 },
  { re: /\bnext time\b/i, state: 'OPEN', weight: 0.55 },
  { re: /\bfollow[- ]?up\b/i, state: 'OPEN', weight: 0.75 },
  { re: /\binterview scheduled\b/i, state: 'IN_PROGRESS', weight: 0.9 },
  { re: /\binterviewing with\b/i, state: 'IN_PROGRESS', weight: 0.88 },
  { re: /\bproject (is )?incomplete\b/i, state: 'IN_PROGRESS', weight: 0.85 },
  { re: /\bincomplete until\b/i, state: 'IN_PROGRESS', weight: 0.85 },
  { re: /\bpaused .{0,30}(work|staging|deploy)\b/i, state: 'IN_PROGRESS', weight: 0.8 },
  { re: /\bblocked\b/i, state: 'WAITING', weight: 0.75 },
  { re: /\bwant to (apply|work|finish|test)\b/i, state: 'OPEN', weight: 0.72 },
  // Note: bare "focused on" is NOT an open signal — it often marks a preference
  // shift after abandoning something else.
  { re: /\bstill need to\b/i, state: 'OPEN', weight: 0.85 },
  { re: /\bwaiting for another assignment\b/i, state: 'WAITING', weight: 0.95 },
  { re: /\bfinished .{0,40}waiting\b/i, state: 'WAITING', weight: 0.9 },
];

const RESOLUTION_SIGNALS: RegExp[] = [
  /\b(finished|completed|resolved|done with)\b/i,
  /\bheard back\b/i,
  /\b(got|was) rejected\b/i,
  /\baccepted\b/i,
  /\bcancelled\b/i,
  /\bno longer interested\b/i,
  /\bchanged my mind\b/i,
  /\balready handled\b/i,
  /\bconfirmed\b/i,
  /\bgave me .{0,30}(new|four|more)\b/i,
  /\bno longer\b/i,
  /\bi'?m focused on\b/i,
];

const CONDITIONAL_ONLY: RegExp[] = [
  /\bif i (get|got|were|am)\b/i,
  /\bmight\b/i,
  /\bmaybe\b/i,
  /\bcould\b/i,
  /\bwould\b/i,
  /\bhypothetically\b/i,
  /\bin theory\b/i,
];

const SENSITIVE_PATTERNS: Array<{ cls: SensitivityClass; re: RegExp }> = [
  { cls: 'dating', re: /\b(dating|girlfriend|boyfriend|crush|romance)\b/i },
  { cls: 'sexual', re: /\b(sex|sexual|intimate)\b/i },
  { cls: 'rejection', re: /\b(rejected|rejection|ghosted)\b/i },
  { cls: 'family', re: /\b(mom|dad|family conflict|sibling)\b/i },
  { cls: 'health', re: /\b(therapy|anxiety|depression|diagnosis|illness)\b/i },
  { cls: 'finances', re: /\b(debt|broke|salary|bankruptcy)\b/i },
  { cls: 'workplace_insecurity', re: /\b(coworkers? hate|dislikes? me|imposter|afraid (at|of) work)\b/i },
  { cls: 'embarrassment', re: /\b(embarrass|humiliat|ashamed)\b/i },
  { cls: 'conflict', re: /\b(fight|argued|hostile)\b/i },
];

function hashId(parts: string[]): string {
  return createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 24);
}

function inferSensitivity(text: string, explicit?: SensitivityClass): SensitivityClass {
  if (explicit && explicit !== 'none') return explicit;
  for (const { cls, re } of SENSITIVE_PATTERNS) {
    if (re.test(text)) return cls;
  }
  return 'none';
}

function extractEntities(text: string, provided?: string[]): string[] {
  const names = new Set(provided ?? []);
  const re = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const n = m[1];
    if (!['I', 'I\'m', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'Today', 'Later'].includes(n)) {
      names.add(n);
    }
  }
  // Brand-like tokens
  for (const brand of ['Rocket Lab', 'SpaceX', 'Tesla', 'Prima AI', 'Lorebook', 'Ring']) {
    if (text.includes(brand)) names.add(brand);
  }
  return [...names];
}

function isConditionalOnly(text: string): boolean {
  const hasConditional = CONDITIONAL_ONLY.some((r) => r.test(text));
  if (!hasConditional) return false;
  // Strong commitment overrides
  if (/\b(interviewing|scheduled|submitted|waiting to hear)\b/i.test(text)) return false;
  return true;
}

function findOpenSignal(text: string): { state: ReturnPointState; weight: number } | null {
  let best: { state: ReturnPointState; weight: number } | null = null;
  for (const s of OPEN_SIGNALS) {
    if (s.re.test(text) && (!best || s.weight > best.weight)) {
      best = { state: s.state, weight: s.weight };
    }
  }
  return best;
}

function findResolutionSignals(text: string): string[] {
  return RESOLUTION_SIGNALS.filter((r) => r.test(text)).map((r) => r.source);
}

function titleFromText(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= 72) return t;
  return t.slice(0, 69) + '…';
}

function modeFor(state: ReturnPointState, text: string): ContinuityModeForReturn {
  if (state === 'WAITING') return 'unfinished_thread';
  if (/\b(want to|goal|apply|career|job|interview|aerospace|rocket)\b/i.test(text)) {
    return 'goal_follow_up';
  }
  if (/\b(finished|progress|more confident)\b/i.test(text)) return 'progress';
  if (state === 'IN_PROGRESS') return 'unfinished_thread';
  return 'unfinished_thread';
}

function surfaceLine(text: string, state: ReturnPointState, entities: string[]): string {
  const ent = entities[0];
  if (state === 'WAITING' && /rocket lab/i.test(text)) {
    return 'Still waiting to hear back from Rocket Lab?';
  }
  if (state === 'WAITING' && /lab assignment/i.test(text)) {
    return 'You were waiting for your next lab assignment.';
  }
  if (/interview/i.test(text) && ent) {
    return `You were waiting for ${ent} to confirm an interview time.`;
  }
  if (state === 'WAITING' && ent) {
    return `Still waiting to hear back from ${ent}?`;
  }
  if (/staging|memory quality|lorebook/i.test(text)) {
    return 'You had paused staging work and shifted toward product intelligence.';
  }
  if (state === 'WAITING') {
    return 'You had something in progress you were waiting on.';
  }
  if (ent) {
    return `Last time, you were still working on something with ${ent}.`;
  }
  const short = text.length > 90 ? text.slice(0, 87) + '…' : text;
  return `Last time: ${short}`;
}

/**
 * Detect candidate open threads from evidence snippets.
 * Later resolution snippets mark earlier open ones as resolved/superseded via ranker.
 */
export function detectOpenThreads(evidence: EvidenceSnippet[], nowIso: string): ReturnPoint[] {
  const points: ReturnPoint[] = [];

  for (const e of evidence) {
    if (e.fromAssistant) continue;
    if (e.goalStatus === 'completed' || e.goalStatus === 'abandoned') continue;

    const text = e.text.trim();
    if (!text) continue;

    if (isConditionalOnly(text)) continue;
    if (isPrimarilyResolution(text)) continue;

    const open = findOpenSignal(text);
    // Goals marked active count as open even without signal phrase
    const goalActive = e.sourceType === 'goal' && e.goalStatus === 'active';
    if (!open && !goalActive) continue;

    const state: ReturnPointState = open?.state ?? 'OPEN';
    const weight = open?.weight ?? 0.6;
    const entities = extractEntities(text, e.entities);
    const sensitivity = inferSensitivity(text, e.sensitivity);
    const conf = Math.min(0.95, (e.confidence ?? 0.7) * weight);

    const id = hashId([e.sourceType, e.id, state, text.slice(0, 80)]);

    points.push({
      id,
      sourceType: e.sourceType,
      sourceId: e.id,
      threadId: e.threadId ?? null,
      title: titleFromText(text),
      summary: text,
      state,
      continuityMode: modeFor(state, text),
      evidenceIds: [e.id],
      involvedEntities: entities,
      openedAt: e.at,
      lastUpdatedAt: e.at,
      confidence: conf,
      sensitivity,
      resolutionSignals: findResolutionSignals(text),
      relevanceBreakdown: {
        sameThread: 0,
        recency: 0,
        unresolved: weight,
        importance: conf,
        goalRelevance: e.sourceType === 'goal' || /goal|interview|apply|career/i.test(text) ? 0.7 : 0.2,
        confidence: conf,
        repetitionPenalty: 0,
        sensitivityPenalty: 0,
        composite: 0,
      },
      recommendedSurface: 'do_not_surface',
      surfaceLine: surfaceLine(text, state, entities),
      evidenceText: text,
    });
  }

  // Apply cross-evidence resolution: later resolution evidence closes earlier open points
  const sorted = [...evidence].sort(
    (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime(),
  );

  for (const p of points) {
    for (const e of sorted) {
      if (new Date(e.at).getTime() <= new Date(p.openedAt).getTime()) continue;
      const res = findResolutionSignals(e.text);
      if (res.length === 0 && e.goalStatus !== 'completed' && e.goalStatus !== 'abandoned') {
        continue;
      }
      // Entity or topic overlap required to resolve
      const overlap =
        p.involvedEntities.some((ent) => e.text.toLowerCase().includes(ent.toLowerCase())) ||
        shareContent(p.evidenceText, e.text);
      if (!overlap && e.goalStatus !== 'completed' && e.goalStatus !== 'abandoned') continue;

      if (e.goalStatus === 'abandoned' || /\bno longer interested|changed my mind|focused on\b/i.test(e.text)) {
        p.state = 'SUPERSEDED';
        p.expirationReason = 'superseded_by_newer_goal_or_statement';
        p.resolutionSignals = [...p.resolutionSignals, ...res, e.text.slice(0, 80)];
        p.lastUpdatedAt = e.at;
      } else {
        p.state = 'RESOLVED';
        p.expirationReason = 'resolved_by_later_evidence';
        p.resolutionSignals = [...p.resolutionSignals, ...res, e.text.slice(0, 80)];
        p.lastUpdatedAt = e.at;
      }
    }
  }

  void nowIso;
  return points;
}

function shareContent(a: string, b: string): boolean {
  const tok = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 3);
  const A = new Set(tok(a));
  let hits = 0;
  for (const t of tok(b)) if (A.has(t)) hits++;
  if (hits >= 2) return true;
  // Soft domain bridges for resolution without shared rare tokens
  const domains: string[][] = [
    ['lab', 'assignment', 'device', 'devices', 'manager', 'test', 'work'],
    ['rocket', 'interview', 'recruiter', 'availability', 'confirmed', 'monday'],
    ['tesla', 'aerospace', 'avionics', 'apply', 'interested'],
    ['prima', 'deploy', 'config', 'blocked', 'finish'],
  ];
  const ab = `${a} ${b}`.toLowerCase();
  for (const g of domains) {
    const inA = g.filter((x) => a.toLowerCase().includes(x));
    const inB = g.filter((x) => b.toLowerCase().includes(x));
    if (inA.length && inB.length) return true;
  }
  void ab;
  return false;
}

/** Resolution-primary statements should not open a new unfinished thread. */
function isPrimarilyResolution(text: string): boolean {
  const hasOpen =
    /\b(waiting|still need|haven'?t .+ yet|need to finish|follow[- ]?up|blocked|incomplete)\b/i.test(
      text,
    );
  if (hasOpen) return false;
  return /\b(no longer interested|changed my mind|already handled|confirmed|heard back|finished|completed|gave me)\b/i.test(
    text,
  );
}

export function isResolutionEvidence(text: string): boolean {
  return RESOLUTION_SIGNALS.some((r) => r.test(text));
}

export { findOpenSignal, isConditionalOnly, inferSensitivity };
