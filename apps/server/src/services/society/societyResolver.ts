// =====================================================
// SOCIETY RESOLVER (Phase 3 — batched LLM polish)
// Purpose: The deterministic mapper resolves the common cases. For the residue
//          it can't settle — auto-generated names ("Tío & Tía Family") and
//          fuzzy social clusters with no clear type — make ONE batched LLM call
//          per user per run to:
//            • give the cluster a natural, human name,
//            • confirm or correct the group type,
//            • set a sensible user relationship.
//
// Cost discipline:
//   • Only co-occurrence (social) clusters are sent — employer/institution
//     clusters already have real names and are skipped.
//   • At most ONE completion per invocation, capped to the top N clusters.
//   • A process-wide daily budget hard-stops runaway cost.
//   • An in-memory cache (keyed by cluster key + member set) skips re-resolving
//     unchanged clusters across runs.
//   • On any error / disabled flag, we fall back to the deterministic result.
// =====================================================

import { config } from '../../config';
import { tracedCompletion } from '../../lib/openai';
import { logger } from '../../logger';
import type { GroupType, UserRelationship } from '../organizationService';
import type { SocietyCluster } from './societyMapper';

const ENABLED = process.env.SOCIETY_LLM_RESOLVER !== 'false';
const MAX_CLUSTERS_PER_CALL = 12;
const DAILY_CALL_BUDGET = Number(process.env.SOCIETY_LLM_DAILY_BUDGET ?? 500);

const GROUP_TYPES: GroupType[] = [
  'friend_group', 'band', 'sports_team', 'company', 'club', 'nonprofit', 'family',
  'martial_arts', 'scene', 'community', 'crew', 'collective', 'institution', 'other',
];
const USER_RELATIONSHIPS: UserRelationship[] = [
  'founder', 'leader', 'member', 'former_member', 'collaborator', 'adjacent',
  'fan', 'aware_of', 'referenced', 'alumnus',
];

interface Resolution {
  name?: string;
  group_type?: GroupType;
  user_relationship?: UserRelationship;
  /** The model judged this not a real group — drop it. */
  drop?: boolean;
}

class SocietyResolver {
  private budgetDay = '';
  private budgetUsed = 0;
  private cache = new Map<string, Resolution>();

  /** A cluster needs LLM polish when it's a fuzzy social cluster (no strong, named anchor). */
  private isAmbiguous(cluster: SocietyCluster): boolean {
    return cluster.metadata?.anchor === 'co_occurrence';
  }

  private cacheKey(cluster: SocietyCluster): string {
    return `${cluster.key}|${[...cluster.memberIds].sort().join(',')}`;
  }

  private withinBudget(): boolean {
    const today = new Date().toISOString().slice(0, 10);
    if (today !== this.budgetDay) { this.budgetDay = today; this.budgetUsed = 0; }
    return this.budgetUsed < DAILY_CALL_BUDGET;
  }

  /**
   * Resolve the ambiguous clusters IN PLACE (returns a new array). Clusters the
   * resolver isn't asked about, or fails on, are returned unchanged.
   */
  async resolve(userId: string, clusters: SocietyCluster[]): Promise<SocietyCluster[]> {
    if (!ENABLED || !config.openAiKey || clusters.length === 0) return clusters;

    const ambiguous = clusters.filter(c => this.isAmbiguous(c));
    if (ambiguous.length === 0) return clusters;

    // Serve from cache where possible; only the rest needs a model call.
    const resolved = new Map<string, Resolution>();
    const toAsk: SocietyCluster[] = [];
    for (const cluster of ambiguous) {
      const cached = this.cache.get(this.cacheKey(cluster));
      if (cached) resolved.set(cluster.key, cached);
      else toAsk.push(cluster);
    }

    if (toAsk.length > 0 && this.withinBudget()) {
      try {
        const fresh = await this.callModel(userId, toAsk.slice(0, MAX_CLUSTERS_PER_CALL));
        this.budgetUsed += 1;
        for (const cluster of toAsk) {
          const r = fresh.get(cluster.key);
          if (r) {
            resolved.set(cluster.key, r);
            this.cache.set(this.cacheKey(cluster), r);
          }
        }
      } catch (error) {
        logger.debug({ error, userId }, 'SocietyResolver: model call failed; using deterministic results');
      }
    }

    const out: SocietyCluster[] = [];
    for (const cluster of clusters) {
      const r = resolved.get(cluster.key);
      if (!r) { out.push(cluster); continue; }
      if (r.drop) continue;
      out.push({
        ...cluster,
        name: r.name?.trim() || cluster.name,
        group_type: r.group_type && GROUP_TYPES.includes(r.group_type) ? r.group_type : cluster.group_type,
        user_relationship: r.user_relationship && USER_RELATIONSHIPS.includes(r.user_relationship)
          ? r.user_relationship : cluster.user_relationship,
        metadata: { ...cluster.metadata, llm_resolved: true },
      });
    }
    return out;
  }

  private async callModel(userId: string, clusters: SocietyCluster[]): Promise<Map<string, Resolution>> {
    const payload = clusters.map(c => ({
      key: c.key,
      members: c.memberNames,
      detected_type: c.group_type,
      evidence: c.evidence.slice(0, 3),
    }));

    const system = [
      'You name and classify social groups detected in a personal journaling app.',
      'For each group you are given its members and short evidence snippets quoted from the user.',
      'Return STRICT JSON: {"groups":[{"key","name","group_type","user_relationship","drop"}]}.',
      `group_type ∈ ${GROUP_TYPES.join('|')}. user_relationship ∈ ${USER_RELATIONSHIPS.join('|')}.`,
      'Rules:',
      '- name: a short, natural, human name for the group (e.g. "Los Goths", "Tía Grace\'s Household"). No quotes.',
      '- Prefer the evidence over the detected_type if the type is clearly wrong.',
      '- drop=true ONLY if the people are not actually a group (a coincidental co-mention).',
      '- Keep the SAME key for each group. Output every group exactly once.',
    ].join('\n');

    const completion = await tracedCompletion(
      {
        model: config.defaultModel,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: JSON.stringify({ groups: payload }) },
        ],
        max_tokens: 1200,
      },
      { service: 'societyResolver', userId }
    );

    const content = completion.choices[0]?.message?.content ?? '{}';
    return SocietyResolver.parse(content);
  }

  /** Parse the model's JSON into a key→Resolution map. Exported-ish for tests. */
  static parse(content: string): Map<string, Resolution> {
    const out = new Map<string, Resolution>();
    let json: any;
    try { json = JSON.parse(content); } catch { return out; }
    const groups = Array.isArray(json?.groups) ? json.groups : [];
    for (const g of groups) {
      if (!g || typeof g.key !== 'string') continue;
      out.set(g.key, {
        name: typeof g.name === 'string' ? g.name : undefined,
        group_type: typeof g.group_type === 'string' ? g.group_type as GroupType : undefined,
        user_relationship: typeof g.user_relationship === 'string' ? g.user_relationship as UserRelationship : undefined,
        drop: g.drop === true,
      });
    }
    return out;
  }
}

export const societyResolver = new SocietyResolver();
export { SocietyResolver };
