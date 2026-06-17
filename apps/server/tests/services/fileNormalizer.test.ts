import { describe, expect, it } from 'vitest';

import { FileNormalizer } from '../../src/services/ingestion/fileNormalizer';

describe('FileNormalizer', () => {
  const normalizer = new FileNormalizer();

  it('normalizes plain text with detected date', async () => {
    const artifact = await normalizer.normalizeDocument({
      buffer: Buffer.from('On 2024-06-15 we went to Costco with Grandma Rose.'),
      filename: 'notes.txt',
      mimeType: 'text/plain',
      sourceFileId: 'file-1',
    });

    expect(artifact.text).toContain('Costco');
    expect(artifact.sourceFileId).toBe('file-1');
    expect(artifact.detectedDate).toBeTruthy();
  });

  it('rejects empty extractable text', async () => {
    await expect(
      normalizer.normalizeDocument({
        buffer: Buffer.from('   '),
        filename: 'empty.txt',
        mimeType: 'text/plain',
        sourceFileId: 'file-2',
      })
    ).rejects.toThrow(/No extractable text/);
  });
});
