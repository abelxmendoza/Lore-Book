import { and, cosineDistance, desc, eq, gte, isNotNull, lt, sql } from 'drizzle-orm';

import { db } from './client';
import { journalEntries, omegaClaims, omegaEntities } from './schema';

function requireDb() {
  if (!db) {
    throw new Error('Direct Postgres database is not configured');
  }
  return db;
}

export async function listRecentJournalEntries(userId: string, limit = 25) {
  return requireDb()
    .select({
      id: journalEntries.id,
      content: journalEntries.content,
      date: journalEntries.date,
      createdAt: journalEntries.createdAt,
    })
    .from(journalEntries)
    .where(eq(journalEntries.userId, userId))
    .orderBy(desc(journalEntries.createdAt))
    .limit(limit);
}

/**
 * Typed equivalent of the `match_journal_entries` Postgres RPC. Mirrors the SQL
 * exactly: cosine-distance threshold filter (`distance < threshold`), nearest-first
 * ordering, and the same projected columns + similarity. `embedding` is never
 * selected (egress), matching migration 20260629100000.
 */
export async function matchJournalEntries(
  userId: string,
  embedding: number[],
  threshold: number | null,
  limit: number,
  yearShardMin?: number,
) {
  const distance = cosineDistance(journalEntries.embedding, embedding);

  return requireDb()
    .select({
      id: journalEntries.id,
      user_id: journalEntries.userId,
      date: journalEntries.date,
      content: journalEntries.content,
      tags: journalEntries.tags,
      chapter_id: journalEntries.chapterId,
      mood: journalEntries.mood,
      summary: journalEntries.summary,
      source: journalEntries.source,
      metadata: journalEntries.metadata,
      similarity: sql<number>`1 - (${distance})`,
    })
    .from(journalEntries)
    .where(
      and(
        eq(journalEntries.userId, userId),
        isNotNull(journalEntries.embedding),
        threshold != null ? lt(distance, threshold) : undefined,
        yearShardMin != null ? gte(journalEntries.yearShard, yearShardMin) : undefined,
      ),
    )
    .orderBy(distance)
    .limit(limit);
}

export async function findSimilarJournalEntries(userId: string, embedding: number[], limit = 20) {
  const similarity = sql<number>`1 - (${cosineDistance(journalEntries.embedding, embedding)})`;

  return requireDb()
    .select({
      id: journalEntries.id,
      content: journalEntries.content,
      similarity,
    })
    .from(journalEntries)
    .where(eq(journalEntries.userId, userId))
    .orderBy(cosineDistance(journalEntries.embedding, embedding))
    .limit(limit);
}

export async function findSimilarOmegaClaims(userId: string, embedding: number[], limit = 20) {
  const similarity = sql<number>`1 - (${cosineDistance(omegaClaims.embedding, embedding)})`;

  return requireDb()
    .select({
      id: omegaClaims.id,
      claimText: omegaClaims.claimText,
      knowledgeType: omegaClaims.knowledgeType,
      similarity,
    })
    .from(omegaClaims)
    .where(eq(omegaClaims.userId, userId))
    .orderBy(cosineDistance(omegaClaims.embedding, embedding))
    .limit(limit);
}

export async function findSimilarOmegaEntities(userId: string, embedding: number[], limit = 20) {
  const similarity = sql<number>`1 - (${cosineDistance(omegaEntities.embedding, embedding)})`;

  return requireDb()
    .select({
      id: omegaEntities.id,
      name: omegaEntities.name,
      entityType: omegaEntities.entityType,
      similarity,
    })
    .from(omegaEntities)
    .where(eq(omegaEntities.userId, userId))
    .orderBy(cosineDistance(omegaEntities.embedding, embedding))
    .limit(limit);
}
