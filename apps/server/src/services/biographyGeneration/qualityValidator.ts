/**
 * Quality Validator
 * 
 * Validates generated biographies for accuracy, consistency, and completeness.
 */

import { logger } from '../../logger';
import { embeddingService } from '../embeddingService';
import type {
  Biography,
  BiographyChapter,
  NarrativeAtom,
  QualityReport,
  TemporalCheck,
  FidelityCheck,
  ConflictReport,
  CompletenessCheck
} from './types';

export class QualityValidator {
  /**
   * Validate entire biography
   */
  async validateBiography(
    biography: Biography,
    sourceAtoms: NarrativeAtom[]
  ): Promise<QualityReport> {
    const temporalCheck = this.checkTemporalConsistency(biography.chapters);
    const fidelityChecks = await Promise.all(
      biography.chapters.map(ch => this.verifySourceFidelity(ch, sourceAtoms))
    );
    const conflictReport = this.detectConflicts(biography.chapters, sourceAtoms);
    const completenessCheck = this.checkCompleteness(biography.chapters, sourceAtoms);

    // Calculate overall fidelity score (average of all chapters)
    const avgFidelity = fidelityChecks.length > 0
      ? fidelityChecks.reduce((sum, check) => sum + check.score, 0) / fidelityChecks.length
      : 1.0;

    // Calculate overall score (weighted average)
    const overallScore = (
      temporalCheck.score * 0.25 +
      avgFidelity * 0.35 +
      completenessCheck.score * 0.25 +
      conflictReport.score * 0.15
    );

    // Collect warnings
    const warnings: string[] = [];
    if (!temporalCheck.isValid) {
      warnings.push(`Temporal inconsistencies detected: ${temporalCheck.outOfOrderChapters.length} chapters out of order`);
    }
    if (avgFidelity < 0.7) {
      warnings.push(`Source fidelity below threshold: ${(avgFidelity * 100).toFixed(0)}%`);
    }
    if (completenessCheck.coverage < 0.8) {
      warnings.push(`Completeness below threshold: ${(completenessCheck.coverage * 100).toFixed(0)}% of important atoms included`);
    }
    if (conflictReport.conflictsFound > 0) {
      warnings.push(`${conflictReport.conflictsFound} conflicting memories detected`);
    }

    return {
      overallScore,
      temporalAccuracy: temporalCheck.score,
      sourceFidelity: avgFidelity,
      completeness: completenessCheck.score,
      conflictAwareness: conflictReport.score,
      warnings,
      checks: {
        temporal: temporalCheck,
        fidelity: {
          score: avgFidelity,
          mismatches: fidelityChecks.flatMap(check => check.mismatches)
        },
        conflicts: conflictReport,
        completeness: completenessCheck
      }
    };
  }

  /**
   * Check temporal consistency
   */
  checkTemporalConsistency(chapters: BiographyChapter[]): TemporalCheck {
    if (chapters.length <= 1) {
      return {
        isValid: true,
        outOfOrderChapters: [],
        score: 1.0
      };
    }

    const outOfOrder: string[] = [];

    for (let i = 0; i < chapters.length - 1; i++) {
      const current = chapters[i];
      const next = chapters[i + 1];

      const currentEnd = new Date(current.timeSpan.end).getTime();
      const nextStart = new Date(next.timeSpan.start).getTime();

      // Allow small overlap (up to 1 day) but flag significant issues
      if (nextStart < currentEnd - (24 * 60 * 60 * 1000)) {
        outOfOrder.push(next.id);
      }
    }

    const score = outOfOrder.length === 0 
      ? 1.0 
      : Math.max(0, 1 - (outOfOrder.length / chapters.length));

    return {
      isValid: outOfOrder.length === 0,
      outOfOrderChapters: outOfOrder,
      score
    };
  }

  /**
   * Verify source fidelity (does generated text match source atoms)
   */
  async verifySourceFidelity(
    chapter: BiographyChapter,
    sourceAtoms: NarrativeAtom[]
  ): Promise<FidelityCheck> {
    if (chapter.atoms.length === 0) {
      return {
        score: 1.0,
        mismatches: []
      };
    }

    // Get source atoms for this chapter
    const chapterAtomIds = new Set(chapter.atoms.map(a => a.id));
    const chapterSourceAtoms = sourceAtoms.filter(a => chapterAtomIds.has(a.id));

    if (chapterSourceAtoms.length === 0) {
      return {
        score: 0.5, // Can't verify if no source atoms
        mismatches: [{
          chapterId: chapter.id,
          generatedText: chapter.text.substring(0, 100),
          sourceAtom: 'No source atoms found',
          issue: 'Chapter has no associated source atoms'
        }]
      };
    }

    // Extract key facts from source atoms (dates, names, events)
    const sourceFacts = chapterSourceAtoms.map(atom => ({
      date: atom.timestamp,
      content: atom.content.substring(0, 200),
      domains: atom.domains,
      people: atom.peopleIds || []
    }));

    // Simple heuristic: check if key dates and domains appear in generated text
    let matches = 0;
    const mismatches: FidelityCheck['mismatches'] = [];

    for (const fact of sourceFacts) {
      const dateYear = new Date(fact.date).getFullYear();
      const hasDate = chapter.text.includes(dateYear.toString());
      const hasDomain = fact.domains.some(domain => 
        chapter.text.toLowerCase().includes(domain.toLowerCase())
      );
      const hasContent = fact.content.length > 0 && 
        chapter.text.toLowerCase().includes(fact.content.substring(0, 50).toLowerCase());

      if (hasDate || hasDomain || hasContent) {
        matches++;
      } else {
        mismatches.push({
          chapterId: chapter.id,
          generatedText: chapter.text.substring(0, 100),
          sourceAtom: fact.content,
          issue: 'Key facts from source atom not found in generated text'
        });
      }
    }

    const score = sourceFacts.length > 0 
      ? matches / sourceFacts.length 
      : 0.5;

    return {
      score,
      mismatches
    };
  }

  /**
   * Detect conflicts in source atoms
   */
  detectConflicts(
    chapters: BiographyChapter[],
    sourceAtoms: NarrativeAtom[]
  ): ConflictReport {
    const conflicts: ConflictReport['conflicts'] = [];

    // Group atoms by entity/event (simplified: by people and domains)
    const atomGroups = new Map<string, NarrativeAtom[]>();

    for (const atom of sourceAtoms) {
      const key = `${atom.peopleIds?.join(',') || 'none'}-${atom.domains.join(',')}`;
      if (!atomGroups.has(key)) {
        atomGroups.set(key, []);
      }
      atomGroups.get(key)!.push(atom);
    }

    // Check for conflicting information in same group
    for (const [key, atoms] of Array.from(atomGroups.entries())) {
      if (atoms.length < 2) continue;

      // Simple conflict detection: same people/domains but different content
      const contents = atoms.map(a => a.content.toLowerCase());
      const uniqueContents = new Set(contents);

      if (uniqueContents.size > 1 && atoms.length > 1) {
        // Potential conflict - check if they're about same time period
        const timeRange = {
          min: Math.min(...atoms.map(a => new Date(a.timestamp).getTime())),
          max: Math.max(...atoms.map(a => new Date(a.timestamp).getTime()))
        };

        // If within 30 days, likely a conflict
        const daysDiff = (timeRange.max - timeRange.min) / (1000 * 60 * 60 * 24);
        if (daysDiff < 30) {
          // Find which chapter this belongs to
          const chapter = chapters.find(ch => 
            ch.atoms.some(a => atoms.includes(a))
          );

          if (chapter) {
            conflicts.push({
              chapterId: chapter.id,
              conflictingAtoms: atoms.map(a => a.id),
              description: `Conflicting descriptions found for same time period and entities`
            });
          }
        }
      }
    }

    // Calculate score (fewer conflicts = higher score)
    const totalAtoms = sourceAtoms.length;
    const conflictScore = totalAtoms > 0
      ? Math.max(0, 1 - (conflicts.length / Math.max(1, totalAtoms / 10)))
      : 1.0;

    return {
      conflictsFound: conflicts.length,
      conflicts,
      score: conflictScore
    };
  }

  /**
   * Check completeness (are important atoms included)
   */
  checkCompleteness(
    chapters: BiographyChapter[],
    sourceAtoms: NarrativeAtom[]
  ): CompletenessCheck {
    if (sourceAtoms.length === 0) {
      return {
        score: 1.0,
        missingImportantAtoms: [],
        coverage: 1.0
      };
    }

    // Identify important atoms (high significance or emotional weight)
    const importantAtoms = sourceAtoms.filter(a => 
      a.significance > 0.7 || a.emotionalWeight > 0.7
    );

    // Get all atoms included in chapters
    const includedAtomIds = new Set(
      chapters.flatMap(ch => ch.atoms.map(a => a.id))
    );

    // Find missing important atoms
    const missingImportant = importantAtoms
      .filter(a => !includedAtomIds.has(a.id))
      .map(a => a.id);

    // Calculate coverage
    const coverage = importantAtoms.length > 0
      ? (importantAtoms.filter(a => includedAtomIds.has(a.id)).length / importantAtoms.length)
      : 1.0;

    // Calculate score (coverage weighted by importance)
    const score = coverage;

    return {
      score,
      missingImportantAtoms: missingImportant,
      coverage
    };
  }
}

export const qualityValidator = new QualityValidator();
