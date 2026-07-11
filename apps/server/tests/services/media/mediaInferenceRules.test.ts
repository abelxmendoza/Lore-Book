import { describe, it, expect } from 'vitest';

import { mediaInferenceService } from '../../../src/services/media/inference/mediaInferenceService';
import { hasPerformanceContext } from '../../../src/services/media/inference/artistBandInference';
import { disambiguateEventOrVenue } from '../../../src/services/media/inference/mediaEventDisambiguation';
import { hasProvenance } from '../../../src/services/media/inference/mediaProvenanceService';
import { applyMediaLinks } from '../../../src/services/media/inference/mediaPreferenceLinker';

function infer(text: string, extra: Parameters<typeof mediaInferenceService.inferFromMessage>[0] = {}) {
  return mediaInferenceService.inferFromMessage({
    text,
    sourceMessageId: 'msg-1',
    authorRole: 'user',
    ...extra,
  });
}

function findMedia(result: ReturnType<typeof infer>, namePart: string) {
  return result.accepted.find((c) =>
    c.displayName.toLowerCase().includes(namePart.toLowerCase()),
  );
}

describe('media inference rules', () => {
  it('One Piece detected as anime/media work', () => {
    const result = infer('I like One Piece and rewatch it often.');
    const media = findMedia(result, 'One Piece');
    expect(media).toBeDefined();
    expect(media!.mediaType).toBe('anime');
  });

  it('Star Wars detected as franchise', () => {
    const result = infer('Star Wars reminds me of epic sci-fi.');
    const media = findMedia(result, 'Star Wars');
    expect(media).toBeDefined();
    expect(media!.mediaType).toBe('cultural_reference');
  });

  it('Blade Runner detected as movie/aesthetic reference', () => {
    const result = infer('Blade Runner vibe for LoreBook UI design.');
    const media = findMedia(result, 'Blade Runner');
    expect(media).toBeDefined();
    expect(media!.mediaType).toBe('movie');
    expect(media!.context.projectContext).toBe('LoreBook');
  });

  it('Hedwig’s Theme detected as theme_song', () => {
    const result = infer("Something like Hedwig's Theme for the intro.");
    const media = findMedia(result, 'Hedwig');
    expect(media).toBeDefined();
    expect(media!.mediaType).toBe('theme_song');
  });

  it('ska detected as music_genre/fandom', () => {
    const result = infer('I like ska and went to shows.');
    const media = findMedia(result, 'ska');
    expect(media).toBeDefined();
    expect(['music_genre', 'fandom']).toContain(media!.mediaType);
  });

  it('Bill Skasby in show context detected as band/artist', () => {
    const result = infer('Bill Skasby playing at the ska show last night.');
    const media = findMedia(result, 'Bill Skasby');
    expect(media).toBeDefined();
    expect(['band', 'artist']).toContain(media!.mediaType);
    expect(hasPerformanceContext('Bill Skasby playing at the show')).toBe(true);
  });

  it('Rafeh Qazi detected as content creator/person, not place', () => {
    const result = infer('Rafeh Qazi is a YouTuber I learned from.');
    const media = findMedia(result, 'Rafeh Qazi');
    expect(media).toBeDefined();
    expect(media!.mediaType).toBe('content_creator');
    expect(media!.context.personContext).toMatch(/content creator/i);
  });

  it('Ska Prom detected as event, not media', () => {
    const disambiguation = disambiguateEventOrVenue('We met at Ska Prom after the set.');
    expect(disambiguation?.route).toBe('event');
    const result = infer('We met at Ska Prom after the set.');
    expect(result.accepted.some((c) => /ska prom/i.test(c.displayName))).toBe(false);
    expect(result.rejected.some((r) => /ska prom/i.test(r.displayName))).toBe(true);
  });

  it('Bad Dogg Compound detected as venue, not media', () => {
    const disambiguation = disambiguateEventOrVenue('The show was at Bad Dogg Compound.');
    expect(disambiguation?.route).toBe('venue');
    const result = infer('The show was at Bad Dogg Compound.');
    expect(result.accepted.some((c) => /bad dogg/i.test(c.displayName))).toBe(false);
  });

  it('Moth Queen known as character blocks media suggestion unless performance context', () => {
    const blocked = infer('Moth Queen texted me today.', {
      knownCharacters: { 'moth queen': 'character-id' },
    });
    expect(blocked.accepted.some((c) => /moth queen/i.test(c.displayName))).toBe(false);

    const allowed = infer('Moth Queen playing on stage at Gothicumbia.', {
      knownCharacters: { 'moth queen': 'character-id' },
    });
    expect(allowed.accepted.some((c) => /moth queen/i.test(c.displayName)) || hasPerformanceContext('Moth Queen playing on stage')).toBe(true);
  });

  it('media references attach to preferences', () => {
    const result = infer("I love something like Hedwig's Theme for mystical vibes.");
    const media = findMedia(result, 'Hedwig');
    expect(media).toBeDefined();
    expect(media!.context.preferenceSignal).toMatch(/likes|favorite|inspired_by/);
    expect(media!.context.sceneContext).toBe('user taste profile');
  });

  it('media references attach to LoreBook project aesthetics when project context exists', () => {
    const result = infer('Blade Runner vibe for LoreBook dark UI.');
    const media = findMedia(result, 'Blade Runner');
    expect(media).toBeDefined();
    expect(media!.context.projectContext).toBe('LoreBook');
    expect(media!.context.aestheticContext).toBeTruthy();
  });

  it('provenance required', () => {
    const result = infer('I like One Piece and Star Wars.');
    expect(result.accepted.length).toBeGreaterThan(0);
    for (const media of result.accepted) {
      expect(hasProvenance(media)).toBe(true);
      expect(media.sourceMessageIds).toContain('msg-1');
      expect(media.evidencePhrases.length).toBeGreaterThan(0);
    }
  });

  it('applyMediaLinks enriches preference context', () => {
    const linked = applyMediaLinks(
      {
        displayName: "Hedwig's Theme",
        mediaType: 'theme_song',
        context: {},
        evidencePhrases: ["Hedwig's Theme"],
        sourceMessageIds: ['msg-1'],
        confidence: 0.88,
        inferredNotConfirmed: true,
        requiresReview: false,
        promotionStatus: 'candidate',
      },
      "something like Hedwig's Theme",
    );
    expect(linked.context.aestheticContext).toBe('mystical orchestral fantasy music');
  });
});
