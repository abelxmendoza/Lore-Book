const KEYWORDS = ['save this', 'log', 'update', 'chapter', 'journal', 'remember', 'note'];

export const shouldPersistMessage = (message: string) => {
  const normalized = message.toLowerCase();
  return KEYWORDS.some((keyword) => normalized.includes(keyword));
};

export const extractTags = (message: string) => {
  const matches = message.match(/#(\w+)/g) ?? [];
  return matches.map((tag) => tag.replace('#', '').toLowerCase());
};
