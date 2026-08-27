import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchJson } from '../lib/api';
import { characterSuggestionsApi } from './entitySuggestions';

vi.mock('../lib/api', () => ({
  fetchJson: vi.fn(),
}));

const mockedFetchJson = vi.mocked(fetchJson);

describe('characterSuggestionsApi.add — robot companions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends inferred robot species from companion context', async () => {
    mockedFetchJson.mockResolvedValue({ character: { id: 'c1', name: 'Omega1' } });

    await characterSuggestionsApi.add({
      id: 'sug:character:omega1',
      name: 'Omega1',
      mentionCount: 2,
      confidence: 0.8,
      source: 'chat_extract',
      context: 'my robot Omega1 needs a charge',
      kind: 'pet',
    });

    expect(mockedFetchJson).toHaveBeenCalledTimes(1);
    const init = mockedFetchJson.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(init.body));
    expect(body.species).toBe('robot');
    expect(body.context).toBe('my robot Omega1 needs a charge');
    expect(body.kind).toBe('pet');
  });

  it('retries a robot designation as species robot after a person-name reject', async () => {
    mockedFetchJson
      .mockRejectedValueOnce(new Error('Character name was rejected'))
      .mockResolvedValueOnce({ character: { id: 'c1', name: 'Omega1', species: 'robot' } });

    const result = await characterSuggestionsApi.add({
      id: 'sug:character:omega1',
      name: 'Omega1',
      mentionCount: 1,
      confidence: 0.7,
      source: 'chat_extract',
    });

    expect(mockedFetchJson).toHaveBeenCalledTimes(2);
    const retryBody = JSON.parse(String((mockedFetchJson.mock.calls[1]?.[1] as RequestInit).body));
    expect(retryBody.species).toBe('robot');
    expect(result.character.name).toBe('Omega1');
  });

  it('does not retry ordinary person-name rejects as robots', async () => {
    mockedFetchJson.mockRejectedValueOnce(new Error('Character name was rejected'));

    await expect(
      characterSuggestionsApi.add({
        id: 'sug:character:jamie',
        name: 'Jamie',
        mentionCount: 1,
        confidence: 0.7,
        source: 'chat_extract',
      }),
    ).rejects.toThrow(/rejected/i);

    expect(mockedFetchJson).toHaveBeenCalledTimes(1);
  });
});
