export type CertifiedEntityType = 'character' | 'location' | 'organization' | 'skill' | 'event';

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
};
