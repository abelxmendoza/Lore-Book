import type { LoreBookNoticeEvent, LoreBookNoticeItem } from './loreBookNoticeTypes';

const DOMAIN_LABEL: Record<LoreBookNoticeItem['domain'], string> = {
  characters: 'character',
  locations: 'place',
  skills: 'skill',
  projects: 'project',
  quests: 'quest',
};

/** Stable dedupe key — O(1) lookup. */
export function loreBookNoticeItemKey(item: Pick<LoreBookNoticeItem, 'domain' | 'name'>): string {
  return `${item.domain}:${item.name.trim().toLowerCase()}`;
}

function formatItemLabel(item: LoreBookNoticeItem): string {
  const label = DOMAIN_LABEL[item.domain] ?? 'entry';
  return `${item.name} (${label})`;
}

/** Accurate, concise toast copy from notice items. */
export function formatLoreBookNoticeMessage(items: LoreBookNoticeItem[]): string {
  if (items.length === 0) return '';

  if (items.length === 1) {
    const [item] = items;
    const label = DOMAIN_LABEL[item.domain] ?? 'entry';
    return `LoreBook noticed a new ${label}: ${item.name}`;
  }

  if (items.length === 2) {
    return `LoreBook noticed ${formatItemLabel(items[0])} and ${formatItemLabel(items[1])}`;
  }

  const primary = formatItemLabel(items[0]);
  const others = items.length - 1;
  return `LoreBook noticed ${primary} and ${others} other${others === 1 ? '' : 's'}`;
}

export type LoreBookNoticeGateState = {
  toastTimestamps: number[];
  seenItemKeys: Set<string>;
};

export type LoreBookNoticeGateOptions = {
  maxToastsPerWindow?: number;
  windowMs?: number;
  minConfidence?: number;
};

const DEFAULT_WINDOW_MS = 10 * 60 * 1000;
const DEFAULT_MAX_TOASTS = 2;
const DEFAULT_MIN_CONFIDENCE = 0.68;

/**
 * Client-side anti-spam gate. O(n) over notice items; filters already-seen
 * and low-confidence entries, then enforces a sliding-window toast cap.
 */
export function evaluateLoreBookNoticeGate(
  notice: LoreBookNoticeEvent,
  state: LoreBookNoticeGateState,
  options: LoreBookNoticeGateOptions = {}
): { shouldShow: boolean; message: string; nextState: LoreBookNoticeGateState; items: LoreBookNoticeItem[] } {
  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
  const maxToasts = options.maxToastsPerWindow ?? DEFAULT_MAX_TOASTS;
  const minConfidence = options.minConfidence ?? DEFAULT_MIN_CONFIDENCE;
  const now = Date.now();

  const freshItems = notice.items.filter((item) => {
    if (item.confidence < minConfidence) return false;
    const key = loreBookNoticeItemKey(item);
    return !state.seenItemKeys.has(key);
  });

  const nextState: LoreBookNoticeGateState = {
    toastTimestamps: state.toastTimestamps.filter((t) => now - t < windowMs),
    seenItemKeys: new Set(state.seenItemKeys),
  };

  if (freshItems.length === 0) {
    return { shouldShow: false, message: '', nextState, items: [] };
  }

  if (nextState.toastTimestamps.length >= maxToasts) {
    return { shouldShow: false, message: '', nextState, items: [] };
  }

  for (const item of freshItems) {
    nextState.seenItemKeys.add(loreBookNoticeItemKey(item));
  }
  nextState.toastTimestamps.push(now);

  return {
    shouldShow: true,
    message: formatLoreBookNoticeMessage(freshItems),
    nextState,
    items: freshItems,
  };
}

const SESSION_STORAGE_KEY = 'lorebook-notice-gate-v1';

type PersistedGate = {
  toastTimestamps: number[];
  seenItemKeys: string[];
};

export function loadLoreBookNoticeGateState(): LoreBookNoticeGateState {
  if (typeof sessionStorage === 'undefined') {
    return { toastTimestamps: [], seenItemKeys: new Set() };
  }
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return { toastTimestamps: [], seenItemKeys: new Set() };
    const parsed = JSON.parse(raw) as PersistedGate;
    return {
      toastTimestamps: Array.isArray(parsed.toastTimestamps) ? parsed.toastTimestamps : [],
      seenItemKeys: new Set(Array.isArray(parsed.seenItemKeys) ? parsed.seenItemKeys : []),
    };
  } catch {
    return { toastTimestamps: [], seenItemKeys: new Set() };
  }
}

export function saveLoreBookNoticeGateState(state: LoreBookNoticeGateState): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    const payload: PersistedGate = {
      toastTimestamps: state.toastTimestamps,
      seenItemKeys: [...state.seenItemKeys],
    };
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Quota or privacy mode — non-critical
  }
}
