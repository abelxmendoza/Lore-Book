import { useEffect, useCallback } from 'react';
import { fetchJson } from '../lib/api';

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: Date;
};

type CharacterExtractionOptions = {
  enabled?: boolean;
  onCharacterCreated?: (character: any) => void;
};

/**
 * Hook to extract and create characters from chat messages
 */
export const useCharacterExtraction = (
  messages: ChatMessage[],
  options: CharacterExtractionOptions = {}
) => {
  const { enabled = true, onCharacterCreated } = options;

  const extractAndCreateCharacters = useCallback(async (message: string) => {
    if (!enabled || !message.trim()) return;

    try {
      // Call backend to extract character information from the message
      const response = await fetchJson<{ characters: any[] }>('/api/characters/extract-from-chat', {
        method: 'POST',
        body: JSON.stringify({ message }),
      });

      if (response?.characters && response.characters.length > 0) {
        // Create characters that don't exist yet
        for (const charData of response.characters) {
          try {
            const created = await fetchJson<{ character: any }>('/api/characters', {
              method: 'POST',
              body: JSON.stringify(charData),
            });

            if (created?.character && onCharacterCreated) {
              onCharacterCreated(created.character);
            }
          } catch (error) {
            // Character might already exist, or validation failed
            console.debug('Character creation skipped:', error);
          }
        }
      }
    } catch (error) {
      console.debug('Character extraction failed:', error);
    }
  }, [enabled, onCharacterCreated]);

  // Watch for new user messages
  useEffect(() => {
    if (!enabled || messages.length === 0) return;

    const lastMessage = messages[messages.length - 1];
    if (lastMessage.role === 'user' && lastMessage.content) {
      // Debounce extraction to avoid too many API calls
      const timeoutId = setTimeout(() => {
        extractAndCreateCharacters(lastMessage.content);
      }, 2000);

      return () => clearTimeout(timeoutId);
    }
  }, [messages, enabled, extractAndCreateCharacters]);

  return { extractAndCreateCharacters };
};

