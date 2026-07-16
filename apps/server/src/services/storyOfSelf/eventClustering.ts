/**
 * Clusters duplicate evidence into canonical events.
 *
 * Several memories often describe the same underlying episode (the same
 * first-week-at-work story retold across days). Records link into one cluster
 * when they agree on entities + time, are lexically near-duplicates, or come
 * from the same conversation — and never on the strength of two entities the
 * user has explicitly separated.
 */
import { randomUUID } from 'crypto';

import { isSeparated } from './entityResolution';
import {
  assertEventStageInput,
  type CanonicalEvent,
  type EntitySeparationConstraint,
  type EvidenceRecord,
  type KnownEntity,
  type LifeDomain,
} from './narrativeRecords';

const STOPWORDS = new Set(
  'a an and are as at be but by for from had has have i in is it my of on or our so that the this to was we with you your'.split(
    ' '
  )
);

export function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9áéíóúñü\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 2 && !STOPWORDS.has(t))
  );
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const t of a) if (b.has(t)) intersection++;
  return intersection / (a.size + b.size - intersection);
}

function daysBetween(a?: string, b?: string): number | undefined {
  if (!a || !b) return undefined;
  const da = Date.parse(a);
  const db = Date.parse(b);
  if (Number.isNaN(da) || Number.isNaN(db)) return undefined;
  return Math.abs(da - db) / 86_400_000;
}

function shouldLink(
  a: EvidenceRecord,
  b: EvidenceRecord,
  tokensA: Set<string>,
  tokensB: Set<string>,
  constraints: EntitySeparationConstraint[]
): boolean {
  const sharedEntities = a.mentions
    .map((m) => m.entityId)
    .filter((id) => b.mentions.some((m) => m.entityId === id));

  // Entities under a separation constraint contribute nothing to linkage:
  // if record A is about one Juan and record B about the other, the shared
  // surface name must not glue their stories together.
  for (const idA of a.mentions.map((m) => m.entityId)) {
    for (const idB of b.mentions.map((m) => m.entityId)) {
      if (idA !== idB && isSeparated(idA, idB, constraints)) return false;
    }
  }

  const days = daysBetween(a.date, b.date);
  const similarity = jaccard(tokensA, tokensB);
  const sameConversation =
    a.conversationId !== undefined && a.conversationId === b.conversationId;

  if (sharedEntities.length > 0 && days !== undefined && days <= 7 && similarity >= 0.25) {
    return true;
  }
  if (similarity >= 0.55 && (days === undefined || days <= 21)) return true;
  if (sameConversation && similarity >= 0.3) return true;
  return false;
}

class UnionFind {
  private parent: number[];
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
  }
  find(x: number): number {
    while (this.parent[x] !== x) {
      this.parent[x] = this.parent[this.parent[x]];
      x = this.parent[x];
    }
    return x;
  }
  union(a: number, b: number): void {
    this.parent[this.find(a)] = this.find(b);
  }
}

/** Normalize a representative sentence into a short processed summary. */
function summarize(records: EvidenceRecord[]): { title: string; summary: string } {
  // Prefer the most informative record: most tokens shared with the rest of
  // the cluster (the "consensus" retelling), tie-broken by brevity.
  const tokenSets = records.map((r) => tokenize(r.text));
  let bestIdx = 0;
  let bestScore = -1;
  for (let i = 0; i < records.length; i++) {
    let overlap = 0;
    for (let j = 0; j < records.length; j++) {
      if (i !== j) overlap += jaccard(tokenSets[i], tokenSets[j]);
    }
    const score = overlap - records[i].text.length / 2000;
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  const firstSentence = records[bestIdx].text.split(/(?<=[.!?])\s+/)[0]?.trim() ?? '';
  const clipped =
    firstSentence.length > 160 ? `${firstSentence.slice(0, 157).trimEnd()}…` : firstSentence;
  const summary = clipped.endsWith('.') || clipped.endsWith('…') ? clipped : `${clipped}.`;
  const title = summary.length > 80 ? `${summary.slice(0, 77).trimEnd()}…` : summary.replace(/\.$/, '');
  return { title, summary };
}

export function clusterCanonicalEvents(
  records: EvidenceRecord[],
  constraints: EntitySeparationConstraint[],
  entities: KnownEntity[]
): { events: CanonicalEvent[]; duplicateClusters: number } {
  assertEventStageInput('clusterCanonicalEvents', records);
  if (records.length === 0) return { events: [], duplicateClusters: 0 };

  const tokenSets = records.map((r) => tokenize(r.text));
  const uf = new UnionFind(records.length);
  for (let i = 0; i < records.length; i++) {
    for (let j = i + 1; j < records.length; j++) {
      if (shouldLink(records[i], records[j], tokenSets[i], tokenSets[j], constraints)) {
        uf.union(i, j);
      }
    }
  }

  const groups = new Map<number, number[]>();
  for (let i = 0; i < records.length; i++) {
    const root = uf.find(i);
    const group = groups.get(root) ?? [];
    group.push(i);
    groups.set(root, group);
  }

  const entityKind = new Map(entities.map((e) => [e.id, e.kind]));
  let duplicateClusters = 0;
  const events: CanonicalEvent[] = [];

  for (const indices of groups.values()) {
    const members = indices.map((i) => records[i]);
    if (members.length > 1) duplicateClusters++;

    const dates = members
      .map((m) => m.date)
      .filter((d): d is string => Boolean(d))
      .sort();
    const entityIds = [...new Set(members.flatMap((m) => m.mentions.map((x) => x.entityId)))];
    const domains = [...new Set(members.flatMap((m) => m.domains))] as LifeDomain[];
    const { title, summary } = summarize(members);

    events.push({
      id: randomUUID(),
      title,
      summary,
      startTime: dates[0],
      endTime: dates[dates.length - 1],
      entityIds: entityIds.filter((id) => entityKind.get(id) !== 'organization' && entityKind.get(id) !== 'place'),
      locationIds: entityIds.filter((id) => entityKind.get(id) === 'place'),
      organizationIds: entityIds.filter((id) => entityKind.get(id) === 'organization'),
      evidenceIds: members.map((m) => m.id),
      domains,
      confidence: Math.min(1, 0.5 + members.length * 0.15),
      importanceScore: 0,
    });
  }

  events.sort((a, b) => (a.startTime ?? '9999').localeCompare(b.startTime ?? '9999'));
  return { events, duplicateClusters };
}
