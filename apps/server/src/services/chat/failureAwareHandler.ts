/**
 * Sprint AH — Failure-Aware Diagnostic Recall (Phase 5)
 */

import { buildRecallCoverageReport } from './recallQueryRouter';
import { buildThreadRecall } from './threadRecallService';
import {
  fetchCharacterRoster,
  formatGroupedCharacterRosterForChat,
  formatFamilyTreeForChat,
  fetchFamilyMembers,
} from './foundationRecallDataService';

type HistoryMessage = { role: string; content: string };

export async function buildDiagnosticRecall(
  userId: string,
  message: string,
  options: {
    conversationHistory: HistoryMessage[];
    threadId?: string;
  }
): Promise<string> {
  const parts: string[] = ['Let me check what I actually have:', ''];

  const thread = await buildThreadRecall(userId, message, options);
  parts.push('**This thread**');
  if (thread.hasContent) {
    parts.push(thread.content.split('\n').slice(0, 12).join('\n'));
  } else {
    parts.push('No substantive messages in the current thread.');
  }
  parts.push('');

  const roster = await fetchCharacterRoster(userId);
  parts.push('**Character memory**');
  parts.push(
    roster.length > 0
      ? await formatGroupedCharacterRosterForChat(userId, roster)
      : 'No characters stored yet.'
  );
  parts.push('');

  const familyTree = await formatFamilyTreeForChat(userId);
  if (familyTree) {
    parts.push('**Relationship memory**');
    parts.push(familyTree);
    parts.push('');
  } else {
    const family = await fetchFamilyMembers(userId);
    parts.push('**Relationship memory**');
    parts.push(
      family.length > 0
        ? `${family.length} family member(s): ${family.map((m) => m.name).join(', ')}`
        : 'No family relationships stored yet.'
    );
    parts.push('');
  }

  const coverage = await buildRecallCoverageReport(userId);
  parts.push('**Structured memory layers**');
  for (const layer of coverage) {
    const status = layer.stored ? '✓' : '✗';
    parts.push(`• ${layer.layer}: ${status} ${layer.sample ? `— ${layer.sample.slice(0, 60)}` : ''}`);
  }

  const timelineLayer = coverage.find((l) => l.layer === 'timeline');
  if (timelineLayer?.stored) {
    parts.push('');
    parts.push('**Timeline memory**');
    parts.push(`✓ ${timelineLayer.sample}`);
  }

  return parts.join('\n');
}
