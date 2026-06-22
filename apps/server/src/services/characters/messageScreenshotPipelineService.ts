/**
 * Full ingestion pipeline for text-message screenshots and pasted transcripts.
 * Vision OCR → lexical intelligence → interpretation pipeline → LoreBook parse → omega memory.
 */
import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { runLexicalIntelligence } from '../lexical/intelligence/lexicalIntelligenceService';
import { ingestLoreBookParseFromMessage } from '../lorebook/parser/loreBookIngestionParseService';
import type { IngestParseSummary } from '../lorebook/parser/loreBookIngestionParseService';
import { runLoreInterpretationPipeline } from '../pipeline/loreInterpretationPipeline';
import { meaningResolutionService } from '../meaning/meaningResolutionService';
import { omegaMemoryService } from '../omegaMemoryService';
import type { MessageScreenshotAnalysis } from './characterMessageAnalysisService';

export type MessageScreenshotPipelineSummary = {
  messageId: string;
  lexicalIntelligence: {
    spanCount: number;
    entities: string[];
    rulesFired: string[];
  };
  interpretation: {
    entityCount: number;
    relationshipCount: number;
    skillCount: number;
    confidence: number;
    allowsMemoryWrite: boolean;
  };
  loreBookParse: IngestParseSummary;
  omegaIngest?: {
    claimsQueued: number;
    entitiesResolved: number;
    conflictsDetected: number;
  };
  completedAt: string;
};

export type RunMessageScreenshotPipelineInput = {
  userId: string;
  characterId: string;
  characterName?: string;
  mediaId: string;
  extractedText: string;
  analysis?: MessageScreenshotAnalysis;
  caption?: string;
};

function buildPipelineText(input: RunMessageScreenshotPipelineInput): string {
  const { extractedText, characterName, caption, analysis } = input;
  const lines: string[] = [];
  const platform = analysis?.platform;
  if (characterName) {
    lines.push(
      `[Text message conversation with ${characterName}${platform ? ` on ${platform}` : ''}]`,
    );
  }
  if (caption?.trim()) lines.push(`Context: ${caption.trim()}`);
  if (analysis?.summary?.trim()) lines.push(`Summary: ${analysis.summary.trim()}`);
  lines.push(extractedText.trim());
  return lines.filter(Boolean).join('\n\n');
}

function screenshotMessageId(mediaId: string): string {
  return `screenshot:${mediaId}`;
}

export async function runMessageScreenshotPipeline(
  input: RunMessageScreenshotPipelineInput,
): Promise<MessageScreenshotPipelineSummary | null> {
  const text = buildPipelineText(input);
  if (input.extractedText.trim().length < 12) {
    return null;
  }

  const messageId = screenshotMessageId(input.mediaId);
  const priorMentionedNames = [
    input.characterName,
    input.analysis?.counterpartName,
  ].filter((n): n is string => Boolean(n?.trim()));

  const lexicalIntelligence = runLexicalIntelligence({
    text,
    userId: input.userId,
    analyzerMode: 'full',
    includeAnalyzerEntities: true,
  });

  const entityNames = [
    ...new Set(
      lexicalIntelligence.spans
        .filter((s) => s.type === 'PERSON' || s.type === 'CHARACTER' || s.type === 'PLACE')
        .map((s) => s.text.trim())
        .filter(Boolean),
    ),
  ];

  let interpretation = {
    entityCount: 0,
    relationshipCount: 0,
    skillCount: 0,
    confidence: 0,
    allowsMemoryWrite: false,
  };

  try {
    const pipeline = await runLoreInterpretationPipeline(
      {
        userId: input.userId,
        messageId,
        text,
        threadId: `character:${input.characterId}`,
      },
      { priorMentionedNames },
    );
    interpretation = {
      entityCount: pipeline.lexical.entities.length,
      relationshipCount: pipeline.meaning.resolvedRelationships.length,
      skillCount: pipeline.lexical.skills.length,
      confidence: pipeline.meaning.confidence,
      allowsMemoryWrite: meaningResolutionService.allowsMemoryWrite(pipeline.meaning),
    };
  } catch (err) {
    logger.warn({ err, mediaId: input.mediaId }, 'message screenshot interpretation pipeline failed');
  }

  let loreBookParse: IngestParseSummary = {
    linesParsed: 0,
    operationsSeen: 0,
    applied: 0,
    skipped: 0,
    byDomain: {},
    appliedItems: [],
  };

  try {
    loreBookParse = await ingestLoreBookParseFromMessage(input.userId, text, {
      messageId,
      threadId: `character:${input.characterId}`,
    });
  } catch (err) {
    logger.warn({ err, mediaId: input.mediaId }, 'message screenshot LoreBook parse failed');
  }

  let omegaIngest: MessageScreenshotPipelineSummary['omegaIngest'];
  if (interpretation.allowsMemoryWrite) {
    try {
      const result = await omegaMemoryService.ingestText(input.userId, text, 'USER');
      omegaIngest = {
        claimsQueued: result.claims?.length ?? 0,
        entitiesResolved: result.entities?.length ?? 0,
        conflictsDetected: result.conflicts_detected ?? 0,
      };
    } catch (err) {
      logger.warn({ err, mediaId: input.mediaId }, 'message screenshot omega ingest failed');
    }
  }

  const summary: MessageScreenshotPipelineSummary = {
    messageId,
    lexicalIntelligence: {
      spanCount: lexicalIntelligence.spans.length,
      entities: entityNames,
      rulesFired: lexicalIntelligence.rulesFired,
    },
    interpretation,
    loreBookParse,
    omegaIngest,
    completedAt: new Date().toISOString(),
  };

  logger.info(
    {
      userId: input.userId,
      mediaId: input.mediaId,
      characterId: input.characterId,
      spanCount: summary.lexicalIntelligence.spanCount,
      loreApplied: summary.loreBookParse.applied,
    },
    'message screenshot pipeline complete',
  );

  return summary;
}

export async function persistPipelineSummary(
  userId: string,
  mediaId: string,
  uploadArchiveId: string | undefined,
  pipeline: MessageScreenshotPipelineSummary,
  existingMetadata: Record<string, unknown> = {},
): Promise<void> {
  const metadata = {
    ...existingMetadata,
    pipeline,
  };

  await supabaseAdmin
    .from('character_media')
    .update({ metadata })
    .eq('id', mediaId)
    .eq('user_id', userId);

  if (uploadArchiveId) {
    const { data: archive } = await supabaseAdmin
      .from('text_message_uploads')
      .select('analysis')
      .eq('id', uploadArchiveId)
      .maybeSingle();

    const analysis = (archive?.analysis as Record<string, unknown> | null) ?? {};
    await supabaseAdmin
      .from('text_message_uploads')
      .update({ analysis: { ...analysis, pipeline } })
      .eq('id', uploadArchiveId)
      .eq('user_id', userId);
  }
}
