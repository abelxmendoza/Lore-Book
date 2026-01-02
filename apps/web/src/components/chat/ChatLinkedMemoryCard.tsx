import { Calendar, BookOpen, Users, CheckSquare, Sparkles, Database } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import type { ChatSource } from './ChatMessage';

type ChatLinkedMemoryCardProps = {
  source: ChatSource;
  onClose?: () => void;
  onNavigate?: (source: ChatSource) => void;
};

const iconMap = {
  entry: Calendar,
  chapter: BookOpen,
  character: Users,
  task: CheckSquare,
  hqi: Sparkles,
  fabric: Database
};

export const ChatLinkedMemoryCard = ({ source, onClose, onNavigate }: ChatLinkedMemoryCardProps) => {
  const Icon = iconMap[source.type] || Database;

  return (
    <Card className="bg-black/60 border-primary/30 hover:border-primary/50 transition-colors">
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 flex-1 min-w-0">
            <Icon className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="outline" className="text-xs border-primary/30 text-primary/70">
                  {source.type}
                </Badge>
                <span className="text-sm font-semibold text-white truncate">{source.title}</span>
              </div>
              {source.snippet && (
                <p className="text-xs text-white/60 line-clamp-2 mb-1">{source.snippet}</p>
              )}
              {source.date && (
                <p className="text-xs text-white/40">
                  {new Date(source.date).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric'
                  })}
                </p>
              )}
            </div>
          </div>
          {onNavigate && (
            <button
              onClick={() => onNavigate(source)}
              className="px-2 py-1 rounded text-xs text-primary hover:bg-primary/10 transition-colors"
            >
              View
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="text-white/40 hover:text-white transition-colors"
            >
              ×
            </button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

