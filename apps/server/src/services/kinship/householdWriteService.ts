/**
 * Household writes — create/delete a household, add/remove a member, move a
 * household to a new location — each recording WHY, and each preserving
 * history rather than overwriting it.
 *
 * A household is an `organizations` row (type 'family'); this service adds
 * two things `organizationService` doesn't have: per-stay residency history
 * (`household_stays` — someone can move out and back in later, as two
 * separate dated stays) and per-period location history (`household_locations`
 * — the same household can be at different addresses over time).
 *
 * Deliberately does NOT reuse `organizationService.removeMember` /
 * `deleteOrganization` — both hard-delete, which would destroy exactly the
 * "why" history this service exists to keep. Removing a member here means
 * flipping the roster row to 'former' and closing the open stay; deleting a
 * household means flagging it (never actually removing the row), so the
 * reason and every past stay/location survive.
 */
import { supabaseAdmin } from '../supabaseClient';
import { organizationService } from '../organizationService';
import { logger } from '../../logger';

export type HouseholdHistoryEntry =
  | {
      kind: 'stay';
      characterId: string | null;
      characterName: string;
      joinedAt: string;
      leftAt: string | null;
      joinReason: string | null;
      leaveReason: string | null;
    }
  | {
      kind: 'location';
      locationName: string;
      movedInAt: string;
      movedOutAt: string | null;
      reason: string | null;
    };

class HouseholdWriteService {
  async createHousehold(
    userId: string,
    name: string,
    opts: { locationName?: string; reason?: string } = {},
  ): Promise<{ id: string; name: string }> {
    const org = await organizationService.createOrganization(userId, {
      name,
      type: 'family',
      location: opts.locationName,
      metadata: {
        inference_source: 'household_residence',
        ...(opts.reason ? { creation_reason: opts.reason } : {}),
      },
    });

    if (opts.locationName) {
      const { error } = await supabaseAdmin.from('household_locations').insert({
        user_id: userId,
        organization_id: org.id,
        location_name: opts.locationName,
        reason: opts.reason ?? null,
        source: 'household_write_service',
      });
      if (error) logger.warn({ error, userId, orgId: org.id }, 'Failed to record opening household location');
    }

    return { id: org.id, name: org.name };
  }

  /** Soft-delete: never removes the organizations row, so history survives. */
  async deleteHousehold(userId: string, householdId: string, reason: string): Promise<boolean> {
    const org = await organizationService.getOrganization(userId, householdId);
    if (!org) return false;

    await organizationService.updateOrganization(userId, householdId, {
      metadata: {
        ...(org.metadata ?? {}),
        household_deleted: { reason, at: new Date().toISOString() },
      },
    });
    return true;
  }

  async addHouseholdMember(
    userId: string,
    householdId: string,
    characterName: string,
    opts: { characterId?: string; role?: string; reason?: string } = {},
  ): Promise<{ characterId: string | null; characterName: string }> {
    const member = await organizationService.addMember(userId, householdId, {
      character_id: opts.characterId,
      character_name: characterName,
      role: opts.role,
      status: 'active',
      notes: opts.reason,
    });

    const { error } = await supabaseAdmin.from('household_stays').insert({
      user_id: userId,
      organization_id: householdId,
      character_id: member.character_id ?? null,
      character_name: member.character_name,
      join_reason: opts.reason ?? null,
      source: 'household_write_service',
    });
    if (error) logger.warn({ error, userId, householdId, characterName }, 'Failed to record household stay start');

    return { characterId: member.character_id ?? null, characterName: member.character_name };
  }

  /** Soft-remove: flips the roster row to 'former' and closes the open stay — never deletes either. */
  async removeHouseholdMember(
    userId: string,
    householdId: string,
    characterId: string,
    reason?: string,
  ): Promise<boolean> {
    const { data: memberRow } = await supabaseAdmin
      .from('organization_members')
      .select('id')
      .eq('user_id', userId)
      .eq('organization_id', householdId)
      .eq('character_id', characterId)
      .eq('status', 'active')
      .maybeSingle();
    if (!memberRow) return false;

    const now = new Date().toISOString();
    const { error: memberError } = await supabaseAdmin
      .from('organization_members')
      .update({ status: 'former', left_at: now, notes: reason ?? null })
      .eq('id', memberRow.id)
      .eq('user_id', userId);
    if (memberError) throw memberError;

    const { error: stayError } = await supabaseAdmin
      .from('household_stays')
      .update({ left_at: now, leave_reason: reason ?? null, updated_at: now })
      .eq('user_id', userId)
      .eq('organization_id', householdId)
      .eq('character_id', characterId)
      .is('left_at', null);
    if (stayError) logger.warn({ error: stayError, userId, householdId, characterId }, 'Failed to close household stay');

    return true;
  }

  /** Closes the current location period and opens a new one — same household, new address. */
  async moveHousehold(
    userId: string,
    householdId: string,
    newLocationName: string,
    reason?: string,
  ): Promise<boolean> {
    const org = await organizationService.getOrganization(userId, householdId);
    if (!org) return false;

    const now = new Date().toISOString();
    const { error: closeError } = await supabaseAdmin
      .from('household_locations')
      .update({ moved_out_at: now })
      .eq('user_id', userId)
      .eq('organization_id', householdId)
      .is('moved_out_at', null);
    if (closeError) logger.warn({ error: closeError, userId, householdId }, 'Failed to close prior household location');

    const { error: insertError } = await supabaseAdmin.from('household_locations').insert({
      user_id: userId,
      organization_id: householdId,
      location_name: newLocationName,
      reason: reason ?? null,
      source: 'household_write_service',
    });
    if (insertError) throw insertError;

    await organizationService.updateOrganization(userId, householdId, {
      location: newLocationName,
      metadata: { ...(org.metadata ?? {}), residence_name: newLocationName },
    });

    return true;
  }

  async getHouseholdHistory(userId: string, householdId: string): Promise<HouseholdHistoryEntry[]> {
    const [{ data: stays }, { data: locations }] = await Promise.all([
      supabaseAdmin
        .from('household_stays')
        .select('character_id, character_name, joined_at, left_at, join_reason, leave_reason')
        .eq('user_id', userId)
        .eq('organization_id', householdId)
        .order('joined_at', { ascending: false }),
      supabaseAdmin
        .from('household_locations')
        .select('location_name, moved_in_at, moved_out_at, reason')
        .eq('user_id', userId)
        .eq('organization_id', householdId)
        .order('moved_in_at', { ascending: false }),
    ]);

    const stayEntries: HouseholdHistoryEntry[] = (stays ?? []).map((s) => ({
      kind: 'stay' as const,
      characterId: (s.character_id as string | null) ?? null,
      characterName: s.character_name as string,
      joinedAt: s.joined_at as string,
      leftAt: (s.left_at as string | null) ?? null,
      joinReason: (s.join_reason as string | null) ?? null,
      leaveReason: (s.leave_reason as string | null) ?? null,
    }));
    const locationEntries: HouseholdHistoryEntry[] = (locations ?? []).map((l) => ({
      kind: 'location' as const,
      locationName: l.location_name as string,
      movedInAt: l.moved_in_at as string,
      movedOutAt: (l.moved_out_at as string | null) ?? null,
      reason: (l.reason as string | null) ?? null,
    }));

    return [...stayEntries, ...locationEntries].sort((a, b) => {
      const aDate = a.kind === 'stay' ? a.joinedAt : a.movedInAt;
      const bDate = b.kind === 'stay' ? b.joinedAt : b.movedInAt;
      return new Date(bDate).getTime() - new Date(aDate).getTime();
    });
  }
}

export const householdWriteService = new HouseholdWriteService();
