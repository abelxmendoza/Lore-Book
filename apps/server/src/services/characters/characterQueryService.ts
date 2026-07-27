/**
 * Sectioned Character Query — single read model for modals, cards, timelines,
 * and chat working-memory assembly. Soft-fails per section.
 */
import { logger } from '../../logger';
import { getCharacterKnowledgeBase } from '../characterKnowledgeBaseService';
import { entityAttributeDetector } from '../conversationCentered/entityAttributeDetector';
import { characterTimelineBuilder } from '../conversationCentered/characterTimelineBuilder';
import { getCharacterEvidenceLocker } from '../characterEvidenceService';
import { familyTreeService } from '../familyTreeService';
import { organizationService } from '../organizationService';
import { supabaseAdmin } from '../supabaseClient';
import { characterLoreProfileService } from './characterLoreProfileService';
import {
  loadCharacterIdentity,
  type CharacterIdentity,
  type CharacterSharedMemoryRef,
} from './characterIdentityLoader';
import { loadCharacterChatMentions, type CharacterChatMention } from './characterChatMentions';

export const CHARACTER_QUERY_SECTIONS = [
  'identity',
  'attributes',
  'lore',
  'knowledge',
  'organizations',
  'memories',
  'chatMentions',
  'provenance',
  'family',
  'timelines',
  'media',
  'evidence',
  'dynamics',
] as const;

export type CharacterQuerySection = (typeof CHARACTER_QUERY_SECTIONS)[number];

export const CHARACTER_QUERY_CORE_SECTIONS: CharacterQuerySection[] = [
  'identity',
  'attributes',
  'lore',
  'knowledge',
  'organizations',
  'memories',
  'chatMentions',
  'provenance',
];

export type { CharacterChatMention };

export type HydratedMemoryCard = CharacterSharedMemoryRef & {
  title?: string | null;
  content?: string | null;
  tags?: string[];
  source?: string | null;
};

export type CharacterQuery = {
  characterId: string;
  subject: 'self' | 'other';
  generatedAt: string;
  sections: {
    identity?: CharacterIdentity;
    attributes?: {
      current: Array<Record<string, unknown>>;
      history?: Array<Record<string, unknown>>;
    };
    lore?: Awaited<ReturnType<typeof characterLoreProfileService.compile>>;
    knowledge?: NonNullable<Awaited<ReturnType<typeof getCharacterKnowledgeBase>>>;
    organizations?: Array<Record<string, unknown>>;
    memories?: HydratedMemoryCard[];
    chatMentions?: CharacterChatMention[];
    provenance?: Record<string, unknown>;
    family?: Record<string, unknown>;
    timelines?: {
      sharedExperiences: Array<Record<string, unknown>>;
      lore: Array<Record<string, unknown>>;
      summary?: { sharedCount: number; loreCount: number; recent: Array<Record<string, unknown>> };
    };
    media?: Array<Record<string, unknown>>;
    evidence?: Record<string, unknown>;
    dynamics?: Record<string, unknown>;
  };
  partialErrors?: Record<string, string>;
};

function parseSections(raw?: string | string[] | null): CharacterQuerySection[] {
  if (!raw) return [...CHARACTER_QUERY_CORE_SECTIONS];
  const parts = (Array.isArray(raw) ? raw.join(',') : raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0 || parts.includes('core')) {
    return [...CHARACTER_QUERY_CORE_SECTIONS];
  }
  if (parts.includes('all')) {
    return [...CHARACTER_QUERY_SECTIONS];
  }
  const allowed = new Set<string>(CHARACTER_QUERY_SECTIONS);
  const out: CharacterQuerySection[] = [];
  for (const part of parts) {
    if (allowed.has(part)) out.push(part as CharacterQuerySection);
  }
  return out.length > 0 ? out : [...CHARACTER_QUERY_CORE_SECTIONS];
}

async function hydrateMemories(
  userId: string,
  refs: CharacterSharedMemoryRef[],
): Promise<HydratedMemoryCard[]> {
  const entryIds = [...new Set(refs.map((r) => r.entry_id).filter(Boolean))];
  if (entryIds.length === 0) {
    return refs.map((r) => ({ ...r }));
  }

  const { data: entries } = await supabaseAdmin
    .from('journal_entries')
    .select('id, date, content, summary, tags, source, title')
    .eq('user_id', userId)
    .in('id', entryIds);

  const byId = new Map((entries ?? []).map((e) => [e.id, e]));
  return refs.map((ref) => {
    const entry = byId.get(ref.entry_id);
    if (!entry) return { ...ref };
    return {
      ...ref,
      title: (entry as { title?: string | null }).title ?? null,
      content: typeof entry.content === 'string' ? entry.content : null,
      summary: ref.summary ?? (typeof entry.summary === 'string' ? entry.summary : undefined),
      tags: Array.isArray(entry.tags) ? entry.tags : [],
      source: typeof entry.source === 'string' ? entry.source : null,
      date: entry.date ?? ref.date,
    };
  });
}

async function loadProvenanceSummary(userId: string, characterId: string) {
  const { provenanceEdgeService } = await import('../provenance/provenanceEdgeService');
  const provenanceReport = await provenanceEdgeService.getEntityProvenance(characterId, userId);
  const { data: mutations } = await supabaseAdmin
    .from('cognition_mutations')
    .select('id, mutation_type, before_state, after_state, rationale, created_at')
    .eq('user_id', userId)
    .eq('artifact_id', characterId)
    .order('created_at', { ascending: true })
    .limit(50);

  let sourceUtterances: Array<{ id: string; content: string; created_at: string }> = [];
  if (provenanceReport.sourceMessageIds.length > 0) {
    const { data: utteranceData } = await supabaseAdmin
      .from('utterances')
      .select('id, content, created_at')
      .eq('user_id', userId)
      .in('id', provenanceReport.sourceMessageIds.slice(0, 20))
      .order('created_at', { ascending: true });
    sourceUtterances = utteranceData ?? [];
  }

  return {
    ...provenanceReport,
    mutations: mutations ?? [],
    sourceUtterances,
    mentionCount: provenanceReport.sourceMessageIds.length,
  };
}

async function loadDynamics(userId: string, characterId: string, characterName: string) {
  // Prefer id-keyed rows when present; fall back to name for legacy dynamics tables.
  const byId = await supabaseAdmin
    .from('relationship_dynamics')
    .select('*')
    .eq('user_id', userId)
    .eq('character_id', characterId)
    .maybeSingle();

  if (!byId.error && byId.data) {
    return { dynamics: byId.data, characterId, characterName };
  }

  const byName = await supabaseAdmin
    .from('relationship_dynamics')
    .select('*')
    .eq('user_id', userId)
    .ilike('person_name', characterName)
    .limit(1)
    .maybeSingle();

  return {
    dynamics: !byName.error ? byName.data ?? null : null,
    characterId,
    characterName,
  };
}

async function softSection<T>(
  name: CharacterQuerySection,
  partialErrors: Record<string, string>,
  fn: () => Promise<T>,
): Promise<T | undefined> {
  try {
    return await fn();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'section failed';
    partialErrors[name] = message;
    logger.warn({ err, section: name }, 'Character query section failed');
    return undefined;
  }
}

export function resolveCharacterQuerySections(
  raw?: string | string[] | null,
): CharacterQuerySection[] {
  return parseSections(raw);
}

export async function getCharacterQuery(
  userId: string,
  characterId: string,
  options: {
    sections?: string | string[] | null;
    subject?: 'self' | 'other';
  } = {},
): Promise<CharacterQuery | null> {
  const wanted = new Set(parseSections(options.sections));
  const partialErrors: Record<string, string> = {};

  // Identity is always loaded first — other sections depend on name / shared_memories.
  const identity = await loadCharacterIdentity(userId, characterId);
  if (!identity) return null;

  const meta = identity.metadata ?? {};
  const subject: 'self' | 'other' =
    options.subject ??
    (meta.is_self === true || meta.is_user === true || /^me$/i.test(identity.name) ? 'self' : 'other');

  const sections: CharacterQuery['sections'] = {};
  if (wanted.has('identity')) {
    sections.identity = identity;
  }

  const tasks: Array<Promise<void>> = [];

  if (wanted.has('attributes')) {
    tasks.push(
      (async () => {
        const [current, history] = await Promise.all([
          softSection('attributes', partialErrors, () =>
            entityAttributeDetector.getEntityAttributes(userId, characterId, 'character', true),
          ),
          softSection('attributes', partialErrors, () =>
            entityAttributeDetector.getEntityAttributes(userId, characterId, 'character', false),
          ),
        ]);
        if (current || history) {
          sections.attributes = {
            current: (current ?? []) as Array<Record<string, unknown>>,
            history: (history ?? current ?? []) as Array<Record<string, unknown>>,
          };
        }
      })(),
    );
  }

  if (wanted.has('lore')) {
    tasks.push(
      (async () => {
        const lore = await softSection('lore', partialErrors, () =>
          characterLoreProfileService.compile(userId, characterId),
        );
        if (lore) sections.lore = lore;
      })(),
    );
  }

  if (wanted.has('knowledge')) {
    tasks.push(
      (async () => {
        const knowledge = await softSection('knowledge', partialErrors, () =>
          getCharacterKnowledgeBase(userId, characterId),
        );
        if (knowledge) sections.knowledge = knowledge;
      })(),
    );
  }

  if (wanted.has('organizations')) {
    tasks.push(
      (async () => {
        const orgs = await softSection('organizations', partialErrors, () =>
          organizationService.getOrganizationsByCharacter(userId, characterId, identity.name),
        );
        if (orgs) sections.organizations = orgs as Array<Record<string, unknown>>;
      })(),
    );
  }

  if (wanted.has('memories')) {
    tasks.push(
      (async () => {
        const memories = await softSection('memories', partialErrors, () =>
          hydrateMemories(userId, identity.shared_memories),
        );
        if (memories) sections.memories = memories;
      })(),
    );
  }

  if (wanted.has('chatMentions')) {
    tasks.push(
      (async () => {
        const chatMentions = await softSection('chatMentions', partialErrors, () =>
          loadCharacterChatMentions(userId, characterId, identity.name, identity.alias),
        );
        if (chatMentions) sections.chatMentions = chatMentions;
      })(),
    );
  }

  if (wanted.has('provenance')) {
    tasks.push(
      (async () => {
        const provenance = await softSection('provenance', partialErrors, () =>
          loadProvenanceSummary(userId, characterId),
        );
        if (provenance) sections.provenance = provenance as Record<string, unknown>;
      })(),
    );
  }

  if (wanted.has('family')) {
    tasks.push(
      (async () => {
        const family = await softSection('family', partialErrors, () =>
          familyTreeService.getCharacterFamilyTree(userId, characterId),
        );
        if (family) sections.family = family as Record<string, unknown>;
      })(),
    );
  }

  if (wanted.has('timelines')) {
    tasks.push(
      (async () => {
        const timelines = await softSection('timelines', partialErrors, async () => {
          const built = await characterTimelineBuilder.buildTimelines(userId, characterId);
          const recent = [...built.sharedExperiences, ...built.lore]
            .sort(
              (a, b) =>
                new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime(),
            )
            .slice(0, 8);
          return {
            sharedExperiences: built.sharedExperiences as unknown as Array<Record<string, unknown>>,
            lore: built.lore as unknown as Array<Record<string, unknown>>,
            summary: {
              sharedCount: built.sharedExperiences.length,
              loreCount: built.lore.length,
              recent: recent as unknown as Array<Record<string, unknown>>,
            },
          };
        });
        if (timelines) sections.timelines = timelines;
      })(),
    );
  }

  if (wanted.has('media')) {
    tasks.push(
      (async () => {
        const media = await softSection('media', partialErrors, async () => {
          const { data, error } = await supabaseAdmin
            .from('character_media')
            .select('id, character_id, kind, url, text, caption, source, metadata, created_at')
            .eq('user_id', userId)
            .eq('character_id', characterId)
            .order('created_at', { ascending: false });
          if (error) throw error;
          return data ?? [];
        });
        if (media) sections.media = media as Array<Record<string, unknown>>;
      })(),
    );
  }

  if (wanted.has('evidence')) {
    tasks.push(
      (async () => {
        const evidence = await softSection('evidence', partialErrors, () =>
          getCharacterEvidenceLocker(userId, characterId),
        );
        if (evidence) sections.evidence = evidence as Record<string, unknown>;
      })(),
    );
  }

  if (wanted.has('dynamics')) {
    tasks.push(
      (async () => {
        const dynamics = await softSection('dynamics', partialErrors, () =>
          loadDynamics(userId, characterId, identity.name),
        );
        if (dynamics) sections.dynamics = dynamics as Record<string, unknown>;
      })(),
    );
  }

  await Promise.all(tasks);

  return {
    characterId,
    subject,
    generatedAt: new Date().toISOString(),
    sections,
    ...(Object.keys(partialErrors).length > 0 ? { partialErrors } : {}),
  };
}
