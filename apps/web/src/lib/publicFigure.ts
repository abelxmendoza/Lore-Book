import type { Character } from '../components/characters/CharacterProfileCard';

export type PublicFigureConnectionStage =
  | 'distant_fan'
  | 'scene_presence'
  | 'brief_contact'
  | 'growing'
  | 'connected';

export const CONNECTION_STAGE_LABELS: Record<PublicFigureConnectionStage, string> = {
  distant_fan: 'Distant fan',
  scene_presence: 'Same scene',
  brief_contact: 'Brief contact',
  growing: 'Growing connection',
  connected: 'Connected',
};

const IMPACT_CAP_BY_STAGE: Record<PublicFigureConnectionStage, number> = {
  distant_fan: 25,
  scene_presence: 35,
  brief_contact: 50,
  growing: 65,
  connected: 80,
};

export function isPublicFigureCharacter(char: Character): boolean {
  const meta = char.metadata as Record<string, unknown> | undefined;
  return Boolean(
    meta?.public_figure ||
    meta?.figure_type ||
    char.importance_level === 'public_figure' ||
    (meta?.social_standing as { tier?: string } | undefined)?.tier === 'public_figure'
  );
}

export function getPublicFigureConnection(char: Character) {
  return (char.metadata as Record<string, unknown> | undefined)?.public_figure_connection as {
    stage?: PublicFigureConnectionStage;
    confidence?: number;
    inferred_met?: boolean;
    interactions?: Array<{ type?: string; evidence?: string; source?: string }>;
  } | undefined;
}

export function getSceneNetwork(char: Character) {
  return (char.metadata as Record<string, unknown> | undefined)?.scene_network as {
    score?: number;
    tier?: string;
    public_figure_count?: number;
    deepest_stage?: string;
  } | undefined;
}

/** Caps analytics impact for public figures unless the user pinned an override. */
export function impactOnUserWithPublicFigureCap(char: Character): number {
  const override = (char.metadata as Record<string, unknown> | undefined)?.impact_override;
  if (typeof override === 'number') return override;

  let base = char.analytics?.character_influence_on_user ?? 0;
  if (!isPublicFigureCharacter(char)) return base;

  const stage = getPublicFigureConnection(char)?.stage ?? 'distant_fan';
  const cap = IMPACT_CAP_BY_STAGE[stage] ?? 30;
  return Math.min(base, cap);
}

export function formatSceneNetworkTier(tier?: string): string {
  return (tier ?? 'underground').replace(/_/g, ' ');
}
