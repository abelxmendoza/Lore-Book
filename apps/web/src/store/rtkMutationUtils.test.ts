import { describe, it, expect } from 'vitest';

import { mutationErrorMessage, mutationErrorStatus } from './rtkMutationUtils';

describe('rtkMutationUtils', () => {
  it('reads message from RTK FetchJsonError-shaped objects', () => {
    expect(mutationErrorMessage({ status: 502, message: 'Bad Gateway' })).toBe('Bad Gateway');
  });

  it('falls back to Error.message', () => {
    expect(mutationErrorMessage(new Error('OpenAI 429'))).toBe('OpenAI 429');
  });

  it('stringifies unknown values', () => {
    expect(mutationErrorMessage('plain')).toBe('plain');
  });

  it('extracts numeric status when present', () => {
    expect(mutationErrorStatus({ status: 409, message: 'Conflict' })).toBe(409);
    expect(mutationErrorStatus(new Error('nope'))).toBeUndefined();
  });
});
