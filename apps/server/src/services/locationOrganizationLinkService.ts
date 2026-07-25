import { ORG_LOCATION_COLS } from '../db/organizationColumns';
import { logger } from '../logger';

import { organizationService, type OrganizationLocation } from './organizationService';
import { supabaseAdmin } from './supabaseClient';

export type LinkedLocationOrganization = OrganizationLocation & {
  organization: {
    id: string;
    name: string;
    type?: string | null;
    group_type?: string | null;
    status?: string | null;
    user_relationship?: string | null;
    description?: string | null;
  };
};

type OrganizationSummary = LinkedLocationOrganization['organization'];

class LocationOrganizationLinkService {
  async list(userId: string, locationId: string): Promise<LinkedLocationOrganization[]> {
    const { data: linkRows, error: linkError } = await supabaseAdmin
      .from('organization_locations')
      .select(ORG_LOCATION_COLS)
      .eq('user_id', userId)
      .eq('location_id', locationId);

    if (linkError) {
      logger.error({ error: linkError, userId, locationId }, 'Failed to list location organization links');
      throw linkError;
    }

    const links = (linkRows ?? []) as OrganizationLocation[];
    if (links.length === 0) return [];

    const organizationIds = [...new Set(links.map((link) => link.organization_id))];
    const { data: organizationRows, error: organizationError } = await supabaseAdmin
      .from('organizations')
      .select('id, name, type, group_type, status, user_relationship, description')
      .eq('user_id', userId)
      .in('id', organizationIds);

    if (organizationError) {
      logger.error(
        { error: organizationError, userId, locationId },
        'Failed to load organizations for location links',
      );
      throw organizationError;
    }

    const organizations = new Map(
      ((organizationRows ?? []) as OrganizationSummary[]).map((organization) => [
        organization.id,
        organization,
      ]),
    );

    return links.flatMap((link) => {
      const organization = organizations.get(link.organization_id);
      return organization ? [{ ...link, organization }] : [];
    });
  }

  async link(
    userId: string,
    locationId: string,
    organizationId: string,
  ): Promise<LinkedLocationOrganization> {
    const [{ data: location, error: locationError }, { data: organization, error: organizationError }] =
      await Promise.all([
        supabaseAdmin
          .from('locations')
          .select('id, name')
          .eq('user_id', userId)
          .eq('id', locationId)
          .maybeSingle(),
        supabaseAdmin
          .from('organizations')
          .select('id, name, type, group_type, status, user_relationship, description')
          .eq('user_id', userId)
          .eq('id', organizationId)
          .maybeSingle(),
      ]);

    if (locationError) throw locationError;
    if (organizationError) throw organizationError;
    if (!location) throw new Error('Location not found');
    if (!organization) throw new Error('Organization not found');

    const { data: existingRows, error: existingError } = await supabaseAdmin
      .from('organization_locations')
      .select(ORG_LOCATION_COLS)
      .eq('user_id', userId)
      .eq('location_id', locationId)
      .eq('organization_id', organizationId)
      .limit(1);

    if (existingError) throw existingError;
    const existing = (existingRows?.[0] ?? null) as OrganizationLocation | null;
    if (existing) {
      return { ...existing, organization: organization as OrganizationSummary };
    }

    const { data: link, error: insertError } = await supabaseAdmin
      .from('organization_locations')
      .insert({
        user_id: userId,
        organization_id: organizationId,
        location_id: locationId,
        location_name: location.name,
        visit_count: 1,
      })
      .select(ORG_LOCATION_COLS)
      .single();

    if (insertError) {
      logger.error(
        { error: insertError, userId, locationId, organizationId },
        'Failed to link organization to location',
      );
      throw insertError;
    }

    organizationService.invalidateOrganizations(userId);
    return {
      ...(link as OrganizationLocation),
      organization: organization as OrganizationSummary,
    };
  }

  async unlink(userId: string, locationId: string, linkId: string): Promise<boolean> {
    const { data, error } = await supabaseAdmin
      .from('organization_locations')
      .delete()
      .eq('id', linkId)
      .eq('location_id', locationId)
      .eq('user_id', userId)
      .select('id');

    if (error) {
      logger.error({ error, userId, locationId, linkId }, 'Failed to unlink organization from location');
      throw error;
    }

    const removed = (data ?? []).length > 0;
    if (removed) organizationService.invalidateOrganizations(userId);
    return removed;
  }
}

export const locationOrganizationLinkService = new LocationOrganizationLinkService();
