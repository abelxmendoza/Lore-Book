export type LoreBookNoticeDomain =
  | 'characters'
  | 'locations'
  | 'skills'
  | 'projects'
  | 'quests';

export type LoreBookNoticeItem = {
  domain: LoreBookNoticeDomain;
  name: string;
  confidence: number;
};

export type LoreBookNoticeEvent = {
  chatMessageId: string;
  userId: string;
  timestamp: string;
  items: LoreBookNoticeItem[];
};
