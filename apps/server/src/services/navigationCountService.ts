import { logger } from '../logger';
import { dedupeCharacters, isVisibleCharacter } from './books/booksAggregateService';
import { enrichRomanticRelationshipsForUser } from './conversationCentered/romanticRelationshipEnrichment';
import { romanticRelationshipDedupeService } from './conversationCentered/romanticRelationshipDedupeService';
import { loadDatingEligibilityForRows } from './conversationCentered/datingEligibilityService';
import { evaluateLifeLogEligibility, isPublishableLifeLogTitle } from './events/lifeLogEligibilityPolicy';
import { familyTreeService } from './familyTreeService';
import { locationService } from './locationService';
import { metaControlService } from './metaControlService';
import { narrativeAnchorService } from './narrative/narrativeAnchorService';
import { organizationService } from './organizationService';
import { projectService } from './projectService';
import { skillService } from './skills/skillService';
import { isReviewPending } from './reviewableRecord';
import { supabaseAdmin } from './supabaseClient';

export type NavigationCounts = {
  characters: number;
  family: number;
  romantic: number;
  organizations: number;
  locations: number;
  events: number;
  projects: number;
  skills: number;
  anchors: number;
};

type CharacterCountRow = {
  name?: string | null;
  metadata?: unknown;
  status?: string | null;
  importance_score?: number | null;
  updated_at?: string | null;
};

type LifeLogCountRow = {
  id: string;
  title?: string | null;
  summary?: string | null;
  type?: string | null;
  metadata?: Record<string, unknown> | null;
};

async function countCharacters(userId: string): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from('characters')
    .select('name, metadata, status, importance_score, updated_at')
    .eq('user_id', userId);
  if (error) throw error;
  return dedupeCharacters(((data ?? []) as CharacterCountRow[]).filter(isVisibleCharacter)).length;
}

async function countLifeLogEvents(userId: string): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from('resolved_events')
    .select('id, title, summary, type, metadata')
    .eq('user_id', userId);
  if (error) {
    if ((error as { code?: string }).code === 'PGRST205') return 0;
    throw error;
  }

  let count = 0;
  for (const event of (data ?? []) as LifeLogCountRow[]) {
    const metadata = event.metadata ?? {};
    const storedLifeLog = (metadata.life_log ?? {}) as Record<string, unknown>;
    const userPosted = metadata.created_via === 'user_posted';
    const eligibility = evaluateLifeLogEligibility({
      text: [event.summary, event.title].filter(Boolean).join(' '),
      title: event.title,
      type: event.type,
      metadata,
    });
    if (
      storedLifeLog.publication_status === 'quarantined' ||
      !eligibility.eligible ||
      (!userPosted && !isPublishableLifeLogTitle(event.title))
    ) {
      continue;
    }
    const [archived, notImportant] = await Promise.all([
      metaControlService.hasOverride(userId, event.id, 'EVENT', 'ARCHIVE'),
      metaControlService.hasOverride(userId, event.id, 'EVENT', 'NOT_IMPORTANT'),
    ]);
    if (!archived && !notImportant) count += 1;
  }
  return count;
}

async function countRomanticRelationships(userId: string): Promise<number> {
  await romanticRelationshipDedupeService.dedupeAndLink(userId).catch((error) => {
    logger.warn({ error, userId }, 'Navigation count romantic dedupe skipped');
  });
  const { data, error } = await supabaseAdmin
    .from('romantic_relationships')
    .select('*')
    .eq('user_id', userId);
  if (error) {
    if ((error as { code?: string }).code === 'PGRST205') return 0;
    throw error;
  }
  const enriched = await enrichRomanticRelationshipsForUser(userId, data ?? []);
  const eligibility = await loadDatingEligibilityForRows(userId, enriched as never);
  return (enriched as Array<Record<string, unknown>>).filter(
    (row) => eligibility.get(row.id as string)?.visibleInDatingBook === true,
  ).length;
}

async function safeCount(
  userId: string,
  key: keyof NavigationCounts,
  loader: () => Promise<number>,
): Promise<number> {
  try {
    return await loader();
  } catch (error) {
    logger.warn({ error, userId, countKey: key }, 'Navigation count unavailable');
    return 0;
  }
}

/** Counts the same visible records rendered by each sidebar Book surface. */
export async function loadNavigationCounts(userId: string): Promise<NavigationCounts> {
  const entries = await Promise.all([
    safeCount(userId, 'characters', () => countCharacters(userId)),
    safeCount(userId, 'family', async () => (await familyTreeService.getUserFamilyTree(userId))?.members.length ?? 0),
    safeCount(userId, 'romantic', () => countRomanticRelationships(userId)),
    safeCount(userId, 'organizations', async () =>
      (await organizationService.listOrganizations(userId)).filter((organization) => !isReviewPending(organization.metadata)).length
    ),
    safeCount(userId, 'locations', async () => (await locationService.listLocations(userId)).length),
    safeCount(userId, 'events', () => countLifeLogEvents(userId)),
    safeCount(userId, 'projects', async () => (await projectService.listProjects(userId)).length),
    safeCount(userId, 'skills', async () =>
      (await skillService.getSkills(userId, { active_only: false, displayable_only: true })).length
    ),
    safeCount(userId, 'anchors', async () => (await narrativeAnchorService.listAnchors(userId)).length),
  ]);

  return {
    characters: entries[0],
    family: entries[1],
    romantic: entries[2],
    organizations: entries[3],
    locations: entries[4],
    events: entries[5],
    projects: entries[6],
    skills: entries[7],
    anchors: entries[8],
  };
}
