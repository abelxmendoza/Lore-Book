import { z } from 'zod';

/** Semantic content class for a message before lore extraction. */
export const LORE_CONTENT_CLASSIFICATIONS = [
  'personal_lore',
  'software_development',
  'mixed',
  'instruction',
  'generated_content',
  'hypothetical',
  'unknown',
] as const;

/** Speaker / authority for a source utterance. */
export const LORE_SOURCE_AUTHORITIES = ['user', 'assistant', 'system', 'tool'] as const;

/** Known external conversation providers (extensible via string). */
export const LORE_EXTERNAL_CONVERSATION_PROVIDERS = [
  'chatgpt',
  'claude',
  'gemini',
  'discord',
  'slack',
  'sms',
  'email',
  'manual',
  'unknown',
] as const;

export const loreContentClassificationSchema = z.enum(LORE_CONTENT_CLASSIFICATIONS);
export const loreSourceAuthoritySchema = z.enum(LORE_SOURCE_AUTHORITIES);
export const loreExternalConversationProviderSchema = z.enum(LORE_EXTERNAL_CONVERSATION_PROVIDERS);

export type LoreContentClassification = z.infer<typeof loreContentClassificationSchema>;
export type LoreSourceAuthority = z.infer<typeof loreSourceAuthoritySchema>;
export type LoreExternalConversationProvider = z.infer<typeof loreExternalConversationProviderSchema>;

export type ExternalConversationSourceRef = {
  type: 'external_conversation';
  provider: string;
  conversationId?: string;
  importId?: string;
  filename?: string;
  importedAt?: string;
};

export const externalConversationSourceRefSchema = z.object({
  type: z.literal('external_conversation'),
  provider: z.string().trim().min(1).max(64),
  conversationId: z.string().trim().min(1).max(240).optional(),
  importId: z.string().trim().min(1).max(240).optional(),
  filename: z.string().trim().min(1).max(512).optional(),
  importedAt: z.string().datetime().optional(),
});

export const loreImportMessageSchema = z.object({
  id: z.string().trim().min(1).max(240).optional(),
  index: z.number().int().nonnegative().optional(),
  role: loreSourceAuthoritySchema,
  text: z.string().trim().min(1).max(200_000),
  timestamp: z.string().datetime().optional(),
});

export const loreImportPackageSchema = z.object({
  source: externalConversationSourceRefSchema,
  items: z.array(loreImportMessageSchema).min(1).max(10_000),
});

export type LoreImportMessage = z.infer<typeof loreImportMessageSchema>;
export type LoreImportPackage = z.infer<typeof loreImportPackageSchema>;

export type ClassifiedImportMessage = LoreImportMessage & {
  messageKey: string;
  classification: LoreContentClassification;
  /** Text eligible for personal-lore extraction (null when none). */
  personalLoreText: string | null;
  /** Whether downstream extraction/MRQ should consider this message. */
  eligibleForExtraction: boolean;
  /** Why extraction was included or excluded. */
  extractionReason: string;
  sourceAuthority: LoreSourceAuthority;
};

export type ClassifiedImportPackage = {
  source: ExternalConversationSourceRef;
  items: ClassifiedImportMessage[];
  summary: Record<LoreContentClassification, number>;
};

/** How a claim relates to evidence — prevents flattening reports/allegations into objective fact. */
export const LORE_CLAIM_EPISTEMIC_KINDS = [
  'direct_autobiographical',
  'reported_communication',
  'third_party_allegation',
  'user_interpretation',
  'assistant_inference',
  'unknown',
] as const;

export const loreClaimEpistemicKindSchema = z.enum(LORE_CLAIM_EPISTEMIC_KINDS);
export type LoreClaimEpistemicKind = z.infer<typeof loreClaimEpistemicKindSchema>;
