import { fetchJson } from '../lib/api';
import type { AuthorityDecision } from '../lib/entityConsolidation';

export type AuthorityEntityPayload = {
  id?: string;
  name: string;
  kind?: string;
  context?: string;
  aliases?: string[];
};

export type AuthorityVerdict = {
  decision: AuthorityDecision | 'IGNORE';
  confidence: number;
  reason: string;
  evidence: string[];
  canonical?: 'a' | 'b';
  relationship?: string;
};

export type ConfirmAuthorityInput = {
  a: AuthorityEntityPayload;
  b: AuthorityEntityPayload;
  decision?: AuthorityDecision;
  source_id?: string;
  target_id?: string;
  reason?: string;
};

export const entityAuthorityApi = {
  decide(a: AuthorityEntityPayload, b: AuthorityEntityPayload) {
    return fetchJson<{ verdict: AuthorityVerdict }>('/api/entity-authority/decide', {
      method: 'POST',
      body: JSON.stringify({ a, b }),
    });
  },

  confirm(input: ConfirmAuthorityInput) {
    return fetchJson<{ ok?: boolean; verdict?: AuthorityVerdict; error?: string }>(
      '/api/entity-authority/confirm',
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
    );
  },

  dismiss(a: AuthorityEntityPayload, b: AuthorityEntityPayload) {
    return fetchJson('/api/entity-authority/dismiss', {
      method: 'POST',
      body: JSON.stringify({ a, b, decision: 'IGNORE' }),
    });
  },
};
