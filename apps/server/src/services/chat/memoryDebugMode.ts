/**
 * Sprint AK-8 — Memory debug mode
 *
 * Rich diagnostic output when user is clearly testing the system.
 */

import { supabaseAdmin } from '../supabaseClient';
import { buildThreadRecall } from './threadRecallService';
import { fetchCharacterRoster, fetchFamilyMembers } from './foundationRecallDataService';
import { buildRecallCoverageReport } from './recallQueryRouter';
import { formatLabeledRecall } from './memorySourceLabels';

type HistoryMessage = { role: string; content: string };

export async function buildMemoryDebugReport(
  userId: string,
  message: string,
  options: {
    conversationHistory: HistoryMessage[];
    threadId?: string;
  }
): Promise<string> {
  const parts: string[] = ['**Memory Debug Mode**', ''];

  const thread = await buildThreadRecall(userId, message, options);
  parts.push(
    formatLabeledRecall({
      currentThread: thread.hasContent ? thread.content : 'No substantive thread content.',
    })
  );
  parts.push('');

  const [
    { data: chars },
    { data: memories },
    { data: events },
    { count: journalCount },
    roster,
    family,
    coverage,
  ] = await Promise.all([
    supabaseAdmin.from('characters').select('id, name').eq('user_id', userId).limit(20),
    supabaseAdmin.from('character_memories').select('id').eq('user_id', userId).limit(1),
    supabaseAdmin.from('resolved_events').select('id, title').eq('user_id', userId).limit(5),
    supabaseAdmin
      .from('journal_entries')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId),
    fetchCharacterRoster(userId),
    fetchFamilyMembers(userId),
    buildRecallCoverageReport(userId),
  ]);

  parts.push('**Entities found:**');
  if (chars?.length) {
    for (const c of chars.slice(0, 12)) {
      parts.push(`• ${c.name}`);
    }
  } else {
    parts.push('• None');
  }
  parts.push('');

  parts.push('**Retrieval status:**');
  for (const layer of coverage) {
    const status = layer.retrievable ? 'succeeded' : 'failed';
    parts.push(`• ${layer.layer}: ${status}${layer.sample ? ` — ${layer.sample.slice(0, 50)}` : ''}`);
  }
  parts.push('');

  parts.push('**Counts:**');
  parts.push(`• Characters: ${roster.filter((r) => !r.isSelf).length}`);
  parts.push(`• Family members: ${family.length}`);
  parts.push(`• Character memories: ${memories?.length ? 'present' : 'none'}`);
  parts.push(`• Journal entries: ${journalCount ?? 0}`);
  parts.push(`• Recent events: ${events?.length ?? 0}`);
  if (events?.length) {
    for (const ev of events) {
      parts.push(`  ◦ ${ev.title}`);
    }
  }

  parts.push('');
  parts.push('**Why retrieval succeeded/failed:**');
  const bio = coverage.find((l) => l.layer === 'biography');
  const rel = coverage.find((l) => l.layer === 'relationships');
  if (!bio?.stored) parts.push('• Biography: no snapshot generated yet');
  if (!rel?.retrievable) parts.push('• Relationships: no family/relationship rows linked');
  if (!thread.hasContent) parts.push('• Thread: empty or no user messages in current session');
  if (bio?.stored && rel?.retrievable && thread.hasContent) {
    parts.push('• Thread + structured lore both available — recall should succeed');
  }

  return parts.join('\n');
}
