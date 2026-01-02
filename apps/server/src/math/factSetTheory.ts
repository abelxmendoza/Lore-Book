import type { ExtractedFact } from '../services/factExtractionService';

/**
 * Set theory operations for efficient fact management
 * All operations are O(1) or O(n) with Sets
 */
export class FactSetTheory {
  /**
   * Create a Set from facts for O(1) lookups
   */
  static factSet(facts: ExtractedFact[]): Set<string> {
    return new Set(facts.map(f => this.factKey(f)));
  }

  /**
   * Generate unique key for fact
   */
  static factKey(fact: ExtractedFact): string {
    return `${fact.subject.toLowerCase()}:${fact.attribute.toLowerCase()}:${fact.value.toLowerCase()}`;
  }

  /**
   * Check if two facts are equal
   */
  static factsEqual(fact1: ExtractedFact, fact2: ExtractedFact): boolean {
    return this.factKey(fact1) === this.factKey(fact2);
  }

  /**
   * Find facts in set1 that are also in set2 (intersection)
   * O(n) where n is size of smaller set
   */
  static intersection(facts1: ExtractedFact[], facts2: ExtractedFact[]): ExtractedFact[] {
    const set2 = this.factSet(facts2);
    return facts1.filter(fact => set2.has(this.factKey(fact)));
  }

  /**
   * Find facts in set1 that are NOT in set2 (difference)
   * O(n) where n is size of set1
   */
  static difference(facts1: ExtractedFact[], facts2: ExtractedFact[]): ExtractedFact[] {
    const set2 = this.factSet(facts2);
    return facts1.filter(fact => !set2.has(this.factKey(fact)));
  }

  /**
   * Combine facts from both sets (union)
   * O(n + m) where n and m are sizes of sets
   */
  static union(facts1: ExtractedFact[], facts2: ExtractedFact[]): ExtractedFact[] {
    const combined = [...facts1, ...facts2];
    return this.deduplicate(combined);
  }

  /**
   * Check if fact exists in facts array
   * O(1) with Set, O(n) with array
   */
  static contains(facts: ExtractedFact[], fact: ExtractedFact): boolean {
    const set = this.factSet(facts);
    return set.has(this.factKey(fact));
  }

  /**
   * Find contradictions: facts with same subject+attribute but different values
   * O(n²) worst case, but optimized with Sets
   */
  static findContradictions(facts: ExtractedFact[]): Array<{ fact1: ExtractedFact; fact2: ExtractedFact }> {
    const contradictions: Array<{ fact1: ExtractedFact; fact2: ExtractedFact }> = [];
    const subjectAttributeMap = new Map<string, Set<string>>();

    // Group facts by subject+attribute
    for (const fact of facts) {
      const key = `${fact.subject.toLowerCase()}:${fact.attribute.toLowerCase()}`;
      if (!subjectAttributeMap.has(key)) {
        subjectAttributeMap.set(key, new Set());
      }
      subjectAttributeMap.get(key)!.add(fact.value.toLowerCase());
    }

    // Find facts with same subject+attribute but different values
    for (let i = 0; i < facts.length; i++) {
      for (let j = i + 1; j < facts.length; j++) {
        const fact1 = facts[i];
        const fact2 = facts[j];
        
        const key1 = `${fact1.subject.toLowerCase()}:${fact1.attribute.toLowerCase()}`;
        const key2 = `${fact2.subject.toLowerCase()}:${fact2.attribute.toLowerCase()}`;
        
        if (key1 === key2 && fact1.value.toLowerCase() !== fact2.value.toLowerCase()) {
          contradictions.push({ fact1, fact2 });
        }
      }
    }

    return contradictions;
  }

  /**
   * Find supporting facts: facts with same subject+attribute+value
   * O(n) with Set
   */
  static findSupportingFacts(targetFact: ExtractedFact, facts: ExtractedFact[]): ExtractedFact[] {
    const targetKey = this.factKey(targetFact);
    return facts.filter(fact => this.factKey(fact) === targetKey);
  }

  /**
   * Deduplicate facts array
   * O(n) with Set
   */
  static deduplicate(facts: ExtractedFact[]): ExtractedFact[] {
    const seen = new Set<string>();
    const unique: ExtractedFact[] = [];

    for (const fact of facts) {
      const key = this.factKey(fact);
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(fact);
      }
    }

    return unique;
  }

  /**
   * Group facts by subject
   * O(n)
   */
  static groupBySubject(facts: ExtractedFact[]): Map<string, ExtractedFact[]> {
    const grouped = new Map<string, ExtractedFact[]>();

    for (const fact of facts) {
      const subject = fact.subject.toLowerCase();
      if (!grouped.has(subject)) {
        grouped.set(subject, []);
      }
      grouped.get(subject)!.push(fact);
    }

    return grouped;
  }

  /**
   * Group facts by attribute
   * O(n)
   */
  static groupByAttribute(facts: ExtractedFact[]): Map<string, ExtractedFact[]> {
    const grouped = new Map<string, ExtractedFact[]>();

    for (const fact of facts) {
      const attribute = fact.attribute.toLowerCase();
      if (!grouped.has(attribute)) {
        grouped.set(attribute, []);
      }
      grouped.get(attribute)!.push(fact);
    }

    return grouped;
  }
}

