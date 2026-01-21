import { logger } from '../../logger';
import { buildAtomsFromTimeline } from './narrativeAtomBuilder';
import { contentAvailabilityService } from './contentAvailabilityService';
import type { BiographySpec, BiographyDepth, Domain } from './types';

export interface BookCapacityEstimate {
  availableAtoms: number;
  estimatedPages: {
    minimum: number;
    recommended: number;
    maximum: number;
  };
  estimatedChapters: {
    minimum: number;
    recommended: number;
    maximum: number;
  };
  estimatedWordCount: number;
  canGenerate: boolean;
  reason?: string;
  recommendations: string[];
  progressToTarget?: {
    targetPages: number;
    currentProgress: number; // 0-1
    neededEntries: number;
    neededAtoms: number;
  };
}

export interface BookRequirements {
  small: { atoms: number; entries: number; pages: number }; // 5-10 pages
  medium: { atoms: number; entries: number; pages: number }; // 20-50 pages
  large: { atoms: number; entries: number; pages: number }; // 50-100 pages
  epic: { atoms: number; entries: number; pages: number }; // 100+ pages
}

export interface CapacityCheck {
  canGenerate: boolean;
  reason?: string;
  estimatedPages: number;
  recommendations: string[];
}

/**
 * Book Generation Capacity Calculator
 * Calculates what size book can be generated from available content
 */
export class BookCapacityCalculator {
  /**
   * Atoms per page by depth
   */
  private readonly ATOMS_PER_PAGE = {
    summary: 12, // ~10-15 atoms per page
    detailed: 6, // ~5-8 atoms per page
    epic: 4 // ~3-5 atoms per page
  };

  /**
   * Words per page by depth
   */
  private readonly WORDS_PER_PAGE = {
    summary: 250,
    detailed: 500,
    epic: 800
  };

  /**
   * Minimum viable requirements
   */
  private readonly MINIMUM_VIABLE = {
    atoms: 20,
    entries: 10,
    pages: 3
  };

  /**
   * Calculate book capacity for a specific spec
   */
  async calculateBookCapacity(
    userId: string,
    spec: BiographySpec,
    targetPages?: number
  ): Promise<BookCapacityEstimate> {
    try {
      // Get available atoms for this spec
      const availableAtoms = await this.getAvailableAtomsForSpec(userId, spec);

      // Estimate pages based on depth
      const atomsPerPage = this.ATOMS_PER_PAGE[spec.depth];
      const wordsPerPage = this.WORDS_PER_PAGE[spec.depth];

      const estimatedPages = {
        minimum: Math.max(1, Math.floor(availableAtoms / (atomsPerPage * 1.5))), // Conservative
        recommended: Math.floor(availableAtoms / atomsPerPage), // Standard
        maximum: Math.floor(availableAtoms / (atomsPerPage * 0.8)) // Optimistic
      };

      // Estimate chapters (roughly 1 chapter per 5-10 pages)
      const estimatedChapters = {
        minimum: Math.max(1, Math.ceil(estimatedPages.minimum / 10)),
        recommended: Math.ceil(estimatedPages.recommended / 7),
        maximum: Math.ceil(estimatedPages.maximum / 5)
      };

      // Estimate word count
      const estimatedWordCount = estimatedPages.recommended * wordsPerPage;

      // Check if generation is possible
      const canGenerate = availableAtoms >= this.MINIMUM_VIABLE.atoms;
      const reason = canGenerate
        ? undefined
        : `Insufficient content. Need at least ${this.MINIMUM_VIABLE.atoms} narrative atoms, but only have ${availableAtoms}.`;

      // Generate recommendations
      const recommendations = this.generateRecommendations(
        availableAtoms,
        estimatedPages.recommended,
        spec,
        canGenerate
      );

      // Calculate progress to target if specified
      let progressToTarget;
      if (targetPages) {
        const targetAtoms = targetPages * atomsPerPage;
        const currentProgress = Math.min(1, availableAtoms / targetAtoms);
        const neededAtoms = Math.max(0, targetAtoms - availableAtoms);
        const neededEntries = Math.ceil(neededAtoms / 2); // Rough estimate: 2 atoms per entry

        progressToTarget = {
          targetPages,
          currentProgress,
          neededEntries,
          neededAtoms
        };
      }

      return {
        availableAtoms,
        estimatedPages,
        estimatedChapters,
        estimatedWordCount,
        canGenerate,
        reason,
        recommendations,
        progressToTarget
      };
    } catch (error) {
      logger.error({ error, userId, spec }, 'Failed to calculate book capacity');
      throw error;
    }
  }

  /**
   * Estimate pages from atom count and depth
   */
  estimatePages(atomCount: number, depth: BiographyDepth): number {
    const atomsPerPage = this.ATOMS_PER_PAGE[depth];
    return Math.floor(atomCount / atomsPerPage);
  }

  /**
   * Get minimum requirements for different book sizes
   */
  getMinimumRequirements(): BookRequirements {
    return {
      small: {
        atoms: 50,
        entries: 25,
        pages: 5
      },
      medium: {
        atoms: 150,
        entries: 75,
        pages: 20
      },
      large: {
        atoms: 400,
        entries: 200,
        pages: 50
      },
      epic: {
        atoms: 800,
        entries: 400,
        pages: 100
      }
    };
  }

  /**
   * Check if generation is possible
   */
  async checkCanGenerate(userId: string, spec: BiographySpec): Promise<CapacityCheck> {
    try {
      const availableAtoms = await this.getAvailableAtomsForSpec(userId, spec);
      const canGenerate = availableAtoms >= this.MINIMUM_VIABLE.atoms;
      const atomsPerPage = this.ATOMS_PER_PAGE[spec.depth];
      const estimatedPages = this.estimatePages(availableAtoms, spec.depth);

      const recommendations = this.generateRecommendations(
        availableAtoms,
        estimatedPages,
        spec,
        canGenerate
      );

      return {
        canGenerate,
        reason: canGenerate
          ? undefined
          : `Need at least ${this.MINIMUM_VIABLE.atoms} atoms, but only have ${availableAtoms}`,
        estimatedPages,
        recommendations
      };
    } catch (error) {
      logger.error({ error, userId, spec }, 'Failed to check generation capacity');
      return {
        canGenerate: false,
        reason: 'Error checking capacity',
        estimatedPages: 0,
        recommendations: ['Please try again later']
      };
    }
  }

  /**
   * Get available atoms for a specific spec
   */
  private async getAvailableAtomsForSpec(userId: string, spec: BiographySpec): Promise<number> {
    try {
      const atoms = await buildAtomsFromTimeline(userId);

      // Filter atoms based on spec
      let filtered = atoms;

      // Filter by domain
      if (spec.scope === 'domain' && spec.domain) {
        filtered = filtered.filter(atom => atom.domains.includes(spec.domain!));
      }

      // Filter by time range
      if (spec.scope === 'time_range' && spec.timeRange) {
        const start = new Date(spec.timeRange.start);
        const end = new Date(spec.timeRange.end);
        filtered = filtered.filter(atom => {
          const atomDate = new Date(atom.timestamp);
          return atomDate >= start && atomDate <= end;
        });
      }

      // Filter by themes (if specified)
      if (spec.themes && spec.themes.length > 0) {
        filtered = filtered.filter(atom => {
          const atomText = (atom.content + ' ' + (atom.tags || []).join(' ')).toLowerCase();
          return spec.themes!.some(theme => atomText.includes(theme.toLowerCase()));
        });
      }

      // Filter by people
      if (spec.peopleIds && spec.peopleIds.length > 0) {
        filtered = filtered.filter(atom => {
          return atom.peopleIds && atom.peopleIds.some(id => spec.peopleIds!.includes(id));
        });
      }

      // Filter by characters
      if (spec.characterIds && spec.characterIds.length > 0) {
        filtered = filtered.filter(atom => {
          return atom.peopleIds && atom.peopleIds.some(id => spec.characterIds!.includes(id));
        });
      }

      return filtered.length;
    } catch (error) {
      logger.warn({ error, userId, spec }, 'Failed to get available atoms');
      return 0;
    }
  }

  /**
   * Generate recommendations based on capacity
   */
  private generateRecommendations(
    availableAtoms: number,
    estimatedPages: number,
    spec: BiographySpec,
    canGenerate: boolean
  ): string[] {
    const recommendations: string[] = [];

    if (!canGenerate) {
      const needed = this.MINIMUM_VIABLE.atoms - availableAtoms;
      recommendations.push(
        `Add approximately ${needed} more narrative atoms to generate a basic book.`,
        'Try adding more journal entries or chat messages to increase your content.'
      );
    } else if (estimatedPages < 10) {
      recommendations.push(
        `You can generate a ${estimatedPages}-page book. Consider adding more content for a longer book.`,
        'Try covering more time periods or domains to expand your story.'
      );
    } else if (estimatedPages < 50) {
      recommendations.push(
        `You can generate a ${estimatedPages}-page book. Great start!`,
        'Consider adding more detailed entries to expand specific chapters.'
      );
    } else {
      recommendations.push(
        `You have enough content for a ${estimatedPages}-page book!`,
        'Consider generating domain-specific books to focus on particular areas of your life.'
      );
    }

    // Scope-specific recommendations
    if (spec.scope === 'domain' && spec.domain) {
      recommendations.push(`Focusing on ${spec.domain} domain. Consider adding more entries in this area.`);
    }

    if (spec.scope === 'time_range') {
      recommendations.push('Time-range books work best with dense content in that period.');
    }

    return recommendations;
  }
}

export const bookCapacityCalculator = new BookCapacityCalculator();
