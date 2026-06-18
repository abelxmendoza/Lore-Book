/**
 * P3 retrieval protocol — applies persona sensemaking contracts to working memory
 * and related entries before prompt assembly.
 */
import type { SensemakingContract } from '../../contracts/sensemakingContract';
import type { KnowledgeType } from '../knowledgeTypeEngineService';
import type { ResolvedMemoryEntry } from '../../types';
import { truthStateWeight, type TruthState } from '../provenance/epistemicWeights';
import { getPersonaDefinition, type PersonaId } from '../personas/personaRegistry';
import {
  buildWorkingMemoryPacket,
  type WorkingMemoryAssembly,
  type WorkingMemoryItem,
} from './workingMemoryAssembler';

export { truthStateWeight } from '../provenance/epistemicWeights';

function inferKnowledgeType(item: WorkingMemoryItem): KnowledgeType {
  const explicit = item.metadata?.knowledge_type as KnowledgeType | undefined;
  if (explicit) return explicit;
  if (item.type === 'preference') return 'BELIEF';
  if (item.type === 'goal') return 'DECISION';
  if (item.type === 'skill' || item.type === 'community') return 'FACT';
  return 'EXPERIENCE';
}

function readTruthState(item: WorkingMemoryItem): TruthState {
  const raw = item.metadata?.truth_state;
  if (typeof raw === 'string') return raw as TruthState;
  return 'PENDING_VERIFICATION';
}

export function passesRetrievalContract(
  item: WorkingMemoryItem,
  contract: SensemakingContract
): boolean {
  if (item.confidence < contract.min_confidence) return false;

  const knowledgeType = inferKnowledgeType(item);
  if (!contract.allowed_knowledge_types.includes(knowledgeType)) return false;

  const truthState = readTruthState(item);
  if (truthState === 'REVISED') return false;
  if (contract.contradiction_policy === 'FILTER_UNSTABLE' && truthState === 'DISPUTED') {
    return false;
  }

  return true;
}

function filterItems(
  items: WorkingMemoryItem[],
  contract: SensemakingContract
): WorkingMemoryItem[] {
  return items.filter((item) => passesRetrievalContract(item, contract));
}

function filterAssembly(
  assembly: WorkingMemoryAssembly,
  contract: SensemakingContract
): WorkingMemoryAssembly {
  const filterBucket = (items: WorkingMemoryItem[]) => filterItems(items, contract);

  const episodes = filterBucket(assembly.episodes);
  const events = filterBucket(assembly.events);
  const projects = filterBucket(assembly.projects);
  const goals = filterBucket(assembly.goals);
  const skills = filterBucket(assembly.skills);
  const communities = filterBucket(assembly.communities);
  const relationships = filterBucket(assembly.relationships);
  const preferences = filterBucket(assembly.preferences);
  const timeline = filterBucket(assembly.timeline);

  const selected = [
    ...episodes,
    ...events,
    ...projects,
    ...goals,
    ...skills,
    ...communities,
    ...relationships,
    ...preferences,
    ...timeline,
  ];

  return {
    ...assembly,
    episodes,
    events,
    projects,
    goals,
    skills,
    communities,
    relationships,
    preferences,
    timeline,
    budget: {
      ...assembly.budget,
      selected: selected.length,
      rejected: assembly.budget.rejected + (assembly.budget.selected - selected.length),
    },
  };
}

function filterRelatedEntries(
  entries: ResolvedMemoryEntry[],
  contract: SensemakingContract
): ResolvedMemoryEntry[] {
  return entries.filter((entry) => {
    const meta = entry.metadata ?? {};
    const confidence = typeof meta.confidence === 'number' ? meta.confidence : 0.65;
    if (confidence < contract.min_confidence) return false;

    const knowledgeType = (meta.knowledge_type as KnowledgeType | undefined) ?? 'EXPERIENCE';
    if (!contract.allowed_knowledge_types.includes(knowledgeType)) return false;

    const truthState = (meta.truth_state as string | undefined) ?? 'PENDING_VERIFICATION';
    if (truthState === 'REVISED') return false;
    if (contract.contradiction_policy === 'FILTER_UNSTABLE' && truthState === 'DISPUTED') {
      return false;
    }
    return true;
  });
}

export type RagPacketContractFields = {
  workingMemory?: WorkingMemoryAssembly | null;
  workingMemoryPacket?: ReturnType<typeof buildWorkingMemoryPacket> | null;
  foundationRecallBlock?: string;
  foundationRelationships?: WorkingMemoryItem[];
  foundationTimeline?: WorkingMemoryItem[];
  relatedEntries?: ResolvedMemoryEntry[];
  sensemakingContract?: {
    id: string;
    name: string;
    filteredItems: number;
    totalItems: number;
  };
};

/**
 * Apply the active persona's sensemaking contract to an assembled RAG packet.
 * Mutates packet fields in place.
 */
export function applyPersonaRetrievalContract(
  packet: RagPacketContractFields,
  personaId: PersonaId | string
): void {
  const resolved = (['therapist', 'strategist', 'gossip_buddy', 'archivist', 'soul_capturer', 'biography_writer'] as const)
    .includes(personaId as PersonaId)
    ? getPersonaDefinition(personaId as PersonaId)
    : getPersonaDefinition('therapist');

  const contract = resolved.contract;
  const beforeCount =
    (packet.workingMemory?.budget.selected ?? 0) + (packet.relatedEntries?.length ?? 0);

  if (packet.workingMemory) {
    const filtered = filterAssembly(packet.workingMemory, contract);
    packet.workingMemory = filtered;
    packet.workingMemoryPacket = buildWorkingMemoryPacket(filtered);
    packet.foundationRecallBlock = packet.workingMemoryPacket.text;
    packet.foundationRelationships = filtered.relationships;
    packet.foundationTimeline = filtered.timeline;
  }

  if (packet.relatedEntries) {
    packet.relatedEntries = filterRelatedEntries(packet.relatedEntries, contract);
  }

  const afterCount =
    (packet.workingMemory?.budget.selected ?? 0) + (packet.relatedEntries?.length ?? 0);

  packet.sensemakingContract = {
    id: contract.id,
    name: contract.name,
    filteredItems: Math.max(0, beforeCount - afterCount),
    totalItems: beforeCount,
  };
}
