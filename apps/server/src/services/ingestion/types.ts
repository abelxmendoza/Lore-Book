export type UserFileDerivedCounts = {
  moments: number;
  facts: number;
  entities: number;
  relationships: number;
  events: number;
};

export type UserFileRecord = {
  id: string;
  user_id: string;
  filename: string;
  mime_type: string;
  sha256: string;
  storage_url: string | null;
  uploaded_at: string;
  processing_status: 'pending' | 'processing' | 'completed' | 'failed';
  ingest_kind: string | null;
  derived_counts: UserFileDerivedCounts;
  metadata: Record<string, unknown>;
  error_message: string | null;
};

export type NormalizedArtifact = {
  text: string;
  mediaRefs: string[];
  detectedDate: string | null;
  sourceFileId: string;
  mimeType: string;
  filename: string;
};

export type IngestKind = 'document' | 'resume' | 'photo' | 'voice' | 'chat_import';

export type UnifiedIngestResult = {
  userFileId: string;
  processingStatus: 'completed' | 'failed';
  derivedCounts: UserFileDerivedCounts;
  momentsCreated?: number;
  charactersCreated?: number;
  sectionsCreated?: number;
  claimsCreated?: number;
  entryIds?: string[];
  error?: string;
};
