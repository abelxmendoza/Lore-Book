import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = new URL('../../../../', import.meta.url);

const LIVE_WRITERS = [
  'src/services/skills/skillSuggestionService.ts',
  'src/services/skills/skillExtractionService.ts',
  'src/services/projects/projectSuggestionService.ts',
  'src/services/organizations/organizationSuggestionService.ts',
  'src/services/quests/questSuggestionService.ts',
  'src/services/entities/omegaOrgPromotionService.ts',
  'src/services/characterConversationRescanService.ts',
  'src/services/locationSuggestionService.ts',
  'src/services/romanticLexicalIngestionService.ts',
  'src/services/lorebook/parser/loreBookParseCorpusService.ts',
  'src/services/profileClaims/resumeLorePopulationService.ts',
  'src/services/entities/entityResolver.ts',
  'src/services/omegaMemoryService.ts',
  'src/services/kinship/householdInferenceService.ts',
  'src/services/kinship/familyGraphInferenceService.ts',
  'src/services/society/societyMappingService.ts',
  'src/services/chat/groupWriteService.ts',
  'src/services/characters/relationalPossessorService.ts',
];

const AUTOMATIC_SCAN_ROOTS = [
  'src/services/skills',
  'src/services/organizations',
  'src/services/profileClaims',
  'src/services/kinship',
  'src/services/society',
  'src/services/entities',
];

const ALLOWLIST_DIRECT_WRITE = [
  'skillService.ts',
  'organizationService.ts',
  'skillSuggestionService.ts',
  'projectSuggestionService.ts',
  'questSuggestionService.ts',
  'reclassifyOrganizationService.ts',
  'reclassifyLocationService.ts',
  'reclassifyCharacterService.ts',
  'storageService.ts',
  'omegaOrgPromotionService.ts',
];

const DIRECT_INSERT = /\.from\(['"](?:skills|organizations|characters|projects|quests|omega_entities)['"]\)\s*\.(?:insert|upsert)\(/;

function walkTs(dir: string): string[] {
  const abs = new URL(dir, ROOT).pathname;
  const out: string[] = [];
  for (const entry of readdirSync(abs)) {
    const full = join(abs, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry.endsWith('.test.ts')) continue;
      out.push(...walkTs(`${dir}/${entry}`));
      continue;
    }
    if (entry.endsWith('.test.ts') || entry.endsWith('.test.tsx')) continue;
    if (entry.endsWith('.ts')) out.push(`${dir}/${entry}`);
  }
  return out;
}

describe('universal suggestion write-path guard', () => {
  it('requires live extractors to call applySuggestionCandidate', () => {
    for (const relative of LIVE_WRITERS) {
      const src = readFileSync(new URL(relative, ROOT), 'utf8');
      expect(src, relative).toContain('applySuggestionCandidate');
    }
  });

  it('catches unauthorized automatic direct writers', () => {
    const offenders: string[] = [];
    for (const root of AUTOMATIC_SCAN_ROOTS) {
      for (const relative of walkTs(root)) {
        const file = relative.split('/').pop() ?? relative;
        if (ALLOWLIST_DIRECT_WRITE.includes(file)) continue;
        const src = readFileSync(new URL(relative, ROOT), 'utf8');
        if (!DIRECT_INSERT.test(src)) continue;
        if (src.includes('applySuggestionCandidate')) continue;
        offenders.push(relative);
      }
    }
    expect(offenders, offenders.join(', ')).toEqual([]);
  });
});
