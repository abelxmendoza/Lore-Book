import { characterSuggestionsApi, locationSuggestionsApi } from '../api/entitySuggestions';
import { skillsApi } from '../api/skills';
import { fetchJson } from './api';
import { apiCache } from './cache';
import type { CertifiedEntityMatch } from './certifiedEntityMatch';
import { invalidateEntityTags } from '../store/invalidateEntityCache';
import { triggerCelebration } from './celebrations';
import { shouldUseMockData } from '../hooks/useShouldUseMockData';
import { mockDataService } from '../services/mockDataService';
import type { Character } from '../components/characters/CharacterProfileCard';

const INDEX_CACHE_KEY = '/api/entities/certified-index';

function demoEntityId(entity: CertifiedEntityMatch): string {
  if (!entity.id.startsWith('draft:')) return entity.id;
  const slug = entity.name.toLowerCase().replace(/\s+/g, '-');
  return `demo-${entity.type}-${slug}`;
}

async function confirmComposerEntityDemo(entity: CertifiedEntityMatch): Promise<void> {
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
      break;
    }
    case 'location': {
      mockDataService.mutate.locations.create({
        name: entity.name,
        context: 'Detected via ontology-backed lexical intelligence (demo).',
      });
      triggerCelebration({
        variant: 'location',
        label: `${entity.name} added to Places`,
        subtitle: 'Confirmed while chatting (demo)',
      });
      break;
    }
    case 'skill': {
      mockDataService.mutate.skills.createFromSuggestion({
        id: entity.id.startsWith('draft:') ? demoEntityId(entity) : entity.id,
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
      break;
    }
    case 'organization':
      triggerCelebration({
        variant: 'organization',
        label: `${entity.name} added to Groups`,
        subtitle: 'Open Groups & Organizations to review group suggestions (demo)',
        xp: 40,
      });
      window.dispatchEvent(new Event('group-candidates-updated'));
      break;
    default:
      throw new Error(`Cannot confirm ${entity.type} from the composer yet.`);
  }
}

/** Promote a composer suggestion/draft chip into a confirmed book entity. */
export async function confirmComposerEntity(entity: CertifiedEntityMatch): Promise<void> {
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
      return;
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
    return;
  }

  if (entity.status === 'confirmed') return;

  if (shouldUseMockData()) {
    await confirmComposerEntityDemo(entity);
    window.dispatchEvent(new CustomEvent('lk:story-data-updated'));
    return;
  }

  switch (entity.type) {
    case 'character': {
      if (entity.status === 'draft') {
        await fetchJson('/api/characters', {
          method: 'POST',
          body: JSON.stringify({
            name: entity.name,
            hasMet: true,
            proximity: 'direct',
            relationshipDepth: 'acquaintance',
          }),
        });
      } else {
        await characterSuggestionsApi.add({
          id: entity.id,
          name: entity.name,
          mentionCount: 1,
          confidence: 0.75,
          source: 'chat_extract',
          context: 'Confirmed while chatting',
        });
      }
      invalidateEntityTags(['Character']);
      triggerCelebration({
        variant: 'character',
        label: `${entity.name} added to Characters`,
        subtitle: 'Confirmed while chatting',
      });
      break;
    }
    case 'location': {
      await locationSuggestionsApi.accept({
        id: entity.id,
        name: entity.name,
        mentionCount: 1,
        confidence: entity.status === 'draft' ? 0.7 : 0.8,
        source: 'chat_detect',
        context: entity.status === 'draft' ? 'Detected while typing' : undefined,
      });
      invalidateEntityTags(['Location']);
      triggerCelebration({
        variant: 'location',
        label: `${entity.name} added to Places`,
        subtitle: 'Confirmed while chatting',
      });
      break;
    }
    case 'skill': {
      if (entity.status === 'suggestion') {
        await skillsApi.confirmSuggestion(entity.id);
      } else {
        await skillsApi.materializeSuggestion({
          id: entity.id,
          skill_name: entity.name,
          skill_category: 'other',
          confidence: 0.7,
        });
      }
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
      if (entity.id.startsWith('sug:')) {
        throw new Error('Organization suggestion is missing a candidate id — open Groups to confirm.');
      }
      await fetchJson(`/api/group-candidates/${entity.id}/accept`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
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
    default:
      throw new Error(`Cannot confirm ${entity.type} from the composer yet.`);
  }

  apiCache.delete(INDEX_CACHE_KEY);
  window.dispatchEvent(new CustomEvent('lk:story-data-updated'));
}
