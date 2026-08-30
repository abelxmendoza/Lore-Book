/**
 * Explicit "make a group / here's the roster" chat writes — create or update an
 * organization and attach members, instead of the prompt-only "I'll set that
 * up" acknowledgment that never persisted (see characterBookWriteService).
 */

import { randomUUID } from 'crypto';
import { isOrganizationGroupFollowUpRequest } from '@lorebook/api-contracts';
import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { characterRegistry } from '../characterRegistry';
import { organizationService } from '../organizationService';
import { classifyGroup } from '../ontology/groupIntelligence';
import { groupDetectionService } from '../groupDetectionService';
import { stripPersonNameEpithet } from '../../utils/personNameEpithet';
import {
  isAppSurfacePersonName,
  isCollectivePersonName,
} from '../../utils/personNameValidation';
import { GROUP_WRITE_MEMBER_NAME_CAP } from '../query/bookQuerySourceCaps';

export type GroupWriteMemberOutcome = {
  name: string;
  outcome: 'added' | 'already_member' | 'created_and_added' | 'failed';
  characterId?: string;
  detail: string;
};

export type GroupWriteResult = {
  organizationId: string;
  organizationName: string;
  created: boolean;
  /** Renamed via an explicit reply to "what do you want to name it?" */
  renamed: boolean;
  /** Deleted via chat "delete the group X" */
  deleted?: boolean;
  members: GroupWriteMemberOutcome[];
  summary: string;
};

export type OrganizationRelationshipWriteIntent = {
  fromName: string;
  toName: string;
  relationshipType: 'part_of' | 'affiliated_with';
  action: 'upsert' | 'remove';
  childKind?: 'team' | 'company';
  locationName?: string;
};

export type OrganizationSiteWriteIntent = {
  organizationName: string;
  locationName: string;
};

function cleanOrganizationName(value: string): string {
  return value
    .trim()
    .replace(/^["'“”‘’]+|["'“”‘’.,!?]+$/g, '')
    .replace(/^(?:the|my|our)\s+/i, '')
    .trim();
}

const HIERARCHY_NOUN = 'subgroup|department|division|branch|team|child group|job|role|position';

/** Explicit "add this place as a company site" without creating a nested group. */
export function parseOrganizationSiteWrite(message: string): OrganizationSiteWriteIntent | null {
  const text = message.trim();
  const addSite = text.match(
    /^(?:please\s+)?(?:add|make)\s+(.{1,80}?)\s+(?:as\s+)?(?:a\s+)?(?:location|site|office|lab|warehouse|depot)\s+(?:of|for|under)\s+(.{1,80}?)[.!?]*$/i,
  );
  if (addSite) {
    const locationName = cleanOrganizationName(addSite[1]);
    const organizationName = cleanOrganizationName(addSite[2]);
    if (locationName && organizationName && locationName.toLowerCase() !== organizationName.toLowerCase()) {
      return { organizationName, locationName };
    }
  }
  const hasSite = text.match(
    /^(.{1,80}?)\s+has\s+(?:a\s+|an\s+)?(?:location|site|office|lab|warehouse|depot)\s+(?:in|at|called)\s+(.{1,80}?)[.!?]*$/i,
  );
  if (hasSite) {
    const organizationName = cleanOrganizationName(hasSite[1]);
    const locationName = cleanOrganizationName(hasSite[2]);
    if (locationName && organizationName && locationName.toLowerCase() !== organizationName.toLowerCase()) {
      return { organizationName, locationName };
    }
  }
  return null;
}

/** Explicit hierarchy/connection edits routed through organization chat write. */
export function parseOrganizationRelationshipWrite(message: string): OrganizationRelationshipWriteIntent | null {
  const text = message.trim();
  if (/^(?:i|we)\s+belong\s+to\b/i.test(text) || /^(?:i(?:'m|\s+am)|we(?:'re|\s+are))\s+close\s+to\b/i.test(text)) {
    return null;
  }
  const names = (left: string, right: string) => {
    const fromName = cleanOrganizationName(left);
    const toName = cleanOrganizationName(right);
    if (!fromName || !toName || fromName.toLowerCase() === toName.toLowerCase()) return null;
    return { fromName, toName };
  };

  const disconnect = text.match(
    /^(?:please\s+)?(?:disconnect|unlink)\s+(.{1,80}?)\s+from\s+(.{1,80}?)[.!?]*$/i,
  );
  if (disconnect) {
    const pair = names(disconnect[1], disconnect[2]);
    if (pair) return { ...pair, relationshipType: 'affiliated_with', action: 'remove' };
  }

  const nestedAtSite = [
    new RegExp(
      `^(?:please\\s+)?(?:make|mark|set)\\s+(.{1,80}?)\\s+(?:as\\s+|a\\s+|the\\s+)?(?:${HIERARCHY_NOUN})\\s+at\\s+(?:the\\s+)?(.{1,80}?)\\s+(?:of|under|inside|within)\\s+(.{1,80}?)[.!?]*$`,
      'i',
    ),
    new RegExp(
      `^(.{1,80}?)\\s+(?:is|should be)\\s+(?:a\\s+|the\\s+)?(?:${HIERARCHY_NOUN})\\s+at\\s+(?:the\\s+)?(.{1,80}?)\\s+(?:of|under|inside|within)\\s+(.{1,80}?)[.!?]*$`,
      'i',
    ),
    /^(.{1,80}?)\s+(?:belongs|sits|rolls up)\s+(?:to|under)\s+(.{1,80}?)\s+at\s+(?:the\s+)?(.{1,80}?)[.!?]*$/i,
  ];
  for (const pattern of nestedAtSite) {
    const match = text.match(pattern);
    if (!match) continue;
    const locationLast = pattern === nestedAtSite[2];
    const fromName = match[1];
    const locationName = locationLast ? match[3] : match[2];
    const toName = locationLast ? match[2] : match[3];
    const pair = names(fromName, toName);
    const site = cleanOrganizationName(locationName);
    if (pair && site) {
      return { ...pair, relationshipType: 'part_of', action: 'upsert', childKind: 'team', locationName: site };
    }
  }

  const hierarchyPatterns = [
    new RegExp(
      `^(?:please\\s+)?(?:make|mark|set)\\s+(.{1,80}?)\\s+(?:as\\s+|a\\s+|the\\s+)?(?:${HIERARCHY_NOUN})\\s+(?:of|under|inside|within|at|with)\\s+(.{1,80}?)[.!?]*$`,
      'i',
    ),
    new RegExp(
      `^(.{1,80}?)\\s+(?:is|should be)\\s+(?:a\\s+|the\\s+)?(?:${HIERARCHY_NOUN})\\s+(?:of|under|inside|within|at|with|for)\\s+(.{1,80}?)[.!?]*$`,
      'i',
    ),
    /^(.{1,80}?)\s+(?:belongs|sits|rolls up)\s+(?:to|under|inside|within)\s+(.{1,80}?)[.!?]*$/i,
  ];
  for (const pattern of hierarchyPatterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const pair = names(match[1], match[2]);
    if (pair) return { ...pair, relationshipType: 'part_of', action: 'upsert', childKind: 'team' };
  }

  const connected = text.match(
    /^(?:please\s+)?(?:connect|link)\s+(.{1,80}?)\s+(?:to|with|and)\s+(.{1,80}?)[.!?]*$/i,
  );
  if (connected) {
    const pair = names(connected[1], connected[2]);
    if (pair) return { ...pair, relationshipType: 'affiliated_with', action: 'upsert' };
  }
  return null;
}

const CLASSIFY_TYPE_TOKEN: Record<string, string> = {
  family: 'family',
  household: 'household',
  company: 'company',
  employer: 'company',
  workplace: 'company',
  crew: 'crew',
  band: 'band',
  club: 'club',
  community: 'community',
  scene: 'scene',
  team: 'team',
  'sports team': 'sports_team',
  'friend group': 'friend_group',
  nonprofit: 'nonprofit',
  institution: 'institution',
  school: 'institution',
  brand: 'brand',
  vendor: 'vendor',
  software: 'software',
  collective: 'collective',
  'martial arts': 'martial_arts',
  'public entity': 'public_entity',
};

const CLASSIFY_STANCE_RELATIONSHIP: Record<string, string> = {
  mine: 'member',
  'close to': 'adjacent',
  'their world': 'aware_of',
  mentioned: 'referenced',
};

const CLASSIFY_MEMBERSHIP_TOKEN: Record<string, string> = {
  member: 'member',
  founder: 'founder',
  leader: 'leader',
  alumnus: 'alumnus',
  fan: 'fan',
  collaborator: 'collaborator',
};

export type OrganizationClassificationWriteIntent = {
  name: string;
  groupType?: string;
  userRelationship?: string;
  usesFocusName?: boolean;
};

function classificationName(raw: string): string {
  return cleanOrganizationName(
    raw
      .replace(/\b(?:this|that|the)\s+(?:group|crew|org(?:anization)?)\b/gi, 'this')
      .replace(/\bnot\s+(?:a\s+|an\s+)?[a-z][a-z\s]{0,24}$/i, ''),
  );
}

export function parseOrganizationClassificationWrite(message: string): OrganizationClassificationWriteIntent | null {
  const text = message.trim();
  if (!text) return null;
  if (parseOrganizationRelationshipWrite(text) || parseOrganizationSiteWrite(text)) return null;

  const stance = text.match(
    /^(?:please\s+)?(?:put|move|mark|set)\s+(.{1,80}?)\s+(?:in(?:to)?|as|under)\s+(?:the\s+)?(mine|close to|their world|mentioned)[.!?]*$/i,
  );
  if (stance) {
    const name = classificationName(stance[1]);
    const userRelationship = CLASSIFY_STANCE_RELATIONSHIP[stance[2].toLowerCase()];
    if (name && userRelationship) return { name, userRelationship, usesFocusName: /^(this|it)$/i.test(name) };
  }

  const belong = text.match(/^(?:please\s+)?i\s+belong\s+to\s+(.{1,80}?)[.!?]*$/i);
  if (belong) {
    const name = classificationName(belong[1]);
    if (name) return { name, userRelationship: 'member', usesFocusName: /^(this|it)$/i.test(name) };
  }

  const closeTo = text.match(/^(?:please\s+)?i(?:'m|\s+am)\s+close\s+to\s+(.{1,80}?)[.!?]*$/i);
  if (closeTo) {
    const name = classificationName(closeTo[1]);
    if (name) return { name, userRelationship: 'adjacent', usesFocusName: /^(this|it)$/i.test(name) };
  }

  const former = text.match(
    /^(?:please\s+)?i\s+used\s+to\s+(?:be\s+(?:in|a member of)|belong to)\s+(.{1,80}?)[.!?]*$/i,
  );
  if (former) {
    const name = classificationName(former[1]);
    if (name) return { name, userRelationship: 'former_member', usesFocusName: /^(this|it)$/i.test(name) };
  }

  const membership = text.match(
    /^(?:please\s+)?(?:i(?:'m|\s+am)?|we(?:'re|\s+are)?)\s+(?:a\s+)?(member|founder|leader|alumnus|fan|collaborator)\s+(?:of|at|with)\s+(.{1,80}?)[.!?]*$/i,
  );
  if (membership) {
    const name = classificationName(membership[2]);
    const userRelationship = CLASSIFY_MEMBERSHIP_TOKEN[membership[1].toLowerCase()];
    if (name && userRelationship) return { name, userRelationship, usesFocusName: /^(this|it)$/i.test(name) };
  }

  const typeNoun = Object.keys(CLASSIFY_TYPE_TOKEN).sort((a, b) => b.length - a.length).join('|');
  const mark = text.match(
    new RegExp(
      `^(?:please\\s+)?(?:mark|set|make|classify)\\s+(.{1,80}?)\\s+(?:as\\s+)?(?:a\\s+|an\\s+|the\\s+)?(${typeNoun})\\b`,
      'i',
    ),
  );
  if (mark) {
    const groupType = CLASSIFY_TYPE_TOKEN[mark[2].trim().toLowerCase()];
    const name = classificationName(mark[1]);
    if (name && groupType) return { name, groupType, usesFocusName: /^(this|it)$/i.test(name) };
  }

  const isType = text.match(
    new RegExp(
      `^(.{1,80}?)\\s+(?:is|should be)\\s+(?:a\\s+|an\\s+|the\\s+)?(${typeNoun})\\b`,
      'i',
    ),
  );
  if (isType) {
    const groupType = CLASSIFY_TYPE_TOKEN[isType[2].trim().toLowerCase()];
    const name = classificationName(isType[1]);
    if (name && groupType) return { name, groupType, usesFocusName: /^(this|it)$/i.test(name) };
  }

  return null;
}

const PENDING_META_KEY = 'pendingGroupWrite';

function titleCaseWords(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((w) =>
      w
        .split('-')
        .map((seg) => (seg ? seg.charAt(0).toUpperCase() + seg.slice(1) : seg))
        .join('-'),
    )
    .join(' ');
}

/** "What do you want to name it?" / "anything specific you want to name the group?" */
const NAMING_QUESTION_RE =
  /\b(?:what|anything(?:\s+specific)?)\s+(?:do you\s+|you\s+)?want to (?:name|call)\s+(?:it|the group|the crew|the squad)\b/i;

/**
 * True when the assistant just asked what to name the pending group and this
 * message is a short, bare reply answering it (not itself a "make a group"
 * request or a member roster — those are handled by their own branches).
 */
export function isReplyToGroupNamingPrompt(
  message: string,
  history: Array<{ role: string; content: string }>,
): boolean {
  const text = message.trim();
  if (!text || text.split(/\s+/).length > 6) return false;
  const lastAssistant = [...history].reverse().find((m) => m.role === 'assistant');
  if (!lastAssistant || !NAMING_QUESTION_RE.test(lastAssistant.content)) return false;
  if (extractListedMemberNames(text).length >= 2) return false;
  return true;
}

/** Pull name tokens from "So far we have A, B, and C" / "members: A, B". */
export function extractListedMemberNames(message: string): string[] {
  const text = message.trim();
  if (!text) return [];
  let rest = text;
  const cue = text.match(
    /\b(?:so far we have|here(?:'s| is) the roster|roster(?:\s+is|:)|members?(?:\s+are|\s+include|:)|the members)\s*/i,
  );
  const addToGroup = text.match(
    /\badd\s+(.+?)\s+(?:to|into)\s+(?:the|that|this|my)\s+(?:group|crew|squad|org(?:anization)?)\b/i,
  );
  const hasBareCommaList = text.includes(',');
  if (!cue && !addToGroup && !hasBareCommaList) return [];

  if (cue && cue.index != null) {
    rest = text.slice(cue.index + cue[0].length);
  } else if (addToGroup?.[1]) {
    rest = addToGroup[1];
  }
  rest = rest
    .replace(/\b(?:to|into)\s+(?:the|that|this|my)\s+(?:group|crew|squad).*$/i, '')
    .replace(/[.!?].*$/, '')
    .trim();

  const parts = rest
    .split(/\s*,\s*(?:and\s+)?|\s+and\s+/i)
    .map((p) => p.trim().replace(/^[@#]+/, '').replace(/^and\s+/i, ''))
    .filter(Boolean);

  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of parts) {
    if (out.length >= GROUP_WRITE_MEMBER_NAME_CAP) break;
    if (part.length < 2) continue;
    if (/^(also|too|etc|now|well|so|far|we|have|the|a|an|group|crew)$/i.test(part)) continue;
    if (!/[A-Za-z]/.test(part)) continue;
    if (isAppSurfacePersonName(part) || isCollectivePersonName(part)) continue;
    const key = part.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(part);
  }
  return out;
}

/**
 * A follow-up such as "can you make the group now?" or "make cards for the
 * individual characters" refers back to the roster the user already supplied.
 * Only recover an explicitly list-shaped earlier user message.
 */
export function recoverListedMemberNamesFromHistory(
  message: string,
  history: Array<{ role: string; content: string }>,
): string[] {
  const refersToPriorRoster =
    isOrganizationGroupFollowUpRequest(message, history) ||
    /\b(?:individual|listed|those|these)\s+(?:characters?|people|members?)\b/i.test(message) ||
    /\bcharacters?\s+(?:should|need to)\s+have\s+(?:character\s+)?(?:cards?|modals?)\b/i.test(
      message,
    );
  if (!refersToPriorRoster) return [];

  for (const item of [...history].reverse()) {
    if (item.role !== 'user') continue;
    const names = extractListedMemberNames(item.content);
    if (names.length >= 2) return names;
  }
  return [];
}

export function resolveGroupWriteMemberNames(
  message: string,
  history: Array<{ role: string; content: string }>,
): string[] {
  const current = extractListedMemberNames(message);
  return current.length > 0
    ? current
    : recoverListedMemberNamesFromHistory(message, history);
}

export function inferGroupNameFromContext(
  message: string,
  history: Array<{ role: string; content: string }> = [],
  threadTitle?: string | null,
): string {
  const forNamed = message.match(
    /\b(?:group|crew|squad|collective)\s+for\s+(?!that\b|this\b|them\b|her\b|him\b|those\b|these\b)(.+?)(?:[.!?]|$)/i,
  );
  if (forNamed?.[1]?.trim()) {
    return titleCaseWords(forNamed[1].trim().replace(/\bgroup\b/i, '').trim() || forNamed[1]);
  }

  const called = message.match(
    /\b(?:call(?:ed)?|named?|name it)\s+["']?([A-Za-z0-9][\w\s'’-]{1,60})["']?/i,
  );
  if (called?.[1]?.trim()) return titleCaseWords(called[1]);

  const blob = [...history.map((m) => m.content), message].join('\n');
  if (/\be-?girls?\b/i.test(blob)) return 'Popular E-Girls';
  if (/\bgoths?\b/i.test(blob) || /\blos goths\b/i.test(blob)) return 'Los Goths';
  if (/\bbaby bats\b/i.test(blob) && /\bcrew|group|squad\b/i.test(blob)) return 'Baby Bats Crew';

  if (threadTitle?.trim() && !/^new chat$/i.test(threadTitle.trim())) {
    return titleCaseWords(threadTitle.trim());
  }

  return 'Untitled Group';
}

async function ensureCharacter(
  userId: string,
  rawName: string,
): Promise<{ id: string; name: string; created: boolean } | null> {
  const name = stripPersonNameEpithet(rawName).trim();
  if (!name) return null;

  return characterRegistry.runExclusive(userId, async () => {
    const decision = await characterRegistry.classifyForCreation(userId, name);
    if (decision.action === 'merge') {
      await characterRegistry.mergeMention(userId, decision.characterId, decision.cleanName, {
        source: 'organization_group_write',
      });
      return { id: decision.characterId, name: decision.matchedName || decision.cleanName, created: false };
    }
    if (decision.action !== 'create') return null;

    let created: { id: string; name: string; created: boolean } | null = null;
    const { applySuggestionCandidate } = await import('../lorebook/suggestions/applySuggestionCandidate');
    const write = await applySuggestionCandidate({
      userId,
      domain: 'characters',
      name: decision.cleanName,
      extractor: 'group_write_chat',
      source: 'chat_group_write',
      writePolicy: 'user',
      onCreate: async () => {
        const now = new Date().toISOString();
        const parts = decision.cleanName.split(/\s+/);
        const { data, error } = await supabaseAdmin
          .from('characters')
          .insert({
            id: randomUUID(),
            user_id: userId,
            name: decision.cleanName,
            first_name: parts[0],
            last_name: parts.slice(1).join(' ') || null,
            status: 'active',
            has_met: true,
            metadata: { created_via: 'organization_group_write' },
            created_at: now,
            updated_at: now,
          })
          .select('id, name')
          .single();
        if (error || !data) {
          logger.warn({ err: error, name }, 'groupWriteService: character create failed');
          return;
        }
        created = { id: data.id as string, name: data.name as string, created: true };
      },
    });
    if (write.outcome === 'ATTACHED' && write.canonical?.id) {
      return { id: write.canonical.id, name: write.canonical.name, created: false };
    }
    return created;
  });
}

async function readPendingGroup(
  userId: string,
  threadId: string,
): Promise<{ organizationId: string; name: string } | null> {
  const { data, error } = await supabaseAdmin
    .from('conversation_sessions')
    .select('metadata')
    .eq('id', threadId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    throw new Error(`Could not read pending group state: ${error.message}`);
  }
  const threadMeta = ((data?.metadata as Record<string, unknown> | null)?.threadMeta ??
    {}) as Record<string, unknown>;
  const pending = threadMeta[PENDING_META_KEY] as
    | { organizationId?: string; name?: string }
    | undefined;
  if (!pending?.organizationId || !pending?.name) return null;
  return { organizationId: pending.organizationId, name: pending.name };
}

async function writePendingGroup(
  userId: string,
  threadId: string,
  pending: { organizationId: string; name: string },
): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from('conversation_sessions')
    .select('metadata')
    .eq('id', threadId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    throw new Error(`Could not read conversation state before group update: ${error.message}`);
  }
  const metadata = { ...((data?.metadata as Record<string, unknown> | null) ?? {}) };
  const threadMeta = { ...((metadata.threadMeta as Record<string, unknown> | null) ?? {}) };
  threadMeta[PENDING_META_KEY] = { ...pending, updatedAt: new Date().toISOString() };
  metadata.threadMeta = threadMeta;
  const { error: updateError } = await supabaseAdmin
    .from('conversation_sessions')
    .update({ metadata })
    .eq('id', threadId)
    .eq('user_id', userId);
  if (updateError) {
    throw new Error(`Could not save pending group state: ${updateError.message}`);
  }
}

function summarize(result: Omit<GroupWriteResult, 'summary'>): string {
  const header = result.created
    ? `Created **${result.organizationName}** and updated the roster:`
    : result.renamed
      ? `Renamed the group to **${result.organizationName}**:`
      : `Updated **${result.organizationName}**:`;
  if (result.members.length === 0) {
    return `${header}\nNo members listed yet — send the roster (e.g. "So far we have A, B, and C") and I'll add them.`;
  }
  const lines = result.members.map((m) => `**${m.name}** — ${m.detail}`);
  return [header, ...lines].join('\n');
}

export async function writeOrganizationGroupFromChat(
  userId: string,
  message: string,
  threadId: string,
  options?: {
    conversationHistory?: Array<{ role: string; content: string }>;
    threadTitle?: string | null;
    focusCharacterName?: string | null;
    focusOrganizationName?: string | null;
  },
): Promise<GroupWriteResult> {
  const { getSuggestionWriteContext, withSuggestionWriteContext } = await import(
    '../lorebook/suggestions/suggestionWriteContext'
  );
  const existing = getSuggestionWriteContext();
  if (!existing || existing.userId !== userId) {
    return withSuggestionWriteContext(userId, () =>
      writeOrganizationGroupFromChat(userId, message, threadId, options),
    );
  }

  const history = options?.conversationHistory ?? [];

  const siteIntent = parseOrganizationSiteWrite(message);
  if (siteIntent) {
    let org = await organizationService.findByName(userId, siteIntent.organizationName);
    if (!org) {
      org = await organizationService.createOrganization(userId, {
        name: siteIntent.organizationName,
        type: 'company',
        group_type: 'company',
        description: `Created from chat with site ${siteIntent.locationName}`,
        metadata: { created_via: 'organization_site_write' },
      });
    }
    const location = await organizationService.attachOrganizationSite(userId, org.id, {
      location_name: siteIntent.locationName,
    });
    return {
      organizationId: org.id,
      organizationName: org.name,
      created: false,
      renamed: false,
      members: [],
      summary: `Linked **${location.location_name}** as a location of **${org.name}**.`,
    };
  }

  const classificationIntent = parseOrganizationClassificationWrite(message);
  if (classificationIntent) {
    const pending = await readPendingGroup(userId, threadId);
    const lookupName = classificationIntent.usesFocusName
      ? (pending?.name || options?.focusOrganizationName || classificationIntent.name)
      : classificationIntent.name;
    if (classificationIntent.usesFocusName && /^(this|it)$/i.test(lookupName)) {
      throw new Error('Say which group to classify, or open it in Groups first.');
    }
    const org = await organizationService.findByName(userId, lookupName);
    if (!org) {
      throw new Error(`I couldn't find a group named "${lookupName}" to classify.`);
    }
    const metadata = {
      ...(org.metadata ?? {}),
      ...(classificationIntent.groupType
        ? { group_type_source: 'user_confirmed', group_type_detected_at: new Date().toISOString() }
        : {}),
      ...(classificationIntent.userRelationship
        ? { user_relationship_source: 'user_confirmed' }
        : {}),
    };
    const updated = await organizationService.updateOrganization(userId, org.id, {
      ...(classificationIntent.groupType ? { group_type: classificationIntent.groupType as never } : {}),
      ...(classificationIntent.userRelationship
        ? { user_relationship: classificationIntent.userRelationship as never }
        : {}),
      metadata,
    });
    const bits: string[] = [];
    if (classificationIntent.groupType) bits.push(`type **${classificationIntent.groupType.replace(/_/g, ' ')}**`);
    if (classificationIntent.userRelationship) {
      const stanceTab =
        classificationIntent.userRelationship === 'aware_of'
          ? 'Their world'
          : classificationIntent.userRelationship === 'referenced' || classificationIntent.userRelationship === 'fan'
            ? 'Mentioned'
            : classificationIntent.userRelationship === 'adjacent' || classificationIntent.userRelationship === 'collaborator'
              ? 'Close to'
              : 'Mine';
      bits.push(`your relationship **${classificationIntent.userRelationship.replace(/_/g, ' ')}** (${stanceTab})`);
    }
    return {
      organizationId: updated.id,
      organizationName: updated.name,
      created: false,
      renamed: false,
      members: [],
      summary: `Updated **${updated.name}**: ${bits.join(' and ')}. That correction is locked so auto-detect won't overwrite it.`,
    };
  }

  const relationshipIntent = parseOrganizationRelationshipWrite(message);
  if (relationshipIntent) {
    let fromOrg = await organizationService.findByName(userId, relationshipIntent.fromName);
    let toOrg = await organizationService.findByName(userId, relationshipIntent.toName);

    if (relationshipIntent.action === 'remove') {
      if (!fromOrg || !toOrg) {
        const missing = [
          !fromOrg ? relationshipIntent.fromName : null,
          !toOrg ? relationshipIntent.toName : null,
        ].filter(Boolean).join(' and ');
        throw new Error(`I couldn't find ${missing} in Groups & Organizations.`);
      }
      const removed = await organizationService.removeRelationshipsBetween(userId, fromOrg.id, toOrg.id);
      return {
        organizationId: fromOrg.id,
        organizationName: fromOrg.name,
        created: false,
        renamed: false,
        members: [],
        summary: removed > 0
          ? `Disconnected **${fromOrg.name}** from **${toOrg.name}**.`
          : `**${fromOrg.name}** and **${toOrg.name}** were not connected.`,
      };
    }

    if (relationshipIntent.relationshipType === 'part_of') {
      if (!toOrg) {
        toOrg = await organizationService.createOrganization(userId, {
          name: relationshipIntent.toName,
          type: 'company',
          group_type: 'company',
          description: `Created from chat as the parent of ${relationshipIntent.fromName}`,
          metadata: { created_via: 'organization_relationship_write' },
        });
      }
      if (!fromOrg) {
        fromOrg = await organizationService.createOrganization(userId, {
          name: relationshipIntent.fromName,
          type: 'other',
          group_type: relationshipIntent.childKind ?? 'team',
          description: `Created from chat nested under ${toOrg.name}`,
          parent_group_id: toOrg.id,
          metadata: {
            created_via: 'organization_relationship_write',
            subcategory: 'department',
          },
        });
      }
    }

    if (!fromOrg || !toOrg) {
      const missing = [
        !fromOrg ? relationshipIntent.fromName : null,
        !toOrg ? relationshipIntent.toName : null,
      ].filter(Boolean).join(' and ');
      throw new Error(`I couldn't find ${missing} in Groups & Organizations.`);
    }
    const created = await organizationService.ensureRelationship(
      userId,
      fromOrg.id,
      toOrg.id,
      relationshipIntent.relationshipType,
      '[chat-confirmed] Explicit organization relationship edit',
    );
    let siteText = '';
    if (relationshipIntent.locationName) {
      const location = await organizationService.attachChildToParentSite(
        userId,
        fromOrg.id,
        toOrg.id,
        { location_name: relationshipIntent.locationName },
      );
      siteText = ` at **${location.location_name}**`;
    }
    const relationText = relationshipIntent.relationshipType === 'part_of'
      ? `Set **${fromOrg.name}** as a ${relationshipIntent.childKind === 'team' ? 'department / job' : 'subgroup'} of **${toOrg.name}**${siteText}.`
      : `Connected **${fromOrg.name}** with **${toOrg.name}**.`;
    return {
      organizationId: fromOrg.id,
      organizationName: fromOrg.name,
      created: false,
      renamed: false,
      members: [],
      summary: created ? relationText : `${relationText} That connection was already saved.`,
    };
  }

  const deleteMatch = message.match(
    /\b(?:delete|remove)\s+(?:the\s+)?(?:group|crew|squad|org(?:anization)?)\s+(.{1,80})$|\b(?:delete|remove)\s+(.{1,80}?)\s+from\s+my\s+(?:groups?|organizations?)\s+book\b/i,
  );
  if (deleteMatch) {
    const rawName = (deleteMatch[1] || deleteMatch[2] || '').trim().replace(/[.!?]+$/, '');
    const name = titleCaseWords(rawName.replace(/^(?:the|a|an|my)\s+/i, ''));
    const existing = await organizationService.findByName(userId, name);
    if (!existing) {
      throw new Error(`I couldn't find a group named "${name}" to delete.`);
    }
    await organizationService.deleteOrganization(userId, existing.id, 'chat_organization_group_write_delete');
    return {
      organizationId: existing.id,
      organizationName: existing.name,
      created: false,
      renamed: false,
      deleted: true,
      members: [],
      summary: `Deleted **${existing.name}** from Groups.`,
    };
  }

  const listed = resolveGroupWriteMemberNames(message, history);
  const pending = await readPendingGroup(userId, threadId);

  const wantsCreate =
    /\b(?:make|create|start|set\s*up)\s+(?:a\s+|an\s+|the\s+)?(?:new\s+)?(group|crew|squad)/i.test(
      message,
    ) || /\b(group|crew|squad)\s+for\s+(?:that|this|them)\b/i.test(message);

  let organizationId = pending?.organizationId ?? null;
  let organizationName = pending?.name ?? null;
  let created = false;
  let renamed = false;

  // The user is answering "what do you want to name it?" directly — that
  // reply is the authoritative title, title-cased regardless of how it was
  // typed (see the lowercase-in-composer request this closes).
  const isNamingReply =
    !wantsCreate && Boolean(pending) && isReplyToGroupNamingPrompt(message, history);

  if (isNamingReply && organizationId) {
    const newName = titleCaseWords(message.trim().replace(/[.!?]+$/, ''));
    if (newName && newName.toLowerCase() !== (organizationName ?? '').toLowerCase()) {
      const updated = await organizationService.updateOrganization(userId, organizationId, {
        name: newName,
      });
      organizationName = updated.name;
      renamed = true;
      await writePendingGroup(userId, threadId, { organizationId, name: organizationName });
    }
  } else if (wantsCreate || !organizationId) {
    organizationName = inferGroupNameFromContext(message, history, options?.threadTitle);
    const requestedOrganizationName = organizationName;
    const existing = await organizationService.findByName(userId, requestedOrganizationName);
    if (existing) {
      organizationId = existing.id;
      organizationName = existing.name;
    } else {
      const classification = classifyGroup(requestedOrganizationName, message);
      const groupType = classification.suggestedGroupType !== 'other' ? classification.suggestedGroupType : 'crew';
      const userRelationship = groupDetectionService.suggestUserRelationship(
        message,
        false,
        requestedOrganizationName,
        groupType,
      );
      const { applySuggestionCandidate } = await import('../lorebook/suggestions/applySuggestionCandidate');
      const write = await applySuggestionCandidate({
        userId,
        domain: 'organizations',
        name: requestedOrganizationName,
        incomingType: groupType,
        evidence: message,
        extractor: 'group_write_chat',
        source: 'chat_group_write',
        writePolicy: 'user',
        onCreate: async () => {
          const org = await organizationService.createOrganization(userId, {
            name: requestedOrganizationName,
            type: groupType === 'company' ? 'company' : 'club',
            group_type: groupType,
            user_relationship: userRelationship,
            description: `Created from chat: ${message.slice(0, 180)}`,
            metadata: {
              created_via: 'organization_group_write',
              source_thread_id: threadId,
              group_type_source: classification.suggestedGroupType !== 'other' ? 'auto' : undefined,
            },
          });
          organizationId = org.id;
          organizationName = org.name;
          created = true;
        },
      });
      if (write.outcome === 'ATTACHED' && write.canonical) {
        organizationId = write.canonical.id;
        organizationName = write.canonical.name;
      }
    }
    await writePendingGroup(userId, threadId, {
      organizationId: organizationId!,
      name: organizationName!,
    });
  }

  // A naming reply ("popular e-girls") answers the name question only — it
  // is not a roster, so it must never be parsed as a member candidate.
  const memberNames = isNamingReply ? [] : [...listed];
  if (!isNamingReply && options?.focusCharacterName?.trim()) {
    const focus = stripPersonNameEpithet(options.focusCharacterName).trim();
    if (focus && !memberNames.some((n) => n.toLowerCase() === focus.toLowerCase())) {
      // Only auto-include focus when creating / naming the group, not on every roster ping.
      if (wantsCreate) memberNames.unshift(focus);
    }
  }

  const members: GroupWriteMemberOutcome[] = [];
  for (const raw of memberNames) {
    try {
      const ensured = await ensureCharacter(userId, raw);
      if (!ensured) {
        members.push({
          name: raw,
          outcome: 'failed',
          detail: 'Could not resolve or create a Character Book card.',
        });
        continue;
      }

      const before = await organizationService.getMembers(organizationId!);
      const already = before.some(
        (m) =>
          (m.character_id && m.character_id === ensured.id) ||
          m.character_name?.toLowerCase() === ensured.name.toLowerCase(),
      );

      await organizationService.addMember(userId, organizationId!, {
        character_id: ensured.id,
        character_name: ensured.name,
        status: 'active',
        role: 'member',
      });

      members.push({
        name: ensured.name,
        characterId: ensured.id,
        outcome: already ? 'already_member' : ensured.created ? 'created_and_added' : 'added',
        detail: already
          ? 'Already on the roster.'
          : ensured.created
            ? 'Created Character Book card and added to the group.'
            : 'Added to the group.',
      });
    } catch (err) {
      logger.warn({ err, raw, organizationId }, 'groupWriteService: addMember failed');
      members.push({
        name: raw,
        outcome: 'failed',
        detail: 'Save failed — please try again.',
      });
    }
  }

  const result = {
    organizationId: organizationId!,
    organizationName: organizationName!,
    created,
    renamed,
    members,
  };
  return { ...result, summary: summarize(result) };
}
