import { randomUUID } from 'crypto';

import { logger } from '../logger';

export type GuestLoreSnapshot = {
  characters: Array<{
    id: string;
    name: string;
    role?: string;
    summary?: string;
    alias?: string[];
    tags?: string[];
  }>;
  entries: Array<{
    id: string;
    content: string;
    summary?: string;
    date: string;
    tags?: string[];
  }>;
  locations: Array<{
    id: string;
    name: string;
    summary?: string;
  }>;
};

export type GuestLoreUpdates = {
  characters: Array<{
    id?: string;
    name: string;
    role?: string;
    summary?: string;
    alias?: string[];
    tags?: string[];
  }>;
  entries: Array<{
    id?: string;
    content: string;
    summary?: string;
    tags?: string[];
  }>;
  locations: Array<{
    id?: string;
    name: string;
    summary?: string;
  }>;
  mentionedEntities: Array<{ id: string; name: string; type: 'character' | 'location' }>;
};

const NAME_PATTERN = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/g;

function extractProperNames(message: string, snapshot: GuestLoreSnapshot): string[] {
  const known = new Set(
    [
      ...snapshot.characters.map((c) => c.name),
      ...snapshot.locations.map((l) => l.name),
    ].map((n) => n.toLowerCase()),
  );
  const found = new Set<string>();
  for (const match of message.matchAll(NAME_PATTERN)) {
    const name = match[1]?.trim();
    if (!name || name.length < 2) continue;
    if (['I', 'The', 'This', 'That', 'What', 'When', 'Where', 'How'].includes(name)) continue;
    found.add(name);
  }
  for (const name of known) {
    if (message.toLowerCase().includes(name)) {
      const original =
        snapshot.characters.find((c) => c.name.toLowerCase() === name)?.name ??
        snapshot.locations.find((l) => l.name.toLowerCase() === name)?.name ??
        name;
      found.add(original);
    }
  }
  return [...found];
}

/** Deterministic guest lore extraction — no OpenAI. */
export function extractGuestLoreUpdates(
  message: string,
  _conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
  snapshot: GuestLoreSnapshot,
): GuestLoreUpdates {
  const names = extractProperNames(message, snapshot);
  const nameToId = new Map<string, string>();
  for (const c of snapshot.characters) {
    nameToId.set(c.name.toLowerCase(), c.id);
    for (const a of c.alias ?? []) nameToId.set(a.toLowerCase(), c.id);
  }

  const characters = names
    .filter((name) => !snapshot.locations.some((l) => l.name.toLowerCase() === name.toLowerCase()))
    .map((name) => ({
      name,
      summary: message.slice(0, 160),
    }));

  const entries = message.trim()
    ? [{ content: message.trim(), summary: message.trim().slice(0, 120) }]
    : [];

  const mentionedEntities: GuestLoreUpdates['mentionedEntities'] = characters.map((c) => ({
    id: nameToId.get(c.name.toLowerCase()) ?? randomUUID(),
    name: c.name,
    type: 'character' as const,
  }));

  logger.debug({ characterCount: characters.length, entryCount: entries.length }, 'guest.lore.extract.simulated');

  return { characters, entries, locations: [], mentionedEntities };
}

function buildGuestReply(message: string, snapshot: GuestLoreSnapshot, updates: GuestLoreUpdates): string {
  const knownNames = [
    ...snapshot.characters.map((c) => c.name),
    ...updates.characters.map((c) => c.name),
  ].filter(Boolean);
  const uniqueNames = [...new Set(knownNames)].slice(0, 4);
  const lower = message.toLowerCase();

  let body: string;
  if (/remember|recall|what do you know|what did i/.test(lower)) {
    body =
      uniqueNames.length > 0
        ? `In this guest preview I'm tracking ${uniqueNames.join(', ')} from your temporary session lore.`
        : "I'm keeping a temporary preview of what you share — sign up to make it permanent.";
  } else if (/feel|felt|anxious|excited|overwhelmed|happy|sad|stress/.test(lower)) {
    body =
      "I hear the emotional weight in what you're sharing. This preview simulates how LoreBook holds patterns over time.";
  } else {
    body =
      uniqueNames.length > 0
        ? `Got it — I'm noting ${uniqueNames.join(', ')} in your guest session.`
        : "Thanks for sharing that. This guest preview simulates LoreBook's memory companion without calling any AI API.";
  }

  return `*(Guest preview — simulated response)*\n\n${body}\n\n_Your lore stays in this browser session only._`;
}

async function* simulateTextStream(text: string) {
  const tokens = text.split(/(\s+)/).filter(Boolean);
  for (const token of tokens) {
    yield { choices: [{ delta: { content: token } }] };
    await new Promise((resolve) => setTimeout(resolve, 12));
  }
}

export async function guestChatStream(
  message: string,
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
  snapshot: GuestLoreSnapshot,
) {
  const loreUpdates = extractGuestLoreUpdates(message, conversationHistory, snapshot);
  const reply = buildGuestReply(message, snapshot, loreUpdates);

  logger.debug({ messageLength: message.length }, 'guest.chat.simulated');

  return { stream: simulateTextStream(reply), loreUpdates };
}
