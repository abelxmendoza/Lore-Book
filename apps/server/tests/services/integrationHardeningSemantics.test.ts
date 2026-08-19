import { describe, expect, it } from 'vitest';

import {
  classifySplitSemanticType,
  multiEventSplittingService,
} from '../../src/services/conversationCentered/multiEventSplittingService';
import { classifySourceSpeechAct } from '../../src/services/timelineNormalization/speechActClassifier';

describe('integration hardening semantic boundaries', () => {
  it('keeps reflections out of the canonical life timeline', () => {
    expect(classifySourceSpeechAct('Looking back, I should have asked them to delete the video.')).toEqual({
      act: 'reflection',
      rejectFromTimeline: true,
      reason: 'reflection_not_occurrence',
    });
  });

  it('separates corrections and reflections from lived events in a split message', () => {
    const result = multiEventSplittingService.convertToExtractedUnits({
      original_text: '',
      language_detected: 'en',
      events: [
        {
          id: 'event-1', content: 'Correction: MemoVault is the same entity as LifeLedger.',
          type: 'other', characters: [], activities: [], confidence: 0.98, start_index: 0, end_index: 58,
        },
        {
          id: 'event-2', content: 'I attended the Vanguard Robotics showcase.',
          type: 'social', characters: ['I'], activities: ['attended'], confidence: 0.9, start_index: 59, end_index: 103,
        },
        {
          id: 'event-3', content: 'In hindsight, I should have left earlier.',
          type: 'personal', characters: ['I'], activities: [], confidence: 0.9, start_index: 104, end_index: 144,
        },
      ],
    });

    expect(result.map((unit) => unit.type)).toEqual(['CORRECTION', 'EXPERIENCE', 'THOUGHT']);
    expect(classifySplitSemanticType('I wish I had handled that differently.')).toBe('THOUGHT');
  });
});

