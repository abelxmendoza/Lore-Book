import { describe, expect, it } from 'vitest';

import { parseBareKinshipResidence, resolveKinshipOwner } from './kinshipOwnerResolver';

const chars = (rows: Array<Partial<{ name: string; alias: string[]; role: string; archetype: string }>>) =>
  async () => rows.map((r) => ({ name: r.name ?? null, alias: r.alias ?? null, role: r.role ?? null, archetype: r.archetype ?? null }));

describe('parseBareKinshipResidence', () => {
  it('detects bare kinship possessive place names', () => {
    expect(parseBareKinshipResidence("Tia's House")).toEqual({ title: 'Tia', placeLabel: 'House' });
    expect(parseBareKinshipResidence('Tía’s Place')).toEqual({ title: 'Tía', placeLabel: 'Place' });
    expect(parseBareKinshipResidence("Mom's House")).toEqual({ title: 'Mom', placeLabel: 'House' });
  });

  it('does not fire once a name is attached or for non-kinship owners', () => {
    expect(parseBareKinshipResidence("Tía Grace's House")).toBeNull();
    expect(parseBareKinshipResidence("Shyla's House")).toBeNull();
    expect(parseBareKinshipResidence('Catch One')).toBeNull();
  });
});

describe('resolveKinshipOwner', () => {
  it('resolves to the single named relative with that title', async () => {
    const r = await resolveKinshipOwner('u1', 'tia', chars([{ name: 'Tía Grace', role: 'Aunt' }]));
    expect(r).toEqual({ status: 'resolved', ownerName: 'Tía Grace' });
  });

  it('reports ambiguity when several relatives share the title', async () => {
    const r = await resolveKinshipOwner('u1', 'tia', chars([
      { name: 'Tía Grace', role: 'Aunt' },
      { name: 'Tia Lourdes', alias: ['Lourdes'], archetype: 'family' },
    ]));
    expect(r.status).toBe('ambiguous');
    if (r.status === 'ambiguous') {
      expect(r.candidates).toEqual(expect.arrayContaining(['Tía Grace', 'Tia Lourdes']));
    }
  });

  it('matches synonym titles across the group (tia ↔ aunt)', async () => {
    const r = await resolveKinshipOwner('u1', 'aunt', chars([{ name: 'Tía Grace' }]));
    expect(r).toEqual({ status: 'resolved', ownerName: 'Tía Grace' });
  });

  it('composes title + name for a role-based match without a titled name', async () => {
    const r = await resolveKinshipOwner('u1', 'tia', chars([{ name: 'Grace', role: 'Aunt' }]));
    expect(r).toEqual({ status: 'resolved', ownerName: 'Tía Grace' });
  });

  it('never matches trailing/stage-name kinship words ("Goth Tio")', async () => {
    const r = await resolveKinshipOwner('u1', 'tio', chars([{ name: 'Goth Tio' }]));
    expect(r).toEqual({ status: 'unknown' });
  });

  it('returns unknown when no relative carries the title', async () => {
    const r = await resolveKinshipOwner('u1', 'abuela', chars([{ name: 'Shyla' }]));
    expect(r).toEqual({ status: 'unknown' });
  });

  it('does not resolve to a card that is itself a bare title ("Abuela")', async () => {
    const r = await resolveKinshipOwner('u1', 'abuela', chars([{ name: 'Abuela', role: 'Grandmother' }]));
    expect(r).toEqual({ status: 'unknown' });
  });
});
