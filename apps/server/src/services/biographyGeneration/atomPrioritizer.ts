/**
 * Atom Prioritizer
 * 
 * Intelligently ranks and selects atoms to prevent information overload
 * and ensure the most important content is included in biographies.
 */

import { logger } from '../../logger';
import type {
  NarrativeAtom,
  PrioritizedAtom,
  PrioritizationOptions,
  BiographyDepth
} from './types';

export class AtomPrioritizer {
  /**
   * Prioritize atoms using multi-factor scoring
   */
  prioritizeAtoms(
    atoms: NarrativeAtom[],
    options: PrioritizationOptions
  ): PrioritizedAtom[] {
    if (atoms.length === 0) return [];

    const referenceDate = new Date();
    const allAtoms = atoms; // For uniqueness calculation

    // Separate preserved content (always included)
    const preservedAtoms = atoms.filter(a => 
      (a.metadata as any)?.preserve_original_language === true
    );
    const regularAtoms = atoms.filter(a => 
      (a.metadata as any)?.preserve_original_language !== true
    );

    // Calculate scores for regular atoms
    const prioritized: PrioritizedAtom[] = regularAtoms.map(atom => {
      const recencyScore = this.calculateRecencyScore(atom, referenceDate);
      const uniquenessScore = this.calculateUniquenessScore(atom, allAtoms);

      // Multi-factor scoring formula
      const priorityScore = 
        (atom.significance * 0.4) +
        (atom.emotionalWeight * 0.3) +
        (recencyScore * 0.2) +
        (uniquenessScore * 0.1);

      return {
        ...atom,
        priorityScore,
        recencyScore,
        uniquenessScore
      };
    });

    // Sort by priority score (highest first)
    prioritized.sort((a, b) => b.priorityScore - a.priorityScore);

    // Add preserved atoms at the top (highest priority)
    const preservedPrioritized: PrioritizedAtom[] = preservedAtoms.map(atom => ({
      ...atom,
      priorityScore: 1.0, // Maximum priority
      recencyScore: this.calculateRecencyScore(atom, referenceDate),
      uniquenessScore: 1.0 // Preserved content is always unique
    }));

    // Combine: preserved first, then prioritized regular atoms
    return [...preservedPrioritized, ...prioritized];
  }

  /**
   * Calculate recency score (decay function)
   * More recent events get higher scores
   */
  calculateRecencyScore(atom: NarrativeAtom, referenceDate: Date): number {
    const atomDate = new Date(atom.timestamp);
    const daysSinceEvent = (referenceDate.getTime() - atomDate.getTime()) / (1000 * 60 * 60 * 24);
    
    // Decay function: 1 / (1 + daysSinceEvent / 365)
    // Events within last year get higher scores
    const recencyScore = 1 / (1 + daysSinceEvent / 365);
    
    // Clamp to 0-1 range
    return Math.max(0, Math.min(1, recencyScore));
  }

  /**
   * Calculate uniqueness score (inverse document frequency)
   * Rare event types/domains get higher scores
   */
  calculateUniquenessScore(atom: NarrativeAtom, allAtoms: NarrativeAtom[]): number {
    // Count frequency of atom type
    const typeFrequency = allAtoms.filter(a => a.type === atom.type).length;
    const typeUniqueness = 1 / (1 + typeFrequency / allAtoms.length);

    // Count frequency of domains
    const domainFrequencies = atom.domains.map(domain => {
      const domainCount = allAtoms.filter(a => a.domains.includes(domain)).length;
      return 1 / (1 + domainCount / allAtoms.length);
    });
    const avgDomainUniqueness = domainFrequencies.length > 0
      ? domainFrequencies.reduce((sum, score) => sum + score, 0) / domainFrequencies.length
      : 0.5;

    // Combine type and domain uniqueness
    const uniquenessScore = (typeUniqueness * 0.5) + (avgDomainUniqueness * 0.5);
    
    return Math.max(0, Math.min(1, uniquenessScore));
  }

  /**
   * Select atoms for a chapter based on priority and limits
   */
  selectAtomsForChapter(
    prioritizedAtoms: PrioritizedAtom[],
    chapterTimeSpan: { start: string; end: string },
    maxAtoms: number
  ): NarrativeAtom[] {
    if (prioritizedAtoms.length === 0) return [];

    const chapterStart = new Date(chapterTimeSpan.start);
    const chapterEnd = new Date(chapterTimeSpan.end);

    // Filter atoms within chapter time span
    const chapterAtoms = prioritizedAtoms.filter(atom => {
      const atomDate = new Date(atom.timestamp);
      return atomDate >= chapterStart && atomDate <= chapterEnd;
    });

    // Separate preserved content (always included)
    const preserved = chapterAtoms.filter(a => 
      (a.metadata as any)?.preserve_original_language === true
    );
    const regular = chapterAtoms.filter(a => 
      (a.metadata as any)?.preserve_original_language !== true
    );

    // Select top N regular atoms (already sorted by priority)
    const selectedRegular = regular.slice(0, Math.max(0, maxAtoms - preserved.length));

    // Combine: preserved + top regular atoms
    const selected = [...preserved, ...selectedRegular];

    // Ensure diversity: try to include different types and domains
    const diversified = this.ensureDiversity(selected, maxAtoms);

    // Return as regular NarrativeAtoms (remove priority scores)
    return diversified.map(({ priorityScore, recencyScore, uniquenessScore, ...atom }) => atom);
  }

  /**
   * Ensure diversity in selected atoms
   * Prevents all atoms from being the same type or domain
   */
  private ensureDiversity(
    atoms: PrioritizedAtom[],
    maxAtoms: number
  ): PrioritizedAtom[] {
    if (atoms.length <= maxAtoms) return atoms;

    const selected: PrioritizedAtom[] = [];
    const usedTypes = new Set<string>();
    const usedDomains = new Set<string>();

    // First pass: select diverse atoms
    for (const atom of atoms) {
      if (selected.length >= maxAtoms) break;

      // Always include preserved content
      if ((atom.metadata as any)?.preserve_original_language === true) {
        selected.push(atom);
        continue;
      }

      // Check if this atom adds diversity
      const hasNewType = !usedTypes.has(atom.type);
      const hasNewDomain = atom.domains.some(d => !usedDomains.has(d));

      if (hasNewType || hasNewDomain || selected.length < maxAtoms * 0.5) {
        selected.push(atom);
        usedTypes.add(atom.type);
        atom.domains.forEach(d => usedDomains.add(d));
      }
    }

    // Second pass: fill remaining slots with highest priority
    if (selected.length < maxAtoms) {
      const remaining = atoms.filter(a => !selected.includes(a));
      const additional = remaining.slice(0, maxAtoms - selected.length);
      selected.push(...additional);
    }

    return selected.slice(0, maxAtoms);
  }

  /**
   * Get max atoms per chapter based on depth
   */
  getMaxAtomsForDepth(depth: BiographyDepth): number {
    switch (depth) {
      case 'summary':
        return 10; // 5-10 atoms per chapter
      case 'detailed':
        return 25; // 15-25 atoms per chapter
      case 'epic':
        return 50; // 30-50 atoms per chapter
      default:
        return 25;
    }
  }
}

export const atomPrioritizer = new AtomPrioritizer();
