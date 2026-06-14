export type CertifiedEntityType = 'character' | 'location' | 'organization' | 'skill' | 'event';

export type CertifiedEntity = {
  id: string;
  name: string;
  type: CertifiedEntityType;
  aliases: string[];
  mentionKeys: string[];
};
