import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  applyPreviewCorrections,
  applyCorrectionsToLexical,
} from '../../src/services/corrections/correctionApplicationService';
import { resolveEntities } from '../../src/services/meaning/entityResolutionService';
import { clearCorrectionAuditLog } from '../../src/services/corrections/correctionAuditService';
import type { CorrectedPreviewSpan } from '../../src/services/corrections/correctionTypes';
import type { LexicalAnalysisResult } from '../../src/services/lexical/lexicalTypes';

vi.mock('../../src/services/search/entitySearchService', () => ({
  validateEntityOwnership: vi.fn(),
}));

import { validateEntityOwnership } from '../../src/services/search/entitySearchService';

vi.mock('../../src/services/selfCharacterService', () => ({
  selfCharacterService: { ensureSelfCharacter: vi.fn().mockResolvedValue(null) },
}));

vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({
        data: [{ id: 'oscar-id', name: 'Oscar Trujillo' }],
      }),
    })),
  },
}));

function linkCorrection(): CorrectedPreviewSpan {
  return {
    id: '0:12:PERSON',
    text: 'Oscar Trujio',
    start: 0,
    end: 12,
    originalType: 'PERSON',
    entityStatus: 'known',
    linkedEntityId: 'oscar-id',
    linkedEntityName: 'Oscar Trujillo',
    linkedEntityType: 'person',
    correctionAction: 'link_existing_entity',
    userConfirmed: true,
    correctionSource: 'composer',
  };
}

describe('linked entity pipeline integration', () => {
  beforeEach(() => {
    clearCorrectionAuditLog();
    vi.mocked(validateEntityOwnership).mockResolvedValue(true);
  });

  it('linkedEntityId prevents duplicate create candidate via unresolved=false', async () => {
    const lexical: LexicalAnalysisResult = {
      messageId: 'm1',
      userId: 'u1',
      rawText: 'Oscar Trujio was my best friend',
      normalizedText: 'oscar trujio was my best friend',
      entities: [
        {
          surface: 'Oscar Trujio',
          normalized: 'oscar trujio',
          type: 'PERSON',
          confidence: 0.6,
          source: 'preview',
        },
      ],
      intents: [],
      emotions: [],
      relationships: [],
      skills: [],
      places: [],
      events: [],
      ontologyCandidates: [],
      memoryCandidates: [],
      glossaryMatches: [],
      confidence: 0.7,
      ambiguityFlags: [],
      needsClarification: false,
      createdAt: new Date().toISOString(),
    };

    const corrected = applyCorrectionsToLexical(lexical, [linkCorrection()]);
    expect(corrected.entities[0]?.linkedEntityId).toBe('oscar-id');

    const { entities } = await resolveEntities('u1', lexical.rawText, corrected, {
      statements: [],
    });

    const oscar = entities.find((e) => e.surface.includes('Oscar'));
    expect(oscar?.entityId).toBe('oscar-id');
    expect(oscar?.isUnresolved).toBeFalsy();
  });

  it('drops unauthorized linked entity corrections', async () => {
    vi.mocked(validateEntityOwnership).mockResolvedValue(false);

    const result = await applyPreviewCorrections({
      userId: 'u1',
      messageId: 'm1',
      text: 'test',
      corrections: [linkCorrection()],
    });

    expect(result.correctedSpans).toHaveLength(0);
  });

  it('audit records link action', async () => {
    const result = await applyPreviewCorrections({
      userId: 'u1',
      messageId: 'm2',
      text: 'Oscar Trujio',
      corrections: [linkCorrection()],
    });

    expect(result.auditId).toBeTruthy();
    expect(result.correctedSpans[0]?.linkedEntityId).toBe('oscar-id');
  });
});
