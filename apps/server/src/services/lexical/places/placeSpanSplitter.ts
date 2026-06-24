/**
 * Split mixed spans that fuse multiple entity types ("LA and Oscuri", "Sol in a few weeks").
 */

import { resolvePlaceBoundary } from './placeBoundaryResolver';

const TIME_INLINE =
  /^(?:a\s+)?(?:few|couple)\s+weeks?(?:\s+ago)?$|^(?:last\s+night|yesterday|today|tonight|ago)$/i;

const PERSON_ALIAS = /^[A-Za-z][\w.-]*\.(?:dad|mom|bro|sis|uncle|aunt)$/i;

export type SplitPiece = {
  text: string;
  splitReason: string;
};

export function splitMixedSpan(span: string): SplitPiece[] {
  const trimmed = span.trim();
  if (!trimmed) return [];

  if (/[.!?]\s+/.test(trimmed)) {
    const parts = trimmed
      .split(/[.!?]\s+/)
      .map(p => p.replace(/[.!?]+$/g, '').trim())
      .filter(Boolean);
    if (parts.length > 1) {
      return parts.map(text => ({ text, splitReason: 'sentence_boundary' }));
    }
  }

  // "LA and Oscuri.dad" → split on coordination
  if (/\s+and\s+/i.test(trimmed)) {
    const parts = trimmed.split(/\s+and\s+/i).map(p => p.trim()).filter(Boolean);
    if (parts.length > 1 && parts.some(isLikelyPersonAlias) && parts.some(isLikelyPlaceToken)) {
      return parts.map(text => ({ text, splitReason: 'coordination_and' }));
    }
  }

  // "Sol in a few weeks" → person + time, not place
  const inSplit = trimmed.match(/^(.+?)\s+in\s+(.+)$/i);
  if (inSplit) {
    const [, head, tail] = inSplit;
    if (TIME_INLINE.test(tail.trim()) && isLikelyPersonName(head.trim())) {
      return [
        { text: head.trim(), splitReason: 'person_before_time_in' },
        { text: tail.trim(), splitReason: 'time_after_in' },
      ];
    }
  }

  // "Ska Prom a couple weeks ago"
  const timeTail = trimmed.match(/^(.+?)\s+(a\s+(?:few|couple)\s+weeks?(?:\s+ago)?)$/i);
  if (timeTail) {
    return [
      { text: timeTail[1].trim(), splitReason: 'event_before_time' },
      { text: timeTail[2].trim(), splitReason: 'time_period_tail' },
    ];
  }

  const resolved = resolvePlaceBoundary(trimmed);
  if (resolved.text !== trimmed) {
    const pieces: SplitPiece[] = [{ text: resolved.text, splitReason: 'boundary_trim' }];
    if (resolved.trimmedSuffix) {
      pieces.push({ text: resolved.trimmedSuffix, splitReason: 'trimmed_suffix' });
    }
    return pieces;
  }

  return [{ text: trimmed, splitReason: 'unsplit' }];
}

function isLikelyPersonName(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > 40) return false;
  if (PERSON_ALIAS.test(t)) return true;
  const words = t.split(/\s+/);
  if (words.length === 1 && /^[A-Z][a-z]{1,15}$/.test(t)) return true;
  if (words.length === 2 && /^[A-Z][a-z]+\s+[A-Z][a-z]+$/.test(t)) return true;
  return false;
}

function isLikelyPlaceToken(text: string): boolean {
  const key = text.trim().toLowerCase();
  if (key === 'la' || key === 'los angeles') return true;
  if (/^[A-Z]{2,5}$/.test(text.trim()) && key.length <= 5) return true;
  return false;
}

function isLikelyPersonAlias(text: string): boolean {
  return PERSON_ALIAS.test(text) || /^[A-Z][a-z]+$/.test(text) && text.length <= 12;
}
