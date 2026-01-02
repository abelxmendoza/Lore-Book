import type { ExtractedFact } from '../services/factExtractionService';

/**
 * Boolean algebra for logical contradiction detection
 * Fast O(1) contradiction checks using boolean logic
 */
export class BooleanContradiction {
  /**
   * Check if two facts contradict each other
   * Contradiction: same subject + same attribute + different values
   * O(1) operation
   */
  static contradicts(fact1: ExtractedFact, fact2: ExtractedFact): boolean {
    const sameSubject = fact1.subject.toLowerCase() === fact2.subject.toLowerCase();
    const sameAttribute = fact1.attribute.toLowerCase() === fact2.attribute.toLowerCase();
    const differentValue = fact1.value.toLowerCase() !== fact2.value.toLowerCase();
    
    return sameSubject && sameAttribute && differentValue;
  }

  /**
   * Check if fact contradicts any fact in array
   * O(n) but optimized with early exit
   */
  static contradictsAny(fact: ExtractedFact, facts: ExtractedFact[]): ExtractedFact | null {
    for (const otherFact of facts) {
      if (this.contradicts(fact, otherFact)) {
        return otherFact;
      }
    }
    return null;
  }

  /**
   * Check if fact is supported by any fact in array
   * Support: same subject + same attribute + same value
   * O(n) but optimized with early exit
   */
  static isSupportedBy(fact: ExtractedFact, facts: ExtractedFact[]): ExtractedFact | null {
    for (const otherFact of facts) {
      if (this.supports(otherFact, fact)) {
        return otherFact;
      }
    }
    return null;
  }

  /**
   * Check if fact1 supports fact2
   * Support: same subject + same attribute + same value
   * O(1) operation
   */
  static supports(fact1: ExtractedFact, fact2: ExtractedFact): boolean {
    const sameSubject = fact1.subject.toLowerCase() === fact2.subject.toLowerCase();
    const sameAttribute = fact1.attribute.toLowerCase() === fact2.attribute.toLowerCase();
    const sameValue = fact1.value.toLowerCase() === fact2.value.toLowerCase();
    
    return sameSubject && sameAttribute && sameValue;
  }

  /**
   * Create boolean signature for fact (for fast comparison)
   * Returns bit pattern representing fact properties
   */
  static factSignature(fact: ExtractedFact): string {
    return `${fact.subject.toLowerCase()}:${fact.attribute.toLowerCase()}`;
  }

  /**
   * Check if two facts have same signature (same subject+attribute)
   * O(1) operation
   */
  static sameSignature(fact1: ExtractedFact, fact2: ExtractedFact): boolean {
    return this.factSignature(fact1) === this.factSignature(fact2);
  }

  /**
   * Find all contradictions in fact array
   * Returns map of fact signatures to contradicting facts
   * O(n²) worst case, but optimized
   */
  static findAllContradictions(facts: ExtractedFact[]): Map<string, ExtractedFact[]> {
    const contradictions = new Map<string, ExtractedFact[]>();

    for (let i = 0; i < facts.length; i++) {
      const fact1 = facts[i];
      const signature = this.factSignature(fact1);

      for (let j = i + 1; j < facts.length; j++) {
        const fact2 = facts[j];

        if (this.contradicts(fact1, fact2)) {
          if (!contradictions.has(signature)) {
            contradictions.set(signature, []);
          }
          contradictions.get(signature)!.push(fact2);
        }
      }
    }

    return contradictions;
  }

  /**
   * Check logical consistency of fact set
   * Returns true if no contradictions exist
   * O(n²) worst case
   */
  static isConsistent(facts: ExtractedFact[]): boolean {
    for (let i = 0; i < facts.length; i++) {
      for (let j = i + 1; j < facts.length; j++) {
        if (this.contradicts(facts[i], facts[j])) {
          return false;
        }
      }
    }
    return true;
  }
}

