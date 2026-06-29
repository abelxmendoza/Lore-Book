import { characterSuggestionsApi, locationSuggestionsApi } from '../api/entitySuggestions';
import { projectsApi } from '../api/projects';
import { skillsApi } from '../api/skills';
import type { Character } from '../components/characters/CharacterProfileCard';
import { shouldUseMockData } from '../hooks/useShouldUseMockData';
import { mockDataService } from '../services/mockDataService';
import { invalidateEntityTags } from '../store/invalidateEntityCache';

import { fetchJson } from './api';
import { apiCache } from './cache';
import { triggerCelebration } from './celebrations';
import type { CertifiedEntityMatch } from './certifiedEntityMatch';


const INDEX_CACHE_KEY = '/api/entities/certified-index';

export type ConfirmedComposerEntity = {
  id: string;
  name: string;
  type: CertifiedEntityMatch['type'];
  created?: boolean;
  deduplicated?: boolean;
  restored?: boolean;
};

function demoEntityId(entity: CertifiedEntityMatch): string {
  if (!entity.id.startsWith('draft:')) return entity.id;
  const slug = entity.name.toLowerCase().replace(/\s+/g, '-');
  return `demo-${entity.type}-${slug}`;
}

async function confirmComposerEntityDemo(entity: CertifiedEntityMatch): Promise<ConfirmedComposerEntity> {
  switch (entity.type) {
    case 'character': {
      const id = demoEntityId(entity);
      mockDataService.mutate.characters.upsert({
        id,
        name: entity.name,
        status: 'active',
        proximity_level: 'direct',
        has_met: true,
        relationship_depth: 'acquaintance',
        summary: 'Added from chat via lexical entity detection (demo).',
      } as Character);
      triggerCelebration({
        variant: 'character',
        label: `${entity.name} added to Characters`,
        subtitle: 'Confirmed while chatting (demo)',
      });
      return { id, name: entity.name, type: entity.type, created: true };
    }
    case 'location': {
      const location = mockDataService.mutate.locations.create({
        name: entity.name,
        context: 'Detected via ontology-backed lexical intelligence (demo).',
      });
      triggerCelebration({
        variant: 'location',
        label: `${entity.name} added to Places`,
        subtitle: 'Confirmed while chatting (demo)',
      });
      return { id: location.id, name: entity.name, type: entity.type, created: true };
    }
    case 'skill': {
      const suggestionId = entity.id.startsWith('draft:') ? demoEntityId(entity) : entity.id;
      const skill = mockDataService.mutate.skills.createFromSuggestion({
        // Demo registry mints canonical book ids; this id is still useful for
        // removing pending suggestions when present.
        id: suggestionId,
        skill_name: entity.name,
        skill_category: 'other',
        confidence: 0.75,
      });
      triggerCelebration({
        variant: 'skill',
        label: `${entity.name} added to Skills`,
        subtitle: 'Confirmed while chatting (demo)',
        xp: 35,
      });
      return { id: skill.id, name: skill.skill_name, type: entity.type, created: true };
    }
    case 'organization':
      triggerCelebration({
        variant: 'organization',
        label: `${entity.name} added to Groups`,
        subtitle: 'Open Groups & Organizations to review group suggestions (demo)',
        xp: 40,
      });
      window.dispatchEvent(new Event('group-candidates-updated'));
      return { id: demoEntityId(entity), name: entity.name, type: entity.type, created: true };
    case 'project': {
      const id = demoEntityId(entity);
      triggerCelebration({
        variant: 'project',
        label: `${entity.name} added to Projects`,
        subtitle: 'Confirmed while chatting (demo)',
        xp: 40,
      });
      return { id, name: entity.name, type: entity.type, created: true };
    }
    case 'thing':
      return { id: entity.id, name: entity.name, type: entity.type };
    default:
      throw new Error(`Cannot confirm ${entity.type} from the composer yet.`);
  }
}

/** Promote a composer suggestion/draft chip into a confirmed book entity. */
export async function confirmComposerEntity(entity: CertifiedEntityMatch): Promise<ConfirmedComposerEntity | null> {
  if (entity.lifecycleStatus === 'archived' && entity.type === 'character') {
    if (shouldUseMockData()) {
      mockDataService.mutate.characters.upsert({
        id: entity.id,
        name: entity.name,
        status: 'active',
      } as Character);
      apiCache.delete(INDEX_CACHE_KEY);
      triggerCelebration({
        variant: 'character',
        label: `${entity.name} restored to Characters`,
        subtitle: 'Mentioned again in chat',
      });
      window.dispatchEvent(new CustomEvent('lk:story-data-updated'));
      return { id: entity.id, name: entity.name, type: entity.type, restored: true };
    }
    await fetchJson(`/api/characters/${entity.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'active' }),
    });
    invalidateEntityTags(['Character']);
    apiCache.delete(INDEX_CACHE_KEY);
    triggerCelebration({
      variant: 'character',
      label: `${entity.name} restored to Characters`,
      subtitle: 'Mentioned again in chat',
    });
    window.dispatchEvent(new CustomEvent('lk:story-data-updated'));
    return { id: entity.id, name: entity.name, type: entity.type, restored: true };
  }

  if (entity.status === 'confirmed') {
    return { id: entity.id, name: entity.name, type: entity.type };
  }

  if (shouldUseMockData()) {
    const confirmed = await confirmComposerEntityDemo(entity);
    window.dispatchEvent(new CustomEvent('lk:story-data-updated'));
    return confirmed;
  }

  let confirmed: ConfirmedComposerEntity | null = null;

  switch (entity.type) {
    case 'character': {
      let response: { character?: { id?: string; name?: string }; deduplicated?: boolean; restored?: boolean };
      if (entity.status === 'draft') {
        response = await fetchJson('/api/characters', {
          method: 'POST',
          body: JSON.stringify({
            name: entity.name,
            hasMet: true,
            proximity: 'direct',
            relationshipDepth: 'acquaintance',
          }),
        });
      } else {
        response = await characterSuggestionsApi.add({
          id: entity.id,
          name: entity.name,
          mentionCount: 1,
          confidence: 0.75,
          source: 'chat_extract',
          context: 'Confirmed while chatting',
        });
      }
      confirmed = {
        id: String(response.character?.id ?? entity.id),
        name: String(response.character?.name ?? entity.name),
        type: entity.type,
        created: !response.deduplicated,
        deduplicated: response.deduplicated,
        restored: response.restored,
      };
      invalidateEntityTags(['Character']);
      triggerCelebration({
        variant: 'character',
        label: `${entity.name} added to Characters`,
        subtitle: 'Confirmed while chatting',
      });
      break;
    }
    case 'location': {
      const response = await locationSuggestionsApi.accept({
        id: entity.id,
        name: entity.name,
        mentionCount: 1,
        confidence: entity.status === 'draft' ? 0.7 : 0.8,
        source: 'chat_detect',
        context: entity.status === 'draft' ? 'Detected while typing' : undefined,
      });
      confirmed = {
        id: response.location.id,
        name: response.location.name ?? entity.name,
        type: entity.type,
        created: true,
      };
      invalidateEntityTags(['Location']);
      triggerCelebration({
        variant: 'location',
        label: `${entity.name} added to Places`,
        subtitle: 'Confirmed while chatting',
      });
      break;
    }
    case 'skill': {
      let skill: { id: string; skill_name?: string };
      if (entity.status === 'suggestion') {
        skill = await skillsApi.confirmSuggestion(entity.id);
      } else {
        skill = await skillsApi.materializeSuggestion({
          id: entity.id,
          skill_name: entity.name,
          skill_category: 'other',
          confidence: 0.7,
        });
      }
      confirmed = {
        id: skill.id,
        name: skill.skill_name ?? entity.name,
        type: entity.type,
        created: true,
      };
      invalidateEntityTags(['Skill']);
      triggerCelebration({
        variant: 'skill',
        label: `${entity.name} added to Skills`,
        subtitle: 'Confirmed while chatting',
        xp: 35,
      });
      break;
    }
    case 'organization': {
      if (entity.status === 'draft' || entity.id.startsWith('draft:')) {
        // Freshly detected composer span — no group candidate exists yet, so
        // create the organization by name directly.
        const response = await fetchJson<{ organization?: { id?: string; name?: string } }>('/api/organizations', {
          method: 'POST',
          body: JSON.stringify({ name: entity.name }),
        });
        confirmed = {
          id: String(response.organization?.id ?? entity.id),
          name: String(response.organization?.name ?? entity.name),
          type: entity.type,
          created: true,
        };
      } else {
        if (entity.id.startsWith('sug:')) {
          throw new Error('Organization suggestion is missing a candidate id — open Groups to confirm.');
        }
        const response = await fetchJson<{ organization_id?: string }>(`/api/group-candidates/${entity.id}/accept`, {
          method: 'POST',
          body: JSON.stringify({}),
        });
        confirmed = {
          id: String(response.organization_id ?? entity.id),
          name: entity.name,
          type: entity.type,
          created: true,
        };
      }
      invalidateEntityTags(['Organization']);
      triggerCelebration({
        variant: 'organization',
        label: `${entity.name} added to Groups`,
        subtitle: 'Confirmed while chatting',
        xp: 40,
      });
      window.dispatchEvent(new Event('group-candidates-updated'));
      break;
    }
    case 'project': {
      const project = await projectsApi.materializeSuggestion({
        id: entity.id.startsWith('draft:') || entity.id.startsWith('suggest:') ? '' : entity.id,
        name: entity.name,
        confidence: entity.significanceScore ?? 0.7,
        reasoning: 'Confirmed from composer chip',
      });
      confirmed = {
        id: project.id,
        name: project.name ?? entity.name,
        type: entity.type,
        created: true,
      };
      invalidateEntityTags(['Project']);
      triggerCelebration({
        variant: 'project',
        label: `${entity.name} added to Projects`,
        subtitle: 'Confirmed while chatting',
        xp: 40,
      });
      break;
    }
    case 'thing':
      confirmed = { id: entity.id, name: entity.name, type: entity.type };
      break;
    default:
      throw new Error(`Cannot confirm ${entity.type} from the composer yet.`);
  }

  apiCache.delete(INDEX_CACHE_KEY);
  window.dispatchEvent(new CustomEvent('lk:story-data-updated'));
  return confirmed;
}
