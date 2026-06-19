import { Compass } from 'lucide-react';
import { Card, CardContent } from '../ui/card';

interface EmptyStateProps {
  title?: string;
  description?: string;
  icon?: React.ReactNode;
}

export const EmptyState = ({
  title = 'No Data Available',
  description = 'There\'s nothing to display here yet.',
  icon,
}: EmptyStateProps) => {
  return (
    <Card className="bg-white/[0.03] border-white/10 rounded-2xl">
      <CardContent className="p-8 sm:p-12 text-center">
        {icon || (
          <div className="inline-flex p-3 rounded-2xl bg-primary/10 border border-primary/20 mb-4">
            <Compass className="h-8 w-8 text-primary/50" />
          </div>
        )}
        <h3 className="text-base sm:text-lg font-semibold text-white/70 mb-2">{title}</h3>
        <p className="text-sm text-white/40 max-w-sm mx-auto leading-relaxed">{description}</p>
      </CardContent>
    </Card>
  );
};
