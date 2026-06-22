import { logger } from '../../logger';
import { normalizeNameKey, namesOverlapByContainment } from '../../utils/nameNormalization';
import {
  evaluateEntityQuality,
  passesEntityQualityGate,
  resolveDisplayName,
} from '../lorebook/quality/entityQualityGateService';
import { buildCrossBookIndexForUser } from '../lexical/projects/projectCrossBookGuard';
import { organizationService, type GroupType } from '../organizationService';
import { supabaseAdmin } from '../supabaseClient';
import type {
  OrganizationCandidate,
  OrganizationType,
} from './inference/organizationInferenceTypes';

export type OrganizationSuggestionRow = {
  id: string;
  name: string;
  organization_type: string;
  group_type: string;
  role_to_user?: string | null;
  confidence: number;
  reasoning?: string | null;
  evidence?: Array<{ text: string } | string>;
  context?: Record<string, unknown>;
  aliases?: string[];
  source?: string;
  source_message_id?: string | null;
  promotion_status?: string;
  match_status: 'new' | 'similar' | 'existing';
  matched_organization_id?: string | null;
  matched_organization_name?: string | null;
  requires_review?: boolean;
};

function isTableMissing(error: unknown): boolean {
  return (error as { code?: string })?.code === 'PGRST205';
}

function mapGroupType(orgType: OrganizationType): GroupType {
  switch (orgType) {
    case 'employer':
    case 'company':
    case 'startup':
    case 'agency':
    case 'investor':
    case 'client':
      return 'company';
    case 'school':
    case 'university':
    case 'bootcamp':
    case 'program':
      return 'institution';
    case 'platform':
    case 'vendor':
      return 'vendor';
    default:
      return 'other';
  }
}

function resolveMatch(
  name: string,
  existing: Array<{ id: string; name: string }>,
): {
  match_status: OrganizationSuggestionRow['match_status'];
  matched_organization_id: string | null;
  matched_organization_name: string | null;
} {
  const key = normalizeNameKey(name);
  const exact = existing.find((o) => normalizeNameKey(o.name) === key);
  if (exact) {
    return {
      match_status: 'existing',
      matched_organization_id: exact.id,
      matched_organization_name: exact.name,
    };
  }
  const similar = existing.find((o) => namesOverlapByContainment(o.name, name));
  if (similar) {
    return {
      match_status: 'similar',
      matched_organization_id: similar.id,
      matched_organization_name: similar.name,
    };
  }
  return { match_status: 'new', matched_organization_id: null, matched_organization_name: null };
}

class OrganizationSuggestionService {
  private async listExistingOrgs(userId: string): Promise<Array<{ id: string; name: string }>> {
    const orgs = await organizationService.listOrganizations(userId).catch(() => []);
    return orgs.map((o) => ({ id: o.id, name: o.name }));
  }

  async upsertFromInference(
    userId: string,
    candidate: OrganizationCandidate,
    opts: {
      sourceMessageId?: string;
      source?: 'chat' | 'journal' | 'llm_scan';
    } = {},
  ): Promise<boolean> {
    if (candidate.confidence < 0.45) return false;

    const evidenceText = candidate.evidencePhrases.join(' ') || candidate.displayName;
    const crossBook = await buildCrossBookIndexForUser(userId).catch(() => undefined);
    const existing = await this.listExistingOrgs(userId);
    const knownInBook = new Set(existing.map((o) => normalizeNameKey(o.name)));

    const quality = evaluateEntityQuality(
      {
        name: candidate.displayName,
        domain: 'organizations',
        contextText: evidenceText,
        evidence: evidenceText,
        confidence: candidate.confidence,
        sourceMessageId: opts.sourceMessageId,
      },
      { crossBook, knownInBook },
    );
    if (!passesEntityQualityGate(quality)) return false;

    const safeName = resolveDisplayName({ name: candidate.displayName, domain: 'organizations' }, quality);
    const match = resolveMatch(safeName, existing);
    if (match.match_status === 'existing') return false;

    const normalized = normalizeNameKey(safeName);
    const payload = {
      user_id: userId,
      name: safeName,
      normalized_name: normalized,
      organization_type: candidate.organizationType,
      group_type: mapGroupType(candidate.organizationType),
      role_to_user: candidate.context.roleToUser ?? null,
      description: evidenceText.slice(0, 500) || null,
      confidence: Math.max(0, Math.min(1, candidate.confidence)),
      reasoning: `Inferred ${candidate.organizationType} from conversation`,
      evidence: candidate.evidencePhrases.map((text) => ({ text })),
      context: candidate.context,
      aliases: candidate.aliases,
      source_message_id: opts.sourceMessageId ?? null,
      source: opts.source ?? 'chat',
      promotion_status: candidate.promotionStatus,
      match_status: match.match_status,
      matched_organization_id: match.matched_organization_id,
      status_row: 'pending',
      requires_review: candidate.requiresReview,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabaseAdmin
      .from('organization_suggestions')
      .upsert(payload, { onConflict: 'user_id,normalized_name' });

    if (error && !isTableMissing(error)) {
      logger.debug({ error, userId, name: safeName }, 'Failed to upsert organization suggestion');
      return false;
    }

    return !error;
  }
}

export const organizationSuggestionService = new OrganizationSuggestionService();
