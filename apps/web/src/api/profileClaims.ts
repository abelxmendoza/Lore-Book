import { fetchJson } from '../lib/api';

export type ProfileClaim = {
  id: string;
  claim_type: string;
  claim_text: string;
  source: string;
  source_detail: string | null;
  verified_status: string;
  confidence: number;
  user_confirmed: boolean;
  user_notes: string | null;
  first_seen_at: string;
  metadata: Record<string, unknown>;
};

export type ProfileClaimsResponse = {
  success: boolean;
  claims: ProfileClaim[];
  stats: { total: number; unverified: number; verified: number };
};

export const profileClaimsApi = {
  async list(params?: { source?: string; verified_status?: string }): Promise<ProfileClaimsResponse> {
    const qs = new URLSearchParams();
    if (params?.source) qs.set('source', params.source);
    if (params?.verified_status) qs.set('verified_status', params.verified_status);
    const suffix = qs.toString() ? `?${qs}` : '';
    return fetchJson<ProfileClaimsResponse>(`/api/profile-claims${suffix}`);
  },

  async confirm(claimId: string, notes?: string): Promise<ProfileClaim> {
    const res = await fetchJson<{ success: boolean; claim: ProfileClaim }>(`/api/profile-claims/${claimId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'confirm', notes }),
    });
    return res.claim;
  },

  async reject(claimId: string, notes?: string): Promise<ProfileClaim> {
    const res = await fetchJson<{ success: boolean; claim: ProfileClaim }>(`/api/profile-claims/${claimId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reject', notes }),
    });
    return res.claim;
  },
};

export type ProvenanceLink = {
  type: string;
  id: string;
  label: string;
  route?: string;
};

export async function fetchFileProvenance(fileId: string): Promise<ProvenanceLink[]> {
  try {
    const res = await fetchJson<{ success: boolean; links: ProvenanceLink[] }>(
      `/api/documents/files/${fileId}/provenance`
    );
    return res.links ?? [];
  } catch {
    return [];
  }
}
