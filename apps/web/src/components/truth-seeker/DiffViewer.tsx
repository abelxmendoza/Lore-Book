import { useMemo, useRef, useEffect } from 'react';
import { ScrollArea } from '../ui/scroll-area';

type DiffViewerProps = {
  leftText: string;
  rightText: string;
  leftLabel?: string;
  rightLabel?: string;
  onAcceptLeft?: () => void;
  onAcceptRight?: () => void;
};

// Simple line-by-line diff
const computeDiff = (text1: string, text2: string): Array<{ left: string | null; right: string | null; type: 'equal' | 'delete' | 'insert' }> => {
  const lines1 = text1.split('\n');
  const lines2 = text2.split('\n');
  const result: Array<{ left: string | null; right: string | null; type: 'equal' | 'delete' | 'insert' }> = [];
  
  const maxLen = Math.max(lines1.length, lines2.length);
  
  for (let i = 0; i < maxLen; i++) {
    const line1 = lines1[i];
    const line2 = lines2[i];
    
    if (line1 === line2) {
      result.push({ left: line1, right: line2, type: 'equal' });
    } else if (line1 === undefined) {
      result.push({ left: null, right: line2, type: 'insert' });
    } else if (line2 === undefined) {
      result.push({ left: line1, right: null, type: 'delete' });
    } else {
      result.push({ left: line1, right: null, type: 'delete' });
      result.push({ left: null, right: line2, type: 'insert' });
    }
  }
  
  return result;
};

export const DiffViewer = ({
  leftText,
  rightText,
  leftLabel = 'Original',
  rightLabel = 'Contradicting',
  onAcceptLeft,
  onAcceptRight,
}: DiffViewerProps) => {
  const leftScrollRef = useRef<HTMLDivElement>(null);
  const rightScrollRef = useRef<HTMLDivElement>(null);

  const diff = useMemo(() => computeDiff(leftText, rightText), [leftText, rightText]);

  // Synchronize scrolling
  useEffect(() => {
    const leftScroll = leftScrollRef.current;
    const rightScroll = rightScrollRef.current;

    if (!leftScroll || !rightScroll) return;

    const handleLeftScroll = () => {
      if (rightScroll) {
        rightScroll.scrollTop = leftScroll.scrollTop;
      }
    };

    const handleRightScroll = () => {
      if (leftScroll) {
        leftScroll.scrollTop = rightScroll.scrollTop;
      }
    };

    leftScroll.addEventListener('scroll', handleLeftScroll);
    rightScroll.addEventListener('scroll', handleRightScroll);

    return () => {
      leftScroll.removeEventListener('scroll', handleLeftScroll);
      rightScroll.removeEventListener('scroll', handleRightScroll);
    };
  }, []);

  const getLineClass = (type: string) => {
    switch (type) {
      case 'delete':
        return 'bg-red-500/20 border-l-4 border-red-500';
      case 'insert':
        return 'bg-green-500/20 border-l-4 border-green-500';
      case 'equal':
        return 'bg-transparent';
      default:
        return 'bg-yellow-500/10';
    }
  };

  return (
    <div className="flex flex-col h-full border border-border/60 rounded-lg bg-black/40 min-h-0">
      {/* Legend */}
      <div className="bg-black/60 border-b border-border/60 px-4 py-2 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-red-500/20 border-l-2 border-red-500" />
            <span className="text-white/60">Removed</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-green-500/20 border-l-2 border-green-500" />
            <span className="text-white/60">Added</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-transparent border-l-2 border-transparent" />
            <span className="text-white/60">Unchanged</span>
          </div>
        </div>
      </div>

      {/* Diff Panels */}
      <div className="flex flex-1 min-h-0">
        {/* Left Panel */}
        <div className="flex-1 flex flex-col border-r border-border/60 min-h-0">
          <div className="bg-black/60 border-b border-border/60 px-4 py-2 flex items-center justify-between flex-shrink-0">
            <span className="text-sm font-medium text-white">{leftLabel}</span>
            {onAcceptLeft && (
              <button
                onClick={onAcceptLeft}
                className="text-xs px-2 py-1 bg-green-500/20 text-green-400 rounded hover:bg-green-500/30 transition-colors"
              >
                Accept
              </button>
            )}
          </div>
          <ScrollArea className="flex-1 min-h-0">
            <div ref={leftScrollRef} className="font-mono text-sm">
            {diff.map((item, idx) => (
              item.left !== null && (
                <div
                  key={`left-${idx}`}
                  className={`px-4 py-1 ${getLineClass(item.type)} ${
                    item.type === 'delete' ? 'text-red-300' : 'text-white/90'
                  }`}
                >
                  <span className="text-white/40 mr-4 select-none w-8 inline-block">{idx + 1}</span>
                  {item.left}
                </div>
              )
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Right Panel */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="bg-black/60 border-b border-border/60 px-4 py-2 flex items-center justify-between flex-shrink-0">
          <span className="text-sm font-medium text-white">{rightLabel}</span>
          {onAcceptRight && (
            <button
              onClick={onAcceptRight}
              className="text-xs px-2 py-1 bg-green-500/20 text-green-400 rounded hover:bg-green-500/30 transition-colors"
            >
              Accept
            </button>
          )}
        </div>
        <ScrollArea className="flex-1 min-h-0">
          <div ref={rightScrollRef} className="font-mono text-sm">
            {diff.map((item, idx) => (
              item.right !== null && (
                <div
                  key={`right-${idx}`}
                  className={`px-4 py-1 ${getLineClass(item.type)} ${
                    item.type === 'insert' ? 'text-green-300' : 'text-white/90'
                  }`}
                >
                  <span className="text-white/40 mr-4 select-none w-8 inline-block">{idx + 1}</span>
                  {item.right}
                </div>
              )
            ))}
          </div>
        </ScrollArea>
      </div>
      </div>
    </div>
  );
};
