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
  icon
}: EmptyStateProps) => {
  return (
    <Card className="bg-black/20 border-border/40">
      <CardContent className="p-12 text-center">
        {icon || <Compass className="h-12 w-12 text-white/20 mx-auto mb-4" />}
        <h3 className="text-lg font-semibold text-white/60 mb-2">{title}</h3>
        <p className="text-sm text-white/40">{description}</p>
      </CardContent>
    </Card>
  );
};

