/**
 * Household / residence inference — expanded with membership roles and head-of-household.
 */
import { logger } from '../../logger';
import { extractNamedPlacesFromText, formatPossessivePlace } from '../../utils/namedPlaceExtractor';
import { supabaseAdmin } from '../supabaseClient';
import { organizationService } from '../organizationService';
import { parseKinshipFromName } from './kinshipGlossary';

const RESIDENCE_TYPES = /\b(house|home|apartment|condo|casa|place|garage|bedroom|backyard|room)\b/i;
const LIVES_WITH = /\b(?:live(?:s|d)?\s+with|stay(?:s|ed|ing)?\s+with|living\s+with|staying\s+with|moved\s+in\s+with)\b/i;

type HouseholdRole = 'resident' | 'visitor' | 'head_of_household';

function inferHeadFromPossessive(context: string, placeName: string): string | undefined {
  const m = context.match(/\b([A-Za-zÀ-ÿ]+(?:'s|s)?)\s+(?:house|home|apartment|condo|casa|place|room|garage|backyard)\b/i);
  if (m) return m[1].replace(/['']s?$/i, '');
  const owner = placeName.split(/['']/)[0]?.trim();
  return owner || undefined;
}

export class HouseholdInferenceService {
  async processMessage(
    userId: string,
    text: string,
    messageId: string,
    characterIds: string[]
  ): Promise<{ householdId?: string; locationName?: string }> {
    const places = extractNamedPlacesFromText(text).filter(
      (p) => p.isNamed && (RESIDENCE_TYPES.test(p.name + ' ' + p.context) || LIVES_WITH.test(text))
    );

    const possessive = places.find(
      (p) => /['']s?\s/i.test(p.context) || /house|home|casa|apartment|room/i.test(p.name)
    );
    if (!possessive && !LIVES_WITH.test(text)) return {};

    const locationName = possessive
      ? possessive.name.includes("'")
        ? possessive.name
        : formatPossessivePlace(possessive.anchor || possessive.name.split(/['']/)[0], 'house')
      : 'Shared Household';

    const headName = inferHeadFromPossessive(possessive?.context ?? text, locationName);
    const displayName =
      locationName.endsWith('House') || locationName.endsWith('Home')
        ? `${locationName} Household`
        : `${locationName} — Household`;

    let locationEntityId: string | undefined;
    const { data: loc } = await supabaseAdmin
      .from('omega_entities')
      .select('id')
      .eq('user_id', userId)
      .eq('type', 'LOCATION')
      .ilike('primary_name', locationName)
      .limit(1);
    if (loc?.[0]) locationEntityId = loc[0].id as string;

    const { data: existing } = await supabaseAdmin
      .from('organizations')
      .select('id, metadata')
      .eq('user_id', userId)
      .eq('type', 'family')
      .ilike('name', displayName)
      .limit(1);

    let householdId = existing?.[0]?.id as string | undefined;
    const confidence = headName ? 0.92 : 0.78;

    if (!householdId) {
      try {
        const org = await organizationService.createOrganization(userId, {
          name: displayName,
          type: 'family',
          description: `Household at ${locationName}`,
          metadata: {
            inferred: true,
            inference_source: 'household_residence',
            source_message_id: messageId,
            residence_name: locationName,
            location_entity_id: locationEntityId,
            head_of_household: headName,
            confidence,
          },
        });
        householdId = org.id;
      } catch (err) {
        logger.warn({ err, userId }, 'Household inference create failed');
        return {};
      }
    } else if (headName) {
      await supabaseAdmin
        .from('organizations')
        .update({
          metadata: {
            ...((existing![0].metadata ?? {}) as Record<string, unknown>),
            head_of_household: headName,
            confidence,
            source_message_id: messageId,
          },
        })
        .eq('id', householdId);
    }

    if (householdId && characterIds.length) {
      const selfId = await this.findSelfId(userId);
      const { data: chars } = await supabaseAdmin
        .from('characters')
        .select('id, name')
        .eq('user_id', userId)
        .in('id', characterIds);

      for (const c of chars ?? []) {
        const role = this.classifyHouseholdRole(c.name as string, c.id as string, selfId, headName);
        await supabaseAdmin
          .from('character_organizations')
          .upsert(
            {
              user_id: userId,
              character_id: c.id,
              organization_id: householdId,
              role,
            },
            { onConflict: 'character_id,organization_id' }
          )
          .catch(() => {});
      }
    }

    return { householdId, locationName };
  }

  private classifyHouseholdRole(
    name: string,
    characterId: string,
    selfId: string | null,
    headName?: string
  ): HouseholdRole {
    if (headName && name.toLowerCase().includes(headName.toLowerCase().split(/\s+/)[0])) {
      return 'head_of_household';
    }
    if (selfId && characterId === selfId) return 'visitor';
    if (parseKinshipFromName(name)) return 'resident';
    return 'visitor';
  }

  private async findSelfId(userId: string): Promise<string | null> {
    const { data } = await supabaseAdmin
      .from('characters')
      .select('id, metadata, importance_level')
      .eq('user_id', userId)
      .limit(50);
    const self = (data ?? []).find(
      (c) =>
        (c.metadata as Record<string, unknown>)?.is_self === true ||
        c.importance_level === 'protagonist'
    );
    return (self?.id as string) ?? null;
  }
}

export const householdInferenceService = new HouseholdInferenceService();
