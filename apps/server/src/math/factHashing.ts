import crypto from 'crypto';
import type { ExtractedFact } from '../services/factExtractionService';

/**
 * Fact hashing for efficient lookups and comparisons
 * Uses cryptographic hashing for consistency
 */
export class FactHashing {
  /**
   * Hash a fact to a unique identifier
   * Uses SHA-256 for consistency
   */
  static hashFact(fact: ExtractedFact): string {
    const key = `${fact.subject.toLowerCase()}:${fact.attribute.toLowerCase()}:${fact.value.toLowerCase()}`;
    return crypto.createHash('sha256').update(key).digest('hex');
  }

  /**
   * Hash fact signature (subject + attribute only)
   * Useful for finding all facts about same subject+attribute
   */
  static hashFactSignature(fact: ExtractedFact): string {
    const key = `${fact.subject.toLowerCase()}:${fact.attribute.toLowerCase()}`;
    return crypto.createHash('sha256').update(key).digest('hex');
  }

  /**
   * Create fast hash map from facts array
   * O(n) operation
   */
  static createFactMap(facts: ExtractedFact[]): Map<string, ExtractedFact> {
    const map = new Map<string, ExtractedFact>();
    for (const fact of facts) {
      map.set(this.hashFact(fact), fact);
    }
    return map;
  }

  /**
   * Create signature map (groups facts by subject+attribute)
   * O(n) operation
   */
  static createSignatureMap(facts: ExtractedFact[]): Map<string, ExtractedFact[]> {
    const map = new Map<string, ExtractedFact[]>();
    for (const fact of facts) {
      const signature = this.hashFactSignature(fact);
      if (!map.has(signature)) {
        map.set(signature, []);
      }
      map.get(signature)!.push(fact);
    }
    return map;
  }

  /**
   * Fast lookup: find fact in map
   * O(1) operation
   */
  static findFact(fact: ExtractedFact, factMap: Map<string, ExtractedFact>): ExtractedFact | undefined {
    return factMap.get(this.hashFact(fact));
  }

  /**
   * Fast lookup: find all facts with same signature
   * O(1) operation
   */
  static findFactsBySignature(fact: ExtractedFact, signatureMap: Map<string, ExtractedFact[]>): ExtractedFact[] {
    return signatureMap.get(this.hashFactSignature(fact)) || [];
  }

  /**
   * Compare two facts using hash (faster than string comparison)
   * O(1) operation
   */
  static factsEqual(fact1: ExtractedFact, fact2: ExtractedFact): boolean {
    return this.hashFact(fact1) === this.hashFact(fact2);
  }

  /**
   * Check if fact exists in map
   * O(1) operation
   */
  static hasFact(fact: ExtractedFact, factMap: Map<string, ExtractedFact>): boolean {
    return factMap.has(this.hashFact(fact));
  }
}

