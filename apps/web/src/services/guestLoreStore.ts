/**
 * Ephemeral guest lore — localStorage only, keyed by guest session id.
 * Powers temporary CRUD during guest preview (characters, entries, locations).
 */

import type { Character } from '../components/characters/CharacterProfileCard';
import type { JournalEntry } from '../contexts/LoreKeeperContext';

export type GuestLocation = {
  id: string;
  name: string;
  summary?: string;
  created_at: string;
  updated_at: string;
};

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
  characters?: Array<{
    id?: string;
    name: string;
    role?: string;
    summary?: string;
    alias?: string[];
    tags?: string[];
  }>;
  entries?: Array<{
    id?: string;
    content: string;
    summary?: string;
    tags?: string[];
  }>;
  locations?: Array<{
    id?: string;
    name: string;
    summary?: string;
  }>;
  mentionedEntities?: Array<{ id: string; name: string; type: 'character' | 'location' }>;
};

type GuestLoreData = {
  characters: Character[];
  entries: JournalEntry[];
  locations: GuestLocation[];
  updatedAt: number;
};

const STORAGE_PREFIX = 'lorekeeper_guest_lore_';

function storageKey(guestId: string): string {
  return `${STORAGE_PREFIX}${guestId}`;
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function read(guestId: string): GuestLoreData {
  if (typeof window === 'undefined' || !guestId) {
    return { characters: [], entries: [], locations: [], updatedAt: Date.now() };
  }
  try {
    const raw = window.localStorage.getItem(storageKey(guestId));
    if (!raw) return { characters: [], entries: [], locations: [], updatedAt: Date.now() };
    return JSON.parse(raw) as GuestLoreData;
  } catch {
    return { characters: [], entries: [], locations: [], updatedAt: Date.now() };
  }
}

function write(guestId: string, data: GuestLoreData): void {
  if (typeof window === 'undefined' || !guestId) return;
  window.localStorage.setItem(storageKey(guestId), JSON.stringify({ ...data, updatedAt: Date.now() }));
  window.dispatchEvent(new CustomEvent('lk:guest-lore-updated', { detail: { guestId } }));
}

export function clearGuestLore(guestId: string): void {
  if (typeof window === 'undefined' || !guestId) return;
  window.localStorage.removeItem(storageKey(guestId));
}

export function getActiveGuestId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem('lorekeeper_guest_state');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { isGuest?: boolean; guestId?: string };
    return parsed?.isGuest && parsed.guestId ? parsed.guestId : null;
  } catch {
    return null;
  }
}

export function getGuestCharacters(guestId: string): Character[] {
  return read(guestId).characters;
}

export function getGuestEntries(guestId: string): JournalEntry[] {
  return read(guestId).entries;
}

export function getGuestLocations(guestId: string): GuestLocation[] {
  return read(guestId).locations;
}

export function getGuestLoreSnapshot(guestId: string): GuestLoreSnapshot {
  const data = read(guestId);
  return {
    characters: data.characters.map((c) => ({
      id: c.id,
      name: c.name,
      role: c.role ?? undefined,
      summary: c.summary ?? undefined,
      alias: c.alias,
      tags: c.tags,
    })),
    entries: data.entries.map((e) => ({
      id: e.id,
      content: e.content,
      summary: e.summary ?? undefined,
      date: e.date,
      tags: e.tags,
    })),
    locations: data.locations.map((l) => ({
      id: l.id,
      name: l.name,
      summary: l.summary,
    })),
  };
}

function findCharacterIndex(characters: Character[], name: string, id?: string): number {
  if (id) {
    const byId = characters.findIndex((c) => c.id === id);
    if (byId >= 0) return byId;
  }
  const key = normalizeName(name);
  return characters.findIndex(
    (c) => normalizeName(c.name) === key || (c.alias ?? []).some((a) => normalizeName(a) === key)
  );
}

function findLocationIndex(locations: GuestLocation[], name: string, id?: string): number {
  if (id) {
    const byId = locations.findIndex((l) => l.id === id);
    if (byId >= 0) return byId;
  }
  return locations.findIndex((l) => normalizeName(l.name) === normalizeName(name));
}

export function applyGuestLoreUpdates(guestId: string, updates: GuestLoreUpdates): GuestLoreData {
  const data = read(guestId);
  const now = new Date().toISOString();

  for (const incoming of updates.characters ?? []) {
    const name = incoming.name?.trim();
    if (!name) continue;
    const idx = findCharacterIndex(data.characters, name, incoming.id);
    if (idx >= 0) {
      const existing = data.characters[idx];
      data.characters[idx] = {
        ...existing,
        name,
        role: incoming.role ?? existing.role,
        summary: incoming.summary
          ? existing.summary
            ? `${existing.summary} ${incoming.summary}`.trim()
            : incoming.summary
          : existing.summary,
        alias: [...new Set([...(existing.alias ?? []), ...(incoming.alias ?? [])])],
        tags: [...new Set([...(existing.tags ?? []), ...(incoming.tags ?? [])])],
        updated_at: now,
      };
    } else {
      data.characters.push({
        id: incoming.id ?? newId('guest_char'),
        name,
        first_name: name.split(/\s+/)[0] ?? name,
        role: incoming.role,
        summary: incoming.summary,
        alias: incoming.alias ?? [],
        tags: incoming.tags ?? [],
        status: 'active',
        created_at: now,
        updated_at: now,
        metadata: { guestSession: true },
      });
    }
  }

  for (const incoming of updates.entries ?? []) {
    const content = incoming.content?.trim();
    if (!content) continue;
    data.entries.push({
      id: incoming.id ?? newId('guest_entry'),
      date: now.split('T')[0],
      content,
      summary: incoming.summary ?? content.slice(0, 120),
      tags: incoming.tags ?? [],
      source: 'guest_chat',
      metadata: { guestSession: true },
    });
  }

  for (const incoming of updates.locations ?? []) {
    const name = incoming.name?.trim();
    if (!name) continue;
    const idx = findLocationIndex(data.locations, name, incoming.id);
    if (idx >= 0) {
      const existing = data.locations[idx];
      data.locations[idx] = {
        ...existing,
        summary: incoming.summary
          ? existing.summary
            ? `${existing.summary} ${incoming.summary}`.trim()
            : incoming.summary
          : existing.summary,
        updated_at: now,
      };
    } else {
      data.locations.push({
        id: incoming.id ?? newId('guest_loc'),
        name,
        summary: incoming.summary,
        created_at: now,
        updated_at: now,
      });
    }
  }

  write(guestId, data);
  return data;
}
