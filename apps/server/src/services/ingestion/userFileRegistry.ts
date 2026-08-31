import { createHash } from 'crypto';

import { v4 as uuid } from 'uuid';

import { logger } from '../../logger';
import {
  categoryForMetadata,
  type DocumentCategory,
} from '../documents/documentCategories';
import { supabaseAdmin } from '../supabaseClient';

import type { IngestKind, UserFileDerivedCounts, UserFileRecord } from './types';

const EMPTY_COUNTS: UserFileDerivedCounts = {
  moments: 0,
  facts: 0,
  entities: 0,
  relationships: 0,
  events: 0,
};

const USER_FILES_BUCKET = 'user-files';
const SIGNED_URL_TTL_SECONDS = 3600;

export type UserFileListOptions = {
  page?: number;
  pageSize?: number;
  status?: UserFileRecord['processing_status'];
  kind?: IngestKind;
  category?: DocumentCategory;
};

export type UserFilePage = {
  files: UserFileRecord[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
};

function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function storagePathFor(userId: string, id: string, filename: string): string {
  return `${userId}/${id}-${filename}`;
}

function isHttpUrl(value: string): boolean {
  return value.startsWith('http://') || value.startsWith('https://');
}

export class UserFileRegistry {
  async registerOrReuse(
    userId: string,
    buffer: Buffer,
    params: {
      filename: string;
      mimeType: string;
      ingestKind: IngestKind;
      storeBinary?: boolean;
      documentCategory?: DocumentCategory;
    }
  ): Promise<UserFileRecord> {
    const hash = sha256(buffer);

    const { data: existing } = await supabaseAdmin
      .from('user_files')
      .select('*')
      .eq('user_id', userId)
      .eq('sha256', hash)
      .maybeSingle();

    if (existing && !existing.storage_url && params.storeBinary !== false) {
      const filePath = storagePathFor(userId, existing.id, existing.filename);
      const { error: uploadError } = await supabaseAdmin.storage
        .from(USER_FILES_BUCKET)
        .upload(filePath, buffer, {
          contentType: existing.mime_type || params.mimeType,
          upsert: true,
        });
      if (uploadError) {
        logger.warn({ error: uploadError, userId, filename: params.filename }, 'user_files storage restore failed');
      } else {
        const metadata = {
          ...((existing.metadata ?? {}) as Record<string, unknown>),
          source_deleted: false,
          source_restored_at: new Date().toISOString(),
          ...(params.documentCategory && existing.metadata?.document_category_source !== 'manual'
            ? { document_category: params.documentCategory }
            : {}),
        };
        const { data: restored, error: restoreError } = await supabaseAdmin
          .from('user_files')
          .update({ storage_url: filePath, metadata })
          .eq('id', existing.id)
          .eq('user_id', userId)
          .select('*')
          .single();
        if (restoreError) throw restoreError;
        return restored as UserFileRecord;
      }
    }

    if (existing) {
      const existingFile = existing as UserFileRecord;
      if (
        params.documentCategory &&
        existingFile.metadata?.document_category_source !== 'manual' &&
        categoryForMetadata(existingFile.metadata) !== params.documentCategory
      ) {
        const metadata = {
          ...(existingFile.metadata ?? {}),
          document_category: params.documentCategory,
        };
        const { data: moved, error: moveError } = await supabaseAdmin
          .from('user_files')
          .update({ metadata })
          .eq('id', existingFile.id)
          .eq('user_id', userId)
          .select('*')
          .single();
        if (moveError) throw moveError;
        return moved as UserFileRecord;
      }
      return existingFile;
    }

    const id = uuid();
    const row = {
      id,
      user_id: userId,
      filename: params.filename,
      mime_type: params.mimeType,
      sha256: hash,
      storage_url: null,
      processing_status: 'pending' as const,
      ingest_kind: params.ingestKind,
      derived_counts: EMPTY_COUNTS,
      metadata: params.documentCategory
        ? { document_category: params.documentCategory }
        : {},
    };

    const { data, error } = await supabaseAdmin
      .from('user_files')
      .insert(row)
      .select('*')
      .single();

    if (error) {
      // The SHA-256 unique key is the concurrency boundary. A second request
      // racing the first registration should reuse its row rather than create
      // a second source object or fail the upload.
      if (error.code === '23505') {
        const { data: concurrent } = await supabaseAdmin
          .from('user_files')
          .select('*')
          .eq('user_id', userId)
          .eq('sha256', hash)
          .maybeSingle();
        if (concurrent) return concurrent as UserFileRecord;
      }
      logger.error({ error, userId }, 'Failed to register user_file');
      throw error;
    }

    const registered = data as UserFileRecord;
    if (params.storeBinary === false) return registered;

    const filePath = storagePathFor(userId, registered.id, params.filename);
    const { error: uploadError } = await supabaseAdmin.storage
      .from(USER_FILES_BUCKET)
      .upload(filePath, buffer, {
        contentType: params.mimeType,
        upsert: false,
      });

    if (uploadError) {
      logger.warn({ error: uploadError, userId, filename: params.filename }, 'user_files storage upload failed');
      return registered;
    }

    // Private bucket: store object path; sign at read time.
    const { data: withStorage, error: storageUpdateError } = await supabaseAdmin
      .from('user_files')
      .update({ storage_url: filePath })
      .eq('id', registered.id)
      .eq('user_id', userId)
      .select('*')
      .single();
    if (storageUpdateError) throw storageUpdateError;
    return withStorage as UserFileRecord;
  }

  async setStatus(
    fileId: string,
    status: UserFileRecord['processing_status'],
    errorMessage?: string | null
  ): Promise<void> {
    const { data } = await supabaseAdmin
      .from('user_files')
      .select('metadata')
      .eq('id', fileId)
      .single();
    const metadata = (data?.metadata ?? {}) as Record<string, unknown>;
    const now = new Date().toISOString();
    await supabaseAdmin
      .from('user_files')
      .update({
        processing_status: status,
        error_message: errorMessage ?? null,
        metadata: {
          ...metadata,
          ...(status === 'processing' ? { processing_started_at: now } : {}),
          ...(status === 'completed' || status === 'failed' ? { processing_finished_at: now } : {}),
        },
      })
      .eq('id', fileId);
  }

  async tryClaimProcessing(
    fileId: string,
    expectedStatus: Extract<UserFileRecord['processing_status'], 'pending' | 'failed'>,
  ): Promise<boolean> {
    const { data: current, error: readError } = await supabaseAdmin
      .from('user_files')
      .select('metadata')
      .eq('id', fileId)
      .maybeSingle();
    if (readError) throw readError;
    const metadata = {
      ...((current?.metadata ?? {}) as Record<string, unknown>),
      processing_started_at: new Date().toISOString(),
    };
    const { data, error } = await supabaseAdmin
      .from('user_files')
      .update({
        processing_status: 'processing',
        error_message: null,
        metadata,
      })
      .eq('id', fileId)
      .eq('processing_status', expectedStatus)
      .select('id')
      .maybeSingle();

    if (error) throw error;
    return Boolean(data);
  }

  async reclaimStaleProcessing(fileId: string, staleBefore: string): Promise<boolean> {
    const { data, error } = await supabaseAdmin
      .from('user_files')
      .update({
        processing_status: 'pending',
        error_message: null,
      })
      .eq('id', fileId)
      .eq('processing_status', 'processing')
      .lt('metadata->>processing_started_at', staleBefore)
      .select('id')
      .maybeSingle();

    if (error) throw error;
    return Boolean(data);
  }

  async updateDerivedCounts(fileId: string, counts: Partial<UserFileDerivedCounts>): Promise<void> {
    const { data } = await supabaseAdmin.from('user_files').select('derived_counts').eq('id', fileId).single();

    const current = (data?.derived_counts ?? EMPTY_COUNTS) as UserFileDerivedCounts;
    const merged: UserFileDerivedCounts = {
      moments: counts.moments ?? current.moments,
      facts: counts.facts ?? current.facts,
      entities: counts.entities ?? current.entities,
      relationships: counts.relationships ?? current.relationships,
      events: counts.events ?? current.events,
    };

    await supabaseAdmin.from('user_files').update({ derived_counts: merged }).eq('id', fileId);
  }

  async appendProvenanceLink(
    fileId: string,
    link: { type: string; id: string }
  ): Promise<void> {
    const { data } = await supabaseAdmin.from('user_files').select('metadata').eq('id', fileId).single();
    const meta = (data?.metadata ?? {}) as Record<string, unknown>;
    const links = Array.isArray(meta.provenance_links) ? [...meta.provenance_links] : [];
    links.push(link);
    await supabaseAdmin
      .from('user_files')
      .update({ metadata: { ...meta, provenance_links: links } })
      .eq('id', fileId);
  }

  async updateMetadata(fileId: string, patch: Record<string, unknown>): Promise<Record<string, unknown>> {
    const { data, error } = await supabaseAdmin
      .from('user_files')
      .select('metadata')
      .eq('id', fileId)
      .single();
    if (error) throw error;
    const metadata = {
      ...((data?.metadata ?? {}) as Record<string, unknown>),
      ...patch,
    };
    const { error: updateError } = await supabaseAdmin
      .from('user_files')
      .update({ metadata })
      .eq('id', fileId);
    if (updateError) throw updateError;
    return metadata;
  }

  async setDocumentCategoryForUser(
    userId: string,
    fileId: string,
    category: DocumentCategory,
  ): Promise<UserFileRecord | null> {
    const current = await this.getForUser(userId, fileId);
    if (!current) return null;

    const metadata = {
      ...(current.metadata ?? {}),
      document_category: category,
      document_category_source: 'manual',
      document_category_updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabaseAdmin
      .from('user_files')
      .update({ metadata })
      .eq('id', fileId)
      .eq('user_id', userId)
      .select('*')
      .maybeSingle();
    if (error) throw error;
    return (data as UserFileRecord | null) ?? null;
  }

  async setAutoDocumentCategoryForUser(
    userId: string,
    fileId: string,
    category: DocumentCategory,
    classification: { confidence: number; reason: string },
  ): Promise<UserFileRecord | null> {
    const current = await this.getForUser(userId, fileId);
    if (!current || current.metadata?.document_category_source === 'manual') return current;

    const metadata = {
      ...(current.metadata ?? {}),
      document_category: category,
      document_category_source: 'automatic',
      document_category_confidence: classification.confidence,
      document_category_reason: classification.reason,
      document_category_updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabaseAdmin
      .from('user_files')
      .update({ metadata })
      .eq('id', fileId)
      .eq('user_id', userId)
      .select('*')
      .maybeSingle();
    if (error) throw error;
    return (data as UserFileRecord | null) ?? null;
  }

  async downloadBuffer(
    file: Pick<UserFileRecord, 'user_id' | 'id' | 'filename' | 'storage_url'>
  ): Promise<Buffer> {
    const storagePath = this.resolveStoragePath(file);
    if (!storagePath) throw new Error('The source archive has already been deleted.');
    const { data, error } = await supabaseAdmin.storage.from(USER_FILES_BUCKET).download(storagePath);
    if (error || !data) {
      logger.warn({ error, storagePath, userId: file.user_id }, 'Failed to download private user file');
      throw error ?? new Error('Could not download source archive');
    }
    return Buffer.from(await data.arrayBuffer());
  }

  async deleteStoredBinary(
    file: Pick<UserFileRecord, 'user_id' | 'id' | 'filename' | 'storage_url'>
  ): Promise<void> {
    const storagePath = this.resolveStoragePath(file);
    if (storagePath) {
      const { error } = await supabaseAdmin.storage.from(USER_FILES_BUCKET).remove([storagePath]);
      if (error) {
        logger.warn({ error, storagePath, userId: file.user_id }, 'Failed to delete private user file');
        throw error;
      }
    }
    await this.updateMetadata(file.id, {
      source_deleted: true,
      source_deleted_at: new Date().toISOString(),
    });
    const { error } = await supabaseAdmin
      .from('user_files')
      .update({ storage_url: null })
      .eq('id', file.id)
      .eq('user_id', file.user_id);
    if (error) throw error;
  }

  async listPageForUser(userId: string, options: UserFileListOptions = {}): Promise<UserFilePage> {
    const page = Math.max(1, options.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 25));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    let query = supabaseAdmin
      .from('user_files')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('uploaded_at', { ascending: false })
      .range(from, to);
    if (options.status) query = query.eq('processing_status', options.status);
    if (options.kind) query = query.eq('ingest_kind', options.kind);
    if (options.category === 'unfiled') {
      query = query.or('metadata->>document_category.is.null,metadata->>document_category.eq.unfiled');
    } else if (options.category) {
      query = query.eq('metadata->>document_category', options.category);
    }

    const { data, error, count } = await query;

    if (error) {
      logger.error({ error, userId }, 'Failed to list user files');
      throw error;
    }
    const files = (data ?? []) as UserFileRecord[];
    return {
      files,
      page,
      pageSize,
      total: count ?? files.length,
      hasMore: from + files.length < (count ?? files.length),
    };
  }

  async listForUser(userId: string, options: UserFileListOptions = {}): Promise<UserFileRecord[]> {
    const page = await this.listPageForUser(userId, options);
    return page.files;
  }

  async listAllForUser(userId: string): Promise<UserFileRecord[]> {
    const { data, error } = await supabaseAdmin
      .from('user_files')
      .select('*')
      .eq('user_id', userId)
      .order('uploaded_at', { ascending: false });

    if (error) {
      logger.error({ error, userId }, 'Failed to list user files');
      throw error;
    }
    return (data ?? []) as UserFileRecord[];
  }

  async getForUser(userId: string, fileId: string): Promise<UserFileRecord | null> {
    const { data, error } = await supabaseAdmin
      .from('user_files')
      .select('*')
      .eq('user_id', userId)
      .eq('id', fileId)
      .maybeSingle();

    if (error) {
      logger.error({ error, userId, fileId }, 'Failed to get user file');
      throw error;
    }
    return (data as UserFileRecord) ?? null;
  }

  resolveStoragePath(file: Pick<UserFileRecord, 'user_id' | 'id' | 'filename' | 'storage_url'>): string | null {
    if (!file.storage_url) return null;
    if (isHttpUrl(file.storage_url)) {
      const marker = `/object/public/${USER_FILES_BUCKET}/`;
      const idx = file.storage_url.indexOf(marker);
      if (idx >= 0) return file.storage_url.slice(idx + marker.length);
      return null;
    }
    return file.storage_url;
  }

  async createSignedDownloadUrl(
    file: Pick<UserFileRecord, 'user_id' | 'id' | 'filename' | 'storage_url'>,
    expiresInSeconds = SIGNED_URL_TTL_SECONDS
  ): Promise<string | null> {
    const storagePath = this.resolveStoragePath(file);
    if (!storagePath) return null;

    const { data, error } = await supabaseAdmin.storage
      .from(USER_FILES_BUCKET)
      .createSignedUrl(storagePath, expiresInSeconds);

    if (error) {
      logger.warn({ error, storagePath, userId: file.user_id }, 'Failed to create signed download URL');
      return null;
    }

    return data.signedUrl;
  }
}

export const userFileRegistry = new UserFileRegistry();
