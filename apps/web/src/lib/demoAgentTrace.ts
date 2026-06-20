import type { LoreAgentTrace } from '../api/loreAgents';
import type { EntityChip } from '../features/chat/message/EntityChipsRow';
import { compileChatLoreContext, toMessageMentionedEntities } from './chatLoreContext';
import { DEMO_ENTITY_FALLBACKS } from './demoEntityFallbacks';
import { certifiedTypeToLoreKind, getLoreEntity, loreKindForChip } from './loreEntities';

function entityLabel(entity: Pick<EntityChip, 'name' | 'type' | 'characterVariant' | 'loreKind'>): string {
  const kind = loreKindForChip(entity);
  const def = getLoreEntity(kind);
  return `${def.shortLabel}: ${entity.name}`;
}

/** Simulated agent trace for demo mode — mirrors server pipeline without API calls. */
export function buildDemoLoreAgentTrace(
  messageId: string,
  message: string,
  mentionedEntities?: EntityChip[],
): LoreAgentTrace {
  const lore = compileChatLoreContext(message, { fallbackEntities: DEMO_ENTITY_FALLBACKS });
  const entities = mentionedEntities ?? toMessageMentionedEntities(lore.entities);
  const entityLabels = entities.map(entityLabel);

  const runs = [
    {
      agent_name: 'MemoryAgent',
      run_id: `${messageId}-memory`,
      status: 'completed',
      confidence: 0.91,
      duration_ms: 42,
    },
  ];

  if (lore.relationshipHints.length > 0 || entities.some((e) => loreKindForChip(e) === 'relationship')) {
    runs.push({
      agent_name: 'IdentityAgent',
      run_id: `${messageId}-identity`,
      status: 'completed',
      confidence: 0.88,
      duration_ms: 36,
    });
  }

  if (entities.length > 1 || lore.ontologyHits.length > 0) {
    runs.push({
      agent_name: 'NarrativeAgent',
      run_id: `${messageId}-narrative`,
      status: 'completed',
      confidence: 0.86,
      duration_ms: 51,
    });
  }

  const observations = [
    {
      agent_name: 'MemoryAgent',
      kind: 'lexical_scan',
      summary:
        entityLabels.length > 0
          ? `Resolved ${entityLabels.join(', ')} from certified index + demo fallbacks.`
          : 'No named entities — tracking themes only.',
      confidence: 0.92,
    },
  ];

  if (lore.ontologyHits.length > 0) {
    observations.push({
      agent_name: 'MemoryAgent',
      kind: 'ontology',
      summary: `Lexical ontology: ${lore.ontologyHits
        .slice(0, 4)
        .map((h) => `${h.name} (${h.category})`)
        .join(', ')}`,
      confidence: 0.84,
    });
  }

  if (lore.relationshipHints.length > 0) {
    observations.push({
      agent_name: 'IdentityAgent',
      kind: 'relationship',
      summary: lore.relationshipHints.slice(0, 3).join('; '),
      confidence: 0.87,
    });
  }

  if (entities.length > 0) {
    observations.push({
      agent_name: 'NarrativeAgent',
      kind: 'entity_link',
      summary: `Would link to ${entities
        .slice(0, 4)
        .map((e) => getLoreEntity(loreKindForChip(e)).bookSurface ?? certifiedTypeToLoreKind(e.type, e.characterVariant))
        .join(', ')} books after confirmation.`,
      confidence: 0.85,
    });
  }

  const proposedActions = entities.slice(0, 3).map((entity, index) => {
    const kind = loreKindForChip(entity);
    const book = getLoreEntity(kind).bookSurface ?? 'entity_authority';
    return {
      agent_name: 'MemoryAgent',
      action_type: `link_${kind}`,
      status: 'proposed',
      confidence: 0.9 - index * 0.04,
      requires_confirmation: true,
      routed_to: book === 'characters' || book === 'locations' ? 'entity_authority' : 'entity_authority',
      payload: { entityId: entity.id, entityName: entity.name, loreKind: kind },
    };
  });

  return {
    enabled: true,
    messageId,
    pipeline: {
      messageId,
      phases: ['lexical_scan', 'entity_resolution', 'agent_orchestration', 'response_draft'],
      lexicalConfidence: Math.min(0.98, 0.72 + entities.length * 0.06),
      meaningConfidence: 0.88,
      factuality: 'simulated',
    },
    runs,
    observations,
    proposedActions,
  };
}
