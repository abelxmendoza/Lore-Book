/** Plain-text export helpers for card/list surfaces. */

export type ClipboardField = {
  label: string;
  value?: string | number | boolean | null | string[];
};

export type ListClipboardFilterOptions = {
  /** Active UI constraints, e.g. `search="jamie"`, `stance=mine`. */
  filters?: string[];
};

/** Drop falsey / blank filter lines while preserving order. */
export function clipboardFilterLines(
  parts: Array<string | false | null | undefined>,
): string[] {
  return parts.filter((p): p is string => typeof p === 'string' && p.trim().length > 0);
}

export function formatClipboardFields(fields: ClipboardField[]): string {
  return fields
    .map(({ label, value }) => {
      if (value == null || value === '') return null;
      if (Array.isArray(value)) {
        const joined = value.map((v) => String(v).trim()).filter(Boolean).join(', ');
        if (!joined) return null;
        return `${label}: ${joined}`;
      }
      if (typeof value === 'boolean') return `${label}: ${value ? 'yes' : 'no'}`;
      const text = String(value).trim();
      if (!text) return null;
      return `${label}: ${text}`;
    })
    .filter(Boolean)
    .join('\n');
}

export function buildListClipboardText(options: {
  title: string;
  /** Constraints that produced this list (search, category, stance, sort, …). */
  filters?: string[];
  items: Array<{ heading: string; fields: ClipboardField[]; body?: string }>;
}): string {
  const header = `${options.title} (${options.items.length} item${options.items.length === 1 ? '' : 's'})`;
  const filterLines = (options.filters ?? []).map((f) => f.trim()).filter(Boolean);
  const filtersBlock = filterLines.length
    ? `\nFilters: ${filterLines.join('; ')}`
    : '';
  if (!options.items.length) return `${header}${filtersBlock}\n\n(empty)`;

  const blocks = options.items.map((item, index) => {
    const meta = formatClipboardFields(item.fields);
    const body = item.body?.trim() ? `\n${item.body.trim()}` : '';
    return `${index + 1}. ${item.heading}${meta ? `\n${meta}` : ''}${body}`;
  });

  return `${header}${filtersBlock}\n\n${blocks.join('\n\n')}`;
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}
