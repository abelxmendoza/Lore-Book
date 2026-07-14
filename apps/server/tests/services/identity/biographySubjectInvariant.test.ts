import { describe, it, expect } from 'vitest';

import { pickBiographySubject } from '../../../src/services/identity/biographySubjectInvariant';

// Fictional cast only.
const rows = [
  { id: 'c1', name: 'Moth Queen', metadata: { mention_count: 340 } },
  { id: 'c2', name: 'Obscurio', metadata: { mention_count: 120 } },
  { id: 'self', name: 'Rene Alvarez', metadata: { is_self: true, mention_count: 12 } },
];

describe('biography subject invariant', () => {
  it('the subject is always the canonical self, regardless of mention counts', () => {
    const subject = pickBiographySubject(rows);
    expect(subject?.id).toBe('self');
    expect(subject?.name).toBe('Rene Alvarez');
  });

  it('a top-retrieved character can never become the subject', () => {
    const subject = pickBiographySubject(rows.filter((r) => r.id !== 'self'));
    // No self flag → fail safely with null, never fall back to prominence.
    expect(subject).toBeNull();
  });

  it('distinct-from-self rows are excluded even if flagged', () => {
    const subject = pickBiographySubject([
      { id: 'bad', name: 'Moth Queen', metadata: { is_self: true, distinct_from_self: true } },
    ]);
    expect(subject).toBeNull();
  });

  it('prefers real_name and explicit is_self over is_user', () => {
    const subject = pickBiographySubject([
      { id: 'a', name: 'Me', metadata: { is_user: true } },
      { id: 'b', name: 'Stage Persona', metadata: { is_self: true, real_name: 'Rene Alvarez' } },
    ]);
    expect(subject?.id).toBe('b');
    expect(subject?.name).toBe('Rene Alvarez');
  });
});
