import { logger } from '../../logger';
import { embeddingService } from '../embeddingService';

export interface Chunk {
  text: string;
  startIndex: number;
  endIndex: number;
  embedding?: number[];
  entities?: string[];
}

/**
 * Semantic Chunker Service
 * Chunks documents at semantic boundaries rather than fixed token counts
 */
export class SemanticChunker {
  /**
   * Chunk document semantically
   */
  async chunkDocument(
    content: string,
    maxChunkSize: number = 500,
    overlap: number = 50
  ): Promise<Chunk[]> {
    try {
      // Split into sentences first
      const sentences = this.splitIntoSentences(content);
      
      if (sentences.length === 0) {
        return [];
      }

      // If content is short, return as single chunk
      if (content.length <= maxChunkSize) {
        return [{
          text: content,
          startIndex: 0,
          endIndex: content.length
        }];
      }

      // Generate embeddings for sentences (for semantic similarity)
      const sentenceEmbeddings = await Promise.all(
        sentences.map(s => embeddingService.embedText(s))
      );

      // Find semantic boundaries
      const chunks = this.findSemanticBoundaries(
        sentences,
        sentenceEmbeddings,
        maxChunkSize,
        overlap
      );

      return chunks;
    } catch (error) {
      logger.error({ error }, 'Semantic chunking failed, using fixed-size fallback');
      return this.fallbackChunking(content, maxChunkSize, overlap);
    }
  }

  /**
   * Split text into sentences
   */
  private splitIntoSentences(text: string): string[] {
    // Simple sentence splitting (can be enhanced with NLP library)
    return text
      .split(/(?<=[.!?])\s+/)
      .map(s => s.trim())
      .filter(s => s.length > 0);
  }

  /**
   * Find semantic boundaries using sentence embeddings
   */
  private findSemanticBoundaries(
    sentences: string[],
    embeddings: number[][],
    maxChunkSize: number,
    overlap: number
  ): Chunk[] {
    const chunks: Chunk[] = [];
    let currentChunk: string[] = [];
    let currentSize = 0;
    let startIndex = 0;

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i];
      const sentenceSize = sentence.length;

      // Check if adding this sentence would exceed max size
      if (currentSize + sentenceSize > maxChunkSize && currentChunk.length > 0) {
        // Check semantic similarity with previous sentence
        if (i > 0) {
          const similarity = this.cosineSimilarity(embeddings[i - 1], embeddings[i]);
          
          // If high similarity, it's a good boundary
          if (similarity < 0.7) {
            // Low similarity = topic shift, good place to chunk
            chunks.push({
              text: currentChunk.join(' '),
              startIndex,
              endIndex: startIndex + currentSize
            });

            // Start new chunk with overlap
            const overlapSentences = this.getOverlapSentences(
              currentChunk,
              overlap
            );
            currentChunk = overlapSentences;
            currentSize = overlapSentences.join(' ').length;
            startIndex = startIndex + currentSize - overlapSentences.join(' ').length;
          } else {
            // High similarity = same topic, continue chunk
            currentChunk.push(sentence);
            currentSize += sentenceSize;
          }
        } else {
          // First sentence, just add it
          chunks.push({
            text: currentChunk.join(' '),
            startIndex,
            endIndex: startIndex + currentSize
          });
          currentChunk = [sentence];
          currentSize = sentenceSize;
          startIndex = startIndex + currentSize;
        }
      } else {
        // Add sentence to current chunk
        currentChunk.push(sentence);
        currentSize += sentenceSize;
      }
    }

    // Add final chunk
    if (currentChunk.length > 0) {
      chunks.push({
        text: currentChunk.join(' '),
        startIndex,
        endIndex: startIndex + currentSize
      });
    }

    return chunks;
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }

  /**
   * Get overlap sentences for chunk boundary
   */
  private getOverlapSentences(sentences: string[], overlapSize: number): string[] {
    const overlap: string[] = [];
    let size = 0;

    // Take last sentences that fit in overlap size
    for (let i = sentences.length - 1; i >= 0 && size < overlapSize; i--) {
      const sentence = sentences[i];
      if (size + sentence.length <= overlapSize) {
        overlap.unshift(sentence);
        size += sentence.length;
      } else {
        break;
      }
    }

    return overlap;
  }

  /**
   * Fallback to fixed-size chunking
   */
  private fallbackChunking(
    content: string,
    maxChunkSize: number,
    overlap: number
  ): Chunk[] {
    const chunks: Chunk[] = [];
    let startIndex = 0;

    while (startIndex < content.length) {
      const endIndex = Math.min(startIndex + maxChunkSize, content.length);
      const chunkText = content.slice(startIndex, endIndex);

      chunks.push({
        text: chunkText,
        startIndex,
        endIndex
      });

      startIndex = endIndex - overlap;
    }

    return chunks;
  }
}

export const semanticChunker = new SemanticChunker();
