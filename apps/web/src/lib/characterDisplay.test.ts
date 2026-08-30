import { describe, expect, it } from 'vitest';
import {
  getCharacterContextHooks,
  getCharacterWittyTagline,
  getMainCharacterDisplayName,
  isTemplateProtagonistBlurb,
  personalizeSelfSummary,
  resolveProfileContextHooks,
  resolveProfileTagline,
} from './characterDisplay';

describe('characterDisplay protagonist copy', () => {
  it('recognizes joke protagonist blurbs', () => {
    expect(
      isTemplateProtagonistBlurb(
        'Main character energy: builder of timelines and trouble — the one the assistant is legally required to remember.',
      ),
    ).toBe(true);
    expect(isTemplateProtagonistBlurb('QA technician at Vanguard Robotics')).toBe(false);
  });

  it('hides template taglines and joke chips', () => {
    expect(
      getCharacterWittyTagline({
        metadata: {
          witty_tagline: 'Main character energy: builder of timelines and trouble',
        },
      } as any),
    ).toBeNull();
    expect(
      getCharacterContextHooks({
        metadata: {
          context_hooks: [
            'has an interview on the horizon',
            'speaks fluent warehouse diagnostics',
            'between-arc transition era',
            'keeps a workshop notebook',
          ],
        },
      } as any),
    ).toEqual(['keeps a workshop notebook']);
  });

  it('sanitizes API overrides the same way', () => {
    const character = {
      metadata: {
        witty_tagline: 'Main character energy: builder of timelines and trouble',
        context_hooks: ['has an interview on the horizon'],
      },
    } as any;
    expect(
      resolveProfileTagline(character, 'Main character energy: builder of timelines and trouble'),
    ).toBeNull();
    expect(resolveProfileTagline(character, 'QA technician at Vanguard Robotics')).toBe(
      'QA technician at Vanguard Robotics',
    );
    expect(
      resolveProfileContextHooks(character, [
        'has an interview on the horizon',
        'speaks fluent warehouse diagnostics',
      ]),
    ).toEqual([]);
  });

  it('strips a composed epithet from the protagonist display-name fallback', () => {
    expect(
      getMainCharacterDisplayName({
        name: 'Jamie Rivera the Isolation And Resilience',
        metadata: { is_self: true },
      } as any),
    ).toBe('Jamie Rivera');
  });

  it('does not personalize joke protagonist summaries into the hero bio', () => {
    expect(
      personalizeSelfSummary(
        'Main character energy: builder of timelines and trouble — the one the assistant is legally required to remember.',
      ),
    ).toMatch(/your story grows with every conversation/i);
  });
});
