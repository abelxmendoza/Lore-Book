import { getGlobalIsGuest, getGlobalMockDataEnabled } from '../contexts/MockDataContext';
import { dispatchStoryDataUpdated, type StoryRefreshScope } from '../lib/storyRefresh';
import { celebrationForDemoEffect, triggerCelebration } from '../lib/celebrations';

export type DemoEffectKind =
  | 'quest_created'
  | 'quest_completed'
  | 'quest_updated'
  | 'character_saved'
  | 'character_archived'
  | 'value_priority'
  | 'location_added'
  | 'skill_added'
  | 'group_added'
  | 'memory_approved'
  | 'memory_rejected'
  | 'memory_edited'
  | 'memory_deferred'
  | 'resume_uploaded'
  | 'photo_uploaded'
  | 'document_uploaded'
  | 'processing';

export interface DemoEffectDetail {
  kind: DemoEffectKind;
  title: string;
  subtitle?: string;
  xp?: number;
  rippleScopes?: StoryRefreshScope[];
  delayMs?: number;
  /** Override toast policy for this event. */
  showToast?: boolean;
}

/** Kinds that surface a toast — everything else is silent (ripples/activity only). */
const TOAST_KINDS = new Set<DemoEffectKind>([
  'quest_created',
  'quest_completed',
  'character_saved',
  'character_archived',
  'value_priority',
  'location_added',
  'group_added',
  'memory_approved',
  'memory_edited',
  'resume_uploaded',
  'photo_uploaded',
  'document_uploaded',
]);

export function shouldShowDemoToast(kind: DemoEffectKind, override?: boolean): boolean {
  if (override != null) return override;
  return TOAST_KINDS.has(kind);
}

export function formatDemoToastMessage(detail: DemoEffectDetail): string {
  const parts = [detail.title.trim()];
  if (detail.subtitle?.trim()) parts.push(detail.subtitle.trim());
  if (detail.xp && detail.xp > 0) parts.push(`+${detail.xp} XP`);
  return parts.join(' · ');
}

const RIPPLE_DEBOUNCE_MS = 700;
let rippleTimer: ReturnType<typeof setTimeout> | null = null;
let pendingRippleScopes = new Set<StoryRefreshScope>();

function scheduleRipple(scopes: StoryRefreshScope[], delayMs: number): void {
  scopes.forEach((scope) => pendingRippleScopes.add(scope));
  if (rippleTimer) clearTimeout(rippleTimer);
  rippleTimer = setTimeout(() => {
    dispatchStoryDataUpdated({
      scopes: [...pendingRippleScopes],
      delayMs: Math.max(0, delayMs - RIPPLE_DEBOUNCE_MS),
    });
    pendingRippleScopes = new Set();
    rippleTimer = null;
  }, RIPPLE_DEBOUNCE_MS);
}

/** Test helper — reset debounced ripple state between tests. */
export function resetDemoEffectRippleScheduler(): void {
  if (rippleTimer) clearTimeout(rippleTimer);
  rippleTimer = null;
  pendingRippleScopes = new Set();
}

export type DemoActivityCounts = {
  quests: number;
  characters: number;
  places: number;
  skills: number;
  groups: number;
  memories: number;
  values: number;
};

const ACTIVITY_KEY = 'lk_demo_activity_v1';

const KIND_TO_ACTIVITY: Partial<Record<DemoEffectKind, keyof DemoActivityCounts>> = {
  quest_created: 'quests',
  quest_completed: 'quests',
  quest_updated: 'quests',
  character_saved: 'characters',
  character_archived: 'characters',
  value_priority: 'values',
  location_added: 'places',
  skill_added: 'skills',
  group_added: 'groups',
  memory_approved: 'memories',
  memory_rejected: 'memories',
  memory_edited: 'memories',
  memory_deferred: 'memories',
};

function readActivity(): DemoActivityCounts {
  const defaults: DemoActivityCounts = {
    quests: 0,
    characters: 0,
    places: 0,
    skills: 0,
    groups: 0,
    memories: 0,
    values: 0,
  };
  try {
    const raw = sessionStorage.getItem(ACTIVITY_KEY);
    if (!raw) return defaults;
    return { ...defaults, ...JSON.parse(raw) };
  } catch {
    return defaults;
  }
}

function bumpActivity(kind: DemoEffectKind): DemoActivityCounts {
  const field = KIND_TO_ACTIVITY[kind];
  if (!field || typeof window === 'undefined') return readActivity();
  const current = readActivity();
  const next = { ...current, [field]: current[field] + 1 };
  sessionStorage.setItem(ACTIVITY_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent('lk:demo-activity-updated', { detail: next }));
  return next;
}

export function getDemoActivityCounts(): DemoActivityCounts {
  return readActivity();
}

function isDemoEffectsEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return getGlobalMockDataEnabled() || getGlobalIsGuest();
  } catch {
    return false;
  }
}

export function emitDemoEffect(detail: DemoEffectDetail): void {
  if (!isDemoEffectsEnabled()) return;

  bumpActivity(detail.kind);

  if (shouldShowDemoToast(detail.kind, detail.showToast)) {
    window.dispatchEvent(new CustomEvent<DemoEffectDetail>('lk:demo-effect', { detail }));
  }

  const celebration = celebrationForDemoEffect(detail);
  if (celebration) {
    triggerCelebration(celebration);
  }

  if (detail.rippleScopes?.length) {
    scheduleRipple(detail.rippleScopes, detail.delayMs ?? 450);
  }
}

export function demoEffectMessage(
  kind: DemoEffectKind,
  label: string,
): Pick<DemoEffectDetail, 'title' | 'subtitle' | 'xp' | 'rippleScopes'> {
  switch (kind) {
    case 'quest_created':
      return {
        title: `"${label}" added to quest log`,
        rippleScopes: ['quests'],
      };
    case 'quest_completed':
      return {
        title: `Quest complete: ${label}`,
        xp: 120,
        rippleScopes: ['quests', 'story'],
      };
    case 'quest_updated':
      return { title: label, rippleScopes: ['quests'] };
    case 'character_saved':
      return {
        title: `${label} saved`,
        rippleScopes: ['characters'],
      };
    case 'character_archived':
      return {
        title: `${label} archived`,
        rippleScopes: ['characters'],
      };
    case 'value_priority':
      return {
        title: `${label} reprioritized`,
        rippleScopes: ['story'],
      };
    case 'location_added':
      return {
        title: `${label} added to Places`,
        rippleScopes: ['timeline', 'characters'],
      };
    case 'skill_added':
      return {
        title: `${label} added to Skills`,
        subtitle: 'Demo · new skill unlocked',
        xp: 35,
        rippleScopes: ['skills', 'story'],
      };
    case 'group_added':
      return {
        title: `${label} added to Groups`,
        xp: 40,
        rippleScopes: ['organizations', 'characters'],
      };
    case 'memory_approved':
      return {
        title: 'Memory saved to lore',
        subtitle: label.length > 48 ? `${label.slice(0, 45)}…` : label,
        rippleScopes: ['characters', 'story'],
      };
    case 'memory_rejected':
      return { title: 'Memory proposal dismissed', subtitle: label };
    case 'memory_edited':
      return {
        title: 'Memory refined before saving',
        subtitle: label,
        rippleScopes: ['characters'],
      };
    case 'memory_deferred':
      return { title: 'Saved for later review', subtitle: label };
    case 'resume_uploaded':
      return {
        title: 'Resume added to lore',
        subtitle: label,
        xp: 85,
        rippleScopes: ['characters', 'skills', 'story', 'timeline'],
      };
    case 'photo_uploaded':
      return {
        title: 'Photo saved to your story',
        subtitle: label,
        xp: 45,
        rippleScopes: ['timeline', 'characters', 'story'],
      };
    case 'document_uploaded':
      return {
        title: 'Document added to lore',
        subtitle: label,
        xp: 55,
        rippleScopes: ['story', 'characters', 'timeline'],
      };
    default:
      return { title: label };
  }
}
