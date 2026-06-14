import { randomUUID } from 'node:crypto';

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { type SkillEvidence, type SkillProfile } from './skillProfile';
import { normalizeSkillKey } from './skillIdentity';

export type SkillHistoryEntry = {
  id: string;
  event_type: 'detected' | 'confirmed' | 'evidence' | 'practiced' | 'relationship';
  summary: string;
  source_type?: 'chat' | 'journal' | 'manual' | 'suggestion';
  source_id?: string;
  captured_at: string;
};

function isTableMissing(error: unknown): boolean {
  return (error as { code?: string })?.code === 'PGRST205';
}

class SkillLoreService {
  /** Stamp stable identity fields onto skill metadata for chat/index lookups. */
  buildIdentityMetadata(skillId: string, skillName: string, existing?: Record<string, unknown>): Record<string, unknown> {
    return {
      ...(existing ?? {}),
      skill_id: skillId,
      skill_key: normalizeSkillKey(skillName),
    };
  }

  appendHistory(
    metadata: Record<string, unknown>,
    entry: Omit<SkillHistoryEntry, 'id' | 'captured_at'> & { captured_at?: string }
  ): SkillHistoryEntry[] {
    const prev = Array.isArray(metadata.skill_history) ? (metadata.skill_history as SkillHistoryEntry[]) : [];
    const row: SkillHistoryEntry = {
      id: randomUUID(),
      captured_at: entry.captured_at ?? new Date().toISOString(),
      ...entry,
    };
    return [...prev, row].slice(-40);
  }

  async persistEvidenceRows(
    userId: string,
    skillId: string,
    evidence: SkillEvidence[],
    opts: { suggestionId?: string; sourceType?: string } = {}
  ): Promise<void> {
    if (!evidence.length) return;
    const rows = evidence
      .filter((e) => e.text?.trim())
      .map((e) => ({
        user_id: userId,
        skill_id: skillId,
        suggestion_id: opts.suggestionId ?? null,
        evidence_text: e.text.trim(),
        source_type: e.source_type ?? opts.sourceType ?? 'chat',
        source_id: e.source_id ?? null,
        confidence: e.confidence ?? null,
      }));

    const { error } = await supabaseAdmin.from('skill_evidence').insert(rows);
    if (error && !isTableMissing(error)) {
      logger.debug({ error, userId, skillId }, 'skill_evidence insert skipped');
    }
  }

  /** Bootstrap lore + history when a skill is confirmed or created from detection. */
  async bootstrapFromProfile(
    userId: string,
    skillId: string,
    skillName: string,
    profile: SkillProfile,
    opts: {
      suggestionId?: string;
      sourceType?: 'chat' | 'journal' | 'manual' | 'suggestion';
      sourceId?: string;
      description?: string;
    } = {}
  ): Promise<{ skill_profile: SkillProfile; skill_history: SkillHistoryEntry[]; skill_id: string; skill_key: string }> {
    const now = new Date().toISOString();
    const evidence = profile.evidence ?? [];
    await this.persistEvidenceRows(userId, skillId, evidence, {
      suggestionId: opts.suggestionId,
      sourceType: opts.sourceType,
    });

    const history: SkillHistoryEntry[] = [
      {
        id: randomUUID(),
        event_type: 'confirmed',
        summary: opts.description?.trim() || `Added "${skillName}" to your skills book`,
        source_type: opts.sourceType ?? 'suggestion',
        source_id: opts.sourceId ?? opts.suggestionId,
        captured_at: now,
      },
    ];

    for (const e of evidence.slice(0, 5)) {
      history.push({
        id: randomUUID(),
        event_type: 'evidence',
        summary: e.text,
        source_type: (e.source_type as SkillHistoryEntry['source_type']) ?? opts.sourceType,
        source_id: e.source_id ?? opts.sourceId,
        captured_at: e.captured_at ?? now,
      });
    }

    if (profile.origin_story?.trim()) {
      history.unshift({
        id: randomUUID(),
        event_type: 'detected',
        summary: profile.origin_story.trim(),
        source_type: opts.sourceType,
        source_id: opts.sourceId,
        captured_at: now,
      });
    }

    return {
      skill_id: skillId,
      skill_key: normalizeSkillKey(skillName),
      skill_profile: { ...profile, evidence },
      skill_history: history.slice(-40),
    };
  }
}

export const skillLoreService = new SkillLoreService();
