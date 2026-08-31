import { logger } from '../../logger';
import type { DocumentCategory } from '../documents/documentCategories';
import { documentService } from '../documentService';
import { eventRecoveryService } from '../eventRecoveryService';
import { memoryService } from '../memoryService';
import { profileClaimsService } from '../profileClaims/profileClaimsService';
import { parseResumeHeuristics } from '../profileClaims/resumeHeuristicParser';
import { resumeLorePopulationService } from '../profileClaims/resumeLorePopulationService';
import { resumeParsingService } from '../profileClaims/resumeParsingService';
import { relationshipFoundationService } from '../relationshipFoundationService';
import { supabaseAdmin } from '../supabaseClient';

import { fileNormalizer } from './fileNormalizer';
import { resumeContentSimilarity, RESUME_DUPLICATE_SIMILARITY_THRESHOLD } from './resumeContentSimilarity';
import type { IngestKind, UnifiedIngestResult, UserFileRecord } from './types';
import { userFileRegistry } from './userFileRegistry';

const PROVENANCE_META = (sourceFileId: string) => ({
  source_file_id: sourceFileId,
  user_file_id: sourceFileId,
  provenance: 'file_upload',
  review_state: 'pending',
  review_required: true,
});

const ACTIVE_PROCESSING_WINDOW_MS = 15 * 60 * 1000;

function resultFromCompletedFile(file: UserFileRecord): UnifiedIngestResult {
  const stored = file.metadata?.ingest_result;
  const storedResult = stored && typeof stored === 'object'
    ? stored as Partial<UnifiedIngestResult>
    : {};
  return {
    ...storedResult,
    userFileId: file.id,
    processingStatus: 'completed',
    derivedCounts: file.derived_counts,
    alreadyImported: true,
  };
}

function receiptFromResult(result: Omit<UnifiedIngestResult, 'userFileId' | 'processingStatus'>) {
  return {
    derivedCounts: result.derivedCounts,
    momentsCreated: result.momentsCreated,
    charactersCreated: result.charactersCreated,
    sectionsCreated: result.sectionsCreated,
    claimsCreated: result.claimsCreated,
    skillsCreated: result.skillsCreated,
    organizationsCreated: result.organizationsCreated,
    eventsCreated: result.eventsCreated,
    projectsSuggested: result.projectsSuggested,
    itemsReconciled: result.itemsReconciled,
    alreadyImported: result.alreadyImported,
    duplicateOfUserFileId: result.duplicateOfUserFileId,
    duplicateSimilarity: result.duplicateSimilarity,
  };
}

export class UnifiedFileIngestionService {
  /**
   * Canonical ingestion entry point for all file uploads.
   * upload → user_files → FileNormalizer → saveEntry → graph recovery
   */
  async ingest(params: {
    userId: string;
    buffer: Buffer;
    filename: string;
    mimeType: string;
    kind: IngestKind;
    storeBinary?: boolean;
    /** Composer text the user typed alongside this upload — folded into the same ingested unit, not dropped. */
    caption?: string;
    /** User-selected Documents library folder. Kept as non-content registry metadata. */
    documentCategory?: DocumentCategory;
  }): Promise<UnifiedIngestResult> {
    const { userId, buffer, filename, mimeType, kind, caption, documentCategory } = params;

    const userFile = await userFileRegistry.registerOrReuse(userId, buffer, {
      filename,
      mimeType,
      ingestKind: kind,
      storeBinary: params.storeBinary,
      documentCategory,
    });

    if (userFile.processing_status === 'completed') {
      return resultFromCompletedFile(userFile);
    }

    let expectedStatus: 'pending' | 'failed' = userFile.processing_status === 'failed' ? 'failed' : 'pending';
    if (userFile.processing_status === 'processing') {
      const startedAt = typeof userFile.metadata?.processing_started_at === 'string'
        ? Date.parse(userFile.metadata.processing_started_at)
        : Number.NaN;
      if (Number.isFinite(startedAt) && Date.now() - startedAt < ACTIVE_PROCESSING_WINDOW_MS) {
        return {
          userFileId: userFile.id,
          processingStatus: 'processing',
          derivedCounts: userFile.derived_counts,
        };
      }
      const reclaimed = await userFileRegistry.reclaimStaleProcessing(
        userFile.id,
        new Date(Date.now() - ACTIVE_PROCESSING_WINDOW_MS).toISOString(),
      );
      if (!reclaimed) {
        return {
          userFileId: userFile.id,
          processingStatus: 'processing',
          derivedCounts: userFile.derived_counts,
        };
      }
      expectedStatus = 'pending';
    }

    const claimed = await userFileRegistry.tryClaimProcessing(userFile.id, expectedStatus);
    if (!claimed) {
      const latest = await userFileRegistry.getForUser(userId, userFile.id);
      if (latest?.processing_status === 'completed') return resultFromCompletedFile(latest);
      return {
        userFileId: userFile.id,
        processingStatus: latest?.processing_status === 'failed' ? 'failed' : 'processing',
        derivedCounts: latest?.derived_counts ?? userFile.derived_counts,
        ...(latest?.error_message ? { error: latest.error_message } : {}),
      };
    }

    try {
      // Filename hints ("resume.pdf") are useful but not authoritative — a
      // resume uploaded through the generic Documents flow with any other
      // filename must still be recognized. Detect from content instead:
      // route through resume ingestion whenever the extracted text actually
      // has resume-shaped structure (employment/education entries), no
      // matter which upload surface or filename it arrived under.
      const effectiveKind: IngestKind =
        kind === 'resume' || (kind === 'document' && (await this.looksLikeResume(buffer, filename, mimeType)))
          ? 'resume'
          : kind;
      const result =
        effectiveKind === 'resume'
          ? await this.ingestResume(userId, buffer, filename, mimeType, userFile.id, caption)
          : await this.ingestDocument(userId, buffer, filename, mimeType, userFile.id, caption);

      // Keep only a non-content receipt in the file registry. Parsed resume
      // content already lives in resume_documents; copying it into metadata
      // would create an unnecessary second store of personal information.
      await userFileRegistry.updateMetadata(userFile.id, { ingest_result: receiptFromResult(result) });
      await userFileRegistry.setStatus(userFile.id, 'completed');
      return { ...result, userFileId: userFile.id, processingStatus: 'completed' };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await userFileRegistry.setStatus(userFile.id, 'failed', message);
      logger.error({ error, userId, filename, kind }, 'Unified file ingestion failed');
      return {
        userFileId: userFile.id,
        processingStatus: 'failed',
        derivedCounts: userFile.derived_counts,
        error: message,
      };
    }
  }

  /**
   * Cheap, non-LLM structural check: does the extracted text actually look
   * like a resume — real employment/education entries — regardless of what
   * the file was named? Uses the same heuristic parser the resume pipeline
   * itself relies on, so "resume-shaped" means the same thing everywhere.
   * Pure text extraction, no side effects, safe to call speculatively.
   */
  private async looksLikeResume(buffer: Buffer, filename: string, mimeType: string): Promise<boolean> {
    try {
      const artifact = await fileNormalizer.normalizeDocument({
        buffer,
        filename,
        mimeType,
        sourceFileId: 'resume-detection',
      });
      const heuristics = parseResumeHeuristics(artifact.text);
      return heuristics.employment.length > 0 || heuristics.education.length > 0;
    } catch (err) {
      logger.debug({ err, filename }, 'Resume content detection failed, falling back to generic document ingestion');
      return false;
    }
  }

  private async ingestDocument(
    userId: string,
    buffer: Buffer,
    filename: string,
    mimeType: string,
    sourceFileId: string,
    caption?: string,
  ): Promise<Omit<UnifiedIngestResult, 'userFileId' | 'processingStatus'>> {
    const artifact = await fileNormalizer.normalizeDocument({
      buffer,
      filename,
      mimeType,
      sourceFileId,
    });

    // Fold the composer prompt into the SAME text the document analyzer
    // reads, so a caption like "focus on the education section" or "this is
    // about my breakup" is part of the one pass that extracts entries — not
    // a second, disconnected signal the analyzer never sees.
    const analysisArtifact = caption?.trim()
      ? { ...artifact, text: `[User note: ${caption.trim()}]\n\n${artifact.text}` }
      : artifact;

    const result = await documentService.processDocumentFromArtifact(userId, analysisArtifact);

    await this.runGraphRecovery(userId, sourceFileId);

    const derivedCounts = {
      moments: result.entriesCreated,
      facts: 0,
      entities: result.charactersCreated,
      relationships: 0,
      events: 0,
    };

    await userFileRegistry.updateDerivedCounts(sourceFileId, derivedCounts);

    for (const entryId of result.entryIds) {
      await userFileRegistry.appendProvenanceLink(sourceFileId, { type: 'journal_entry', id: entryId });
    }

    return {
      derivedCounts,
      momentsCreated: result.entriesCreated,
      charactersCreated: result.charactersCreated,
      sectionsCreated: result.sectionsCreated,
      entryIds: result.entryIds,
    };
  }

  private async ingestResume(
    userId: string,
    buffer: Buffer,
    filename: string,
    mimeType: string,
    sourceFileId: string,
    caption?: string,
  ): Promise<Omit<UnifiedIngestResult, 'userFileId' | 'processingStatus'>> {
    const artifact = await fileNormalizer.normalizeDocument({
      buffer,
      filename,
      mimeType,
      sourceFileId,
    });

    const duplicate = await this.findNearDuplicateResume(userId, artifact.text, sourceFileId);
    if (duplicate) {
      await userFileRegistry.updateDerivedCounts(sourceFileId, duplicate.file.derived_counts);
      await userFileRegistry.updateMetadata(sourceFileId, {
        duplicate_of_user_file_id: duplicate.file.id,
        duplicate_similarity: duplicate.similarity,
        deduplicated_at: new Date().toISOString(),
      });
      const currentFile = await userFileRegistry.getForUser(userId, sourceFileId);
      if (currentFile?.storage_url) {
        await userFileRegistry.deleteStoredBinary(currentFile);
      }
      const prior = resultFromCompletedFile(duplicate.file);
      return {
        ...prior,
        derivedCounts: duplicate.file.derived_counts,
        alreadyImported: true,
        duplicateOfUserFileId: duplicate.file.id,
        duplicateSimilarity: duplicate.similarity,
      };
    }

    const fileType = filename.toLowerCase().endsWith('.pdf')
      ? 'pdf'
      : filename.toLowerCase().endsWith('.docx')
        ? 'docx'
        : 'txt';

    const { document, claims, structured } = await resumeParsingService.processResumeFromText(
      userId,
      artifact.text,
      {
        fileName: filename,
        fileType: fileType as 'pdf' | 'docx' | 'txt',
        fileSize: buffer.length,
        sourceFileId,
      }
    );

    const createdClaims = await profileClaimsService.batchCreateClaims(userId, claims);

    const lore = await resumeLorePopulationService.populate(userId, structured, {
      sourceFileId,
      resumeDocumentId: document.id,
      fileName: filename,
    });

    const captionPrefix = caption?.trim() ? `[User note: ${caption.trim()}]\n\n` : '';
    const summaryEntry = await memoryService.saveEntry({
      userId,
      content: `${captionPrefix}[Resume: ${filename}]\n\n${artifact.text.slice(0, 4000)}`,
      tags: ['resume', 'career', 'imported'],
      source: 'document_upload',
      metadata: {
        ...PROVENANCE_META(sourceFileId),
        resume_document_id: document.id,
        claims_count: createdClaims.length,
        importedAt: new Date().toISOString(),
      },
    });

    // Profile claims remain the review queue. Do not mirror them into active
    // entity_facts during upload, where last_confirmed_at would make imported
    // assertions look like user-confirmed memory.
    const factsCreated = lore.facts;

    // Persist role conflicts on the resume document so the review UI can surface them.
    if (lore.roleConflicts.length > 0) {
      const { error: conflictError } = await supabaseAdmin
        .from('resume_documents')
        .update({
          parsed_data: {
            ...(document.parsed_data ?? {}),
            role_conflicts: lore.roleConflicts,
          },
        })
        .eq('id', document.id);
      if (conflictError) {
        logger.warn({ error: conflictError, userId }, 'Failed to persist resume role conflicts');
      }
    }

    await this.runGraphRecovery(userId, sourceFileId);

    const derivedCounts = {
      moments: lore.journalEntries + 1,
      facts: factsCreated,
      entities: lore.organizations,
      relationships: 0,
      events: lore.timelineEvents,
    };

    await userFileRegistry.updateDerivedCounts(sourceFileId, derivedCounts);
    for (const entryId of [summaryEntry.id, ...lore.entryIds]) {
      await userFileRegistry.appendProvenanceLink(sourceFileId, { type: 'journal_entry', id: entryId });
    }
    await userFileRegistry.appendProvenanceLink(sourceFileId, { type: 'resume_document', id: document.id });

    return {
      derivedCounts: {
        ...derivedCounts,
        characterAttributes: lore.characterAttributes,
      },
      momentsCreated: lore.journalEntries + 1,
      claimsCreated: createdClaims.length,
      entryIds: [summaryEntry.id, ...lore.entryIds],
      skillsCreated: lore.skills,
      organizationsCreated: lore.organizations,
      eventsCreated: lore.timelineEvents,
      projectsSuggested: lore.projectsSuggested,
      itemsReconciled: lore.itemsReconciled,
      roleConflicts: lore.roleConflicts,
      structured,
    };
  }

  private async findNearDuplicateResume(
    userId: string,
    rawText: string,
    sourceFileId: string,
  ): Promise<{ file: UserFileRecord; similarity: number } | null> {
    try {
      const [documents, files] = await Promise.all([
        resumeParsingService.getResumeDocuments(userId),
        userFileRegistry.listAllForUser(userId),
      ]);
      const completedFiles = new Map(
        files
          .filter((file) => file.processing_status === 'completed' && file.id !== sourceFileId)
          .map((file) => [file.id, file]),
      );

      let best: { file: UserFileRecord; similarity: number } | null = null;
      for (const document of documents.slice(0, 25)) {
        if (document.processing_status !== 'completed' || !document.raw_text) continue;
        const parsedData = document.parsed_data as { source_file_id?: string } | null;
        const priorFile = parsedData?.source_file_id
          ? completedFiles.get(parsedData.source_file_id)
          : undefined;
        if (!priorFile) continue;
        const similarity = resumeContentSimilarity(rawText, document.raw_text);
        if (similarity < RESUME_DUPLICATE_SIMILARITY_THRESHOLD) continue;
        if (!best || similarity > best.similarity) best = { file: priorFile, similarity };
      }
      return best;
    } catch (error) {
      logger.warn({ error, userId }, 'Resume near-duplicate lookup failed (continuing with import)');
      return null;
    }
  }

  private async runGraphRecovery(userId: string, sourceFileId: string): Promise<void> {
    try {
      const relStats = await relationshipFoundationService.recoverRelationshipGraph(userId);
      const eventStats = await eventRecoveryService.recoverMissingEvents(userId);

      await userFileRegistry.updateDerivedCounts(sourceFileId, {
        relationships: relStats.pairs ?? relStats.created + relStats.updated,
        events: eventStats.created,
      });
    } catch (error) {
      logger.warn({ error, userId, sourceFileId }, 'Graph recovery after file ingest failed (non-blocking)');
    }
  }
}

export const unifiedFileIngestionService = new UnifiedFileIngestionService();
