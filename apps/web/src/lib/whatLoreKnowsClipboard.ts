import type { CharacterKnowledgeBaseData } from '../components/characters/CharacterKnowledgeBase';
import type { CharacterChatMention } from '../hooks/useCharacterProfileBundle';

import { clipboardFilterLines } from './listClipboard';
import {
  confirmationDisplayCount,
  partitionCurrentHistoryFacts,
} from './whatLoreKnowsFacts';

const CAT_LABEL: Record<string, string> = {
  personality: 'Personality',
  appearance: 'Appearance',
  relationship: 'Relationship',
  history: 'History',
  career: 'Career',
  location: 'Location',
  goals: 'Goals',
  general: 'General',
};

export type WhatLoreKnowsClipboardInput = {
  title: string;
  characterName: string;
  learningScore?: number;
  lastUpdated?: string | null;
  knowledgeBase: Pick<
    CharacterKnowledgeBaseData,
    | 'aliases'
    | 'identityMentions'
    | 'summary'
    | 'facts'
    | 'knowledgeClaims'
    | 'relatedEntities'
    | 'conversationLinks'
    | 'profile'
  > | null;
  chatMentions?: CharacterChatMention[];
};

/** Plain-text dump of the What Lore Knows / knowledge-base panel. */
export function buildWhatLoreKnowsClipboardText(input: WhatLoreKnowsClipboardInput): string {
  const kb = input.knowledgeBase;
  const lines: string[] = [];
  const factCount = kb?.facts.length ?? 0;
  const claimCount = kb?.knowledgeClaims.length ?? 0;
  const timelineCount = kb?.profile.timelineEventCount ?? kb?.profile.timelineEvents.length ?? 0;
  const chatCount = input.chatMentions?.length ?? 0;

  lines.push(input.title);
  lines.push(
    ...clipboardFilterLines([
      `Subject: ${input.characterName}`,
      input.learningScore != null ? `Learning score: ${input.learningScore}/100` : null,
      input.lastUpdated
        ? `Updated: ${new Date(input.lastUpdated).toLocaleString()}`
        : null,
      `Counts: ${factCount} facts · ${claimCount} patterns · ${timelineCount} timeline · ${chatCount} chat mentions`,
    ]),
  );

  if (kb?.summary?.trim()) {
    lines.push('', '## Summary', kb.summary.trim());
  }

  const aliases = kb?.aliases?.filter(Boolean) ?? [];
  const mentions =
    kb?.identityMentions
      ?.map((m) => m.mention)
      .filter((m) => m && m.toLowerCase() !== input.characterName.toLowerCase()) ?? [];
  const knownAs = [...new Set([...aliases, ...mentions])];
  if (knownAs.length) {
    lines.push('', '## Known as / merged mentions', knownAs.map((a) => `- ${a}`).join('\n'));
  }

  if (kb?.relatedEntities?.length) {
    lines.push(
      '',
      '## Related',
      ...kb.relatedEntities.map((e) => {
        const rel = e.relationship ? ` (${e.relationship})` : '';
        return `- ${e.name} [${e.type}]${rel}`;
      }),
    );
  }

  if (factCount > 0 && kb) {
    lines.push('', '## Facts');
    const byCategory = kb.facts.reduce<Record<string, typeof kb.facts>>((acc, f) => {
      const key = f.category || 'general';
      if (!acc[key]) acc[key] = [];
      acc[key].push(f);
      return acc;
    }, {});
    for (const [category, facts] of Object.entries(byCategory)) {
      lines.push(`### ${CAT_LABEL[category] ?? category}`);
      const { current, history } = partitionCurrentHistoryFacts(facts);
      const emit = (section: string, list: typeof facts) => {
        if (list.length === 0) return;
        lines.push(`#### ${section}`);
        for (const fact of list) {
          const pct = Math.round((fact.confidence ?? 0.7) * 100);
          const status = fact.status && fact.status !== 'active' ? `, ${fact.status}` : '';
          const mentions = confirmationDisplayCount(fact);
          const mentionLabel = mentions >= 2 ? `, ${mentions}× confirmed` : '';
          lines.push(`- ${fact.fact} (${pct}%${status}${mentionLabel})`);
          if (fact.previous_value?.trim()) {
            lines.push(`  was: ${fact.previous_value.trim()}`);
          }
          const firstSeen = fact.first_seen_at
            ? new Date(fact.first_seen_at).toLocaleDateString()
            : null;
          const lastConfirmed = (fact.last_confirmed_at || fact.updated_at)
            ? new Date(String(fact.last_confirmed_at || fact.updated_at)).toLocaleDateString()
            : null;
          if (firstSeen || lastConfirmed) {
            lines.push(
              `  dates: ${[
                firstSeen ? `first noted ${firstSeen}` : null,
                lastConfirmed ? `last confirmed ${lastConfirmed}` : null,
              ]
                .filter(Boolean)
                .join(' · ')}`,
            );
          }
        }
      };
      emit('Current', current);
      emit('History', history);
    }
  } else {
    lines.push('', '## Facts', '(none yet)');
  }

  if (chatCount > 0 && input.chatMentions) {
    lines.push('', '## From your chats');
    input.chatMentions.forEach((mention, i) => {
      const when = mention.createdAt ? new Date(mention.createdAt).toLocaleString() : '';
      const heading = [mention.sessionTitle, when].filter(Boolean).join(' · ');
      lines.push(`${i + 1}. ${heading || 'Chat mention'}`);
      lines.push(mention.content.trim());
      lines.push('');
    });
  }

  if (claimCount > 0 && kb) {
    lines.push('', '## Crystallized knowledge');
    kb.knowledgeClaims.forEach((claim, i) => {
      const pct = Math.round((claim.confidence ?? 0) * 100);
      const type = claim.knowledge_type ? ` · ${claim.knowledge_type.replace(/_/g, ' ')}` : '';
      lines.push(`${i + 1}. ${claim.human_readable_claim} (${pct}%${type})`);
      const evidence = (claim.evidence_links ?? [])
        .map((l) => l.evidence_summary?.trim())
        .filter(Boolean)
        .slice(0, 3);
      for (const ev of evidence) lines.push(`   - ${ev}`);
    });
  }

  const timeline = kb?.profile.timelineEvents ?? [];
  if (timeline.length > 0) {
    lines.push('', '## Timeline');
    timeline.forEach((ev, i) => {
      const date = ev.date ? ` · ${ev.date}` : '';
      lines.push(`${i + 1}. ${ev.title} [${ev.type}]${date}`);
      if (ev.summary?.trim()) lines.push(`   ${ev.summary.trim()}`);
    });
  }

  const links = kb?.conversationLinks ?? [];
  if (links.length > 0) {
    lines.push('', '## Conversation links');
    for (const link of links) {
      const title = link.sessionTitle || link.sessionId;
      lines.push(`- ${title} (${link.linkKind}, ×${link.mentionCount})`);
    }
  }

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
