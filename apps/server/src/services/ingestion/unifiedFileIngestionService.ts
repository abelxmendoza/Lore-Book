import { logger } from '../../logger';
import { documentService } from '../documentService';
import { relationshipFoundationService } from '../relationshipFoundationService';
import { eventRecoveryService } from '../eventRecoveryService';
import { profileClaimsService } from '../profileClaims/profileClaimsService';
import { resumeParsingService } from '../profileClaims/resumeParsingService';
import { resumeLorePopulationService } from '../profileClaims/resumeLorePopulationService';
import { memoryService } from '../memoryService';
import { supabaseAdmin } from '../supabaseClient';

import { fileNormalizer } from './fileNormalizer';
import { userFileRegistry } from './userFileRegistry';
import type { IngestKind, UnifiedIngestResult } from './types';

const PROVENANCE_META = (sourceFileId: string) => ({
  source_file_id: sourceFileId,
  user_file_id: sourceFileId,
  provenance: 'file_upload',
});

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
  }): Promise<UnifiedIngestResult> {
    const { userId, buffer, filename, mimeType, kind } = params;

    const userFile = await userFileRegistry.registerOrReuse(userId, buffer, {
      filename,
      mimeType,
      ingestKind: kind,
      storeBinary: params.storeBinary,
    });

    if (userFile.processing_status === 'completed') {
      return {
        userFileId: userFile.id,
        processingStatus: 'completed',
        derivedCounts: userFile.derived_counts,
      };
    }

    await userFileRegistry.setStatus(userFile.id, 'processing');

    try {
      const result =
        kind === 'resume'
          ? await this.ingestResume(userId, buffer, filename, mimeType, userFile.id)
          : await this.ingestDocument(userId, buffer, filename, mimeType, userFile.id);

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

  private async ingestDocument(
    userId: string,
    buffer: Buffer,
    filename: string,
    mimeType: string,
    sourceFileId: string
  ): Promise<Omit<UnifiedIngestResult, 'userFileId' | 'processingStatus'>> {
    const artifact = await fileNormalizer.normalizeDocument({
      buffer,
      filename,
      mimeType,
      sourceFileId,
    });

    const result = await documentService.processDocumentFromArtifact(userId, artifact);

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
    sourceFileId: string
  ): Promise<Omit<UnifiedIngestResult, 'userFileId' | 'processingStatus'>> {
    const artifact = await fileNormalizer.normalizeDocument({
      buffer,
      filename,
      mimeType,
      sourceFileId,
    });

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

    const summaryEntry = await memoryService.saveEntry({
      userId,
      content: `[Resume: ${filename}]\n\n${artifact.text.slice(0, 4000)}`,
      date: artifact.detectedDate ?? new Date().toISOString(),
      tags: ['resume', 'career', 'imported'],
      source: 'document_upload',
      metadata: {
        ...PROVENANCE_META(sourceFileId),
        resume_document_id: document.id,
        claims_count: createdClaims.length,
      },
    });

    const factsCreated =
      (await this.promoteResumeClaimsToEntityFacts(userId, createdClaims, sourceFileId)) + lore.facts;

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
      structured,
    };
  }

  private async promoteResumeClaimsToEntityFacts(
    userId: string,
    claims: Array<{ id: string; claim_text: string; claim_type: string; confidence: number }>,
    sourceFileId: string
  ): Promise<number> {
    const { data: meChar } = await supabaseAdmin
      .from('characters')
      .select('id')
      .eq('user_id', userId)
      .ilike('name', 'me')
      .maybeSingle();

    if (!meChar?.id || !claims.length) return 0;

    let created = 0;
    for (const claim of claims) {
      const category =
        claim.claim_type === 'role' || claim.claim_type === 'experience'
          ? 'career'
          : claim.claim_type === 'education'
            ? 'history'
            : 'general';

      const { error } = await supabaseAdmin.from('entity_facts').insert({
        user_id: userId,
        entity_id: meChar.id,
        entity_type: 'character',
        fact: claim.claim_text,
        category,
        confidence: claim.confidence ?? 0.75,
        mention_count: 1,
        status: 'active',
        first_seen_at: new Date().toISOString(),
        last_confirmed_at: new Date().toISOString(),
      });

      if (!error) {
        created++;
        await userFileRegistry.appendProvenanceLink(sourceFileId, {
          type: 'entity_fact',
          id: claim.id,
        });
      }
    }

    return created;
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
