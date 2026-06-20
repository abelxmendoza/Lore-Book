/**
 * When a suggestion is redirected to another LoreBook, compare against existing
 * entries using the Identity Integrity Policy. Auto-merge ONLY when all identity
 * criteria pass (canonical match, no ambiguity, unique candidate).
 */

import { logger } from '../logger';
import { characterRegistry } from './characterRegistry';
import {
  evaluateCharacterIdentity,
  evaluateLocationIdentity,
  evaluateOrganizationIdentity,
  evaluateProjectIdentity,
  evaluateQuestIdentity,
  evaluateSkillIdentity,
  identityTierToRedirectDisposition,
  type IdentityVerdict,
} from './identityIntegrityPolicy';
import { projectService } from './projectService';
import { questStorage } from './quests/questStorage';
import { skillService } from './skills/skillService';
import { supabaseAdmin } from './supabaseClient';
import type { SuggestionBookDomain } from './suggestionCrossBookService';
import { SUGGESTION_DOMAIN_LABELS } from './suggestionCrossBookService';
import { normalizeNameKey } from '../utils/nameNormalization';

export type RedirectMatchDisposition = 'auto_merged' | 'suggested' | 'uncertain';

export type RedirectTargetMatchResult = {
  disposition: RedirectMatchDisposition;
  matchedId?: string;
  matchedName?: string;
  confidence: number;
  method?: string;
  identityTier?: IdentityVerdict['tier'];
  identityCriteria?: IdentityVerdict['criteria'];
  identityReasons?: string[];
};

type NameCandidate = { id: string; name: string; aliases?: string[] };

function toRedirectResult(
  verdict: IdentityVerdict,
  matched?: NameCandidate
): RedirectTargetMatchResult {
  return {
    disposition: identityTierToRedirectDisposition(verdict.tier),
    matchedId: matched?.id,
    matchedName: matched?.name,
    confidence: verdict.confidence,
    method: verdict.method,
    identityTier: verdict.tier,
    identityCriteria: verdict.criteria,
    identityReasons: verdict.reasons,
  };
}

async function loadCharacterCandidates(userId: string): Promise<NameCandidate[]> {
  const { data } = await supabaseAdmin
    .from('characters')
    .select('id, name, alias, aliases')
    .eq('user_id', userId);
  return (data ?? []).map((row) => ({
    id: String(row.id),
    name: String(row.name ?? ''),
    aliases: [
      ...(Array.isArray(row.alias) ? row.alias : []),
      ...(Array.isArray(row.aliases) ? row.aliases : []),
    ].map(String),
  }));
}

async function loadLocationCandidates(userId: string): Promise<NameCandidate[]> {
  const { data } = await supabaseAdmin
    .from('locations')
    .select('id, name, nicknames')
    .eq('user_id', userId);
  return (data ?? []).map((row) => ({
    id: String(row.id),
    name: String(row.name ?? ''),
    aliases: (Array.isArray(row.nicknames) ? row.nicknames : []).map(String),
  }));
}

async function loadProjectCandidates(userId: string): Promise<NameCandidate[]> {
  const projects = await projectService.listProjects(userId);
  return projects.map((p) => ({ id: p.id, name: p.name }));
}

async function loadSkillCandidates(userId: string): Promise<NameCandidate[]> {
  const skills = await skillService.getSkills(userId, { active_only: false });
  return skills.map((s) => ({ id: s.id, name: s.skill_name }));
}

async function loadQuestCandidates(userId: string): Promise<NameCandidate[]> {
  const quests = await questStorage.getQuests(userId, {});
  return quests.map((q) => ({ id: q.id, name: q.title }));
}

async function loadOrganizationCandidates(userId: string): Promise<NameCandidate[]> {
  const { data } = await supabaseAdmin.from('organizations').select('id, name').eq('user_id', userId);
  return (data ?? []).map((row) => ({ id: String(row.id), name: String(row.name ?? '') }));
}

export async function evaluateRedirectTargetMatch(
  userId: string,
  name: string,
  toDomain: SuggestionBookDomain
): Promise<RedirectTargetMatchResult> {
  const trimmed = name.trim();
  if (!trimmed) return { disposition: 'suggested', confidence: 0, identityTier: 'distinct' };

  try {
    switch (toDomain) {
      case 'characters': {
        const candidates = await loadCharacterCandidates(userId);
        const { verdict, matched } = evaluateCharacterIdentity(trimmed, candidates);
        return toRedirectResult(verdict, matched);
      }
      case 'locations': {
        const candidates = await loadLocationCandidates(userId);
        const { verdict, matched } = evaluateLocationIdentity(trimmed, candidates);
        return toRedirectResult(verdict, matched);
      }
      case 'projects': {
        const candidates = await loadProjectCandidates(userId);
        const { verdict, matched } = evaluateProjectIdentity(trimmed, candidates);
        return toRedirectResult(verdict, matched);
      }
      case 'skills': {
        const candidates = await loadSkillCandidates(userId);
        const { verdict, matched } = evaluateSkillIdentity(trimmed, candidates);
        return toRedirectResult(verdict, matched);
      }
      case 'quests': {
        const candidates = await loadQuestCandidates(userId);
        const { verdict, matched } = evaluateQuestIdentity(trimmed, candidates);
        return toRedirectResult(verdict, matched);
      }
      case 'organizations':
      case 'groups': {
        const orgs = await loadOrganizationCandidates(userId);
        const orgResult = evaluateOrganizationIdentity(trimmed, orgs);
        if (orgResult.verdict.tier !== 'distinct') return toRedirectResult(orgResult.verdict, orgResult.matched);
        const { data: groups } = await supabaseAdmin.from('groups').select('id, name').eq('user_id', userId);
        const groupResult = evaluateOrganizationIdentity(
          trimmed,
          (groups ?? []).map((row) => ({ id: String(row.id), name: String(row.name ?? '') }))
        );
        return toRedirectResult(groupResult.verdict, groupResult.matched);
      }
      default:
        return { disposition: 'suggested', confidence: 0, identityTier: 'distinct' };
    }
  } catch (err) {
    logger.debug({ err, userId, name: trimmed, toDomain }, 'Redirect target match failed — keeping as suggestion');
    return { disposition: 'suggested', confidence: 0, identityTier: 'distinct' };
  }
}

async function mergeCharacterAlias(userId: string, characterId: string, alias: string): Promise<void> {
  await characterRegistry.mergeMention(userId, characterId, alias, {
    source: 'suggestion_category_redirect',
  });
}

async function mergeLocationAlias(userId: string, locationId: string, alias: string): Promise<void> {
  const { data } = await supabaseAdmin
    .from('locations')
    .select('id, name, nicknames')
    .eq('id', locationId)
    .eq('user_id', userId)
    .maybeSingle();
  if (!data) return;

  const canonical = String(data.name ?? '');
  if (normalizeNameKey(alias) === normalizeNameKey(canonical)) return;

  const nicknames = new Set<string>([...(Array.isArray(data.nicknames) ? data.nicknames : []), alias]);
  await supabaseAdmin
    .from('locations')
    .update({ nicknames: [...nicknames], updated_at: new Date().toISOString() })
    .eq('id', locationId)
    .eq('user_id', userId);
}

export function buildRedirectMergeNotification(
  name: string,
  toDomain: SuggestionBookDomain,
  match: RedirectTargetMatchResult
): string | undefined {
  if (match.disposition !== 'auto_merged' || !match.matchedName) return undefined;
  const book = SUGGESTION_DOMAIN_LABELS[toDomain];
  if (normalizeNameKey(name) === normalizeNameKey(match.matchedName)) {
    return `Already in ${book} as “${match.matchedName}”. No duplicate created.`;
  }
  return `Same identity as existing ${book.slice(0, -1).toLowerCase()} “${match.matchedName}”. Linked as an alias.`;
}

export async function applyRedirectTargetMerge(
  userId: string,
  name: string,
  toDomain: SuggestionBookDomain,
  match: RedirectTargetMatchResult
): Promise<void> {
  if (match.disposition !== 'auto_merged' || !match.matchedId) return;

  switch (toDomain) {
    case 'characters':
      await mergeCharacterAlias(userId, match.matchedId, name);
      break;
    case 'locations':
      await mergeLocationAlias(userId, match.matchedId, name);
      break;
    case 'projects':
    case 'skills':
    case 'quests':
    case 'organizations':
    case 'groups':
      break;
    default:
      break;
  }
}
