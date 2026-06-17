import { fetchJson } from '../lib/api';

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

export const ontologyComplianceApi = {
  get: () =>
    fetchJson<{ success: boolean; report: OntologyComplianceReport }>('/api/ontology/compliance'),
};
