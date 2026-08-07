import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { isDualWriteEnabled } from './dualWrite';

describe('isDualWriteEnabled', () => {
  const original = process.env.KNOWLEDGE_KERNEL_DUAL_WRITE;

  beforeEach(() => {
    delete process.env.KNOWLEDGE_KERNEL_DUAL_WRITE;
  });

  afterEach(() => {
    if (original === undefined) delete process.env.KNOWLEDGE_KERNEL_DUAL_WRITE;
    else process.env.KNOWLEDGE_KERNEL_DUAL_WRITE = original;
  });

  it('is true only when explicitly set to "1"', () => {
    process.env.KNOWLEDGE_KERNEL_DUAL_WRITE = '1';
    expect(isDualWriteEnabled()).toBe(true);
  });

  it('is false when unset', () => {
    expect(isDualWriteEnabled()).toBe(false);
  });

  it('is false for "0" and any other value', () => {
    process.env.KNOWLEDGE_KERNEL_DUAL_WRITE = '0';
    expect(isDualWriteEnabled()).toBe(false);
    process.env.KNOWLEDGE_KERNEL_DUAL_WRITE = 'true';
    expect(isDualWriteEnabled()).toBe(false);
  });
});
