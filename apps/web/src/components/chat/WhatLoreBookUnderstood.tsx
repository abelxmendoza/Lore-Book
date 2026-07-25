import { useMemo, useState } from 'react';
import { Brain, ChevronDown, ChevronRight } from 'lucide-react';

import { decomposePersonIntro } from '../../lib/personIntroDecomposition';

type Props = {
  messageContent?: string;
  visible?: boolean;
};

type UnderstoodSection = {
  title: string;
  items: string[];
};

/**
 * Compact "What LoreBook understood" surface for multi-knowledge turns.
 * Client-side mirror of contextual lore heuristics for immediate feedback.
 */
export function WhatLoreBookUnderstood({ messageContent, visible = true }: Props) {
  const [expanded, setExpanded] = useState(false);
  const sections = useMemo(() => buildSections(messageContent ?? ''), [messageContent]);

  if (!visible || sections.length === 0) return null;

  return (
    <div className="mt-2 rounded-lg border border-white/10 bg-black/25 px-3 py-2">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="flex items-center gap-1.5 text-xs font-medium text-white/70">
          <Brain className="h-3.5 w-3.5 text-primary/80" />
          What LoreBook understood
        </span>
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-white/40" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-white/40" />
        )}
      </button>
      {expanded && (
        <div className="mt-2 space-y-2 border-t border-white/10 pt-2">
          {sections.map((section) => (
            <div key={section.title}>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-white/45">
                {section.title}
              </p>
              <ul className="mt-1 space-y-0.5">
                {section.items.map((item) => (
                  <li key={item} className="text-xs text-white/75">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function buildSections(text: string): UnderstoodSection[] {
  if (!text.trim()) return [];
  const sections: UnderstoodSection[] = [];

  const tellAbout = text.match(
    /\b(?:i want to tell you about|let me tell you about)\s+([^.…\n]{1,80})/i,
  );
  if (tellAbout) {
    const d = decomposePersonIntro(tellAbout[1]);
    if (d.canonicalName) {
      const bits = [
        d.canonicalName,
        d.rolePhrase ? `Role: ${d.rolePhrase}` : null,
        d.supportsAnchor ? `Supports: ${d.supportsAnchor}` : null,
      ].filter(Boolean) as string[];
      sections.push({ title: 'People', items: bits });
    }
  }

  const group = text.match(
    /\b(?:(?:that(?:'|’)s|thats|called|named)\s+)([A-ZÀ-Ý][^.\n]{3,80}?(?:Support Team|Care Team|Support Network))\b/i,
  );
  if (group) {
    sections.push({ title: 'Groups', items: [group[1].trim()] });
  }

  const events: string[] = [];
  if (/\bdistrokid\b/i.test(text) && /\b(?:first time|account)\b/i.test(text)) {
    events.push('First DistroKid account / distribution upload');
  }
  if (/\brivian\b/i.test(text) && /\b(?:interview|phone call|video call|recruit)\b/i.test(text)) {
    events.push('Agency-mediated Rivian interview (phone + video)');
  }
  if (/\b(?:working on|building)\s+lore\s*book\b/i.test(text)) {
    events.push('Returned to working on LoreBook');
  }
  if (/\bsocial worker|support team|living room\b/i.test(text)) {
    events.push('Support-team visit (unnamed visitors unresolved)');
  }
  if (events.length) sections.push({ title: 'Events / milestones', items: events });

  const reflections: string[] = [];
  if (/\b(?:need something like that|therapist|therapy)\b/i.test(text)) {
    reflections.push('Considering human support / possible therapy (uncertain, not a diagnosis)');
  }
  if (/\bwaste of time|ambitious|busy\b/i.test(text) && /\bneed\b/i.test(text)) {
    reflections.push('Ambition vs support tension preserved');
  }
  if (/\bnothing (?:beats|replaces) real people\b/i.test(text)) {
    reflections.push('LoreBook cannot replace real people');
  }
  if (reflections.length) sections.push({ title: 'Reflections', items: reflections });

  return sections;
}
