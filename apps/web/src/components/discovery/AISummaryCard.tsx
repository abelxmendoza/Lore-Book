import { Sparkles } from 'lucide-react';
import { Card, CardContent } from '../ui/card';

interface AISummaryCardProps {
  summary: string;
}

export const AISummaryCard = ({ summary }: AISummaryCardProps) => {
  return (
    <Card className="bg-gradient-to-br from-purple-900/30 via-fuchsia-900/30 to-purple-900/30 border-purple-500/50">
      <CardContent className="p-6">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 p-2 bg-purple-500/20 rounded-lg">
            <Sparkles className="h-5 w-5 text-purple-400" />
          </div>
          <div className="flex-1 space-y-2">
            <h3 className="text-sm font-semibold text-white/80 uppercase tracking-wide">
              AI Summary
            </h3>
            <blockquote className="text-base text-white/90 leading-relaxed pl-4 border-l-2 border-purple-500/50">
              {summary}
            </blockquote>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

