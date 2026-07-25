/**
 * Omni Timeline Chronology Authority repair — dry-run by default.
 *
 *   npm run timeline:repair-founder
 *   npm run timeline:repair-founder -- --apply
 *   npm run timeline:repair-founder -- --rollback --mutation-log=<path>
 *
 * Resolves founder via OWNER_USER_ID / admin role. Never hardcodes a UUID.
 * Writes audits under artifacts/ (detail dumps with lore → .private/artifacts/).
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

import { config } from '../config';
import { supabaseAdmin } from '../services/supabaseClient';
import {
  detectTemporalContradiction,
  suggestedOccurrenceIso,
  evaluateTimelineEligibility,
  applyDomainRoutingGuards,
  type ArcTrack,
} from '../services/chronologyAuthority';

type Mutation = {
  table: string;
  id: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  reason: string;
};

function parseFlag(argv: string[], flag: string): boolean {
  return argv.includes(flag);
}

function parseArg(argv: string[], flag: string): string | undefined {
  const eq = argv.find((a) => a.startsWith(`${flag}=`));
  if (eq) return eq.slice(flag.length + 1);
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
    return (
      role === 'admin' ||
      role === 'owner' ||
      u.email?.toLowerCase() === config.ownerEmail?.toLowerCase()
    );
  });
  if (matches.length === 0) throw new Error('Could not resolve founder account');
  if (matches.length > 1) {
    throw new Error(
      `Ambiguous founder accounts (${matches.length}). Pass --user=<id> explicitly.`,
    );
  }
  return matches[0].id;
}

/** Prefer monorepo root artifacts/ even when cwd is apps/server. */
function repoRoot(): string {
  const cwd = process.cwd();
  if (cwd.endsWith('/apps/server') || cwd.endsWith('\\apps\\server')) {
    return join(cwd, '..', '..');
  }
  return cwd;
}

function ensureDirs() {
  const root = repoRoot();
  mkdirSync(join(root, 'artifacts'), { recursive: true });
  mkdirSync(join(root, '.private', 'artifacts'), { recursive: true });
}

function stableJson(value: unknown): string {
  return JSON.stringify(value);
}

function materiallyChanged(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): boolean {
  return stableJson(before) !== stableJson(after);
}

function metaAlreadyExcluded(metadata: unknown): boolean {
  return Boolean((metadata as Record<string, unknown> | null)?.omni_excluded);
}

async function inventory(userId: string) {
  const [{ data: events }, { data: arcs }, { data: journals }] = await Promise.all([
    supabaseAdmin
      .from('resolved_events')
      .select(
        'id, title, summary, start_time, confidence, tags, metadata, temporal_precision, temporal_source, temporal_confidence, temporal_status',
      )
      .eq('user_id', userId)
      .limit(5000),
    supabaseAdmin
      .from('life_arcs')
      .select('id, title, arc_type, track, start_date, end_date, summary, metadata, confidence')
      .eq('user_id', userId)
      .limit(2000),
    supabaseAdmin
      .from('journal_entries')
      .select('id, content, date, tags')
      .eq('user_id', userId)
      .limit(5000),
  ]);

  return {
    events: events ?? [],
    arcs: arcs ?? [],
    journals: journals ?? [],
  };
}

async function planMutations(userId: string): Promise<{
  mutations: Mutation[];
  audit: Array<Record<string, unknown>>;
  summary: Record<string, number>;
}> {
  const { events, arcs } = await inventory(userId);
  const mutations: Mutation[] = [];
  const audit: Array<Record<string, unknown>> = [];
  const summary = {
    events_scanned: events.length,
    arcs_scanned: arcs.length,
    temporal_repairs: 0,
    temporal_unanchored: 0,
    eligibility_excluded: 0,
    occasions_demoted: 0,
    tracks_repaired: 0,
  };

  for (const e of events) {
    const tags = (e.tags as string[]) ?? [];
    const eligibility = evaluateTimelineEligibility({
      text: `${e.title ?? ''} ${e.summary ?? ''}`,
      title: e.title,
      tags,
      metadata: (e.metadata as Record<string, unknown>) ?? null,
    });

    const contradiction = detectTemporalContradiction({
      recordId: e.id,
      storedOccurrence: e.start_time,
      title: e.title,
      summary: e.summary,
      temporalSource: e.temporal_source,
      tags,
    });

    const before = {
      start_time: e.start_time,
      temporal_precision: e.temporal_precision,
      temporal_source: e.temporal_source,
      temporal_confidence: e.temporal_confidence,
      temporal_status: e.temporal_status,
      confidence: e.confidence,
      metadata: e.metadata,
    };

    const after: Record<string, unknown> = { ...before };
    let reason = '';
    const meta = (e.metadata as Record<string, unknown>) ?? {};

    const hardExclude = [
      'RECAP_REQUEST',
      'COMMAND',
      'CORRECTION',
      'QUESTION',
      'PRODUCT_FEEDBACK',
      'SYSTEM_DEBUGGING',
      'EMPTY',
      'EXTERNAL_CONTEXT',
    ].includes(eligibility.speechAct);

    if (hardExclude && !metaAlreadyExcluded(e.metadata)) {
      after.metadata = {
        ...meta,
        omni_excluded: true,
        omni_exclude_reason: eligibility.speechAct,
        chronology_authority: true,
      };
      reason = `exclude:${eligibility.speechAct}`;
      summary.eligibility_excluded += 1;
    }

    const alreadyUnanchored =
      e.start_time == null &&
      (e.temporal_status === 'unanchored' || meta.needs_temporal_resolution === true);
    const isRecoveryArtifact =
      !alreadyUnanchored &&
      (tags.some((t) => /^recovered$/i.test(t)) ||
        meta.generated_by === 'event_recovery' ||
        (meta.needs_temporal_resolution === true && e.start_time != null));

    if (isRecoveryArtifact) {
      after.start_time = null;
      after.temporal_precision = 'unknown';
      after.temporal_source = 'recording_fallback';
      after.temporal_status = 'unanchored';
      after.temporal_confidence = 0.2;
      after.confidence = Math.min(Number(e.confidence ?? 0.5), 0.2);
      after.metadata = {
        ...((after.metadata as Record<string, unknown>) ?? {}),
        ...meta,
        ...(e.start_time ? { recovery_fallback_date: e.start_time } : {}),
        needs_temporal_resolution: true,
        chronology_authority: true,
      };
      reason = reason ? `${reason}|unanchor_recovery` : 'unanchor_recovery';
      summary.temporal_unanchored += 1;
    } else if (contradiction && !alreadyUnanchored) {
      if (
        contradiction.recommendedAction === 'AUTO_REPAIR' &&
        suggestedOccurrenceIso(contradiction)
      ) {
        after.start_time = suggestedOccurrenceIso(contradiction);
        after.temporal_precision = contradiction.suggestedDay ? 'date' : 'month';
        after.temporal_source = 'context_inferred';
        after.temporal_status = 'approximate';
        after.temporal_confidence = Math.min(0.7, Number(e.temporal_confidence ?? 0.7));
        reason = reason
          ? `${reason}|repair:${contradiction.contradictionType}`
          : `repair:${contradiction.contradictionType}`;
        summary.temporal_repairs += 1;
      } else if (contradiction.recommendedAction === 'REMOVE_OCCURRENCE_DATE') {
        // Only null dates for true recovery/import artifacts. Other recording_fallback
        // labels demote precision so we do not wipe usable occurrence anchors.
        const hardUnanchor =
          contradiction.contradictionType !== 'FALLBACK_DATE_USED' ||
          tags.some((t) => /recovered|import/i.test(t)) ||
          meta.generated_by === 'event_recovery';
        if (hardUnanchor) {
          after.start_time = null;
          after.temporal_precision = 'unknown';
          after.temporal_status = 'unanchored';
          after.temporal_confidence = 0.2;
          reason = reason
            ? `${reason}|remove:${contradiction.contradictionType}`
            : `remove:${contradiction.contradictionType}`;
          summary.temporal_unanchored += 1;
        } else {
          after.temporal_precision =
            after.temporal_precision === 'exact' ? 'approximate' : after.temporal_precision;
          after.temporal_confidence = Math.min(0.35, Number(e.temporal_confidence ?? 0.35));
          after.temporal_status = 'approximate';
          reason = reason
            ? `${reason}|demote:${contradiction.contradictionType}`
            : `demote:${contradiction.contradictionType}`;
          summary.temporal_repairs += 1;
        }
      } else {
        after.temporal_precision =
          after.temporal_precision === 'exact' ? 'unknown' : after.temporal_precision;
        after.temporal_confidence = Math.min(0.4, Number(e.temporal_confidence ?? 0.4));
        after.temporal_status = 'ambiguous';
        reason = reason
          ? `${reason}|demote:${contradiction.contradictionType}`
          : `demote:${contradiction.contradictionType}`;
        summary.temporal_repairs += 1;
      }
      after.metadata = {
        ...((after.metadata as Record<string, unknown>) ?? {}),
        temporal_contradiction: contradiction.contradictionType,
        chronology_authority: true,
      };
    }

    if (reason && materiallyChanged(before, after)) {
      mutations.push({ table: 'resolved_events', id: e.id, before, after, reason });
      audit.push({
        originalObjectId: e.id,
        originalObjectType: 'resolved_event',
        originalTitle: e.title,
        originalStart: e.start_time,
        mutationDecision: reason,
        eligibilitySurface: eligibility.surface,
        speechAct: eligibility.speechAct,
      });
    } else if (reason && !materiallyChanged(before, after)) {
      // Already repaired — do not re-count.
      if (reason.includes('exclude:')) summary.eligibility_excluded -= 1;
      if (reason.includes('unanchor') || reason.includes('remove:')) {
        summary.temporal_unanchored -= 1;
      }
      if (reason.includes('repair:') || reason.includes('demote:')) {
        summary.temporal_repairs -= 1;
      }
    }
  }

  for (const a of arcs) {
    const before = {
      track: a.track,
      metadata: a.metadata,
      start_date: a.start_date,
      end_date: a.end_date,
    };
    const after: Record<string, unknown> = { ...before };
    let reason = '';
    const arcMeta = (a.metadata as Record<string, unknown>) ?? {};

    if (
      a.arc_type === 'occasion' &&
      !(arcMeta.render_as === 'event' && arcMeta.omni_draw_bar === false)
    ) {
      after.metadata = {
        ...arcMeta,
        render_as: 'event',
        omni_draw_bar: false,
        chronology_authority: true,
      };
      reason = 'demote_occasion';
      summary.occasions_demoted += 1;
    }

    const guard = applyDomainRoutingGuards({
      title: a.title,
      summary: a.summary,
      proposedTrack: (a.track as ArcTrack) ?? 'inner',
    });
    if (guard.overruled && guard.track !== a.track) {
      after.track = guard.track;
      reason = reason ? `${reason}|retrack:${guard.reasons.join(',')}` : `retrack:${guard.reasons.join(',')}`;
      summary.tracks_repaired += 1;
    }

    if (reason && materiallyChanged(before, after)) {
      mutations.push({ table: 'life_arcs', id: a.id, before, after, reason });
      audit.push({
        originalObjectId: a.id,
        originalObjectType: 'life_arc',
        originalTitle: a.title,
        originalTrack: a.track,
        proposedPrimaryDomain: after.track,
        mutationDecision: reason,
      });
    } else if (reason && !materiallyChanged(before, after)) {
      if (reason.includes('demote_occasion')) summary.occasions_demoted -= 1;
      if (reason.includes('retrack:')) summary.tracks_repaired -= 1;
    }
  }

  return { mutations, audit, summary };
}

async function applyMutations(mutations: Mutation[]): Promise<number> {
  let applied = 0;
  for (const m of mutations) {
    const { error } = await supabaseAdmin.from(m.table).update(m.after).eq('id', m.id);
    if (error) {
      console.error(`Failed ${m.table}/${m.id}:`, error.message);
      continue;
    }
    applied += 1;
  }
  return applied;
}

async function rollback(logPath: string): Promise<number> {
  const raw = JSON.parse(readFileSync(logPath, 'utf8')) as { mutations: Mutation[] };
  let n = 0;
  for (const m of raw.mutations ?? []) {
    const { error } = await supabaseAdmin.from(m.table).update(m.before).eq('id', m.id);
    if (error) {
      console.error(`Rollback failed ${m.table}/${m.id}:`, error.message);
      continue;
    }
    n += 1;
  }
  return n;
}

async function main() {
  const argv = process.argv.slice(2);
  const apply = parseFlag(argv, '--apply');
  const doRollback = parseFlag(argv, '--rollback');
  const userArg = parseArg(argv, '--user');
  const mutationLog = parseArg(argv, '--mutation-log');

  ensureDirs();

  if (doRollback) {
    if (!mutationLog || !existsSync(mutationLog)) {
      throw new Error('--rollback requires --mutation-log=<path>');
    }
    const n = await rollback(mutationLog);
    console.log(`Rolled back ${n} rows from ${mutationLog}`);
    return;
  }

  const userId = await resolveFounderId(userArg);
  console.log(`Founder resolved (id length=${userId.length}). Mode=${apply ? 'APPLY' : 'DRY-RUN'}`);

  const { mutations, audit, summary } = await planMutations(userId);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const root = repoRoot();
  const publicPath = join(root, 'artifacts', `omni-timeline-founder-migration-${stamp}.json`);
  const privatePath = join(
    root,
    '.private',
    'artifacts',
    `omni-timeline-founder-migration-${stamp}.json`,
  );
  const mdPath = join(root, 'artifacts', `omni-timeline-founder-migration-${stamp}.md`);

  const payload = {
    userIdFingerprint: userId.slice(0, 8),
    mode: apply ? 'apply' : 'dry-run',
    summary,
    mutationCount: mutations.length,
    mutations,
    audit,
  };

  writeFileSync(publicPath, JSON.stringify({ ...payload, mutations: mutations.map((m) => ({
    table: m.table,
    id: m.id.slice(0, 8),
    reason: m.reason,
  })) }, null, 2));
  writeFileSync(privatePath, JSON.stringify(payload, null, 2));
  writeFileSync(
    mdPath,
    [
      '# Omni Timeline Founder Migration',
      '',
      `Mode: **${payload.mode}**`,
      '',
      '## Summary',
      ...Object.entries(summary).map(([k, v]) => `- ${k}: ${v}`),
      '',
      `Mutations planned: ${mutations.length}`,
      '',
      'See `.private/artifacts/` for full before/after payloads.',
    ].join('\n'),
  );

  console.log(JSON.stringify(summary, null, 2));
  console.log(`Wrote ${mdPath}`);
  console.log(`Wrote redacted ${publicPath}`);
  console.log(`Wrote full ${privatePath}`);

  if (apply) {
    const n = await applyMutations(mutations);
    console.log(`Applied ${n}/${mutations.length} mutations`);
    writeFileSync(
      join(root, 'artifacts', `omni-timeline-rollback-${stamp}.json`),
      JSON.stringify({ mutationCount: mutations.length, mutations: mutations.map((m) => ({
        table: m.table,
        id: m.id.slice(0, 8),
        reason: m.reason,
      })) }, null, 2),
    );
    writeFileSync(
      join(root, '.private', 'artifacts', `omni-timeline-rollback-${stamp}.json`),
      JSON.stringify({ mutations }, null, 2),
    );
  } else {
    console.log('Dry-run only. Re-run with --apply to mutate.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
