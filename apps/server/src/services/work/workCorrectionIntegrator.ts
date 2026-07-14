/**
 * Work correction integration — "you forgot these teammates" updates the
 * roster and the answer, never the response size.
 */

import { supabaseAdmin } from '../supabaseClient';
import { logger } from '../../logger';
import type { WorkContext, WorkPerson } from './workContextTypes';

/** Pure: add correction names to a WorkContext as coworkers (until role evidence exists). */
export function applyRosterCorrection(context: WorkContext, names: string[]): WorkContext {
  if (names.length === 0) return context;

  const existing = new Set(
    [...context.managers, ...context.leads, ...context.coworkers].map((p) =>
      p.displayName.toLowerCase(),
    ),
  );

  const added: WorkPerson[] = [];
  for (const raw of names) {
    const name = raw.trim();
    if (!name || existing.has(name.toLowerCase())) continue;
    existing.add(name.toLowerCase());
    added.push({
      displayName: name,
      relationship: 'coworker',
      confidence: 0.9, // user-stated
      evidenceIds: [],
    });
  }

  if (added.length === 0) return context;
  return {
    ...context,
    coworkers: [...context.coworkers, ...added],
    correctionsApplied: [
      ...context.correctionsApplied,
      `user added: ${added.map((p) => p.displayName).join(', ')}`,
    ],
  };
}

/**
 * Persist a roster correction: upsert the named people into the team org's
 * membership with a user-correction marker, so the next answer starts right.
 */
export async function persistRosterCorrection(
  userId: string,
  teamOrgId: string | undefined,
  names: string[],
): Promise<{ persisted: number }> {
  if (!teamOrgId || names.length === 0) return { persisted: 0 };

  let persisted = 0;
  try {
    const { data: existing } = await supabaseAdmin
      .from('organization_members')
      .select('character_name')
      .eq('user_id', userId)
      .eq('organization_id', teamOrgId);
    const have = new Set((existing ?? []).map((m) => String(m.character_name).toLowerCase()));

    for (const name of names) {
      if (have.has(name.toLowerCase())) continue;
      const { error } = await supabaseAdmin.from('organization_members').insert({
        user_id: userId,
        organization_id: teamOrgId,
        character_name: name,
        role: 'member',
        notes: '[user_correction] added via roster correction in chat',
      });
      if (!error) persisted += 1;
    }
  } catch (err) {
    logger.warn({ err, userId, teamOrgId }, 'persistRosterCorrection failed');
  }
  return { persisted };
}
