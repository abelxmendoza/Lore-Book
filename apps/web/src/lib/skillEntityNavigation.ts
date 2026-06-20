import type { Organization } from '../components/organizations/OrganizationProfileCard';
import type { ProjectCardData } from '../components/projects/ProjectProfileCard';
import { enrichOrganizationForDemo } from '../mocks/modalDemoData';
import { openCharacterBookModal } from './openCharacterBookModal';

const now = () => new Date().toISOString();

export function organizationStub(id: string, name: string, groupType: Organization['group_type'] = 'other'): Organization {
  return enrichOrganizationForDemo({
    id,
    name,
    aliases: [],
    type: 'other',
    group_type: groupType,
    membership_model: 'fuzzy',
    user_relationship: 'member',
    is_public_entity: false,
    status: 'active',
    member_count: 0,
    usage_count: 1,
    confidence: 0.8,
    last_seen: now(),
    created_at: now(),
    updated_at: now(),
  });
}

export function projectStub(id: string, name: string): ProjectCardData {
  return {
    id,
    name,
    type: 'project',
    status: 'active',
    description: `${name} — linked from your skill story.`,
    tags: [],
    updated_at: now(),
  };
}

export function slugId(label: string, prefix: string): string {
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${prefix}-${slug || 'item'}`;
}

export function openLocationBookModal(locationId: string) {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem('highlightItem', locationId);
  window.dispatchEvent(
    new CustomEvent('navigate-surface', { detail: { surface: 'locations' as const } }),
  );
}

export function openOrganizationBookModal(organizationId: string) {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem('highlightItem', organizationId);
  window.dispatchEvent(
    new CustomEvent('navigate-surface', { detail: { surface: 'organizations' as const } }),
  );
}

export function openProjectBookModal(projectId: string) {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem('highlightItem', projectId);
  window.dispatchEvent(
    new CustomEvent('navigate-surface', { detail: { surface: 'projects' as const } }),
  );
}

export function openSkillBookModal(skillId: string) {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem('highlightItem', skillId);
  window.dispatchEvent(
    new CustomEvent('navigate-surface', { detail: { surface: 'skills' as const } }),
  );
}

export { openCharacterBookModal };
