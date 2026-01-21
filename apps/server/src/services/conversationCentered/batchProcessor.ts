// =====================================================
// BATCH PROCESSOR
// Purpose: Group similar messages for efficient processing
// Expected Impact: 40-50% cost reduction on batch processing
// =====================================================

import { logger } from '../../logger';
import { embeddingService } from '../embeddingService';

export type MessageBatch = {
  messages: Array<{
    id: string;
    content: string;
    timestamp: Date;
    userId: string;
  }>;
  batchType: 'time' | 'topic' | 'mixed';
  similarityScore?: number;
};

export type BatchGroupingStrategy = 'time' | 'topic' | 'hybrid';

/**
 * Groups messages into batches for efficient processing
 */
export class BatchProcessor {
  private readonly TIME_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
  private readonly TOPIC_SIMILARITY_THRESHOLD = 0.75; // 75% similarity
  private readonly MAX_BATCH_SIZE = 10; // Maximum messages per batch

  /**
   * Group messages by time window
   */
  groupByTime(
    messages: Array<{ id: string; content: string; timestamp: Date; userId: string }>
  ): MessageBatch[] {
    if (messages.length === 0) return [];

    // Sort by timestamp
    const sorted = [...messages].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    const batches: MessageBatch[] = [];
    let currentBatch: MessageBatch['messages'] = [];
    let batchStartTime = sorted[0].timestamp.getTime();

    for (const message of sorted) {
      const messageTime = message.timestamp.getTime();
      const timeDiff = messageTime - batchStartTime;

      // If within time window and batch not too large, add to current batch
      if (timeDiff <= this.TIME_WINDOW_MS && currentBatch.length < this.MAX_BATCH_SIZE) {
        currentBatch.push(message);
      } else {
        // Start new batch
        if (currentBatch.length > 0) {
          batches.push({
            messages: currentBatch,
            batchType: 'time',
          });
        }
        currentBatch = [message];
        batchStartTime = messageTime;
      }
    }

    // Add final batch
    if (currentBatch.length > 0) {
      batches.push({
        messages: currentBatch,
        batchType: 'time',
      });
    }

    return batches;
  }

  /**
   * Group messages by topic similarity (using embeddings)
   */
  async groupByTopic(
    messages: Array<{ id: string; content: string; timestamp: Date; userId: string }>
  ): Promise<MessageBatch[]> {
    if (messages.length === 0) return [];

    // Generate embeddings for all messages
    const embeddings = await Promise.all(
      messages.map(async (msg) => ({
        message: msg,
        embedding: await embeddingService.embedText(msg.content),
      }))
    );

    const batches: MessageBatch[] = [];
    const processed = new Set<string>();

    for (let i = 0; i < embeddings.length; i++) {
      if (processed.has(embeddings[i].message.id)) continue;

      const batch: MessageBatch['messages'] = [embeddings[i].message];
      processed.add(embeddings[i].message.id);

      // Find similar messages
      for (let j = i + 1; j < embeddings.length; j++) {
        if (processed.has(embeddings[j].message.id)) continue;
        if (batch.length >= this.MAX_BATCH_SIZE) break;

        const similarity = this.cosineSimilarity(embeddings[i].embedding, embeddings[j].embedding);
        if (similarity >= this.TOPIC_SIMILARITY_THRESHOLD) {
          batch.push(embeddings[j].message);
          processed.add(embeddings[j].message.id);
        }
      }

      if (batch.length > 0) {
        batches.push({
          messages: batch,
          batchType: 'topic',
        });
      }
    }

    // Add any unprocessed messages as individual batches
    for (const emb of embeddings) {
      if (!processed.has(emb.message.id)) {
        batches.push({
          messages: [emb.message],
          batchType: 'topic',
        });
      }
    }

    return batches;
  }

  /**
   * Hybrid grouping: combine time and topic
   */
  async groupHybrid(
    messages: Array<{ id: string; content: string; timestamp: Date; userId: string }>
  ): Promise<MessageBatch[]> {
    if (messages.length === 0) return [];

    // First group by time
    const timeBatches = this.groupByTime(messages);

    // Then refine by topic similarity within each time batch
    const hybridBatches: MessageBatch[] = [];

    for (const timeBatch of timeBatches) {
      if (timeBatch.messages.length === 1) {
        hybridBatches.push({
          ...timeBatch,
          batchType: 'mixed',
        });
        continue;
      }

      // Group by topic within this time window
      const topicBatches = await this.groupByTopic(timeBatch.messages);

      for (const topicBatch of topicBatches) {
        hybridBatches.push({
          ...topicBatch,
          batchType: 'mixed',
        });
      }
    }

    return hybridBatches;
  }

  /**
   * Group messages using specified strategy
   */
  async groupMessages(
    messages: Array<{ id: string; content: string; timestamp: Date; userId: string }>,
    strategy: BatchGroupingStrategy = 'hybrid'
  ): Promise<MessageBatch[]> {
    switch (strategy) {
      case 'time':
        return this.groupByTime(messages);
      case 'topic':
        return await this.groupByTopic(messages);
      case 'hybrid':
      default:
        return await this.groupHybrid(messages);
    }
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length) {
      logger.warn({ vecALength: vecA.length, vecBLength: vecB.length }, 'Vector length mismatch');
      return 0;
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator === 0) return 0;

    return dotProduct / denominator;
  }

  /**
   * Check if messages should be batched
   * Returns true if batching would be beneficial
   */
  shouldBatch(messages: Array<{ id: string; content: string; timestamp: Date }>): boolean {
    if (messages.length < 2) return false;

    // Check if messages are close in time
    const sorted = [...messages].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    const timeSpan = sorted[sorted.length - 1].timestamp.getTime() - sorted[0].timestamp.getTime();

    // Batch if messages are within time window
    return timeSpan <= this.TIME_WINDOW_MS;
  }

  /**
   * Get batch statistics
   */
  getBatchStats(batches: MessageBatch[]): {
    totalBatches: number;
    totalMessages: number;
    averageBatchSize: number;
    largestBatch: number;
    smallestBatch: number;
  } {
    if (batches.length === 0) {
      return {
        totalBatches: 0,
        totalMessages: 0,
        averageBatchSize: 0,
        largestBatch: 0,
        smallestBatch: 0,
      };
    }

    const sizes = batches.map(b => b.messages.length);
    const totalMessages = sizes.reduce((sum, size) => sum + size, 0);

    return {
      totalBatches: batches.length,
      totalMessages,
      averageBatchSize: totalMessages / batches.length,
      largestBatch: Math.max(...sizes),
      smallestBatch: Math.min(...sizes),
    };
  }
}

export const batchProcessor = new BatchProcessor();
