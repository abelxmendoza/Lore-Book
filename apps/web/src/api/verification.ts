import { fetchJson } from '../lib/api';

export type VerificationStatus = 'verified' | 'unverified' | 'contradicted' | 'ambiguous';

export type ClaimType = 'date' | 'location' | 'character' | 'event' | 'relationship' | 'attribute' | 'other';

export type VerificationResult = {
  status: VerificationStatus;
  confidence_score: number;
  evidence_count: number;
  contradiction_count: number;
  supporting_entries: Array<{
    entry_id: string;
    entry_date: string;
    content_snippet: string;
    similarity_score?: number;
  }>;
  contradicting_entries: Array<{
    entry_id: string;
    entry_date: string;
    content_snippet: string;
    similarity_score?: number;
  }>;
  extracted_facts: Array<{
    claim_type: ClaimType;
    subject: string;
    attribute: string;
    value: string;
    confidence: number;
    context?: string;
  }>;
  verification_report: {
    facts_checked: number;
    facts_verified: number;
    facts_contradicted: number;
    facts_unverified: number;
    details: Array<{
      fact: {
        claim_type: ClaimType;
        subject: string;
        attribute: string;
        value: string;
        confidence: number;
      };
      status: VerificationStatus;
      evidence?: Array<{
        entry_id: string;
        entry_date: string;
        content_snippet: string;
      }>;
      contradictions?: Array<{
        entry_id: string;
        entry_date: string;
        content_snippet: string;
      }>;
    }>;
  };
};

export type EntryVerification = {
  id: string;
  entry_id: string;
  verification_status: VerificationStatus;
  verified_at: string;
  verified_by: string;
  confidence_score: number;
  evidence_count: number;
  contradiction_count: number;
  supporting_entries: string[];
  contradicting_entries: string[];
  verification_report: Record<string, unknown>;
  resolved: boolean;
  resolved_at?: string | null;
  resolution_notes?: string | null;
  entry?: {
    id: string;
    date: string;
    content: string;
    summary?: string | null;
  };
};

export type VerificationStats = {
  total: number;
  verified: number;
  unverified: number;
  contradicted: number;
  ambiguous: number;
  unresolved: number;
};

/**
 * Verify a specific entry
 */
export const verifyEntry = async (entryId: string): Promise<VerificationResult> => {
  const response = await fetchJson<{ verification: VerificationResult }>(
    `/api/verification/verify-entry/${entryId}`,
    { method: 'POST' }
  );
  return response.verification;
};

/**
 * Verify a specific claim
 */
export const verifyClaim = async (claim: {
  claim_type: ClaimType;
  subject: string;
  attribute: string;
  value: string;
}): Promise<{ claim: typeof claim; results: Array<{ entry_id: string; entry_date: string; verification: VerificationResult }> }> => {
  return fetchJson(`/api/verification/verify-claim`, {
    method: 'POST',
    body: JSON.stringify(claim)
  });
};

/**
 * Get verification status for an entry
 */
export const getVerificationStatus = async (entryId: string): Promise<{
  status: VerificationStatus;
  verification: EntryVerification | null;
}> => {
  return fetchJson(`/api/verification/status/${entryId}`);
};

/**
 * Get all contradictions
 */
export const getContradictions = async (): Promise<{ contradictions: EntryVerification[] }> => {
  return fetchJson('/api/verification/contradictions');
};

/**
 * Resolve a contradiction
 */
export const resolveContradiction = async (
  verificationId: string,
  resolutionNotes?: string
): Promise<{ verification: EntryVerification }> => {
  return fetchJson(`/api/verification/resolve/${verificationId}`, {
    method: 'POST',
    body: JSON.stringify({ resolution_notes: resolutionNotes })
  });
};

/**
 * Get verification statistics
 */
export const getVerificationStats = async (): Promise<{ stats: VerificationStats }> => {
  return fetchJson('/api/verification/stats');
};

