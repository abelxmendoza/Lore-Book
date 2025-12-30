import type { CharacterProfile } from '../api/characters';

export type CharacterMatch = {
  id?: string;
  name: string;
  portraitUrl?: string;
  confidence: number;
};

const namePattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g;

export const extractNameCandidates = (text: string): string[] => {
  const names = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = namePattern.exec(text)) !== null) {
    const candidate = match[1];
    if (candidate.length > 2) {
      names.add(candidate.trim());
    }
  }
  return Array.from(names);
};

export const findCharacterMentions = (
  text: string,
  knownCharacters: CharacterProfile[]
): CharacterMatch[] => {
  const candidates = extractNameCandidates(text);
  const textLower = text.toLowerCase();
  
  return candidates.map((candidate) => {
    // Check for exact name match
    let match = knownCharacters.find((char) => char.name.toLowerCase() === candidate.toLowerCase());
    
    // If no exact match, check aliases/nicknames
    if (!match) {
      match = knownCharacters.find((char) => {
        if (char.alias && Array.isArray(char.alias)) {
          return char.alias.some(alias => alias.toLowerCase() === candidate.toLowerCase());
        }
        return false;
      });
    }
    
    // Also check if the text mentions any character by alias (even if candidate doesn't match)
    const aliasMentioned = knownCharacters.find((char) => {
      if (char.alias && Array.isArray(char.alias)) {
        return char.alias.some(alias => textLower.includes(alias.toLowerCase()));
      }
      return false;
    });
    
    const finalMatch = match || aliasMentioned;
    const confidence = finalMatch ? 0.95 : 0.55;
    
    return {
      id: finalMatch?.id,
      name: finalMatch?.name ?? candidate,
      portraitUrl: finalMatch?.portraitUrl,
      confidence
    } satisfies CharacterMatch;
  });
};
