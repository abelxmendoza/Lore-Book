/**
 * Dynamic character blurbs — witty, context-aware one-liners from lore, attributes, and ontology.
 */
import { parseCharacterName } from '../../utils/characterNameMatching';
import { discoverEntities } from '../ontology/lexicalIntelligence';
import { entityAttributeDetector, type DetectedAttribute } from '../conversationCentered/entityAttributeDetector';
import { entityFactsService } from '../entityFactsService';
import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

export type CharacterBlurb = {
  wittyTagline: string;
  profileSummary: string;
  contextHooks: string[];
  ontologyTags: string[];
};

type BlurbContext = {
  name: string;
  realName?: string;
  isSelf: boolean;
  role?: string;
  archetype?: string;
  summary?: string;
  attributes: DetectedAttribute[];
  factTexts: string[];
  memorySnippets: string[];
  ontologyTags: string[];
};

function stableIndex(seed: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h + seed.charCodeAt(i) * (i + 1)) % mod;
  return h;
}

const PROTAGONIST_HOOK_RULES: Array<{ pattern: RegExp; hook: string }> = [
  { pattern: /\binterview\b/, hook: 'has an interview on the horizon' },
  { pattern: /\bepirus\b/, hook: 'Epirus enters the chat' },
  { pattern: /\brobot|robotics|ros2|px4|jetson\b/, hook: 'runs on caffeine and firmware' },
  { pattern: /\bamazon\b/, hook: 'speaks fluent warehouse diagnostics' },
  { pattern: /\bresume\b/, hook: 'resume lore unlocked' },
  { pattern: /\bunemploy|between jobs|gap\b/, hook: 'between-arc transition era' },
  { pattern: /\bdeploy|field\b/, hook: 'field-ops protagonist energy' },
];

const CHARACTER_HOOK_RULES: Array<{ pattern: RegExp; hook: string }> = [
  { pattern: /\bfamily|relative|cousin|sibling\b/, hook: 'family tree material' },
  { pattern: /\bvisit|visited|reunion|holiday\b/, hook: 'shows up for the good scenes' },
  { pattern: /\bcall|called|texted|messaged\b/, hook: 'keeps in touch off-screen' },
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildMentionPattern(names: string[]): RegExp | null {
  const terms = [...new Set(names.map((n) => n.trim()).filter((n) => n.length >= 2))];
  if (terms.length === 0) return null;
  return new RegExp(`\\b(?:${terms.map(escapeRegExp).join('|')})\\b`, 'i');
}

function textMentionsCharacter(text: string, mentionPattern: RegExp | null): boolean {
  if (!mentionPattern || !text.trim()) return false;
  return mentionPattern.test(text);
}

function extractContextHooks(
  texts: string[],
  options: { isSelf: boolean; kinshipRole?: string | null }
): string[] {
  const hooks = new Set<string>();
  const blob = texts.join(' ').toLowerCase();
  const rules = options.isSelf
    ? PROTAGONIST_HOOK_RULES
    : options.kinshipRole
      ? CHARACTER_HOOK_RULES
      : CHARACTER_HOOK_RULES.filter((rule) => rule.hook !== 'family tree material');

  for (const rule of rules) {
    if (rule.pattern.test(blob)) hooks.add(rule.hook);
  }

  return [...hooks].slice(0, 4);
}

function attrValues(attributes: DetectedAttribute[], ...types: string[]): string[] {
  return attributes
    .filter((a) => a.isCurrent && types.includes(a.attributeType))
    .map((a) => a.attributeValue)
    .filter(Boolean);
}

function composeWittyTagline(ctx: BlurbContext): string {
  const label = ctx.realName || ctx.name;
  const occupation = attrValues(ctx.attributes, 'occupation', 'job', 'title')[0];
  const workplace = attrValues(ctx.attributes, 'workplace', 'company')[0];
  const school = attrValues(ctx.attributes, 'school', 'education')[0];
  const trait = attrValues(ctx.attributes, 'personality_trait')[0];
  const hooks = ctx.contextHooks;
  const hook = hooks[stableIndex(label, Math.max(hooks.length, 1))] ?? hooks[0];

  if (ctx.isSelf) {
    const openers = [
      'Main character energy:',
      'Protagonist log, entry:',
      'LoreBook canon confirms:',
      'Your saga, summarized:',
    ];
    const cores = [
      occupation && workplace
        ? `${occupation} at ${workplace}`
        : occupation
          ? occupation
          : school
            ? `scholar of ${school}`
            : 'builder of timelines and trouble',
    ];
    const closers = [
      hook ? `${hook}.` : 'still collecting plot twists.',
      'attributes syncing from chat, journal, and resume.',
      'certified protagonist — side quests optional.',
      'the one the assistant is legally required to remember.',
    ];
    const o = stableIndex(label, openers.length);
    const c = stableIndex(`${label}-close`, closers.length);
    return `${openers[o]} ${cores[0]} — ${closers[c]}`;
  }

  const archetype = (ctx.archetype || 'character').replace(/_/g, ' ');
  const templates = [
    () =>
      `${label}: ${ctx.role || archetype} — ${trait ? `${trait} vibes` : 'mystery aura'}${hook ? `, and ${hook}` : ''}.`,
    () =>
      `If this were a sitcom, ${label} would be the ${archetype} who ${occupation ? `works as ${occupation}` : 'steals every scene'}.`,
    () =>
      `${label} — ${workplace ? `seen at ${workplace}` : 'location TBD'}${trait ? `, rumored to be ${trait.toLowerCase()}` : ''}.`,
    () =>
      `LoreBook filing: ${label}, ${archetype}${hook ? `; note: ${hook}` : ''}.`,
  ];
  return templates[stableIndex(label, templates.length)]();
}

function composeProfileSummary(ctx: BlurbContext): string {
  const parts: string[] = [];
  const occupation = attrValues(ctx.attributes, 'occupation', 'job')[0];
  const workplace = attrValues(ctx.attributes, 'workplace', 'company')[0];
  const school = attrValues(ctx.attributes, 'school', 'education', 'degree')[0];
  const city = attrValues(ctx.attributes, 'current_city', 'hometown', 'living_situation')[0];

  if (occupation) parts.push(`Works as ${occupation}${workplace ? ` at ${workplace}` : ''}`);
  if (school) parts.push(`Education: ${school}`);
  if (city) parts.push(`Based in ${city}`);
  for (const hook of ctx.contextHooks.slice(0, 2)) parts.push(hook);

  if (parts.length === 0 && ctx.summary?.trim()) return ctx.summary.trim().slice(0, 280);
  if (parts.length === 0) {
    return ctx.isSelf
      ? 'Your story grows with every chat — upload a resume or keep talking to fill this in.'
      : `${ctx.name} is still being written into your lore.`;
  }
  return parts.join(' · ');
}

function buildBlurb(ctx: BlurbContext & { kinshipRole?: string | null }): CharacterBlurb {
  const contextHooks = extractContextHooks(
    [...ctx.memorySnippets, ...ctx.factTexts, ctx.summary ?? '', ctx.role ?? ''],
    { isSelf: ctx.isSelf, kinshipRole: ctx.kinshipRole }
  );

  return {
    wittyTagline: composeWittyTagline({ ...ctx, contextHooks }),
    profileSummary: composeProfileSummary({ ...ctx, contextHooks }),
    contextHooks,
    ontologyTags: ctx.ontologyTags,
  };
}

async function loadCharacterMemorySnippets(
  userId: string,
  characterId: string,
  names: string[]
): Promise<string[]> {
  const snippets: string[] = [];
  const mentionPattern = buildMentionPattern(names);

  const { data: charMemories } = await supabaseAdmin
    .from('character_memories')
    .select('summary')
    .eq('character_id', characterId)
    .order('created_at', { ascending: false })
    .limit(20);

  for (const memory of charMemories ?? []) {
    if (typeof memory.summary === 'string' && memory.summary.trim()) {
      snippets.push(memory.summary.trim());
    }
  }

  const { data: journals } = await supabaseAdmin
    .from('journal_entries')
    .select('content, summary')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .limit(80);

  for (const entry of journals ?? []) {
    const text = [entry.summary, entry.content].filter(Boolean).join(' ').trim();
    if (!text || !textMentionsCharacter(text, mentionPattern)) continue;
    snippets.push(text);
    if (snippets.length >= 12) break;
  }

  return snippets.slice(0, 12);
}

class CharacterBlurbService {
  async buildForCharacter(
    userId: string,
    characterId: string,
    options?: { isSelf?: boolean }
  ): Promise<CharacterBlurb | null> {
    const { data: character, error } = await supabaseAdmin
      .from('characters')
      .select('id, name, alias, role, archetype, summary, metadata')
      .eq('id', characterId)
      .eq('user_id', userId)
      .single();

    if (error || !character) return null;

    const metadata = (character.metadata as Record<string, unknown>) ?? {};
    const isSelf =
      options?.isSelf ??
      Boolean(metadata.is_self || metadata.is_user || /^me$/i.test(character.name));
    const parsedName = parseCharacterName(character.name);
    const mentionNames = [character.name, ...(Array.isArray(character.alias) ? character.alias : [])].filter(
      (name): name is string => typeof name === 'string' && name.trim().length > 0
    );

    const [attributes, facts, memorySnippets] = await Promise.all([
      entityAttributeDetector.getEntityAttributes(userId, characterId, 'character', true),
      entityFactsService.getEntityFacts(userId, characterId, 'character'),
      loadCharacterMemorySnippets(userId, characterId, mentionNames),
    ]);

    const corpus = [
      character.name,
      character.role ?? '',
      character.summary ?? '',
      ...memorySnippets,
      ...facts.map((f) => f.fact),
      ...attributes.map((a) => `${a.attributeType} ${a.attributeValue}`),
    ].join(' ');

    const discovered = discoverEntities(corpus);
    const ontologyTags = [
      ...new Set(discovered.map((d) => d.surface || d.name).filter(Boolean)),
    ].slice(0, 12);

    return buildBlurb({
      name: character.name,
      realName: typeof metadata.real_name === 'string' ? metadata.real_name : undefined,
      isSelf,
      kinshipRole: parsedName.kinshipRole,
      role: character.role ?? undefined,
      archetype: character.archetype ?? undefined,
      summary: character.summary ?? undefined,
      attributes,
      factTexts: facts.filter((f) => f.status === 'active').map((f) => f.fact),
      memorySnippets,
      ontologyTags,
    });
  }

  async refreshAndPersist(userId: string, characterId: string, options?: { isSelf?: boolean }): Promise<CharacterBlurb | null> {
    const blurb = await this.buildForCharacter(userId, characterId, options);
    if (!blurb) return null;

    const { data: existing } = await supabaseAdmin
      .from('characters')
      .select('metadata, summary')
      .eq('id', characterId)
      .eq('user_id', userId)
      .single();

    const metadata = {
      ...((existing?.metadata as Record<string, unknown>) ?? {}),
      witty_tagline: blurb.wittyTagline,
      character_blurb: blurb.wittyTagline,
      profile_summary: blurb.profileSummary,
      ontology_tags: blurb.ontologyTags,
      context_hooks: blurb.contextHooks,
      blurb_updated_at: new Date().toISOString(),
    };

    const summary =
      (typeof existing?.summary === 'string' && existing.summary.trim()) || blurb.profileSummary;

    const { error } = await supabaseAdmin
      .from('characters')
      .update({
        metadata,
        summary,
        updated_at: new Date().toISOString(),
      })
      .eq('id', characterId)
      .eq('user_id', userId);

    if (error) {
      logger.warn({ error, characterId }, 'Failed to persist character blurb');
    }

    return blurb;
  }
}

export const characterBlurbService = new CharacterBlurbService();
