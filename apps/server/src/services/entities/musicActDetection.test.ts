import { describe, it, expect } from 'vitest';
import { looksLikeMusicAct } from './musicActDetection';

describe('looksLikeMusicAct', () => {
  it('detects "<Name> the band"', () => {
    expect(looksLikeMusicAct('Ex Lover', 'Ex Lover the band sounded so good on the way here').isMusicAct).toBe(true);
  });

  it('detects "<Name> ... band shows"', () => {
    const r = looksLikeMusicAct('Ex Lover', 'I saw Daisy at the Ex Lover and Voltra band shows with Mr. Chino');
    expect(r.isMusicAct).toBe(true);
  });

  it('detects another act in the same "band shows" phrase (Voltra)', () => {
    expect(looksLikeMusicAct('Voltra', 'the Ex Lover and Voltra band shows').isMusicAct).toBe(true);
  });

  it('detects "DJ for <Name>"', () => {
    expect(looksLikeMusicAct('Prayers', 'Mr. Chino is a DJ for Prayers aka Cholo Goth').isMusicAct).toBe(true);
  });

  it('does NOT treat "DJ <Name>" as a band (a DJ is a person)', () => {
    expect(looksLikeMusicAct('Moth Queen', 'the DJs Moth Queen and Mr. Chino are playing').isMusicAct).toBe(false);
  });

  it('does not fire for a person in ordinary context', () => {
    expect(looksLikeMusicAct('Sol', 'I was seeing Sol for a couple weeks').isMusicAct).toBe(false);
    expect(looksLikeMusicAct('Ashley', 'Ashley said she had a great time').isMusicAct).toBe(false);
  });

  it('is empty-safe', () => {
    expect(looksLikeMusicAct('', 'whatever').isMusicAct).toBe(false);
    expect(looksLikeMusicAct('Prayers', '').isMusicAct).toBe(false);
    expect(looksLikeMusicAct('Prayers', undefined).isMusicAct).toBe(false);
  });
});
