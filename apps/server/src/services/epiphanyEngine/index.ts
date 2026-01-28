/**
 * LOREBOOK v0.1 — EPIPHANY ENGINE (CONTROL + PATTERN DETECTION)
 * When new information is added, retroactively reinterpret past events
 * and surface a coherent insight. Throttled by scope-based cooldowns.
 */

import type {
  EpiphanyMemory,
  EpiphanyInterpretation,
  EpiphanyPatternType,
  EpiphanyScope,
  EpiphanyCooldown,
} from '../../types/epiphanyEngine';

// ---------- STORES ----------

let memoryStore: EpiphanyMemory[] = [];
let interpretationStore: EpiphanyInterpretation[] = [];
let cooldownStore: EpiphanyCooldown[] = [];

// ---------- CONSTANTS ----------

const CONFIDENCE_THRESHOLD = 0.55;
const DAY = 24 * 60 * 60 * 1000;
const COOLDOWNS = {
  global: 7 * DAY,
  thread: 14 * DAY,
  timeline_node: 30 * DAY,
};

// ---------- UTILS ----------

function overlap(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  const intersection = [...setA].filter((x) => setB.has(x)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function uuid(): string {
  return crypto.randomUUID?.() ?? `epiphany-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function nowISO(): string {
  return new Date().toISOString();
}

// ---------- RELATED MEMORY MATCHING ----------

function relatedness(a: EpiphanyMemory, b: EpiphanyMemory): number {
  return (
    0.4 * overlap(a.entities, b.entities) +
    0.4 * overlap(a.themes, b.themes) +
    0.2 * overlap(a.emotions, b.emotions)
  );
}

function findRelatedPastMemories(memory: EpiphanyMemory): EpiphanyMemory[] {
  return memoryStore.filter(
    (m) => m.id !== memory.id && relatedness(memory, m) >= 0.5
  );
}

// ---------- PATTERN DETECTION ----------

function countTheme(memories: EpiphanyMemory[], theme: string): number {
  return memories.filter((m) => m.themes.includes(theme)).length;
}

function detectPattern(memories: EpiphanyMemory[]): EpiphanyPatternType | null {
  if (countTheme(memories, 'exclusion') >= 2) return 'REPEATED_EXCLUSION';
  if (countTheme(memories, 'conflict') >= 3) return 'RECURRING_CONFLICT';
  return null;
}

// ---------- INTERPRETATION GENERATION ----------

function buildClaim(pattern: EpiphanyPatternType): string {
  if (pattern === 'REPEATED_EXCLUSION') {
    return 'There appears to be a recurring pattern of exclusion across experiences.';
  }
  if (pattern === 'RECURRING_CONFLICT') {
    return 'There appears to be a recurring pattern of unresolved conflict across experiences.';
  }
  return '';
}

function generateInterpretation(
  pattern: EpiphanyPatternType,
  memories: EpiphanyMemory[]
): EpiphanyInterpretation | null {
  const supporting = memories.filter((m) =>
    m.themes.includes(
      pattern === 'REPEATED_EXCLUSION' ? 'exclusion' : 'conflict'
    )
  );
  const contradicting = memories.filter((m) => m.themes.includes('acceptance'));

  const confidence =
    supporting.length / (supporting.length + contradicting.length || 1);

  return {
    id: uuid(),
    claim: buildClaim(pattern),
    confidence: clamp(confidence, 0, 1),
    supporting_memory_ids: supporting.map((m) => m.id),
    contradicting_memory_ids: contradicting.map((m) => m.id),
    created_at: nowISO(),
    last_updated: nowISO(),
    supersedes_interpretation_ids: [], // filled by caller
  };
}

// ---------- SUPERSESSION ----------

function findSupersededInterpretations(
  interpretation: EpiphanyInterpretation
): string[] {
  return interpretationStore
    .filter(
      (prev) =>
        overlap(
          prev.supporting_memory_ids,
          interpretation.supporting_memory_ids
        ) >= 0.6
    )
    .map((prev) => prev.id);
}

// ---------- COOLDOWN CONTROL ----------

function canEmitInterpretation(
  scope: EpiphanyScope,
  scopeId?: string
): boolean {
  const last = cooldownStore.find(
    (c) => c.scope === scope && c.scope_id === scopeId
  );
  if (!last) return true;
  const elapsed = Date.now() - new Date(last.last_fired_at).getTime();
  return elapsed > COOLDOWNS[scope];
}

function updateCooldown(scope: EpiphanyScope, scopeId?: string): void {
  const existing = cooldownStore.find(
    (c) => c.scope === scope && c.scope_id === scopeId
  );
  if (existing) {
    existing.last_fired_at = nowISO();
  } else {
    cooldownStore.push({
      scope,
      scope_id: scopeId,
      last_fired_at: nowISO(),
    });
  }
}

// ---------- EPIPHANY PASS ----------

function runEpiphanyPass(
  newMemory: EpiphanyMemory,
  scope: EpiphanyScope,
  scopeId?: string
): void {
  const related = findRelatedPastMemories(newMemory);
  const memories = [newMemory, ...related];

  if (memories.length < 2) return;

  const pattern = detectPattern(memories);
  if (!pattern) return;

  const interpretation = generateInterpretation(pattern, memories);
  if (!interpretation) return;
  if (interpretation.confidence < CONFIDENCE_THRESHOLD) return;
  if (!canEmitInterpretation(scope, scopeId)) return;

  interpretation.supersedes_interpretation_ids =
    findSupersededInterpretations(interpretation);

  interpretationStore.push(interpretation);
  updateCooldown(scope, scopeId);
}

// ---------- PUBLIC API ----------

/**
 * Add a memory and run one epiphany pass. Interpretations are appended
 * when confidence >= 0.55 and scope cooldown allows. Scope defaults to 'global'.
 */
export function addMemory(
  memory: EpiphanyMemory,
  scope: EpiphanyScope = 'global',
  scopeId?: string
): void {
  memoryStore.push(memory);
  runEpiphanyPass(memory, scope, scopeId);
}

/** Read-only view of the memory store. */
export function getMemoryStore(): readonly EpiphanyMemory[] {
  return memoryStore;
}

/** Read-only view of the interpretation store. */
export function getInterpretationStore(): readonly EpiphanyInterpretation[] {
  return interpretationStore;
}

/** Reset memory, interpretation, and cooldown stores (for tests or replays). */
export function resetEpiphanyStores(): void {
  memoryStore = [];
  interpretationStore = [];
  cooldownStore = [];
}
