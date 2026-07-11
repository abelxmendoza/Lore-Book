/**
 * MCP lore corrections — "that's wrong, fix it" from any dev agent.
 *
 * The user corrects their lore in conversation ("Hell Fairy is a crush, not an
 * ex", "that name is spelled Stimkybun") and the agent applies it through this
 * tool instead of hand-written SQL. Every correction is user-scoped,
 * non-destructive (old values preserved in metadata/aliases), marked
 * correction_source='user' so ingestion never overwrites it, and audit-logged.
 */

import { z } from 'zod';

import { auditMcpToolCall } from './mcpAuditService';
import type { McpAuthContext } from './types';

export const ROMANTIC_TYPES = [
  'boyfriend', 'girlfriend', 'wife', 'husband', 'lover', 'crush', 'infatuation',
  'situationship', 'dating', 'talking', 'hooking_up', 'one_night_stand',
  'friends_with_benefits', 'ex_boyfriend', 'ex_girlfriend', 'ex_wife',
  'ex_husband', 'ex_lover', 'complicated',
] as const;

export const ROMANTIC_STATUSES = [
  'active', 'ended', 'blocked', 'ghosted', 'on_break', 'complicated', 'paused',
  'unrequited', 'fading', 'rekindled',
] as const;

export const correctLoreInputSchema = {
  action: z.enum([
    'rename_character',
    'set_romantic_classification',
    'exclude_from_dating',
    'confirm_romantic',
  ]),
  /** rename_character */
  character_id: z.string().uuid().optional(),
  new_name: z.string().min(1).max(120).optional(),
  /** romantic actions */
  relationship_id: z.string().uuid().optional(),
  relationship_type: z.enum(ROMANTIC_TYPES).optional(),
  status: z.enum(ROMANTIC_STATUSES).optional(),
  /** The user's own words for why — stored as provenance. */
  note: z.string().max(1000).optional(),
  source_tool: z.string().max(60).optional(),
  _version: z.string().optional(),
};

export type CorrectLoreArgs = {
  action: 'rename_character' | 'set_romantic_classification' | 'exclude_from_dating' | 'confirm_romantic';
  character_id?: string;
  new_name?: string;
  relationship_id?: string;
  relationship_type?: (typeof ROMANTIC_TYPES)[number];
  status?: (typeof ROMANTIC_STATUSES)[number];
  note?: string;
  source_tool?: string;
};

/** Pure argument validation — exported for tests. */
export function validateCorrection(args: CorrectLoreArgs): { ok: true } | { ok: false; error: string } {
  switch (args.action) {
    case 'rename_character':
      if (!args.character_id || !args.new_name?.trim()) {
        return { ok: false, error: 'rename_character requires character_id and new_name' };
      }
      return { ok: true };
    case 'set_romantic_classification':
      if (!args.relationship_id) {
        return { ok: false, error: 'set_romantic_classification requires relationship_id' };
      }
      if (!args.relationship_type && !args.status) {
        return { ok: false, error: 'set_romantic_classification requires relationship_type and/or status' };
      }
      return { ok: true };
    case 'exclude_from_dating':
    case 'confirm_romantic':
      if (!args.relationship_id) {
        return { ok: false, error: `${args.action} requires relationship_id` };
      }
      return { ok: true };
    default:
      return { ok: false, error: 'Unknown action' };
  }
}

function correctionStamp(args: CorrectLoreArgs) {
  return {
    correction_source: 'user',
    corrected_via: `mcp:${(args.source_tool ?? 'unknown_agent').replace(/[^a-z0-9_-]/gi, '_').slice(0, 60)}`,
    correction_note: args.note ?? null,
    corrected_at: new Date().toISOString(),
  };
}

export async function mcpCorrectLore(
  ctx: McpAuthContext,
  args: CorrectLoreArgs,
): Promise<{ success: boolean; action: string; error?: string; detail?: string }> {
  const started = Date.now();
  const userId = ctx.user.id;
  const finish = async (status: 'ok' | 'error' | 'denied', errorCode?: string) => {
    void auditMcpToolCall({
      ctx,
      toolName: 'correct_lore',
      input: { action: args.action, character_id: args.character_id, relationship_id: args.relationship_id },
      status,
      latencyMs: Date.now() - started,
      errorCode,
    });
  };

  const valid = validateCorrection(args);
  if (!valid.ok) {
    await finish('denied', 'invalid_arguments');
    return { success: false, action: args.action, error: valid.error };
  }

  const { supabaseAdmin } = await import('../services/supabaseClient');

  try {
    if (args.action === 'rename_character') {
      const { data: existing } = await supabaseAdmin
        .from('characters')
        .select('id, name, alias')
        .eq('id', args.character_id!)
        .eq('user_id', userId)
        .maybeSingle();
      if (!existing) {
        await finish('denied', 'not_found');
        return { success: false, action: args.action, error: 'Character not found in your book' };
      }
      const oldName = existing.name as string;
      const aliases = [...new Set([...(existing.alias ?? []), oldName])].filter(
        (a: string) => a && a !== args.new_name!.trim(),
      );
      const { error } = await supabaseAdmin
        .from('characters')
        .update({ name: args.new_name!.trim(), alias: aliases })
        .eq('id', args.character_id!)
        .eq('user_id', userId);
      if (error) throw error;
      // Keep group rosters consistent — they snapshot character_name.
      await supabaseAdmin
        .from('organization_members')
        .update({ character_name: args.new_name!.trim() })
        .eq('user_id', userId)
        .eq('character_id', args.character_id!);
      await finish('ok');
      return {
        success: true,
        action: args.action,
        detail: `Renamed "${oldName}" to "${args.new_name!.trim()}" — old name kept as alias; group rosters updated.`,
      };
    }

    // All remaining actions operate on a romantic relationship row.
    const { data: rel } = await supabaseAdmin
      .from('romantic_relationships')
      .select('id, metadata, relationship_type, status')
      .eq('id', args.relationship_id!)
      .eq('user_id', userId)
      .maybeSingle();
    if (!rel) {
      await finish('denied', 'not_found');
      return { success: false, action: args.action, error: 'Relationship not found for your account' };
    }

    const stamp = correctionStamp(args);
    const previous = { relationship_type: rel.relationship_type, status: rel.status };

    const update: Record<string, unknown> = {};
    const metadata: Record<string, unknown> = { ...(rel.metadata ?? {}), ...stamp, previous };

    if (args.action === 'set_romantic_classification') {
      if (args.relationship_type) update.relationship_type = args.relationship_type;
      if (args.status) {
        update.status = args.status;
        update.is_current = !['ended', 'ghosted', 'blocked'].includes(args.status);
      }
      metadata.user_confirmed_romantic = true;
    } else if (args.action === 'exclude_from_dating') {
      metadata.dating_integrity = {
        excluded: true,
        reason: 'user_correction',
        excluded_at: stamp.corrected_at,
      };
      metadata.user_confirmed_romantic = false;
    } else if (args.action === 'confirm_romantic') {
      metadata.user_confirmed_romantic = true;
      const existingIntegrity = (metadata.dating_integrity ?? null) as { excluded?: boolean } | null;
      if (existingIntegrity?.excluded) metadata.dating_integrity = { excluded: false, reason: 'user_confirmed' };
    }

    const { error } = await supabaseAdmin
      .from('romantic_relationships')
      .update({ ...update, metadata })
      .eq('id', args.relationship_id!)
      .eq('user_id', userId);
    if (error) throw error;

    await finish('ok');
    return {
      success: true,
      action: args.action,
      detail:
        args.action === 'set_romantic_classification'
          ? `Reclassified to ${args.relationship_type ?? previous.relationship_type} / ${args.status ?? previous.status} (was ${previous.relationship_type} / ${previous.status}).`
          : args.action === 'exclude_from_dating'
            ? 'Excluded from Dating & Romance (non-destructive; row and evidence preserved).'
            : 'Confirmed as a real romantic connection — visible in Dating & Romance.',
    };
  } catch (err) {
    await finish('error', err instanceof Error ? err.message.slice(0, 120) : 'unknown');
    return { success: false, action: args.action, error: 'Correction failed — try again.' };
  }
}
