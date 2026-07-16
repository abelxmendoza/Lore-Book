import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Source-level regression: the old ambiguous "may not have completed" copy
 * must not be the default for OpenAI rate-limit failures.
 */
describe('useChat friendlyErrorMessage durability copy', () => {
  const src = readFileSync(join(__dirname, '../useChat.ts'), 'utf8');

  it('does not use the legacy ambiguous memory-loss phrasing as default', () => {
    expect(src).not.toContain(
      'Memory ingestion and entity creation may not have completed for this send.',
    );
  });

  it('prefers server truth-backed saved/queued messaging', () => {
    expect(src).toMatch(/I saved your message|Your message is saved|queued it for autobiographical/);
  });

  it('generates clientIdempotencyKey for sends', () => {
    expect(src).toContain('clientIdempotencyKey');
  });

  it('does not mark user bubble failed when durability says saved', () => {
    expect(src).toMatch(/userSaved/);
    expect(src).toMatch(/durability\?\.userMessage\?\.persisted/);
  });

  it('uses cloud-saved copy when userSaved, not the restore-composer unsaved copy', () => {
    expect(src).toContain('Cloud save succeeded, but I couldn’t generate a reply');
    expect(src).toContain('Cloud save and reply both failed');
    // Branching must prefer userSaved for the safe path
    expect(src).toMatch(/userSaved\s*\n?\s*\?\s*\n?\s*'Cloud save succeeded/);
  });
});
