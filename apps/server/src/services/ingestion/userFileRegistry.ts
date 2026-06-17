import { createHash } from 'crypto';
import { v4 as uuid } from 'uuid';

import { config } from '../../config';
import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

import type { IngestKind, UserFileDerivedCounts, UserFileRecord } from './types';

const EMPTY_COUNTS: UserFileDerivedCounts = {
  moments: 0,
  facts: 0,
  entities: 0,
  relationships: 0,
  events: 0,
};

function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
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
    }
  ): Promise<UserFileRecord> {
    const hash = sha256(buffer);

    const { data: existing } = await supabaseAdmin
      .from('user_files')
      .select('*')
      .eq('user_id', userId)
      .eq('sha256', hash)
      .maybeSingle();

    if (existing) {
      return existing as UserFileRecord;
    }

    const id = uuid();
    let storageUrl: string | null = null;

    if (params.storeBinary !== false) {
      const filePath = `${userId}/${id}-${params.filename}`;
      const { error: uploadError } = await supabaseAdmin.storage
        .from('user-files')
        .upload(filePath, buffer, {
          contentType: params.mimeType,
          upsert: false,
        });

      if (uploadError) {
        logger.warn({ error: uploadError, userId, filename: params.filename }, 'user_files storage upload failed');
      } else {
        storageUrl = `${config.supabaseUrl}/storage/v1/object/public/user-files/${filePath}`;
      }
    }

    const row = {
      id,
      user_id: userId,
      filename: params.filename,
      mime_type: params.mimeType,
      sha256: hash,
      storage_url: storageUrl,
      processing_status: 'pending' as const,
      ingest_kind: params.ingestKind,
      derived_counts: EMPTY_COUNTS,
      metadata: {},
    };

    const { data, error } = await supabaseAdmin.from('user_files').insert(row).select('*').single();

    if (error) {
      logger.error({ error, userId }, 'Failed to register user_file');
      throw error;
    }

    return data as UserFileRecord;
  }

  async setStatus(
    fileId: string,
    status: UserFileRecord['processing_status'],
    errorMessage?: string | null
  ): Promise<void> {
    await supabaseAdmin
      .from('user_files')
      .update({
        processing_status: status,
        error_message: errorMessage ?? null,
      })
      .eq('id', fileId);
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
}

export const userFileRegistry = new UserFileRegistry();
