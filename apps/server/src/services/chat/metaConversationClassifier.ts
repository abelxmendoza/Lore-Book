/**
 * Classifies whether a user message is about LoreBook (the product) vs lived experience.
 * Used to gate biography extraction and to capture product conversation lore.
 */

export type IngestionScope = 'product_only' | 'mixed' | 'life';

/** Product names that must never become character/location cards. */
const LOREBOOK_PRODUCT_NAMES = /^(lore\s?book|lorekeeper|lore\s?keeper)$/i;

/** Strong signals the message is about the app, not the user's life. */
const PRODUCT_SIGNAL_PATTERNS: RegExp[] = [
  /\blore\s?book\b/i,
  /\blorekeeper\b/i,
  /\b(this|the) app\b/i,
  /\bhow does (this|the app|memory|extraction|recall)\b/i,
  /\b(do you|will you|can you) remember\b/i,
  /\bdid you (save|create|add|extract|capture)\b/i,
  /\b(character|location|entity) (card|chip|book)\b/i,
  /\bcomposer\b/i,
  /\bmemory review\b/i,
  /\bextraction pipeline\b/i,
  /\btesting (the |this |)app\b/i,
  /\bbug\b/i,
  /\bfeature request\b/i,
  /\bwish (lore\s?book|the app|you) (would|could)\b/i,
  /\bwhat (gets|is) (saved|extracted|stored)\b/i,
  /\bwhere (can i|do i) (see|find|view) (my )?(memories|characters|timeline)\b/i,
];

/** Pure meta — no autobiographical content expected. Mirrors memoryExtractionService. */
const PURE_META_PATTERNS: RegExp[] = [
  /\bdo you remember\b/i,
  /\bcan you remember\b/i,
  /\bwill you remember\b/i,
  /\bdid you save\b/i,
  /\bcan you recall\b/i,
  /\bwill this update\b/i,
  /\bremember this conversation\b/i,
  /\bremember what (i|we) (just |)talked about\b/i,
  /\bcharacter card\b/i,
  /\blocation card\b/i,
  /\btesting (the |this |)app\b/i,
  /\btesting (for |)new changes\b/i,
  /\bhow does this (app|work)\b/i,
  /\bwhat do you (know about me|remember about me)\b/i,
  /\bdo you know who i am\b/i,
  /\byou (don't|dont) already know\b/i,
  /\blore\s?books? (not working|is broken|broken|buggy)\b/i,
  /\bwhat is lore\s?book\b/i,
  /\bhow does lore\s?book work\b/i,
];

/** Life-content cues — if present alongside product talk, biography extraction may apply. */
const LIFE_SIGNAL_PATTERNS: RegExp[] = [
  /\b(my|our) (mom|dad|mother|father|wife|husband|partner|friend|boss|coworker|abuela|tío|tia|uncle|aunt|sister|brother|son|daughter|kid|kids|family)\b/i,
  /\b(went to|visited|traveled|trip to|dinner with|coffee with|met with|hung out with)\b/i,
  /\b(yesterday|last week|last month|last year|on monday|this morning|tonight)\b/i,
  /\b(i feel|i felt|i'm feeling|i was feeling|stressed|anxious|happy|sad|excited)\b/i,
  /\b(work|job|school|class|interview|wedding|funeral|birthday|vacation)\b/i,
  /\b(costa rica|mexico|california|home|apartment|house)\b/i,
];

export function isLoreBookProductName(name: string): boolean {
  return LOREBOOK_PRODUCT_NAMES.test(name.trim());
}

export function mentionsLoreBookProduct(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return PRODUCT_SIGNAL_PATTERNS.some((p) => p.test(trimmed));
}

export function isPureMetaProductMessage(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return PURE_META_PATTERNS.some((p) => p.test(trimmed));
}

/** @deprecated Use isPureMetaProductMessage — kept for memoryExtractionService parity. */
export function isMetaMessage(content: string): boolean {
  return isPureMetaProductMessage(content);
}

export function hasLifeContentSignals(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return LIFE_SIGNAL_PATTERNS.some((p) => p.test(trimmed));
}

/**
 * Decide how ingestion should treat a USER message.
 * - product_only: capture product lore; skip biography extraction
 * - mixed: extract life content; filter LoreBook from entity cards
 * - life: normal ingestion
 */
export function classifyIngestionScope(text: string): IngestionScope {
  const trimmed = text.trim();
  if (!trimmed) return 'life';

  if (isPureMetaProductMessage(trimmed)) {
    return hasLifeContentSignals(trimmed) ? 'mixed' : 'product_only';
  }

  if (!mentionsLoreBookProduct(trimmed)) {
    return 'life';
  }

  return hasLifeContentSignals(trimmed) ? 'mixed' : 'product_only';
}
