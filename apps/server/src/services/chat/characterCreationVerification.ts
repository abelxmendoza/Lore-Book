/**
 * Sprint AK-3 — Character creation verification
 *
 * Verifies entity + character + DB write when user asks "Did you create a character?"
 */

import { supabaseAdmin } from '../supabaseClient';
import { resolveCharacterByName } from './foundationRecallDataService';
import { loadFoundationEntityIndex } from './foundationEntityIndex';
import { entityNameFromMessage } from './memoryFormationStatusService';
import { formatEvidenceResponse, type EvidenceCounts } from './memoryEvidenceFormatter';

type VerificationCheck = { label: string; ok: boolean; detail: string };

export async function verifyCharacterCreation(
  userId: string,
  message: string,
  options: { threadId?: string } = {}
): Promise<{ content: string; entityName: string | null }> {
  const entityName = entityNameFromMessage(message);

  if (!entityName) {
    const { count: charCount } = await supabaseAdmin
      .from('characters')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);

    const { data: recent } = await supabaseAdmin
      .from('characters')
      .select('name, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(3);

    const checks: VerificationCheck[] = [
      {
        label: 'Character table',
        ok: (charCount ?? 0) > 0,
        detail: `${charCount ?? 0} character(s) in database`,
      },
    ];

    const known = recent?.map((c) => `${c.name} (created ${new Date(c.created_at).toLocaleDateString()})`) ?? [];
    const unknown = (charCount ?? 0) === 0 ? ['No characters created yet'] : [];

    const evidence: EvidenceCounts = {
      thread: 0,
      memory: 0,
      event: 0,
      character: charCount ?? 0,
    };

    const body = formatEvidenceResponse({
      preamble: '**Character Creation — System Check**\n\nAsk about a specific name for a detailed verification.',
      known,
      unknown,
      evidence,
    });

    const checkLines = checks.map((c) => `**${c.label}:** ${c.ok ? '✓' : '✗'} ${c.detail}`);
    return { content: [body, '', ...checkLines].join('\n'), entityName: null };
  }

  const char = await resolveCharacterByName(userId, entityName);
  const checks: VerificationCheck[] = [];

  const index = await loadFoundationEntityIndex(userId);
  const normKey = entityName.trim().toLowerCase();
  let entityRef = index.get(normKey);
  if (!entityRef) {
    for (const [key, ref] of index) {
      if (key.includes(normKey) || normKey.includes(key)) {
        entityRef = ref;
        break;
      }
    }
  }
  const entityOk = !!entityRef || !!char;
  const entityLabel = entityRef?.type ?? (char ? 'person' : null);

  if (char) {
    const [{ count: memCount }, { count: relCount }] = await Promise.all([
      supabaseAdmin
        .from('character_memories')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('character_id', char.id),
      supabaseAdmin
        .from('character_relationships')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .or(`source_character_id.eq.${char.id},target_character_id.eq.${char.id}`),
    ]);

    checks.push({
      label: '1. Entity exists',
      ok: entityOk,
      detail: entityOk
        ? `✓ Entity in foundation registry (${char?.name ?? entityName}, ${entityLabel ?? 'person'})`
        : '○ Entity registry pending',
    });

    checks.push({
      label: '2. Character exists',
      ok: true,
      detail: `✓ Character row: "${char.name}" (${char.id.slice(0, 8)}…)`,
    });

    checks.push({
      label: '3. UI card exists',
      ok: true,
      detail: `✓ Character card available via GET /api/characters/${char.id}`,
    });

    checks.push({
      label: '4. Ingestion succeeded',
      ok: (memCount ?? 0) > 0,
      detail:
        (memCount ?? 0) > 0
          ? `✓ ${memCount} character_memory link(s) — ingestion complete`
          : '○ Character created — memory links pending (extraction async)',
    });

    const ingestionFailed = char.metadata?.extraction_failed === true;
    checks.push({
      label: '5. Creation status',
      ok: !ingestionFailed && (memCount ?? 0) > 0,
      detail: ingestionFailed
        ? '✗ Ingestion reported failure — check diagnostics'
        : (memCount ?? 0) > 0
          ? '✓ Fully created'
          : '○ Partial — card exists, memories pending',
    });

    checks.push({
      label: 'Relationships',
      ok: (relCount ?? 0) > 0,
      detail: (relCount ?? 0) > 0 ? `✓ ${relCount} relationship row(s)` : '○ No relationships yet',
    });
  } else {
    checks.push({ label: '1. Entity exists', ok: entityOk, detail: entityOk ? '✓' : '✗ Not found' });
    checks.push({ label: '2. Character exists', ok: false, detail: `✗ No character row for "${entityName}"` });
    checks.push({ label: '3. UI card exists', ok: false, detail: '✗ No card — character not created' });
    checks.push({ label: '4. Ingestion succeeded', ok: false, detail: '✗ No ingestion — nothing to display' });
    checks.push({ label: '5. Creation status', ok: false, detail: '✗ Creation failed or not started' });
  }

  let threadEvidence = 0;
  if (options.threadId) {
    const { data: msgs } = await supabaseAdmin
      .from('chat_messages')
      .select('content')
      .eq('user_id', userId)
      .eq('session_id', options.threadId)
      .eq('role', 'user')
      .limit(30);

    const key = entityName.toLowerCase();
    threadEvidence = (msgs ?? []).filter((m) =>
      String(m.content).toLowerCase().includes(key)
    ).length;
  }

  const known: string[] = [];
  const unknown: string[] = [];

  if (char) known.push(`Character "${char.name}" exists in database`);
  else unknown.push(`Character record for "${entityName}" not created`);

  if (entityOk) known.push('Entity registered in foundation index');
  else unknown.push('Entity not in foundation registry');

  const memCheck = checks.find((c) => c.label === '4. Ingestion succeeded');
  if (memCheck?.ok) known.push(memCheck.detail.replace('✓ ', ''));
  else if (char) unknown.push('No linked memories yet');

  const evidence: EvidenceCounts = {
    thread: threadEvidence,
    memory: memCheck?.ok ? 1 : 0,
    event: 0,
    character: char ? 1 : 0,
  };

  const whyNot = !char
    ? `\n\n**Why not created:** No matching row in \`characters\` for "${entityName}". Mention them again in chat — extraction runs asynchronously after ingestion.`
    : !memCheck?.ok
      ? '\n\n**Partial creation:** Character card exists but memory links are still pending extraction.'
      : '';

  const body = formatEvidenceResponse({
    preamble: `**Character Creation — ${entityName}**`,
    known,
    unknown,
    evidence,
  });

  const checkLines = checks.map((c) => `**${c.label}:** ${c.detail}`);

  return {
    content: [body, '', ...checkLines, whyNot].filter(Boolean).join('\n'),
    entityName,
  };
}
