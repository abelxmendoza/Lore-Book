import type { DemoEffectDetail, DemoEffectKind } from '../services/demoMutationEffects';

export type CelebrationVariant =
  | 'romantic'
  | 'skill'
  | 'character'
  | 'location'
  | 'quest'
  | 'memory'
  | 'value'
  | 'organization';

export type CelebrationPayload = {
  variant: CelebrationVariant;
  label: string;
  subtitle?: string;
  xp?: number;
  durationMs?: number;
};

const CELEBRATION_EVENT = 'lk:celebration';

const DEMO_KIND_TO_VARIANT: Partial<Record<DemoEffectKind, CelebrationVariant>> = {
  skill_added: 'skill',
  character_saved: 'character',
  character_archived: 'character',
  location_added: 'location',
  quest_created: 'quest',
  quest_completed: 'quest',
  memory_approved: 'memory',
  memory_edited: 'memory',
  value_priority: 'value',
  group_added: 'organization',
  resume_uploaded: 'character',
  photo_uploaded: 'memory',
  document_uploaded: 'memory',
};

/** Fire a full-screen celebration overlay (global host renders it). */
export function triggerCelebration(payload: CelebrationPayload): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<CelebrationPayload>(CELEBRATION_EVENT, { detail: payload }));
}

export function celebrationForDemoEffect(detail: DemoEffectDetail): CelebrationPayload | null {
  const variant = DEMO_KIND_TO_VARIANT[detail.kind];
  if (!variant) return null;
  return {
    variant,
    label: detail.title,
    subtitle: detail.subtitle,
    xp: detail.xp,
  };
}

export { CELEBRATION_EVENT };
