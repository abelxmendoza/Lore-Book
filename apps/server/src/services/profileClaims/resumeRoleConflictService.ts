/**
 * Detects conflicts between resume-claimed current roles and what LoreBook
 * already believes is the user's current employment (from chats/corrections).
 *
 * Review-first: a resume saying "RLH Industries, Apr 2026 – Present" must not
 * overwrite a chat-derived current role at Ring/Amazon. Conflicting resume jobs
 * are flagged for review and their orgs created as inactive until resolved.
 */
import { logger } from '../../logger';
import { normalizeNameKey, namesOverlapByContainment } from '../../utils/nameNormalization';
import { supabaseAdmin } from '../supabaseClient';

import type { ResumeEmployment, ResumeRoleConflict } from './resumeStructuredTypes';

export type ExistingCurrentEmployer = {
  organization: string;
  title?: string;
  source: string;
};

function sameCompany(a: string, b: string): boolean {
  const ak = normalizeNameKey(a);
  const bk = normalizeNameKey(b);
  return ak === bk || namesOverlapByContainment(ak, bk);
}

/**
 * Pure conflict detection: resume jobs marked current vs. employers LoreBook
 * already holds as current. Same company (exact or containment) is agreement;
 * a different company is a conflict that needs user review.
 */
export function detectCurrentRoleConflicts(
  employment: ResumeEmployment[],
  existingCurrent: ExistingCurrentEmployer[],
): ResumeRoleConflict[] {
  if (existingCurrent.length === 0) return [];

  const conflicts: ResumeRoleConflict[] = [];
  for (const job of employment) {
    if (!job.isCurrent || !job.company?.trim()) continue;
    const agrees = existingCurrent.some((e) => sameCompany(e.organization, job.company));
    if (agrees) continue;

    for (const existing of existingCurrent) {
      conflicts.push({
        resumeCompany: job.company,
        resumeTitle: job.title,
        existingOrganization: existing.organization,
        existingSource: existing.source,
        reason:
          `Resume claims current role "${job.title}" at ${job.company}, but ` +
          `${existing.source} says the current employer is ${existing.organization}. ` +
          'Needs review — existing canon kept.',
      });
    }
  }
  return conflicts;
}

/** Company names (normalized keys) that are conflicted — used to downgrade org status on import. */
export function conflictedCompanyKeys(conflicts: ResumeRoleConflict[]): Set<string> {
  return new Set(conflicts.map((c) => normalizeNameKey(c.resumeCompany)));
}

class ResumeRoleConflictService {
  /**
   * Load employers LoreBook currently believes the user works at,
   * excluding rows created by this same resume upload.
   */
  async loadExistingCurrentEmployers(
    userId: string,
    excludeSourceFileId?: string,
  ): Promise<ExistingCurrentEmployer[]> {
    const { data, error } = await supabaseAdmin
      .from('organizations')
      .select('name, status, type, group_type, user_relationship, metadata')
      .eq('user_id', userId)
      .eq('status', 'active');

    if (error) {
      logger.warn({ error, userId }, 'resume conflicts: failed to load current employers');
      return [];
    }

    return (data ?? [])
      .filter((row) => {
        const meta = (row.metadata ?? {}) as Record<string, unknown>;
        if (excludeSourceFileId && meta.source_file_id === excludeSourceFileId) return false;
        // Only employment-shaped org links count as "current employer" canon:
        // company-typed orgs, or anything carrying a job title (chat/resume derived).
        return (
          row.type === 'company' ||
          row.group_type === 'company' ||
          Boolean(meta.job_title) ||
          row.user_relationship === 'employee'
        );
      })
      .map((row) => {
        const meta = (row.metadata ?? {}) as Record<string, unknown>;
        return {
          organization: row.name as string,
          title: (meta.job_title as string) ?? undefined,
          source: meta.provenance === 'resume_lore_population' ? 'a previous resume import' : 'chat history',
        };
      });
  }

  async detectForUser(
    userId: string,
    employment: ResumeEmployment[],
    excludeSourceFileId?: string,
  ): Promise<ResumeRoleConflict[]> {
    const existing = await this.loadExistingCurrentEmployers(userId, excludeSourceFileId);
    return detectCurrentRoleConflicts(employment, existing);
  }
}

export const resumeRoleConflictService = new ResumeRoleConflictService();
