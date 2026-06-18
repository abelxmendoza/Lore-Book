import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const SERVER_SRC = join(__dirname, '../../src');

function readSrc(relativePath: string): string {
  return readFileSync(join(SERVER_SRC, relativePath), 'utf8');
}

describe('System Cognition wiring guard', () => {
  it('omegaChatService imports and gates on resolveMetaProductContext', () => {
    const src = readSrc('services/omegaChatService.ts');

    expect(src).toContain("import('./chat/lorebookSelfModelService')");
    expect(src).toContain('resolveMetaProductContext');
    expect(src).toContain('SYSTEM_COGNITION');
    expect(src).toContain('selfModelBlockStream');
    expect(src).toContain('selfModelBlockChat');
    expect(src).toContain('metaContext.shortCircuit');
  });

  it('systemPromptBuilder accepts and renders selfModelBlock', () => {
    const src = readSrc('services/chat/systemPromptBuilder.ts');

    expect(src).toContain('selfModelBlock?: string | null');
    expect(src).toContain('HOW LOREBOOK WORKS');
    expect(src).toContain('WHAT LOREBOOK KNOWS ABOUT YOU');
  });

  it('lorebookSelfModelService exports fallback facts for every product concept', () => {
    const src = readSrc('services/chat/lorebookSelfModelService.ts');

    expect(src).toContain('PRODUCT_SELF_MODEL_CONCEPTS');
    expect(src).toContain('FALLBACK_SELF_MODEL');
    expect(src).toContain('USER_RECALL_BLOCKERS');
    expect(src).toContain('META_QUERY_RULES');
  });

  it('memory extraction still filters meta product messages', () => {
    const src = readSrc('services/memoryExtractionService.ts');

    expect(src).toContain('how does this (app|work)');
    expect(src).toContain('META_PATTERNS');
  });
});
