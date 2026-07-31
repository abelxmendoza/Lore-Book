// © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.

import { describe, it, expect } from 'vitest';
import { getRelationshipColorKey, getRelationshipStatusClasses } from './relationshipStatusColors';

describe('relationshipStatusColors', () => {
  it('gives every non-active status a distinct color key', () => {
    const statuses = ['on_break', 'paused', 'complicated', 'unrequited', 'fading', 'ghosted', 'ended', 'blocked', 'rekindled'];
    const keys = statuses.map((status) => getRelationshipColorKey({ status }));
    expect(new Set(keys).size).toBe(statuses.length);
  });

  it('differentiates active relationships by relationship_type', () => {
    expect(getRelationshipColorKey({ status: 'active', relationship_type: 'girlfriend' })).toBe('committed');
    expect(getRelationshipColorKey({ status: 'active', relationship_type: 'crush' })).toBe('early_interest');
    expect(getRelationshipColorKey({ status: 'active', relationship_type: 'situationship' })).toBe('situationship');
    expect(getRelationshipColorKey({ status: 'active', relationship_type: 'infatuation' })).toBe('intense');
    expect(getRelationshipColorKey({ status: 'active', relationship_type: 'something_unmapped' })).toBe('active_default');
  });

  it('treats is_situationship as authoritative even if relationship_type does not say so', () => {
    expect(getRelationshipColorKey({ status: 'active', relationship_type: 'crush', is_situationship: true })).toBe('situationship');
  });

  it('falls back to active_default for an unrecognized status', () => {
    expect(getRelationshipColorKey({ status: 'made_up_status' })).toBe('active_default');
  });

  it('every color key resolves to a non-empty className with bg/text/border', () => {
    const relationships = [
      { status: 'active', relationship_type: 'girlfriend' },
      { status: 'active', relationship_type: 'crush' },
      { status: 'active', relationship_type: 'situationship' },
      { status: 'active', relationship_type: 'infatuation' },
      { status: 'active' },
      { status: 'on_break' },
      { status: 'paused' },
      { status: 'complicated' },
      { status: 'unrequited' },
      { status: 'fading' },
      { status: 'ghosted' },
      { status: 'ended' },
      { status: 'blocked' },
      { status: 'rekindled' },
    ];
    for (const rel of relationships) {
      const classes = getRelationshipStatusClasses(rel);
      expect(classes.bg).toMatch(/^bg-/);
      expect(classes.text).toMatch(/^text-/);
      expect(classes.border).toMatch(/^border-/);
      expect(classes.className).toContain(classes.bg);
      expect(classes.className).toContain(classes.text);
      expect(classes.className).toContain(classes.border);
    }
  });

  it('is case-insensitive on status and relationship_type', () => {
    expect(getRelationshipColorKey({ status: 'ACTIVE', relationship_type: 'GIRLFRIEND' })).toBe('committed');
    expect(getRelationshipColorKey({ status: 'Blocked' })).toBe('blocked');
  });
});
