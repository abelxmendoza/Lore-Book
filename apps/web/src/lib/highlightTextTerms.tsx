import type { ReactNode } from 'react';

/**
 * Split plain text and wrap case-insensitive word-boundary matches of `terms`
 * in a highlight mark. Longer terms win when they overlap.
 */
export function highlightTextTerms(
  text: string,
  terms: string[],
  options?: { className?: string; markTestId?: string },
): ReactNode {
  const cleaned = terms
    .map((t) => t.trim())
    .filter((t) => t.length >= 2)
    .sort((a, b) => b.length - a.length);
  if (!text || cleaned.length === 0) return text;

  const escaped = cleaned.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp(`\\b(${escaped.join('|')})\\b`, 'gi');
  const className =
    options?.className ??
    'rounded-sm bg-sky-400/35 text-sky-50 px-0.5 ring-1 ring-sky-400/40';
  const markTestId = options?.markTestId ?? 'chat-name-highlight';

  const nodes: ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = re.exec(text)) != null) {
    if (match.index > last) {
      nodes.push(text.slice(last, match.index));
    }
    nodes.push(
      <mark key={`h-${i++}-${match.index}`} className={className} data-testid={markTestId}>
        {match[0]}
      </mark>,
    );
    last = match.index + match[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  if (nodes.length === 0) return text;
  return <>{nodes}</>;
}

/** Apply highlight terms to markdown/React children when they are plain strings. */
export function withHighlightedTerms(children: ReactNode, terms: string[]): ReactNode {
  if (!terms.length) return children;
  if (typeof children === 'string') {
    return highlightTextTerms(children, terms);
  }
  if (Array.isArray(children)) {
    return children.map((child, i) => <span key={i}>{withHighlightedTerms(child, terms)}</span>);
  }
  return children;
}
