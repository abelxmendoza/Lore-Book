import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import { Button } from '../../ui/button';
import { Badge } from '../../ui/badge';
import type { EssenceInsight } from '../../../types/essence';

interface EssenceCategoryCardProps {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  items: EssenceInsight[];
  color: string;
}

const INITIAL_VISIBLE = 3;

/**
 * EssenceCategoryCard - Individual category card with expandable insights
 */
export const EssenceCategoryCard = ({ title, icon: Icon, items, color }: EssenceCategoryCardProps) => {
  const [expanded, setExpanded] = useState(false);

  if (!items || items.length === 0) {
    return (
      <Card className="bg-gradient-to-br from-black/50 to-black/30 border border-white/10 rounded-xl">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Icon className={`h-5 w-5 ${color}`} />
            <CardTitle className="text-base font-semibold text-white">{title}</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-white/40 italic">Still learning about you...</p>
        </CardContent>
      </Card>
    );
  }

  const visibleItems = expanded ? items : items.slice(0, INITIAL_VISIBLE);
  const hasMore = items.length > INITIAL_VISIBLE;

  return (
    <Card className="bg-gradient-to-br from-black/50 to-black/30 border border-white/10 rounded-xl">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className={`h-5 w-5 ${color}`} />
            <CardTitle className="text-base font-semibold text-white">{title}</CardTitle>
          </div>
          <Badge variant="outline" className="text-xs border-white/20 text-white/70">
            {items.length}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {visibleItems.map((item, idx) => {
          const isHighConfidence = item.confidence >= 0.8;
          const isRecent = new Date(item.extractedAt) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          const hasMultipleSources = (item.sources?.length || 0) > 1;
          
          return (
            <div
              key={idx}
              className={`p-3 rounded-lg transition-all group ${
                isHighConfidence
                  ? 'bg-gradient-to-br from-black/50 to-black/30 border border-primary/20 shadow-sm shadow-primary/10'
                  : 'bg-gradient-to-br from-black/40 to-black/20 border border-white/5'
              } hover:border-primary/30 hover:shadow-md`}
              title="Discuss this in chat to refine or correct it"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <p className={`text-sm leading-relaxed flex-1 ${
                  isHighConfidence ? 'text-white font-medium' : 'text-white/90'
                }`}>{item.text}</p>
                {isHighConfidence && (
                  <div className="flex-shrink-0 w-2 h-2 rounded-full bg-primary animate-pulse" />
                )}
              </div>
              <div className="flex items-center gap-2 mb-2">
                <div className="flex-1 h-1.5 bg-black/60 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      isHighConfidence
                        ? `bg-gradient-to-r ${color.replace('text-', 'bg-')}`
                        : `${color.replace('text-', 'bg-')}/60`
                    }`}
                    style={{ width: `${item.confidence * 100}%` }}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs">
                {isRecent && (
                  <span className="px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded text-[10px] font-medium">
                    Recent
                  </span>
                )}
                {hasMultipleSources && (
                  <span className="px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded text-[10px] font-medium">
                    {item.sources?.length} sources
                  </span>
                )}
                <span className="text-white/40 ml-auto">
                  {new Date(item.extractedAt).toLocaleDateString()}
                </span>
              </div>
            </div>
          );
        })}
        {hasMore && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
            className="w-full text-xs text-white/60 hover:text-white"
          >
            {expanded ? (
              <>
                <ChevronUp className="h-3 w-3 mr-1" />
                Show less
              </>
            ) : (
              <>
                <ChevronDown className="h-3 w-3 mr-1" />
                Show {items.length - INITIAL_VISIBLE} more
              </>
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
};
