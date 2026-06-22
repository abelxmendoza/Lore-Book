import type { EntityData } from '../components/entity/EntityDetailModal';
import type { Character } from '../components/characters/CharacterProfileCard';
import type { LocationProfile } from '../components/locations/LocationProfileCard';
import type { AppDispatch } from '../store';
import { openEntity, updateSelectedEntity } from '../store/slices/selectionSlice';
import {
  fetchCharacterById,
  fetchLocationById,
  isEphemeralEntityId,
  locationStub,
} from './hydrateBookEntity';

export type GlobalEntityModalType = 'character' | 'location' | 'memory';

export type OpenEntityModalInput = {
  type: GlobalEntityModalType;
  id: string;
  name?: string;
  seed?: Record<string, unknown>;
};

function buildInitialEntity(input: OpenEntityModalInput): EntityData {
  const { type, id, name, seed } = input;

  if (type === 'character') {
    const character = (seed?.character as Character | undefined) ?? (seed as Character | undefined) ?? {
      id,
      name: name ?? 'Character',
    };
    return {
      type: 'character',
      id,
      name: name ?? character.name,
      character,
      description: (seed?.description as string | undefined) ?? character.summary,
      tags: (seed?.tags as string[] | undefined) ?? character.tags,
    };
  }

  if (type === 'location') {
    const location =
      (seed?.location as LocationProfile | undefined) ??
      (seed as LocationProfile | undefined) ??
      locationStub(id, name);
    return {
      type: 'location',
      id,
      name: name ?? location.name,
      location,
      description: (seed?.description as string | undefined) ?? location.description,
      tags: (seed?.tags as string[] | undefined) ?? location.tags,
    };
  }

  const memory = seed ?? {};
  const content = (memory.content as string | undefined) ?? name ?? '';
  return {
    type: 'memory',
    id,
    memory,
    content,
    date: (memory.start_time as string | undefined) ?? (memory.date as string | undefined),
    title: (memory.title as string | undefined) ?? (content.substring(0, 50) || 'Memory'),
  };
}

async function hydrateEntityModal(dispatch: AppDispatch, input: OpenEntityModalInput): Promise<void> {
  try {
    if (input.type === 'character') {
      const fullCharacter = await fetchCharacterById<Character>(input.id);
      dispatch(
        updateSelectedEntity({
          type: 'character',
          id: input.id,
          name: fullCharacter.name ?? input.name,
          character: fullCharacter,
          description: fullCharacter.summary,
          tags: fullCharacter.tags,
        })
      );
      return;
    }

    if (input.type === 'location') {
      const fullLocation = await fetchLocationById(input.id);
      dispatch(
        updateSelectedEntity({
          type: 'location',
          id: input.id,
          name: fullLocation.name ?? input.name,
          location: fullLocation,
          description: fullLocation.description,
          tags: fullLocation.tags,
        })
      );
    }
  } catch (error) {
    console.error(`Error loading ${input.type}:`, error);
  }
}

/** Open the global entity modal immediately, then hydrate from the API when possible. */
export function openEntityModal(dispatch: AppDispatch, input: OpenEntityModalInput): void {
  dispatch(openEntity(buildInitialEntity(input)));
  if (isEphemeralEntityId(input.id)) return;
  if (input.type === 'memory') return;
  void hydrateEntityModal(dispatch, input);
}
