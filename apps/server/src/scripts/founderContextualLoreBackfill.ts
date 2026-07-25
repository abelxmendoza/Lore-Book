/**
 * Founder contextual-lore backfill — dry-run by default.
 *
 *   npx tsx src/scripts/founderContextualLoreBackfill.ts
 *   npx tsx src/scripts/founderContextualLoreBackfill.ts --apply --conversation=<id>
 *   npx tsx src/scripts/founderContextualLoreBackfill.ts --rollback --mutation-log=<path>
 *
 * Resolves founder via OWNER_USER_ID / FOUNDER_USER_ID / admin role.
 * Never hardcodes a production UUID. Writes audits under .private/artifacts/.
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

import { config } from '../config';
import { buildContextualKnowledgeBundle } from '../services/contextualLore';
import { supabaseAdmin } from '../services/supabaseClient';

function parseFlag(argv: string[], flag: string): boolean {
  return argv.includes(flag);
}

function parseArg(argv: string[], flag: string): string | undefined {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
}

async function resolveFounderId(explicit?: string): Promise<string> {
  if (explicit?.trim()) return explicit.trim();
  if (config.ownerUserId?.trim()) return config.ownerUserId.trim();
  const { data, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const matches = data.users.filter((u) => {
    const role = String(u.app_metadata?.role ?? '').toLowerCase();
    return role === 'admin' || role === 'owner' || u.email?.toLowerCase() === config.ownerEmail?.toLowerCase();
  });
  if (matches.length === 0) throw new Error('Could not resolve founder account');
  if (matches.length > 1) {
    throw new Error(
      `Ambiguous founder accounts (${matches.length}). Pass --user=<id> explicitly.`,
    );
  }
  return matches[0].id;
}

async function loadConversationText(
  userId: string,
  conversationId?: string,
): Promise<{ conversationId: string | null; messageIds: string[]; text: string }> {
  if (conversationId) {
    const { data, error } = await supabaseAdmin
      .from('chat_messages')
      .select('id, content, role, created_at')
      .eq('user_id', userId)
      .eq('session_id', conversationId)
      .eq('role', 'user')
      .order('created_at', { ascending: true })
      .limit(40);
    if (error) throw error;
    const rows = data ?? [];
    return {
      conversationId,
      messageIds: rows.map((r) => r.id),
      text: rows.map((r) => r.content).filter(Boolean).join('\n\n'),
    };
  }

  // Fingerprint search for the Jessica / support-team multi-thread day (no UUID hardcoding).
  const { data, error } = await supabaseAdmin
    .from('chat_messages')
    .select('id, content, session_id, created_at')
    .eq('user_id', userId)
    .eq('role', 'user')
    .ilike('content', '%Social Worker%')
    .order('created_at', { ascending: false })
    .limit(30);
  if (error) throw error;

  const hit = (data ?? []).find(
    (r) =>
      /DistroKid/i.test(r.content ?? '') ||
      /Support Team/i.test(r.content ?? '') ||
      /Rivian/i.test(r.content ?? ''),
  );
  if (!hit) {
    return { conversationId: null, messageIds: [], text: '' };
  }

  const { data: thread } = await supabaseAdmin
    .from('chat_messages')
    .select('id, content, role, created_at')
    .eq('user_id', userId)
    .eq('session_id', hit.session_id)
    .eq('role', 'user')
    .order('created_at', { ascending: true })
    .limit(40);

  const rows = thread ?? [];
  return {
    conversationId: hit.session_id,
    messageIds: rows.map((r) => r.id),
    text: rows.map((r) => r.content).filter(Boolean).join('\n\n'),
  };
}

async function main() {
  const argv = process.argv.slice(2);
  const apply = parseFlag(argv, '--apply');
  const rollback = parseFlag(argv, '--rollback');
  const userArg = parseArg(argv, '--user');
  const conversationArg = parseArg(argv, '--conversation');
  const mutationLogPath = parseArg(argv, '--mutation-log');

  const outDir = join(process.cwd(), '../../.private/artifacts');
  mkdirSync(outDir, { recursive: true });

  if (rollback) {
    if (!mutationLogPath || !existsSync(mutationLogPath)) {
      throw new Error('Rollback requires --mutation-log=<path> to a prior apply log');
    }
    const log = JSON.parse(readFileSync(mutationLogPath, 'utf8')) as {
      applied: Array<{ table: string; id: string }>;
    };
    let reverted = 0;
    for (const row of log.applied ?? []) {
      const { error } = await supabaseAdmin.from(row.table).delete().eq('id', row.id);
      if (!error) reverted += 1;
    }
    console.log(JSON.stringify({ ok: true, rollback: true, reverted }, null, 2));
    return;
  }

  const founderId = await resolveFounderId(userArg);
  const source = await loadConversationText(founderId, conversationArg);
  const bundle = source.text
    ? buildContextualKnowledgeBundle(source.text)
    : buildContextualKnowledgeBundle('');

  const plan = {
    dryRun: !apply,
    founderAccountId: founderId,
    sourceConversationId: source.conversationId,
    sourceMessageIds: source.messageIds,
    bundleSummary: {
      threads: bundle.threads,
      introducedEntities: bundle.introducedEntities,
      groupProposals: bundle.groupProposals,
      eventProposals: bundle.eventProposals.map((e) => ({
        title: e.title,
        kind: e.kind,
        isMilestone: e.isMilestone,
        publicationUncertain: e.publicationUncertain,
      })),
      reflectionProposals: bundle.reflectionProposals,
      dayMomentTitle: bundle.dayMomentTitle,
      responseMode: bundle.responsePlan.responseMode,
    },
    proposedCreates: [
      ...bundle.introducedEntities.map((e) => ({
        type: 'character',
        name: e.canonicalName,
        role: e.rolePhrase,
        supports: e.supportsAnchor,
      })),
      ...bundle.groupProposals.map((g) => ({
        type: 'organization',
        name: g.canonicalName,
        group_type: g.groupType,
      })),
    ],
    preventedClaims: bundle.responsePlan.avoidedClaims,
    unresolvedAmbiguities: source.text
      ? []
      : ['No matching source conversation found — pass --conversation=<session_id>'],
  };

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const jsonPath = join(outDir, `founder-contextual-lore-audit-${stamp}.json`);
  const mdPath = join(outDir, `founder-contextual-lore-audit-${stamp}.md`);
  writeFileSync(jsonPath, JSON.stringify(plan, null, 2));
  writeFileSync(
    mdPath,
    [
      '# Founder Contextual Lore Audit',
      '',
      `- Dry run: ${plan.dryRun}`,
      `- Founder: (resolved; id redacted in markdown)`,
      `- Conversation: ${plan.sourceConversationId ?? 'not found'}`,
      `- Threads: ${bundle.threads.join(', ') || 'none'}`,
      `- Day moment: ${bundle.dayMomentTitle ?? 'n/a'}`,
      '',
      '## Proposed creates',
      ...plan.proposedCreates.map((c) => `- ${JSON.stringify(c)}`),
      '',
      '## Reflections',
      ...bundle.reflectionProposals.map((r) => `- [${r.modality}] ${r.statement}`),
      '',
      '## Prevented claims',
      ...plan.preventedClaims.map((c) => `- ${c}`),
    ].join('\n'),
  );

  if (!apply) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          dryRun: true,
          auditJson: jsonPath,
          auditMd: mdPath,
          threads: bundle.threads,
          proposedCreates: plan.proposedCreates.length,
          message: 'Re-run with --apply to mutate (after reviewing the audit).',
        },
        null,
        2,
      ),
    );
    return;
  }

  if (!source.text) {
    throw new Error('Refusing --apply without source conversation text');
  }

  const applied: Array<{ table: string; id: string; name: string }> = [];

  for (const person of bundle.introducedEntities) {
    const { data: existing } = await supabaseAdmin
      .from('characters')
      .select('id, name')
      .eq('user_id', founderId)
      .ilike('name', person.canonicalName)
      .limit(1);
    if (existing?.[0]) continue;
    const { data: created, error } = await supabaseAdmin
      .from('characters')
      .insert({
        user_id: founderId,
        name: person.canonicalName,
        role: person.rolePhrase ?? null,
        metadata: {
          supports_person: person.supportsAnchor,
          provenance: {
            source: 'founder_contextual_lore_backfill',
            conversation_id: source.conversationId,
            message_ids: source.messageIds,
          },
        },
      })
      .select('id, name')
      .single();
    if (!error && created) {
      applied.push({ table: 'characters', id: created.id, name: created.name });
    }
  }

  for (const group of bundle.groupProposals) {
    const { data: existing } = await supabaseAdmin
      .from('organizations')
      .select('id, name')
      .eq('user_id', founderId)
      .ilike('name', group.canonicalName)
      .limit(1);
    if (existing?.[0]) continue;
    const { data: created, error } = await supabaseAdmin
      .from('organizations')
      .insert({
        user_id: founderId,
        name: group.canonicalName,
        type: group.groupType ?? 'care_team',
        group_type: group.groupType ?? 'care_team',
        membership_model: 'fuzzy',
        user_relationship: 'adjacent',
        metadata: {
          provenance: {
            source: 'founder_contextual_lore_backfill',
            conversation_id: source.conversationId,
            central_person_name: group.supportsAnchor,
          },
        },
      })
      .select('id, name')
      .single();
    if (!error && created) {
      applied.push({ table: 'organizations', id: created.id, name: created.name });
    }
  }

  const mutationLog = join(outDir, `founder-contextual-lore-mutations-${stamp}.json`);
  writeFileSync(
    mutationLog,
    JSON.stringify({ founderAccountId: founderId, applied, at: new Date().toISOString() }, null, 2),
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        dryRun: false,
        applied: applied.length,
        mutationLog,
        auditJson: jsonPath,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
