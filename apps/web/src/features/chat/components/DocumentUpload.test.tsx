import { describe, expect, it } from 'vitest';

import { isResumeUploadAbort, resumeUploadErrorMessage } from './DocumentUpload';

describe('resume upload recovery messaging', () => {
  it('recognizes browser abort errors without depending on a specific DOMException class', () => {
    expect(isResumeUploadAbort({ name: 'AbortError' })).toBe(true);
    expect(resumeUploadErrorMessage({ name: 'AbortError' })).toContain('will not create duplicates');
  });

  it('preserves an ordinary server error message', () => {
    expect(resumeUploadErrorMessage(new Error('Resume parser unavailable'))).toBe('Resume parser unavailable');
  });
});
