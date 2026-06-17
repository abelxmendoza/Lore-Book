/**
 * Public Figure Relationship Engine
 *
 * Infers whether the user actually interacted with a public figure (not just
 * heard about them) from story context: co-located events, venues, cast, and
 * language cues. Deepening connections can raise the user's scene-network
 * standing on their protagonist card.
 */
import { logger } from '../../logger';
import { normalizeNameKey } from '../../utils/nameNormalization';
import { loadStoryEvidence } from '../inference/evidenceService';
import { supabaseAdmin } from '../supabaseClient';
import { detectPublicFigureProfile, type CloutLevel } from './publicFigureDetection';
import { inferFromEpisodes } from './publicFigureInferenceUtils';
import type {
  ConnectionStage,
  InferredInteraction,
  PublicFigureConnection,
  SceneNetworkStatus,
} from './publicFigureTypes';

export type {
  ConnectionStage,
  InferredInteraction,
  PublicFigureConnection,
  SceneNetworkStatus,
} from './publicFigureTypes';

export type PublicFigureInferenceReport = {
  scanned: number;
  publicFigures: number;
  updated: number;
  metInferred: number;
  sceneNetwork: SceneNetworkStatus | null;
};

type CharRow = {
  id: string;
  name: string;
  role: string | null;
  summary: string | null;
  tags: string[] | null;
  archetype: string | null;
  importance_level: string | null;
  importance_score: number | null;
  relationship_depth: string | null;
  proximity_level: string | null;
  has_met: boolean | null;
  metadata: Record<string, unknown> | null;
};

const STAGE_RANK: Record<ConnectionStage, number> = {
  distant_fan: 0,
  scene_presence: 1,
  brief_contact: 2,
  growing: 3,
  connected: 4,
};

const IMPORTANCE_RANK: Record<string, number> = {
  background: 0, minor: 1, supporting: 2, major: 3, protagonist: 4,
};

function stageCap(stage: ConnectionStage, archetype: string | null): string {
  if (stage === 'connected' && (archetype === 'friend' || archetype === 'collaborator' || archetype === 'romantic')) {
    return 'major';
  }
  if (stage === 'growing') return 'supporting';
  if (stage === 'brief_contact') return 'supporting';
  return 'minor';
}

function depthForStage(stage: ConnectionStage): string {
  if (stage === 'connected') return 'moderate';
  if (stage === 'growing' || stage === 'brief_contact') return 'casual';
  if (stage === 'scene_presence') return 'mentioned_only';
  return 'mentioned_only';
}

function proximityForStage(stage: ConnectionStage): string {
  if (stage === 'connected' || stage === 'growing' || stage === 'brief_contact') return 'direct';
  if (stage === 'scene_presence') return 'indirect';
  return 'distant';
}

function stageFromInteractions(interactions: InferredInteraction[]): ConnectionStage {
  if (interactions.some((i) => i.type === 'explicit_dialogue' && i.confidence >= 0.85)) {
    const explicit = interactions.filter((i) => i.type === 'explicit_dialogue').length;
    return explicit >= 2 ? 'growing' : 'brief_contact';
  }
  if (interactions.some((i) => i.type === 'co_event')) return 'scene_presence';
  if (interactions.some((i) => i.type === 'co_location' || i.type === 'scene_context')) {
    return 'scene_presence';
  }
  return 'distant_fan';
}

function cloutBoost(clout: CloutLevel | undefined): number {
  const map: Record<CloutLevel, number> = {
    local: 0.05, emerging: 0.1, rising: 0.15, established: 0.2, prominent: 0.25, global: 0.3,
  };
  return map[clout ?? 'emerging'] ?? 0.1;
}

class PublicFigureRelationshipService {
  private buildCoEventsFromEvidence(
    chars: CharRow[],
    evidence: Awaited<ReturnType<typeof loadStoryEvidence>>
  ): Map<string, InferredInteraction[]> {
    const omegaToChar = new Map<string, string>();
    for (const c of chars) {
      const oid = c.metadata?.omega_entity_id as string | undefined;
      if (oid) omegaToChar.set(oid, c.id);
    }
    const byChar = new Map<string, InferredInteraction[]>();
    for (const ev of evidence.resolvedEvents) {
      const charIds = ev.people.map((p) => omegaToChar.get(p)).filter(Boolean) as string[];
      if (charIds.length < 2) continue;
      const label = [ev.title, ev.summary].filter(Boolean).join(' — ').slice(0, 120);
      for (const id of charIds) {
        const list = byChar.get(id) ?? [];
        list.push({
          type: 'co_event',
          confidence: 0.7,
          evidence: label || 'Shared story event',
          source: 'event',
        });
        byChar.set(id, list);
      }
    }
    return byChar;
  }

  private capImportance(
    currentLevel: string | null,
    currentScore: number | null,
    stage: ConnectionStage,
    archetype: string | null
  ): { importance_level: string; importance_score: number } {
    const cap = stageCap(stage, archetype);
    const capRank = IMPORTANCE_RANK[cap] ?? 1;
    const curRank = IMPORTANCE_RANK[currentLevel ?? 'minor'] ?? 1;
    const level = curRank > capRank ? cap : (currentLevel ?? cap);
    const maxScore = stage === 'connected' ? 75 : stage === 'growing' ? 55 : stage === 'brief_contact' ? 45 : 35;
    const score = Math.min(currentScore ?? maxScore, maxScore);
    if (level === 'protagonist') return { importance_level: 'supporting', importance_score: Math.min(score, 50) };
    return { importance_level: level, importance_score: score };
  }

  private buildSceneNetwork(connections: Array<{ stage: ConnectionStage; clout?: CloutLevel }>): SceneNetworkStatus {
    let score = 0;
    let deepest: ConnectionStage = 'distant_fan';
    for (const c of connections) {
      score += STAGE_RANK[c.stage] * 12 + cloutBoost(c.clout) * 100;
      if (STAGE_RANK[c.stage] > STAGE_RANK[deepest]) deepest = c.stage;
    }
    score = Math.min(100, Math.round(score));
    const tier: SceneNetworkStatus['tier'] =
      score >= 70 ? 'scene_insider'
      : score >= 45 ? 'connector'
      : score >= 20 ? 'scene_regular'
      : 'underground';
    return {
      score,
      tier,
      public_figure_count: connections.length,
      deepest_stage: deepest,
      updated_at: new Date().toISOString(),
    };
  }

  async inferForUser(userId: string): Promise<PublicFigureInferenceReport> {
    const { data: charData } = await supabaseAdmin
      .from('characters')
      .select('id, name, role, summary, tags, archetype, importance_level, importance_score, relationship_depth, proximity_level, has_met, metadata')
      .eq('user_id', userId)
      .neq('status', 'archived');

    const chars = (charData ?? []) as CharRow[];
    if (chars.length === 0) {
      return { scanned: 0, publicFigures: 0, updated: 0, metInferred: 0, sceneNetwork: null };
    }

    const evidence = await loadStoryEvidence(userId);
    const coEvents = this.buildCoEventsFromEvidence(chars, evidence);
    const connectionRows: Array<{ stage: ConnectionStage; clout?: CloutLevel }> = [];
    let updated = 0;
    let metInferred = 0;
    let publicFigures = 0;

    for (const char of chars) {
      const profile = detectPublicFigureProfile({
        name: char.name,
        role: char.role,
        summary: char.summary,
        tags: char.tags,
        metadata: char.metadata,
      });
      if (!profile.isPublicFigure) continue;
      publicFigures += 1;

      const textHits = inferFromEpisodes(char.name, evidence.episodes);
      const eventHits = coEvents.get(char.id) ?? [];
      const interactions = [...textHits, ...eventHits].slice(0, 10);
      const stage = stageFromInteractions(interactions);
      const confidence = interactions.length
        ? Math.min(0.95, interactions.reduce((s, i) => s + i.confidence, 0) / interactions.length)
        : 0.3;

      const connection: PublicFigureConnection = {
        stage,
        interactions,
        confidence,
        inferred_met: stage !== 'distant_fan',
        updated_at: new Date().toISOString(),
      };

      const { importance_level, importance_score } = this.capImportance(
        char.importance_level,
        char.importance_score,
        stage,
        char.archetype
      );

      const meta = {
        ...(char.metadata ?? {}),
        public_figure: true,
        figure_type: profile.figureType,
        clout_level: profile.cloutLevel,
        public_figure_connection: connection,
        public_figure_detected_by: profile.reason,
      };

      const update: Record<string, unknown> = {
        metadata: meta,
        importance_level,
        importance_score,
        updated_at: new Date().toISOString(),
      };

      if (stage !== 'distant_fan') {
        update.has_met = true;
        update.proximity_level = proximityForStage(stage);
        const depth = depthForStage(stage);
        const curDepth = char.relationship_depth ?? 'mentioned_only';
        const depthRank: Record<string, number> = { mentioned_only: 0, casual: 1, moderate: 2, close: 3, deep: 4 };
        if ((depthRank[depth] ?? 0) > (depthRank[curDepth] ?? 0)) {
          update.relationship_depth = depth;
        }
        metInferred += 1;
      } else if (char.has_met == null) {
        update.has_met = false;
        update.proximity_level = 'distant';
      }

      await supabaseAdmin.from('characters').update(update).eq('id', char.id).eq('user_id', userId);
      updated += 1;
      connectionRows.push({ stage, clout: profile.cloutLevel });
    }

    let sceneNetwork: SceneNetworkStatus | null = null;
    if (connectionRows.length > 0) {
      sceneNetwork = this.buildSceneNetwork(connectionRows);
      const { data: selfRows } = await supabaseAdmin
        .from('characters')
        .select('id, metadata')
        .eq('user_id', userId)
        .or('metadata->>is_self.eq.true,importance_level.eq.protagonist')
        .limit(1);
      const self = selfRows?.[0] as { id: string; metadata: Record<string, unknown> | null } | undefined;
      if (self) {
        await supabaseAdmin
          .from('characters')
          .update({
            metadata: { ...(self.metadata ?? {}), scene_network: sceneNetwork },
            updated_at: new Date().toISOString(),
          })
          .eq('id', self.id)
          .eq('user_id', userId);
      }
    }

    logger.info({ userId, publicFigures, updated, metInferred, sceneTier: sceneNetwork?.tier }, 'Public figure relationships inferred');
    return { scanned: chars.length, publicFigures, updated, metInferred, sceneNetwork };
  }
}

export const publicFigureRelationshipService = new PublicFigureRelationshipService();
