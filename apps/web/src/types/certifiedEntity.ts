export type CertifiedEntityType = 'character' | 'location' | 'organization' | 'skill' | 'event';

export type EntityStatus = 'confirmed' | 'suggestion';

export type CertifiedEntity = {
  id: string;
  name: string;
  type: CertifiedEntityType;
  aliases: string[];
  mentionKeys: string[];
  /** confirmed = book card; suggestion = pending review in a book */
  status?: EntityStatus;
};
