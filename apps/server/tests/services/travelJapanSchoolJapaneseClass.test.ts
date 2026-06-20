import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  assertTravelJapanActionChips,
  assertTravelJapanInferenceSnapshot,
  assertTravelJapanLexicalSnapshot,
  assertTravelJapanMeaningSnapshot,
  assertTravelJapanPreviewSpans,
  TRAVEL_JAPAN_SCHOOL_JAPANESE_CLASS_ID,
  TRAVEL_JAPAN_SCHOOL_JAPANESE_CLASS_TEXT,
} from '../fixtures/travelJapanSchoolJapaneseClass';
import { previewLexicalSpans } from '../../src/services/lexical/lexicalPreviewService';
import { lexicalAnalyzerService } from '../../src/services/lexical';
import { meaningResolutionService } from '../../src/services/meaning';
import { inferenceAssociationService } from '../../src/services/inference';

vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: [] }),
      }),
    })),
  },
}));

describe(`fixture: ${TRAVEL_JAPAN_SCHOOL_JAPANESE_CLASS_ID}`, () => {
  beforeEach(() => vi.clearAllMocks());

  it('lexical analysis extracts travel + class entities', () => {
    const lexical = lexicalAnalyzerService.analyzeMessage({
      userId: 'user-travel',
      messageId: 'msg-travel-lex',
      text: TRAVEL_JAPAN_SCHOOL_JAPANESE_CLASS_TEXT,
    });
    assertTravelJapanLexicalSnapshot(lexical);
  });

  it('preview endpoint logic returns spans without persistence', async () => {
    const preview = await previewLexicalSpans({
      text: TRAVEL_JAPAN_SCHOOL_JAPANESE_CLASS_TEXT,
      userId: 'user-travel',
      mode: 'composer_preview',
    });

    expect(preview.spans.length).toBeGreaterThan(0);
    expect(preview.spans.every((s) => s.temporary)).toBe(true);
    assertTravelJapanPreviewSpans(preview.spans);
    expect(preview.inferredAssociations.some((a) => a.inferredNotConfirmed)).toBe(true);
  });

  it('full pipeline infers school class + travel associations', async () => {
    const lexical = lexicalAnalyzerService.analyzeMessage({
      userId: 'user-travel',
      messageId: 'msg-travel-full',
      text: TRAVEL_JAPAN_SCHOOL_JAPANESE_CLASS_TEXT,
    });

    const meaning = await meaningResolutionService.resolve({
      userId: 'user-travel',
      messageId: 'msg-travel-full',
      text: TRAVEL_JAPAN_SCHOOL_JAPANESE_CLASS_TEXT,
      lexicalResult: lexical,
      timestamp: new Date().toISOString(),
    });
    assertTravelJapanMeaningSnapshot(meaning);

    const inference = await inferenceAssociationService.infer({
      userId: 'user-travel',
      messageId: 'msg-travel-full',
      rawText: TRAVEL_JAPAN_SCHOOL_JAPANESE_CLASS_TEXT,
      lexicalResult: lexical,
      meaningResult: meaning,
      timestamp: new Date().toISOString(),
    });
    assertTravelJapanInferenceSnapshot(inference);
    assertTravelJapanActionChips(inference.actionCandidates as Parameters<typeof assertTravelJapanActionChips>[0]);
  });
});
