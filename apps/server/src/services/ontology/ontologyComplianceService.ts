/**
 * Unified ontology compliance — aggregates lexical audits for Characters, Places, Organizations.
 */
import { characterLexicalAuditService } from './characterLexicalAuditService';
import { locationDomainAuditService } from '../locationDomainAuditService';
import { organizationDomainAuditService } from '../organizationDomainAuditService';
import { classifyEntity } from '../entities/entityClassifier';
import { classifyPlace } from './placeIntelligence';
import { classifyGroup } from './groupIntelligence';

export type ComplianceBook = 'characters' | 'locations' | 'organizations';

export type OntologyComplianceIssue = {
  id: string;
  book: ComplianceBook;
  name: string;
  rule: string;
  issue: string;
  severity: 'error' | 'warning' | 'info';
  expected?: string;
  stored?: string;
  fixAction: 'inference_sync' | 'merge' | 'manual_review';
};

export type OntologyComplianceReport = {
  userId: string;
  generatedAt: string;
  summary: {
    totalIssues: number;
    errors: number;
    warnings: number;
    byBook: Record<ComplianceBook, number>;
    healthy: boolean;
    entityCounts: { characters: number; locations: number; organizations: number };
  };
  issues: OntologyComplianceIssue[];
  recommendedFix: {
    tier: 't1' | 't2';
    label: string;
    domains: string[];
  };
};

class OntologyComplianceService {
  async audit(userId: string): Promise<OntologyComplianceReport> {
    const [characters, locations, organizations] = await Promise.all([
      characterLexicalAuditService.audit(userId),
      locationDomainAuditService.audit(userId),
      organizationDomainAuditService.audit(userId),
    ]);

    const issues: OntologyComplianceIssue[] = [];

    for (const c of characters.issues) {
      issues.push({
        id: c.id,
        book: 'characters',
        name: c.name,
        rule: c.rule,
        issue: c.issue,
        severity: c.severity,
        expected: c.classifierType ? `not ${c.classifierType}` : undefined,
        stored: c.importanceLevel ?? undefined,
        fixAction: c.rule.startsWith('entity_classifier') ? 'manual_review' : 'inference_sync',
      });
    }

    for (const v of locations.topLevelViolations) {
      issues.push({
        id: v.id,
        book: 'locations',
        name: v.name,
        rule: 'place.hierarchy',
        issue: v.issue,
        severity: 'error',
        fixAction: 'inference_sync',
      });
    }

    for (const row of locations.mergeSuggestions.filter((s) => s.confidence >= 0.95).slice(0, 10)) {
      issues.push({
        id: row.sourceId,
        book: 'locations',
        name: row.sourceName,
        rule: 'place.duplicate',
        issue: `Likely duplicate of "${row.targetName}"`,
        severity: 'warning',
        expected: row.targetName,
        fixAction: 'merge',
      });
    }

    for (const m of organizations.misclassifications) {
      issues.push({
        id: m.id,
        book: 'organizations',
        name: m.name,
        rule: 'group.misclassification',
        issue: m.issue,
        severity: 'warning',
        stored: m.storedType,
        expected: m.expectedCategory,
        fixAction: 'inference_sync',
      });
    }

    for (const v of organizations.topLevelViolations) {
      issues.push({
        id: v.id,
        book: 'organizations',
        name: v.name,
        rule: 'group.hierarchy',
        issue: v.issue,
        severity: 'warning',
        fixAction: 'inference_sync',
      });
    }

    for (const row of organizations.mergeSuggestions.filter((s) => s.confidence >= 0.95).slice(0, 10)) {
      issues.push({
        id: row.sourceId,
        book: 'organizations',
        name: row.sourceName,
        rule: 'group.duplicate',
        issue: `Likely duplicate of "${row.targetName}"`,
        severity: 'info',
        expected: row.targetName,
        fixAction: 'merge',
      });
    }

    const errors = issues.filter((i) => i.severity === 'error').length;
    const warnings = issues.filter((i) => i.severity === 'warning').length;
    const byBook: Record<ComplianceBook, number> = {
      characters: issues.filter((i) => i.book === 'characters').length,
      locations: issues.filter((i) => i.book === 'locations').length,
      organizations: issues.filter((i) => i.book === 'organizations').length,
    };

    const needsT2 = characters.issues.some((i) => i.rule === 'entity_classifier.unclassified');

    return {
      userId,
      generatedAt: new Date().toISOString(),
      summary: {
        totalIssues: issues.length,
        errors,
        warnings,
        byBook,
        healthy: issues.length === 0,
        entityCounts: {
          characters: characters.characterCount,
          locations: locations.locationCount,
          organizations: organizations.groupCount,
        },
      },
      issues: issues.sort((a, b) => {
        const rank = { error: 0, warning: 1, info: 2 };
        return rank[a.severity] - rank[b.severity] || a.name.localeCompare(b.name);
      }),
      recommendedFix: {
        tier: needsT2 ? 't2' : 't1',
        label: needsT2
          ? 'Run full inference (rescan + normalize)'
          : 'Run inference normalize pass',
        domains: needsT2
          ? ['character_rescan', 'locations', 'organizations', 'public_figures']
          : ['locations', 'organizations', 'public_figures', 'character_importance'],
      },
    };
  }

  /** Lightweight re-classify preview for a single name (UI tooltips). */
  previewClassification(name: string, book: ComplianceBook): {
    category: string;
    reason: string;
    confidence: number;
  } {
    if (book === 'locations') {
      const c = classifyPlace(name);
      return { category: c.category, reason: c.reason, confidence: c.confidence };
    }
    if (book === 'organizations') {
      const c = classifyGroup(name);
      return { category: c.category, reason: c.reason, confidence: c.confidence };
    }
    const c = classifyEntity(name);
    return { category: c.type, reason: c.reason, confidence: c.confidence };
  }
}

export const ontologyComplianceService = new OntologyComplianceService();
