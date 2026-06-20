/** Shared validation helpers for cognition routes and services. */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const ASSERTION_TARGET_KINDS = new Set(['node', 'edge', 'narrative_claim'] as const);
export type AssertionTargetKind = 'node' | 'edge' | 'narrative_claim';

export const GRAPH_NODE_KINDS = new Set([
  'person',
  'place',
  'organization',
  'event',
  'relationship',
  'skill',
  'artifact',
  'goal',
  'decision',
  'concept',
  'group',
]);

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export function parseQueryLimit(raw: unknown, defaultLimit = 20, max = 200): number {
  if (raw === undefined || raw === null || raw === '') return defaultLimit;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return defaultLimit;
  return Math.min(Math.floor(n), max);
}

export function parseAssertionTargetKind(value: string): AssertionTargetKind | null {
  return ASSERTION_TARGET_KINDS.has(value as AssertionTargetKind)
    ? (value as AssertionTargetKind)
    : null;
}

export function parseGraphNodeKind(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return GRAPH_NODE_KINDS.has(value) ? value : undefined;
}
