/**
 * Pre-LLM lore compilation for chat — deterministic lexical + certified index pass.
 * Runs before any OpenAI call so the model receives structured, deduped context.
 */

import type { CertifiedEntity, CertifiedEntityType } from '../types/certifiedEntity';
import type { CertifiedEntityMatch } from './certifiedEntityMatch';
import {
  buildEntityMatchIndex,
  matchCertifiedEntitiesWithIndex,
} from './certifiedEntityMatch';
import { detectDraftEntitiesInText } from './draftEntityDetect';
import { buildDemoCertifiedIndex } from './demoCertifiedIndex';
import {
  analyzeLexicalOntology,
  discoverLexicalRelationshipHints,
  type LexicalOntologyHit,
} from './lexicalEntityDetect';

export type ChatLoreIntent =
  | 'recall'
  | 'journal'
  | 'character_extract'
  | 'emotional'
  | 'general';

export type CompiledEntityMention = {
  id: string;
  name: string;
  type: CertifiedEntityType;
  status: 'confirmed' | 'draft';
  source: 'certified' | 'lexical' | 'fallback';
};

export type ChatLoreContext = {
  message: string;
  confirmed: CompiledEntityMention[];
  drafts: CompiledEntityMention[];
  entities: CompiledEntityMention[];
  ontologyHits: LexicalOntologyHit[];
  relationshipHints: string[];
  priorMentionedNames: string[];
  threadDominantEntities: string[];
  intent: ChatLoreIntent;
  subtitle: string;
  /** Compact structured block for LLM system/context injection. */
  loreBrief: string;
  stats: {
    confirmedCount: number;
    draftCount: number;
    ontologyHitCount: number;
    priorMentionCount: number;
  };
};

export type CompileChatLoreContextOptions = {
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  certifiedIndex?: CertifiedEntity[];
  /** Demo-only fallback when index is empty (legacy seed entities). */
  fallbackEntities?: Array<{
    pattern: RegExp;
    id: string;
    name: string;
    type: CertifiedEntityType;
  }>;
  historyWindow?: number;
};

const DEFAULT_HISTORY_WINDOW = 6;

function entityKey(type: string, name: string): string {
  return `${type}:${name.toLowerCase().trim()}`;
}

function matchToCompiled(
  match: CertifiedEntityMatch,
  source: CompiledEntityMention['source'],
): CompiledEntityMention {
  return {
    id: match.id,
    name: match.name,
    type: match.type,
    status: match.status === 'draft' ? 'draft' : 'confirmed',
    source,
  };
}

function mergeEntityMentions(
  confirmed: CompiledEntityMention[],
  drafts: CompiledEntityMention[],
  fallbacks: CompiledEntityMention[] = [],
): CompiledEntityMention[] {
  const byKey = new Map<string, CompiledEntityMention>();
  for (const entity of [...confirmed, ...drafts, ...fallbacks]) {
    const key = entityKey(entity.type, entity.name);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, entity);
      continue;
    }
    // Prefer confirmed certified over draft/fallback.
    if (existing.status === 'draft' && entity.status === 'confirmed') {
      byKey.set(key, entity);
    }
  }
  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function detectChatLoreIntent(message: string): ChatLoreIntent {
  const lower = message.toLowerCase();
  if (/remember|recall|what do you know|what did i|did you save|do you remember/.test(lower)) {
    return 'recall';
  }
  if (/log this|save this|remember this|journal/.test(lower)) return 'journal';
  if (/villain|character|who is|tell me about/.test(lower)) return 'character_extract';
  if (/feel|felt|anxious|excited|overwhelmed|happy|sad|stress/.test(lower)) return 'emotional';
  return 'general';
}

export function deriveChatThreadSubtitle(text: string): string {
  const lower = text.toLowerCase();
  if (/love|date|relationship|alex|partner|crush|girlfriend|boyfriend/.test(lower)) {
    return 'Relationships';
  }
  if (/job|career|work|resume|role|company|employed|hiring/.test(lower)) return 'Career thread';
  if (/family|cousin|mom|dad|t[ií]a|aunt|uncle|abuela|abuelo/.test(lower)) return 'Family context';
  if (/project|build|ship|launch|skill|learning|training/.test(lower)) return 'Projects';
  return 'Life log';
}

function detectEntitiesInText(
  text: string,
  index: CertifiedEntity[],
  fallbackEntities: CompileChatLoreContextOptions['fallbackEntities'],
): { confirmed: CompiledEntityMention[]; drafts: CompiledEntityMention[]; fallbacks: CompiledEntityMention[] } {
  const matchIndex = buildEntityMatchIndex(index);
  const certifiedMatches = matchCertifiedEntitiesWithIndex(text, matchIndex);
  const draftMatches = detectDraftEntitiesInText(text, index, certifiedMatches);

  const confirmed = certifiedMatches.map((m) => matchToCompiled(m, 'certified'));
  const drafts = draftMatches.map((m) => matchToCompiled(m, 'lexical'));

  const mergedKeys = new Set([
    ...confirmed.map((e) => entityKey(e.type, e.name)),
    ...drafts.map((e) => entityKey(e.type, e.name)),
  ]);

  const fallbacks: CompiledEntityMention[] = [];
  if (fallbackEntities?.length) {
    for (const entity of fallbackEntities) {
      if (!entity.pattern.test(text)) continue;
      const key = entityKey(entity.type, entity.name);
      if (mergedKeys.has(key)) continue;
      fallbacks.push({
        id: entity.id,
        name: entity.name,
        type: entity.type,
        status: 'confirmed',
        source: 'fallback',
      });
    }
  }

  return { confirmed, drafts, fallbacks };
}

/** Collect entity names from recent conversation for multi-turn continuity. */
export function collectPriorMentionedNames(
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  index: CertifiedEntity[],
  window = DEFAULT_HISTORY_WINDOW,
  fallbackEntities?: CompileChatLoreContextOptions['fallbackEntities'],
): string[] {
  const recent = history.slice(-window);
  const combined = recent.map((m) => m.content).join('\n');
  if (!combined.trim()) return [];

  const { confirmed, drafts, fallbacks } = detectEntitiesInText(combined, index, fallbackEntities);
  const names = new Set<string>();
  for (const entity of [...confirmed, ...drafts, ...fallbacks]) {
    names.add(entity.name);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

export function buildLoreBrief(ctx: Pick<
  ChatLoreContext,
  'entities' | 'ontologyHits' | 'relationshipHints' | 'priorMentionedNames' | 'intent' | 'subtitle'
>): string {
  const lines: string[] = [];

  if (ctx.entities.length > 0) {
    const entityLine = ctx.entities
      .map((e) => `${e.name} (${e.type}${e.status === 'draft' ? ', draft' : ''})`)
      .join('; ');
    lines.push(`ENTITIES: ${entityLine}`);
  }

  if (ctx.ontologyHits.length > 0) {
    const hitLine = ctx.ontologyHits
      .slice(0, 8)
      .map((h) => `${h.name} [${h.category}]`)
      .join('; ');
    lines.push(`ONTOLOGY: ${hitLine}`);
  }

  if (ctx.relationshipHints.length > 0) {
    lines.push(`RELATIONSHIPS: ${ctx.relationshipHints.join(', ')}`);
  }

  const priorOnly = ctx.priorMentionedNames.filter(
    (name) => !ctx.entities.some((e) => e.name.toLowerCase() === name.toLowerCase()),
  );
  if (priorOnly.length > 0) {
    lines.push(`PRIOR_THREAD: ${priorOnly.join(', ')}`);
  }

  lines.push(`INTENT: ${ctx.intent}`);
  lines.push(`THREAD: ${ctx.subtitle}`);

  return lines.join('\n');
}

/** Full pre-LLM lore pass — certified index, lexical drafts, ontology, thread memory. */
export function compileChatLoreContext(
  message: string,
  options: CompileChatLoreContextOptions = {},
): ChatLoreContext {
  const index = options.certifiedIndex ?? buildDemoCertifiedIndex();
  const history = options.conversationHistory ?? [];
  const historyWindow = options.historyWindow ?? DEFAULT_HISTORY_WINDOW;

  const { confirmed, drafts, fallbacks } = detectEntitiesInText(
    message,
    index,
    options.fallbackEntities,
  );
  const entities = mergeEntityMentions(confirmed, drafts, fallbacks);

  const ontologyHits = analyzeLexicalOntology(message);
  const relationshipHints = discoverLexicalRelationshipHints(message);
  const priorMentionedNames = collectPriorMentionedNames(
    history,
    index,
    historyWindow,
    options.fallbackEntities,
  );

  const recentText = [...history.slice(-historyWindow), { role: 'user' as const, content: message }]
    .map((m) => m.content)
    .join(' ');
  const threadScan = detectEntitiesInText(recentText, index, options.fallbackEntities);
  const threadDominantEntities = mergeEntityMentions(
    threadScan.confirmed,
    threadScan.drafts,
    threadScan.fallbacks,
  )
    .slice(0, 3)
    .map((e) => e.name);

  const intent = detectChatLoreIntent(message);
  const subtitle = deriveChatThreadSubtitle(recentText);

  const partial = {
    entities,
    ontologyHits,
    relationshipHints,
    priorMentionedNames,
    intent,
    subtitle,
  };

  return {
    message,
    confirmed,
    drafts,
    entities,
    ontologyHits,
    relationshipHints,
    priorMentionedNames,
    threadDominantEntities,
    intent,
    subtitle,
    loreBrief: buildLoreBrief(partial),
    stats: {
      confirmedCount: confirmed.length,
      draftCount: drafts.length,
      ontologyHitCount: ontologyHits.length,
      priorMentionCount: priorMentionedNames.length,
    },
  };
}

/** Map compiled entities to chat message metadata shape. */
export function toMessageMentionedEntities(
  entities: CompiledEntityMention[],
): Array<{ id: string; name: string; type: CertifiedEntityType }> {
  return entities.map(({ id, name, type }) => ({ id, name, type }));
}
