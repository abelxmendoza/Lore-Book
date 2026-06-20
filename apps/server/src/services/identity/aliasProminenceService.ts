/**
 * Tracks alias prominence and suggests title promotion from usage patterns.
 */

import { randomUUID } from 'crypto';
import type {
  CharacterAlias,
  CharacterAliasType,
  CharacterDisplayTitle,
  TitleUpdateProposal,
} from './personDisplayTitleTypes';

export type AliasUsageRecord = {
  value: string;
  aliasType: CharacterAliasType;
  count: number;
  firstSeenAt: string;
  lastSeenAt: string;
  preferred?: boolean;
};

export type AliasProminenceMap = Record<string, AliasUsageRecord>;

const PROMOTION_THRESHOLD = 8;
const PROMOTION_RATIO = 3;

function aliasKey(value: string): string {
  return value.trim().toLowerCase();
}

export function computeProminenceScore(record: AliasUsageRecord, primaryTitle: string): number {
  const base = Math.min(100, record.count * 8);
  const preferredBoost = record.preferred ? 40 : 0;
  const typeBoost =
    record.aliasType === 'stage_name' ? 25 : record.aliasType === 'nickname' ? 15 : 0;
  const primaryPenalty = aliasKey(record.value) === aliasKey(primaryTitle) ? -100 : 0;
  return Math.max(0, Math.min(100, base + preferredBoost + typeBoost + primaryPenalty));
}

export function recordAliasUsage(
  map: AliasProminenceMap,
  value: string,
  aliasType: CharacterAliasType,
  now = new Date().toISOString()
): AliasProminenceMap {
  const key = aliasKey(value);
  if (!key) return map;
  const existing = map[key];
  const next: AliasUsageRecord = existing
    ? { ...existing, count: existing.count + 1, lastSeenAt: now }
    : { value: value.trim(), aliasType, count: 1, firstSeenAt: now, lastSeenAt: now };
  return { ...map, [key]: next };
}

export function aliasesFromProminenceMap(
  map: AliasProminenceMap,
  primaryTitle: string
): CharacterAlias[] {
  return Object.values(map).map((rec) => ({
    id: aliasKey(rec.value),
    value: rec.value,
    aliasType: rec.aliasType,
    prominenceScore: computeProminenceScore(rec, primaryTitle),
    evidenceCount: rec.count,
    firstSeenAt: rec.firstSeenAt,
    lastSeenAt: rec.lastSeenAt,
  }));
}

export function suggestAliasTitlePromotion(
  displayTitle: CharacterDisplayTitle,
  prominenceMap: AliasProminenceMap
): TitleUpdateProposal | null {
  if (displayTitle.stability === 'locked') return null;

  const primaryKey = aliasKey(displayTitle.primaryTitle);
  const primaryCount =
    prominenceMap[primaryKey]?.count ??
    displayTitle.aliases.find((a) => aliasKey(a.value) === primaryKey)?.evidenceCount ??
    1;

  let best: { alias: CharacterAlias; score: number } | null = null;

  for (const rec of Object.values(prominenceMap)) {
    const alias: CharacterAlias = {
      id: aliasKey(rec.value),
      value: rec.value,
      aliasType: rec.aliasType,
      prominenceScore: computeProminenceScore(rec, displayTitle.primaryTitle),
      evidenceCount: rec.count,
      firstSeenAt: rec.firstSeenAt,
      lastSeenAt: rec.lastSeenAt,
    };

    if (aliasKey(alias.value) === primaryKey) continue;
    if (rec.preferred) {
      return {
        proposedPrimaryTitle: rec.value,
        proposedTitleType:
          rec.aliasType === 'stage_name' ? 'stage_name' : rec.aliasType === 'nickname' ? 'nickname' : displayTitle.titleType,
        proposedParts: { ...displayTitle.titleParts, nickname: rec.value },
        reason: 'user_marked_preferred_alias',
        stability: 'suggested_update',
        preservePreviousAsAlias: true,
      };
    }

    if (rec.count >= PROMOTION_THRESHOLD && rec.count >= primaryCount * PROMOTION_RATIO) {
      if (!best || alias.prominenceScore > best.score) {
        best = { alias, score: alias.prominenceScore };
      }
    }
  }

  if (!best) return null;

  return {
    proposedPrimaryTitle: best.alias.value,
    proposedTitleType:
      best.alias.aliasType === 'stage_name'
        ? 'stage_name'
        : best.alias.aliasType === 'nickname'
          ? 'nickname'
          : displayTitle.titleType,
    proposedParts: {
      ...displayTitle.titleParts,
      nickname: best.alias.aliasType === 'nickname' ? best.alias.value : displayTitle.titleParts.nickname,
      stageName: best.alias.aliasType === 'stage_name' ? best.alias.value : displayTitle.titleParts.stageName,
    },
    reason: `alias_used_${best.alias.evidenceCount}x_vs_primary_${primaryCount}x`,
    stability: 'suggested_update',
    preservePreviousAsAlias: true,
  };
}

export function mergeAliasIntoList(
  aliases: CharacterAlias[],
  value: string,
  aliasType: CharacterAliasType
): CharacterAlias[] {
  const key = aliasKey(value);
  const existing = aliases.find((a) => aliasKey(a.value) === key);
  if (existing) {
    return aliases.map((a) =>
      aliasKey(a.value) === key
        ? { ...a, evidenceCount: a.evidenceCount + 1, lastSeenAt: new Date().toISOString() }
        : a
    );
  }
  return [
    ...aliases,
    {
      id: randomUUID(),
      value: value.trim(),
      aliasType,
      prominenceScore: 0,
      evidenceCount: 1,
      firstSeenAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
    },
  ];
}
