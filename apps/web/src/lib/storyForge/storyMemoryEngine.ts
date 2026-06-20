import type { CertifiedEntity } from '../../types/certifiedEntity';
import { compileChatLoreContext } from '../chatLoreContext';
import { buildDemoCertifiedIndex } from '../demoCertifiedIndex';
import { DEMO_ENTITY_FALLBACKS } from '../demoEntityFallbacks';
import type {
  ConversationScenario,
  DetectedSituation,
  MemoryConnection,
  MemoryEntity,
  NarrativeAtomDraft,
  StoryDomain,
  StoryMemoryState,
  TurnAnalysis,
} from './types';

const DEMO_FALLBACK = DEMO_ENTITY_FALLBACKS;

function emptyDomains(): Record<StoryDomain, number> {
  return {
    relationships: 0,
    romance: 0,
    family: 0,
    career: 0,
    health: 0,
    creative: 0,
    social: 0,
    place: 0,
    identity: 0,
  };
}

export function createEmptyStoryMemory(scenarioId: string | null = null): StoryMemoryState {
  const now = new Date().toISOString();
  return {
    scenarioId,
    turnsProcessed: 0,
    entities: {},
    connections: [],
    situations: [],
    atoms: [],
    domains: emptyDomains(),
    startedAt: now,
    updatedAt: now,
  };
}

function memorySource(entity: { status: string; source: string }): MemoryEntity['sources'][number] {
  if (entity.status === 'draft') return 'draft';
  if (entity.source === 'lexical' || entity.source === 'fallback' || entity.source === 'certified') {
    return entity.source;
  }
  return 'certified';
}

function entityFromCompiled(
  entity: { id: string; name: string; type: MemoryEntity['type']; status: string; source: string },
  turnIndex: number,
  content: string,
  existing?: MemoryEntity
): MemoryEntity {
  const romantic =
    entity.id.includes('kelly') ||
    (entity.type === 'character' &&
      /\b(romantic partner|girlfriend|boyfriend|my partner)\b/i.test(content) &&
      new RegExp(`\\b${entity.name}\\b`, 'i').test(content));
  return {
    id: entity.id,
    name: entity.name,
    type: entity.type,
    characterVariant: romantic ? 'romantic' : existing?.characterVariant,
    mentionCount: (existing?.mentionCount ?? 0) + 1,
    firstSeenTurn: existing?.firstSeenTurn ?? turnIndex,
    lastSeenTurn: turnIndex,
    sources: [...new Set([...(existing?.sources ?? []), memorySource(entity)])],
  };
}

function coMentionConnections(
  entityIds: string[],
  entities: Record<string, MemoryEntity>,
  turnIndex: number
): MemoryConnection[] {
  const connections: MemoryConnection[] = [];
  for (let i = 0; i < entityIds.length; i++) {
    for (let j = i + 1; j < entityIds.length; j++) {
      const a = entities[entityIds[i]];
      const b = entities[entityIds[j]];
      if (!a || !b) continue;
      connections.push({
        id: `co-${a.id}-${b.id}-${turnIndex}`,
        fromEntityId: a.id,
        toEntityId: b.id,
        fromName: a.name,
        toName: b.name,
        relation: 'co_mention',
        label: `${a.name} ↔ ${b.name}`,
        weight: 0.6,
        turnIndex,
      });
    }
  }
  return connections;
}

function inferSituations(
  content: string,
  scenario: ConversationScenario | null,
  entityIds: string[],
  turnIndex: number
): DetectedSituation[] {
  const lower = content.toLowerCase();
  const tags = scenario?.situationTags ?? [];
  const hits: DetectedSituation[] = [];

  const rules: Array<{ match: RegExp; tag: string; title: string; domain: StoryDomain }> = [
    { match: /weekend|beach|present with/i, tag: 'weekend_trip', title: 'Quality time away', domain: 'romance' },
    { match: /opening|interview|deployment|career|trajectory/i, tag: 'job_lead', title: 'Career opportunity', domain: 'career' },
    { match: /visit|t[ií]a|abuela|family/i, tag: 'family_visit', title: 'Family reconnection', domain: 'family' },
    { match: /crew|group|northwind|collaborat/i, tag: 'new_group', title: 'Group forming', domain: 'social' },
    { match: /running|journal|stress|health|routine/i, tag: 'habit_building', title: 'Health routine', domain: 'health' },
    { match: /breakup|not getting back|relieved|sad/i, tag: 'breakup', title: 'Relationship closure', domain: 'romance' },
    { match: /presentation|demo|nailed|speaking/i, tag: 'presentation', title: 'Public milestone', domain: 'career' },
    { match: /move back|relocation|considering/i, tag: 'relocation', title: 'Place decision', domain: 'place' },
    { match: /mentor|walked me through/i, tag: 'mentorship', title: 'Mentor moment', domain: 'career' },
    { match: /launch|live|ship|commit/i, tag: 'launch', title: 'Creative launch', domain: 'creative' },
  ];

  for (const rule of rules) {
    if (!rule.match.test(lower) && !tags.includes(rule.tag)) continue;
    hits.push({
      id: `sit-${rule.tag}-${turnIndex}`,
      tag: rule.tag,
      title: rule.title,
      summary: content.slice(0, 140),
      domain: rule.domain,
      entityIds,
      turnIndex,
      confidence: rule.match.test(lower) ? 0.85 : 0.65,
    });
  }

  return hits;
}

function draftAtom(
  content: string,
  entityIds: string[],
  turnIndex: number,
  domains: StoryDomain[],
  type: NarrativeAtomDraft['type'] = 'reflection'
): NarrativeAtomDraft {
  return {
    id: `atom-${turnIndex}-${entityIds.join('-') || 'general'}`,
    type,
    timestamp: new Date(Date.now() - (100 - turnIndex) * 86_400_000).toISOString(),
    content: content.slice(0, 280),
    domains,
    entityIds,
    turnIndex,
    significance: Math.min(1, 0.45 + entityIds.length * 0.12),
  };
}

function domainsForContent(content: string, scenario: ConversationScenario | null): StoryDomain[] {
  const base = scenario?.domains ?? [];
  const extra: StoryDomain[] = [];
  if (/romantic|partner|love|alex|kelly/i.test(content)) extra.push('romance');
  if (/marcus|vanguard|career|job|mentor/i.test(content)) extra.push('career');
  if (/t[ií]a|family|abuela/i.test(content)) extra.push('family');
  if (/san diego|mission beach|move/i.test(content)) extra.push('place');
  if (/northwind|crew|group|jamie/i.test(content)) extra.push('social');
  if (/skill|speaking|presentation/i.test(content)) extra.push('creative');
  if (/health|running|journal|stress/i.test(content)) extra.push('health');
  if (/future me|identity|who i/i.test(content)) extra.push('identity');
  return [...new Set([...base, ...extra])];
}

export type StoryMemoryEngineOptions = {
  certifiedIndex?: CertifiedEntity[];
  scenario?: ConversationScenario | null;
};

export class StoryMemoryEngine {
  private state: StoryMemoryState;
  private history: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  private certifiedIndex: CertifiedEntity[];
  private scenario: ConversationScenario | null;

  constructor(options: StoryMemoryEngineOptions = {}) {
    this.scenario = options.scenario ?? null;
    this.certifiedIndex = options.certifiedIndex ?? buildDemoCertifiedIndex();
    this.state = createEmptyStoryMemory(this.scenario?.id ?? null);
  }

  getState(): StoryMemoryState {
    return this.state;
  }

  reset(scenario?: ConversationScenario | null): void {
    this.scenario = scenario ?? null;
    this.history = [];
    this.state = createEmptyStoryMemory(this.scenario?.id ?? null);
  }

  processTurn(role: 'user' | 'assistant', content: string): TurnAnalysis {
    const turnIndex = this.state.turnsProcessed;
    const lore = compileChatLoreContext(content, {
      conversationHistory: this.history,
      certifiedIndex: this.certifiedIndex,
      fallbackEntities: DEMO_FALLBACK.map((f) => ({
        pattern: f.pattern,
        id: f.id,
        name: f.name,
        type: f.type,
      })),
    });

    this.history.push({ role, content });
    if (this.history.length > 12) this.history.shift();

    const turnEntities: MemoryEntity[] = [];
    for (const entity of lore.entities) {
      const existing = this.state.entities[entity.id];
      const next = entityFromCompiled(entity, turnIndex, content, existing);
      this.state.entities[entity.id] = next;
      turnEntities.push(next);
    }

    const entityIds = turnEntities.map((e) => e.id);
    this.state.connections.push(...coMentionConnections(entityIds, this.state.entities, turnIndex));

    for (const hint of lore.relationshipHints) {
      const names = hint.split(/\s+/).filter(Boolean);
      if (names.length < 2) continue;
      this.state.connections.push({
        id: `hint-${turnIndex}-${hint}`,
        fromEntityId: entityIds[0] ?? 'unknown',
        toEntityId: entityIds[1] ?? entityIds[0] ?? 'unknown',
        fromName: names[0],
        toName: names[names.length - 1],
        relation: 'relationship_hint',
        label: hint,
        weight: 0.75,
        turnIndex,
      });
    }

    const situations = inferSituations(content, this.scenario, entityIds, turnIndex);
    this.state.situations.push(...situations);

    const turnDomains = domainsForContent(content, this.scenario);
    for (const domain of turnDomains) {
      this.state.domains[domain] = (this.state.domains[domain] ?? 0) + 1;
    }

    const atomType: NarrativeAtomDraft['type'] =
      /breakup|turning|move|launch|nailed|finally talked/i.test(content)
        ? 'turning_point'
        : /mentor|partner|romantic|love|alex|kelly/i.test(content)
          ? 'relationship_moment'
          : /skill|speaking|presentation/i.test(content)
            ? 'skill_milestone'
            : role === 'user'
              ? 'event'
              : 'reflection';

    this.state.atoms.push(
      draftAtom(content, entityIds, turnIndex, turnDomains, atomType)
    );

    this.state.turnsProcessed += 1;
    this.state.updatedAt = new Date().toISOString();

    return {
      turnIndex,
      role,
      content,
      intent: lore.intent,
      entities: turnEntities,
      relationshipHints: lore.relationshipHints,
      ontologyHits: lore.ontologyHits.map((h) => `${h.name} (${h.category})`),
      subtitle: lore.subtitle,
    };
  }

  runScenario(scenario: ConversationScenario): StoryMemoryState {
    this.reset(scenario);
    for (const turn of scenario.turns) {
      this.processTurn(turn.role, turn.content);
    }
    return this.getState();
  }
}
