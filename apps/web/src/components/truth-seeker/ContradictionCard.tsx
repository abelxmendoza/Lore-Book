import { AlertTriangle, Calendar, TrendingUp, CheckCircle2 } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';

type ContradictionCardProps = {
  id: string;
  description: string;
  severity: number;
  createdAt: string;
  sourceComponents: string[];
  metadata?: Record<string, unknown>;
  onClick?: () => void;
  isResolved?: boolean;
};

export const ContradictionCard = ({
  id,
  description,
  severity,
  createdAt,
  sourceComponents,
  onClick,
  isResolved = false,
}: ContradictionCardProps) => {
  const getSeverityColor = (severity: number) => {
    if (severity >= 8) return 'bg-red-500/20 text-red-400 border-red-500/30';
    if (severity >= 5) return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
    return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <Card
      onClick={onClick}
      className="bg-black/40 border-border/60 hover:border-primary/50 cursor-pointer transition-colors"
    >
      <CardContent className="pt-4">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-red-500/10 rounded-lg">
            <AlertTriangle className="h-5 w-5 text-red-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              {isResolved && (
                <Badge variant="outline" className="bg-green-500/10 text-green-400 border-green-500/30">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Resolved
                </Badge>
              )}
              <Badge variant="outline" className={getSeverityColor(severity)}>
                Severity: {severity}/10
              </Badge>
              <div className="flex items-center gap-1 text-xs text-white/60">
                <Calendar className="h-3 w-3" />
                {formatDate(createdAt)}
              </div>
              <div className="flex items-center gap-1 text-xs text-white/60">
                <TrendingUp className="h-3 w-3" />
                {sourceComponents.length} component{sourceComponents.length > 1 ? 's' : ''}
              </div>
            </div>
            <p className="text-sm text-white/90 line-clamp-2">{description}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
