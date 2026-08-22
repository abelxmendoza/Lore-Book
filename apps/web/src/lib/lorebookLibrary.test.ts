import { describe, expect, it } from 'vitest';
import {
  LOREBOOK_LIBRARY_PATH,
  lorebookLibraryUrl,
  lorebookReadUrl,
} from './lorebookLibrary';

describe('lorebook library URLs', () => {
  it('points the compiled library at /lorebook/library', () => {
    expect(lorebookLibraryUrl()).toBe(LOREBOOK_LIBRARY_PATH);
    expect(lorebookLibraryUrl()).toBe('/lorebook/library');
  });

  it('opens a compiled book in the reader via ?book=', () => {
    expect(lorebookReadUrl('demo-1')).toBe('/lorebook?book=demo-1');
  });
});
