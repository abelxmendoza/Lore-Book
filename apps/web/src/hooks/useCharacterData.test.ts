import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useCharacterData } from './useCharacterData';
import {
  fetchCharacterProfile,
  fetchCharacterRelationships,
  fetchCharacterMemories,
  fetchCharacterCloseness,
  fetchCharacterInfluence,
} from '../api/characters';

vi.mock('../api/characters', () => ({
  fetchCharacterProfile: vi.fn(),
  fetchCharacterRelationships: vi.fn(),
  fetchCharacterMemories: vi.fn(),
  fetchCharacterCloseness: vi.fn(),
  fetchCharacterInfluence: vi.fn(),
}));

describe('useCharacterData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize with null values', () => {
    const { result } = renderHook(() => useCharacterData('char-1'));

    expect(result.current.profile).toBeNull();
    expect(result.current.relationships).toEqual([]);
    expect(result.current.memories).toEqual([]);
    expect(result.current.closeness).toEqual([]);
    expect(result.current.influence).toEqual([]);
  });

  it('should load character data on mount', async () => {
    const mockProfile = {
      id: 'char-1',
      name: 'Test Character',
      bio: 'Test bio',
    };

    const mockRelationships = [
      { id: 'rel-1', character_id: 'char-2', relationship_type: 'friend' },
    ];

    const mockMemories = [
      { id: 'mem-1', content: 'Test memory', timestamp: '2023-01-01' },
    ];

    const mockCloseness = [
      { timestamp: '2023-01-01', score: 0.8 },
    ];

    const mockInfluence = [
      { category: 'emotional', score: 0.9 },
    ];

    vi.mocked(fetchCharacterProfile).mockResolvedValue({ profile: mockProfile });
    vi.mocked(fetchCharacterRelationships).mockResolvedValue({ relationships: mockRelationships });
    vi.mocked(fetchCharacterMemories).mockResolvedValue({ memories: mockMemories });
    vi.mocked(fetchCharacterCloseness).mockResolvedValue({ closeness: mockCloseness });
    vi.mocked(fetchCharacterInfluence).mockResolvedValue({ influence: mockInfluence });

    const { result } = renderHook(() => useCharacterData('char-1'));

    await waitFor(() => {
      expect(result.current.profile).toEqual(mockProfile);
    });

    expect(result.current.relationships).toEqual(mockRelationships);
    expect(result.current.memories).toEqual(mockMemories);
    expect(result.current.closeness).toEqual(mockCloseness);
    expect(result.current.influence).toEqual(mockInfluence);
  });

  it('should not fetch data if characterId is empty', async () => {
    const { result } = renderHook(() => useCharacterData(''));

    await waitFor(() => {
      expect(fetchCharacterProfile).not.toHaveBeenCalled();
    });

    expect(result.current.profile).toBeNull();
  });

  it('should refresh data when refresh is called', async () => {
    const mockProfile1 = { id: 'char-1', name: 'Character 1' };
    const mockProfile2 = { id: 'char-1', name: 'Character 1 Updated' };

    vi.mocked(fetchCharacterProfile)
      .mockResolvedValueOnce({ profile: mockProfile1 })
      .mockResolvedValueOnce({ profile: mockProfile2 });
    vi.mocked(fetchCharacterRelationships).mockResolvedValue({ relationships: [] });
    vi.mocked(fetchCharacterMemories).mockResolvedValue({ memories: [] });
    vi.mocked(fetchCharacterCloseness).mockResolvedValue({ closeness: [] });
    vi.mocked(fetchCharacterInfluence).mockResolvedValue({ influence: [] });

    const { result } = renderHook(() => useCharacterData('char-1'));

    await waitFor(() => {
      expect(result.current.profile).toEqual(mockProfile1);
    });

    await result.current.refresh();

    await waitFor(() => {
      expect(result.current.profile).toEqual(mockProfile2);
    });
  });

  it('should handle errors gracefully', async () => {
    vi.mocked(fetchCharacterProfile).mockRejectedValueOnce(new Error('Network error'));
    vi.mocked(fetchCharacterRelationships).mockResolvedValue({ relationships: [] });
    vi.mocked(fetchCharacterMemories).mockResolvedValue({ memories: [] });
    vi.mocked(fetchCharacterCloseness).mockResolvedValue({ closeness: [] });
    vi.mocked(fetchCharacterInfluence).mockResolvedValue({ influence: [] });

    const { result } = renderHook(() => useCharacterData('char-1'));

    // Hook should still initialize even if one fetch fails
    await waitFor(() => {
      expect(result.current.profile).toBeNull();
    });
  });

  it('should refetch when characterId changes', async () => {
    const mockProfile1 = { id: 'char-1', name: 'Character 1' };
    const mockProfile2 = { id: 'char-2', name: 'Character 2' };

    vi.mocked(fetchCharacterProfile)
      .mockResolvedValueOnce({ profile: mockProfile1 })
      .mockResolvedValueOnce({ profile: mockProfile2 });
    vi.mocked(fetchCharacterRelationships).mockResolvedValue({ relationships: [] });
    vi.mocked(fetchCharacterMemories).mockResolvedValue({ memories: [] });
    vi.mocked(fetchCharacterCloseness).mockResolvedValue({ closeness: [] });
    vi.mocked(fetchCharacterInfluence).mockResolvedValue({ influence: [] });

    const { result, rerender } = renderHook(
      ({ characterId }) => useCharacterData(characterId),
      { initialProps: { characterId: 'char-1' } }
    );

    await waitFor(() => {
      expect(result.current.profile).toEqual(mockProfile1);
    });

    rerender({ characterId: 'char-2' });

    await waitFor(() => {
      expect(result.current.profile).toEqual(mockProfile2);
    });
  });
});
