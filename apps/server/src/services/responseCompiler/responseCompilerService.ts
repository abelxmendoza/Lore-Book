import { extractAssistantClaims } from './assistantClaimExtractor';
import {
  applyContradictionsToGrounding,
  detectContradictions,
} from './contradictionChecker';
import { groundClaims } from './groundingChecker';
import { filterMemoryWrites } from './memoryWriteFilter';
import { bindProvenance } from './provenanceBinder';
import { findLoreEvidence } from './loreClaimMatcher';
import { extractResponseActions } from './responseActionExtractor';
import { applySemanticMatches, findSemanticEvidence } from './semanticGroundingChecker';
import { aggregateCertaintyScore } from './uncertaintyDetector';
import { applySummaryDiscipline } from '../chat/summaryDiscipline';
import type {
  CompiledAssistantResponse,
  CompilerRuleFired,
  GroundedClaim,
  ResponseCompileInput,
  ResponseInspectorReport,
} from './responseCompilerTypes';

function partitionClaims(claims: GroundedClaim[]): Pick<
  CompiledAssistantResponse,
  'groundedClaims' | 'inferredClaims' | 'unsupportedClaims'
> {
  return {
    groundedClaims: claims.filter((c) => c.grounding === 'grounded'),
    inferredClaims: claims.filter((c) => c.grounding === 'inferred' || c.grounding === 'contradicted'),
    unsupportedClaims: claims.filter((c) => c.grounding === 'unsupported'),
  };
}

function buildVerifiedResponse(
  rawResponse: string,
  claims: GroundedClaim[],
  contradictions: CompiledAssistantResponse['contradictions'],
  sourceText: string,
): {
  text: string;
  disciplineFired: boolean;
  discipline: CompiledAssistantResponse['discipline'];
} {
  const disciplined = applySummaryDiscipline(rawResponse, sourceText);
  const discipline = {
    text: disciplined.text || rawResponse,
    warnings: disciplined.warnings,
  };
  let text = discipline.text;

  const warnings: string[] = [];
  if (contradictions.length > 0) {
    warnings.push(
      `[Note: ${contradictions.length} statement${contradictions.length === 1 ? '' : 's'} conflict with your established lore and were not stored as fact.]`,
    );
  }
  const unsupported = claims.filter((c) => c.grounding === 'unsupported');
  if (unsupported.length > 0) {
    warnings.push(
      `[Note: ${unsupported.length} detail${unsupported.length === 1 ? '' : 's'} in this reply are interpretive, not confirmed from your messages.]`,
    );
  }

  if (warnings.length > 0) {
    text = `${text}\n\n${warnings.join(' ')}`;
  }
  return { text, disciplineFired: disciplined.warnings.length > 0, discipline };
}

function groundingIcon(grounding: GroundedClaim['grounding']): '✓' | '~' | '?' | '⚠' {
  switch (grounding) {
    case 'grounded':
      return '✓';
    case 'inferred':
      return '~';
    case 'contradicted':
      return '⚠';
    default:
      return '?';
  }
}

class ResponseCompilerService {
  compile(input: ResponseCompileInput): CompiledAssistantResponse {
    const rulesFired: CompilerRuleFired[] = [];

    const claims = extractAssistantClaims(input.rawResponse);
    rulesFired.push('inference_classifier', 'uncertainty');

    let grounded = groundClaims(
      claims,
      input.sourceMessages,
      input.canonFacts ?? [],
      input.parserFrames ?? [],
    );
    rulesFired.push('grounding', 'provenance');

    const contradictions = detectContradictions(claims, input.canonFacts ?? []);
    if (contradictions.length > 0) rulesFired.push('contradiction');
    grounded = applyContradictionsToGrounding(grounded, contradictions);

    const provenanceBindings = bindProvenance(grounded);
    const actionCandidates = extractResponseActions(input.rawResponse);
    if (actionCandidates.length > 0) rulesFired.push('action_extraction');

    const memoryCandidatesBlocked = filterMemoryWrites(grounded);
    rulesFired.push('memory_write_filter');

    const partitions = partitionClaims(grounded);
    const certaintyScore = aggregateCertaintyScore(grounded.map((c) => c.certainty));
    const sourceText = input.sourceMessages.map((m) => m.content).join('\n');
    const verified = buildVerifiedResponse(input.rawResponse, grounded, contradictions, sourceText);
    if (verified.disciplineFired) rulesFired.push('summary_discipline');

    return {
      rawResponse: input.rawResponse,
      ...partitions,
      contradictions,
      actionCandidates,
      provenanceBindings,
      certaintyScore,
      memoryCandidatesBlocked,
      rulesFired: [...new Set(rulesFired)],
      verifiedResponse: verified.text,
      discipline: verified.discipline,
    };
  }

  /**
   * Compile, then run the semantic grounding layer (embeddings + cosine) to
   * rescue paraphrased claims the token-overlap heuristic left unsupported.
   * Async because it may call the (cached) embedding service. Falls back to the
   * pure compile result when the semantic layer is disabled or finds nothing.
   */
  async compileWithSemantics(input: ResponseCompileInput): Promise<CompiledAssistantResponse> {
    const base = this.compile(input);

    const union = [
      ...base.groundedClaims,
      ...base.inferredClaims,
      ...base.unsupportedClaims,
    ];

    let upgraded = union;
    let changed = false;

    // Pass 1: paraphrase rescue against the current thread's witnesses.
    const witnessMatches = await findSemanticEvidence(upgraded, input.sourceMessages);
    if (witnessMatches.size > 0) {
      upgraded = applySemanticMatches(upgraded, witnessMatches);
      changed = true;
    }

    // Pass 2: ground whatever's still unbound against the user's whole canon.
    if (input.userId) {
      const loreMatches = await findLoreEvidence(upgraded, input.userId);
      if (loreMatches.size > 0) {
        upgraded = applySemanticMatches(upgraded, loreMatches);
        changed = true;
      }
    }

    if (!changed) return base;

    const verified = buildVerifiedResponse(
      base.rawResponse,
      upgraded,
      base.contradictions,
      input.sourceMessages.map((m) => m.content).join('\n'),
    );

    return {
      ...base,
      ...partitionClaims(upgraded),
      provenanceBindings: bindProvenance(upgraded),
      memoryCandidatesBlocked: filterMemoryWrites(upgraded),
      verifiedResponse: verified.text,
      discipline: verified.discipline,
    };
  }

  toInspectorReport(compiled: CompiledAssistantResponse): ResponseInspectorReport {
    const allClaims = [
      ...compiled.groundedClaims,
      ...compiled.inferredClaims,
      ...compiled.unsupportedClaims,
    ];

    return {
      rawResponse: compiled.rawResponse,
      verifiedResponse: compiled.verifiedResponse,
      claims: allClaims.map((c) => ({
        claim: c.claim,
        grounding: c.grounding,
        statementKind: c.statementKind,
        certainty: c.certainty,
        icon: groundingIcon(c.grounding),
        provenance: c.provenance,
      })),
      contradictions: compiled.contradictions,
      actionCandidates: compiled.actionCandidates,
      rulesFired: compiled.rulesFired,
      certaintyScore: compiled.certaintyScore,
      memoryCandidatesBlocked: compiled.memoryCandidatesBlocked,
    };
  }
}

export const responseCompilerService = new ResponseCompilerService();
