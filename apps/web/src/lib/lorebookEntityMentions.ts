export type ActiveLorebookMention = {
  start: number;
  end: number;
  search: string;
};

export function findActiveLorebookMention(
  value: string,
  caret = value.length,
): ActiveLorebookMention | null {
  const beforeCaret = value.slice(0, caret);
  const at = beforeCaret.lastIndexOf('@');
  if (at < 0 || (at > 0 && !/\s/.test(beforeCaret[at - 1]))) return null;
  const search = beforeCaret.slice(at + 1);
  if (/[\n@]/.test(search)) return null;
  return { start: at, end: caret, search };
}

export function replaceLorebookMention(
  value: string,
  mention: ActiveLorebookMention,
  entityName: string,
): { value: string; caret: number } {
  const replacement = `@${entityName}`;
  const next = `${value.slice(0, mention.start)}${replacement}${value.slice(mention.end)}`;
  return { value: next, caret: mention.start + replacement.length };
}
