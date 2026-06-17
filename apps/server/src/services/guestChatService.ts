import { randomUUID } from 'crypto';

import { config } from '../config';
import { openai } from '../lib/openai';
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

function formatLoreContext(snapshot: GuestLoreSnapshot): string {
  const parts: string[] = [];
  if (snapshot.characters.length > 0) {
    parts.push(
      'CHARACTERS:\n' +
        snapshot.characters
          .map((c) => {
            const aliases = c.alias?.length ? ` (aka ${c.alias.join(', ')})` : '';
            const role = c.role ? ` — ${c.role}` : '';
            const summary = c.summary ? `: ${c.summary}` : '';
            return `- ${c.name}${aliases}${role}${summary}`;
          })
          .join('\n')
    );
  }
  if (snapshot.entries.length > 0) {
    parts.push(
      'MEMORIES:\n' +
        snapshot.entries
          .slice(-12)
          .map((e) => `- [${e.date}] ${e.summary ?? e.content.slice(0, 160)}`)
          .join('\n')
    );
  }
  if (snapshot.locations.length > 0) {
    parts.push(
      'LOCATIONS:\n' +
        snapshot.locations.map((l) => `- ${l.name}${l.summary ? `: ${l.summary}` : ''}`).join('\n')
    );
  }
  return parts.length > 0 ? parts.join('\n\n') : '(No lore saved yet — this is a fresh guest session.)';
}

export async function extractGuestLoreUpdates(
  message: string,
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
  snapshot: GuestLoreSnapshot
): Promise<GuestLoreUpdates> {
  const existingNames = snapshot.characters.map((c) => c.name).join(', ') || 'none';
  const completion = await openai.chat.completions.create({
    model: config.extractionModel,
    temperature: 0.2,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `You extract structured lore from a guest user's chat message for a temporary preview session.
Existing characters: ${existingNames}

Return JSON:
{
  "characters": [{ "name": "string", "role": "string?", "summary": "string?", "alias": ["string"]?, "tags": ["string"]? }],
  "entries": [{ "content": "string", "summary": "string?", "tags": ["string"]? }],
  "locations": [{ "name": "string", "summary": "string?" }]
}

Rules:
- Extract every person mentioned with name, role, relationship, and descriptive details.
- If updating an existing character, use their exact name and add NEW details to summary (don't repeat old facts).
- Create one journal entry capturing the factual content of the user's message (first person preserved).
- Extract locations/venues separately — not as characters.
- Stage names and handles (e.g. "Hell Fairy", "Oscuri.dad") go in alias, real name in name when both given.
- Do not invent facts not stated or clearly implied.
- If nothing to extract, return empty arrays.`,
      },
      {
        role: 'user',
        content: `Message: ${message}\n\nRecent conversation:\n${conversationHistory
          .slice(-6)
          .map((m) => `${m.role}: ${m.content}`)
          .join('\n')}`,
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? '{}';
  let parsed: {
    characters?: GuestLoreUpdates['characters'];
    entries?: GuestLoreUpdates['entries'];
    locations?: GuestLoreUpdates['locations'];
  };
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = {};
  }

  const characters = (parsed.characters ?? []).filter((c) => c?.name?.trim());
  const entries = (parsed.entries ?? []).filter((e) => e?.content?.trim());
  const locations = (parsed.locations ?? []).filter((l) => l?.name?.trim());

  const nameToId = new Map<string, string>();
  for (const c of snapshot.characters) {
    nameToId.set(c.name.toLowerCase(), c.id);
    for (const a of c.alias ?? []) nameToId.set(a.toLowerCase(), c.id);
  }
  for (const c of characters) {
    if (!nameToId.has(c.name.toLowerCase())) {
      nameToId.set(c.name.toLowerCase(), randomUUID());
    }
  }

  const mentionedEntities: GuestLoreUpdates['mentionedEntities'] = [
    ...characters.map((c) => ({
      id: nameToId.get(c.name.toLowerCase()) ?? randomUUID(),
      name: c.name,
      type: 'character' as const,
    })),
    ...locations.map((l) => ({
      id: randomUUID(),
      name: l.name,
      type: 'location' as const,
    })),
  ];

  return { characters, entries, locations, mentionedEntities };
}

export async function guestChatStream(
  message: string,
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
  snapshot: GuestLoreSnapshot
) {
  const loreContext = formatLoreContext(snapshot);

  const [extraction, stream] = await Promise.all([
    extractGuestLoreUpdates(message, conversationHistory, snapshot),
    openai.chat.completions.create({
      model: config.chatModel,
      temperature: 0.7,
      stream: true,
      messages: [
        {
          role: 'system',
          content: `You are LoreBook — an intelligent memory companion in GUEST PREVIEW mode.
The user is trying the product without an account. Their lore is stored temporarily in this session only.

CURRENT LORE (reference accurately — do not contradict or forget these facts):
${loreContext}

Guidelines:
- Respond warmly and specifically using their lore when relevant.
- When they share new people, places, or events, acknowledge what you're learning about their story.
- If they ask what you remember, cite specific characters and memories from CURRENT LORE above.
- Keep responses concise but impressive — show you are tracking their world.
- Do not mention sign-up unless natural; focus on being a great memory companion.
- Never claim data is permanently saved — it's a preview session.`,
        },
        ...conversationHistory.slice(-8).map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        { role: 'user', content: message },
      ],
    }),
  ]);

  return { stream, loreUpdates: extraction };
}
