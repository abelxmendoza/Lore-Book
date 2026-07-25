import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, Sparkles } from 'lucide-react';
import { Badge } from '../../../components/ui/badge';
import {
  buildChatSourcesClipboardText,
  rankChatSourcesForDisplay,
} from '../../../lib/chatSourcesClipboard';
import { copyTextToClipboard } from '../../../lib/listClipboard';
import type { ChatSource } from '../message/ChatMessage';
import { SOURCE_TYPE_LABELS } from '../message/ChatMessage';

type ChatSourcesBarProps = {
  sources?: ChatSource[];
  onSourceClick?: (source: ChatSource) => void;
};

export const ChatSourcesBar = ({ sources, onSourceClick }: ChatSourcesBarProps) => {
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    };
  }, []);

  const ranked = useMemo(() => rankChatSourcesForDisplay(sources ?? []), [sources]);

  const visible = useMemo(
    () => ranked.filter((source) => source.usage !== 'rejected'),
    [ranked],
  );
  const groupedSources = useMemo(() => {
    return visible.reduce((acc, source) => {
      if (!acc[source.type]) acc[source.type] = [];
      acc[source.type].push(source);
      return acc;
    }, {} as Record<string, ChatSource[]>);
  }, [visible]);

  if (visible.length === 0) return null;

  const handleCopyAll = async () => {
    const text = buildChatSourcesClipboardText(ranked, {
      filters: ['conversation evidence consulted — not every item is quoted in the reply'],
    });
    const ok = await copyTextToClipboard(text);
    if (!ok) return;
    setCopied(true);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="px-4 py-2 border-t border-border/30 bg-black/20 chat-sources-bar"
      data-testid="chat-sources-bar"
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Sparkles className="h-3 w-3 text-primary/70 shrink-0" />
            <span className="text-xs font-semibold text-primary/70">Sources for this answer</span>
            <span className="text-xs text-white/40">({visible.length})</span>
          </div>
          <p className="text-[10px] text-white/35 mt-0.5 leading-snug">
            Supporting sources are cited or matched to the answer. Background sources were
            consulted but are not presented as direct support.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleCopyAll()}
          className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-md border border-white/10 text-[11px] text-white/55 hover:text-white hover:bg-white/5 touch-manipulation"
          title="Copy all consulted evidence as plain text"
          aria-label="Copy all conversation sources"
          data-testid="chat-sources-copy-all"
        >
          {copied ? (
            <Check className="h-3 w-3 text-emerald-400" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
          <span className="hidden sm:inline">{copied ? 'Copied' : 'Copy all'}</span>
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {visible.some((source) => source.usage === 'supporting') && (
          <span className="text-[10px] font-medium text-emerald-300/70 w-full">
            Sources supporting this answer
          </span>
        )}
        {Object.entries(groupedSources).map(([type, typeSources]) => (
          <div key={type} className="flex items-center gap-1">
            <Badge variant="outline" className="text-xs border-border/30 text-white/50">
              {SOURCE_TYPE_LABELS[type] ?? type}
            </Badge>
            {typeSources.slice(0, 3).map((source) => (
              <button
                key={`${source.type}:${source.id}`}
                type="button"
                onClick={() => onSourceClick?.(source)}
                className="flex items-center gap-1 px-2 py-0.5 rounded text-xs text-white/60 hover:text-white hover:bg-black/40 transition-colors max-w-[160px]"
                title={
                  [
                    source.title,
                    source.snippet,
                    source.relevanceScore != null ? `relevance ${source.relevanceScore}` : null,
                  ]
                    .filter(Boolean)
                    .join(' — ')
                }
              >
                <span className="truncate">{source.title}</span>
                {source.relevanceScore != null && (
                  <span className="shrink-0 text-[10px] tabular-nums text-primary/60">
                    {source.relevanceScore}
                  </span>
                )}
              </button>
            ))}
            {typeSources.length > 3 && (
              <span className="text-xs text-white/40">+{typeSources.length - 3}</span>
            )}
          </div>
        ))}
        {visible.some((source) => source.usage !== 'supporting') && (
          <span className="text-[10px] text-white/35 w-full mt-1">
            Consulted background: {visible.filter((source) => source.usage !== 'supporting').length}
          </span>
        )}
      </div>
    </div>
  );
};
