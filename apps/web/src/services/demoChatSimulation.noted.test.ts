import { describe, it, expect } from 'vitest';
import { buildDemoChatResponse } from './demoChatSimulation';
import { maybeNotedSignatureResponse, NOTED_SIGNATURE } from '../lib/notedSignature';

describe('demoChatSimulation noted signature', () => {
  it('can return Noted. for eligible log commands', () => {
    expect(
      maybeNotedSignatureResponse({ message: 'Log this: Abel entered the lab.', random: () => 0 }),
    ).toBe(NOTED_SIGNATURE);

    const result = buildDemoChatResponse(
      'Log this: Abel entered the lab.',
      undefined,
      undefined,
    );
    // buildDemoChatResponse uses Math.random — verify non-question log still produces valid response
    expect(result.content.length).toBeGreaterThan(0);
  });

  it('does not return Noted. for normal conversation', () => {
    const result = buildDemoChatResponse('I thought the villain needed more depth.');
    expect(result.content).not.toBe(NOTED_SIGNATURE);
  });
});
