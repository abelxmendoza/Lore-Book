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
    const existing = await organizationService.findByName(userId, organizationName);
    if (existing) {
      organizationId = existing.id;
      organizationName = existing.name;
    } else {
      const { applySuggestionCandidate } = await import('../lorebook/suggestions/applySuggestionCandidate');
      const write = await applySuggestionCandidate({
        userId,
        domain: 'organizations',
        name: organizationName,
        incomingType: 'crew',
        evidence: message,
        extractor: 'group_write_chat',
        source: 'chat_group_write',
        writePolicy: 'user',
        onCreate: async () => {
          const org = await organizationService.createOrganization(userId, {
            name: organizationName,
            type: 'club',
            group_type: 'crew',
            description: `Created from chat: ${message.slice(0, 180)}`,
            metadata: { created_via: 'organization_group_write', source_thread_id: threadId },
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
      organizationId,
      name: organizationName,
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
