import { embeddingService } from '../embeddingService';
import type { SelfStatement } from './types';

/**
 * Compute cosine distance between two vectors
 */
function cosineDistance(a: number[], b: number[]): number {
  if (a.length !== b.length) return 1;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 1;

  const similarity = dotProduct / denominator;
  return 1 - similarity; // Convert similarity to distance
}

export async function selfSimilarityMatrix(selves: SelfStatement[]): Promise<number[][]> {
  const embeddings = await Promise.all(selves.map((s) => embeddingService.embedText(s.text)));
  const matrix: number[][] = [];

  for (let i = 0; i < selves.length; i++) {
    const row: number[] = [];
    for (let j = 0; j < selves.length; j++) {
      row.push(1 - cosineDistance(embeddings[i], embeddings[j]));
    }
    matrix.push(row);
  }

  return matrix;
}

