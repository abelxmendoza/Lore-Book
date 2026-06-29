/**
 * Remove misclassified character cards (holidays, events, game fragments).
 * Wrong-domain cards are archived so they disappear from active/home surfaces;
 * cards already queued for deletion can be permanently removed with recovery.
 *
 * Usage:
 *   npx tsx src/scripts/cleanupMisclassifiedCharacters.ts [--dry-run] [--name "Memorial Day"]
 */

import { classifyMentionKind } from '../utils/entityMentionClassifier';
import { evaluateWrongDomain } from '../services/characters/audit/wrongDomainCharacterGuard';
import { characterDeletionService } from '../services/characterDeletionService';
import { supabaseAdmin } from '../services/supabaseClient';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const nameIdx = args.indexOf('--name');
const nameFilter = nameIdx >= 0 ? args[nameIdx + 1]?.toLowerCase() : null;
const userIdx = args.indexOf('--user');
const userFilter = userIdx >= 0 ? args[userIdx + 1] : null;

function provenanceText(metadata: unknown): string {
  const meta = (metadata ?? {}) as Record<string, unknown>;
  return [
    meta.storyContext,
    meta.provenance,
    meta.sourceText,
    meta.source_excerpt,
    meta.evidence,
  ]
    .flatMap((value) => Array.isArray(value) ? value : [value])
    .filter((value): value is string => typeof value === 'string')
    .join('\n');
}

function shouldRemoveCharacter(c: { name: string; metadata?: unknown }): boolean {
  const provenance = provenanceText(c.metadata);
  if (evaluateWrongDomain(c.name, provenance).wrongDomain) return true;
  const kind = classifyMentionKind(c.name, provenance).kind;
  return kind !== 'person' && kind !== 'unknown';
}

function wrongDomainTarget(c: { name: string; metadata?: unknown }) {
  return evaluateWrongDomain(c.name, provenanceText(c.metadata));
}

async function main() {
  let query = supabaseAdmin
    .from('characters')
    .select('id, user_id, name, metadata, status')
    .neq('status', 'archived');
  if (userFilter) query = query.eq('user_id', userFilter);

  const { data: characters, error } = await query.limit(500);
  if (error) throw error;

  const targets = (characters ?? []).filter((c) => {
    if (nameFilter && !c.name.toLowerCase().includes(nameFilter)) return false;
    return shouldRemoveCharacter(c);
  });

  if (targets.length === 0) {
    console.log('No misclassified character cards found.');
    return;
  }

  console.log(`Found ${targets.length} misclassified character(s):`);
  for (const c of targets) {
    const domain = wrongDomainTarget(c);
    const kind = classifyMentionKind(c.name, provenanceText(c.metadata)).kind;
    const action = domain.wrongDomain && domain.target !== 'system' ? 'archive' : 'delete-if-queued';
    console.log(`  - ${c.name} (${kind}) [${c.id}] user=${c.user_id} action=${action}`);
  }

  if (dryRun) {
    console.log('\nDry run — no deletions performed.');
    return;
  }

  for (const c of targets) {
    const domain = wrongDomainTarget(c);
    if (domain.wrongDomain && domain.target !== 'system') {
      const metadata = (c.metadata ?? {}) as Record<string, unknown>;
      const { error: archiveError } = await supabaseAdmin
        .from('characters')
        .update({
          status: 'archived',
          updated_at: new Date().toISOString(),
          metadata: {
            ...metadata,
            card_audit_review: {
              action: domain.target === 'interest' ? 'move_to_interest' : 'move_to_group',
              wrongDomainTarget: domain.target,
              reason: domain.reason,
              reviewedAt: new Date().toISOString(),
              appliedBy: 'cleanup_misclassified_characters',
            },
          },
        })
        .eq('id', c.id)
        .eq('user_id', c.user_id);
      if (archiveError) throw archiveError;
      console.log(`Archived "${c.name}" as ${domain.target}.`);
      continue;
    }

    if (c.status !== 'pending_deletion') {
      console.log(`Skipped "${c.name}" — queue for deletion before permanent removal.`);
      continue;
    }

    const report = await characterDeletionService.deleteCharacter(c.user_id, c.id, { redistribute: true });
    console.log(`Deleted "${c.name}":`, report?.redistribution);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
