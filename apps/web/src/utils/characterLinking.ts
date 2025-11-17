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
  return candidates.map((candidate) => {
    const match = knownCharacters.find((char) => char.name.toLowerCase() === candidate.toLowerCase());
    const confidence = match ? 0.95 : 0.55;
    return {
      id: match?.id,
      name: match?.name ?? candidate,
      portraitUrl: match?.portraitUrl,
      confidence
    } satisfies CharacterMatch;
  });
};
