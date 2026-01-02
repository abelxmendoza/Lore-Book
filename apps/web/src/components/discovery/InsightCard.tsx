import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';

interface InsightCardProps {
  title?: string;
  body: string;
  badge?: string;
  category?: string;
  score?: number;
}

export const InsightCard = ({ 
  title, 
  body, 
  badge,
  category,
  score
}: InsightCardProps) => {
  return (
    <Card className="bg-black/40 border-border/60 hover:border-primary/50 transition-colors">
      <CardContent className="p-4">
        <div className="space-y-2">
          {title && (
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-white">{title}</h4>
              {badge && (
                <Badge variant="outline" className="border-primary/50 text-primary">
                  {badge}
                </Badge>
              )}
            </div>
          )}
          <p className="text-sm text-white/80 leading-relaxed">{body}</p>
          {(category || score !== undefined) && (
            <div className="flex items-center gap-2 pt-2">
              {category && (
                <Badge variant="ghost" className="text-xs text-white/60">
                  {category}
                </Badge>
              )}
              {score !== undefined && (
                <span className="text-xs text-white/40">
                  Score: {score.toFixed(2)}
                </span>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

