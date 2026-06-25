export type CertifiedEntityType =
  | 'character'
  | 'location'
  | 'organization'
  | 'skill'
  | 'event'
  | 'project'
  | 'thing';

export type EntityStatus = 'confirmed' | 'suggestion' | 'draft';

/** Character overlay — romantic interests get their own highlight/chip color. */
export type CharacterVariant = 'romantic';

export type CertifiedEntity = {
  id: string;
  name: string;
  type: CertifiedEntityType;
  aliases: string[];
  mentionKeys: string[];
  /** confirmed = book card; suggestion = pending review in a book */
  status?: EntityStatus;
  /** When set on type character, use romantic styling (rose) instead of default (violet). */
  characterVariant?: CharacterVariant;
  /** Archived cards stay mentionable in chat — tap ✓ to restore to the book */
  lifecycleStatus?: 'archived' | 'pending_deletion';
  /**
   * Presentation/domain override for concepts that share a storage type today.
   * Example: pets are still character cards; significant objects may be tracked
   * as thing chips before a dedicated Things book exists.
   */
  loreKind?: 'person' | 'pet' | 'place' | 'group' | 'organization' | 'skill' | 'project' | 'event' | 'memory' | 'relationship' | 'thing';
  promotionStage?: 'track' | 'growing' | 'suggest' | 'confirmed';
  significanceScore?: number;
  mentionCount?: number;
};
