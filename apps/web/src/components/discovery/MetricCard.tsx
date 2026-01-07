import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Card, CardContent } from '../ui/card';

interface MetricCardProps {
  label: string;
  value: string | number;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  tooltip?: string;
  className?: string;
}

export const MetricCard = ({ 
  label, 
  value, 
  trend, 
  trendValue,
  tooltip,
  className = ''
}: MetricCardProps) => {
  const formatValue = (val: string | number): string => {
    if (typeof val === 'number') {
      if (val >= 1000000) return `${(val / 1000000).toFixed(1)}M`;
      if (val >= 1000) return `${(val / 1000).toFixed(1)}K`;
      return val.toFixed(1);
    }
    return val;
  };

  const getTrendIcon = () => {
    switch (trend) {
      case 'up':
        return <TrendingUp className="h-4 w-4 text-green-400" />;
      case 'down':
        return <TrendingDown className="h-4 w-4 text-red-400" />;
      default:
        return <Minus className="h-4 w-4 text-white/40" />;
    }
  };

  return (
    <Card 
      className={`bg-black/40 border-border/60 hover:border-primary/50 transition-colors ${className}`}
      title={tooltip}
    >
      <CardContent className="p-4">
        <div className="space-y-2">
          <div className="text-xs text-white/60 uppercase tracking-wide">
            {label}
          </div>
          <div className="flex items-baseline gap-2">
            <div className="text-2xl font-semibold text-white">
              {formatValue(value)}
            </div>
            {trend && trendValue && (
              <div className={`flex items-center gap-1 text-sm ${
                trend === 'up' ? 'text-green-400' : 
                trend === 'down' ? 'text-red-400' : 
                'text-white/60'
              }`}>
                {getTrendIcon()}
                <span>{trendValue}</span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

