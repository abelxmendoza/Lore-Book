import type { MemoryProposal } from '../hooks/useMemoryReviewQueue';

import { buildListClipboardText } from './listClipboard';

type ProposalMeta = {
  proposal_kind?: string;
  normalized_summary?: string;
  proposed_mutation?: string;
  group_label?: string;
  risk_reason?: string;
  sensitivity?: string;
  evidence_count?: number;
  source?: string;
  source_conversation_title?: string;
  belief_cognition?: {
    rendered_proposition?: string;
    resolved_subject?: string;
    predicate?: string;
    domain?: string;
    durability?: string;
    routing_target?: string;
    confirmation_requirement?: string;
  };
};

function metadataFor(proposal: MemoryProposal): ProposalMeta {
  return (proposal.metadata ?? {}) as ProposalMeta;
}

export function buildMemoryReviewQueueClipboardText(proposals: MemoryProposal[]): string {
  return buildListClipboardText({
    title: 'Memory proposals',
    items: proposals.map((proposal) => {
      const meta = metadataFor(proposal);
      const cognition = meta.belief_cognition;
      const belief = cognition?.rendered_proposition || meta.normalized_summary || proposal.claim_text;
      return {
        heading: belief,
        fields: [
          { label: 'Id', value: proposal.id },
          { label: 'Kind', value: meta.proposal_kind },
          { label: 'Subject', value: cognition?.resolved_subject },
          { label: 'Predicate', value: cognition?.predicate },
          { label: 'Domain', value: cognition?.domain },
          { label: 'Durability', value: cognition?.durability },
          { label: 'Route', value: cognition?.routing_target },
          { label: 'Story group', value: meta.group_label },
          { label: 'Confidence', value: `${Math.round((proposal.confidence ?? 0) * 100)}%` },
          { label: 'Impact', value: proposal.risk_level },
          { label: 'Sensitivity', value: meta.sensitivity },
          { label: 'Confirmation', value: cognition?.confirmation_requirement },
          { label: 'Evidence count', value: meta.evidence_count },
          { label: 'Source', value: meta.source },
          { label: 'Conversation', value: meta.source_conversation_title },
          { label: 'Mutation', value: meta.proposed_mutation },
          { label: 'Risk reason', value: meta.risk_reason },
          { label: 'Affected beliefs', value: proposal.affected_claim_ids?.length },
          { label: 'Created', value: proposal.created_at },
        ],
        body: proposal.source_excerpt
          ? `Evidence: “${proposal.source_excerpt.trim()}”`
          : proposal.reasoning?.trim() || undefined,
      };
    }),
  });
}
