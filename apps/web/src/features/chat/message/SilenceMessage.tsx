/**
 * Silence Message Component
 * 
 * Displays when no significant past signal is detected
 */

import { Card, CardContent } from '../../../components/ui/card';
import { Info } from 'lucide-react';

type SilenceMessageProps = {
  message: {
    content: string;
    disclaimer?: string;
  };
};

export const SilenceMessage = ({ message }: SilenceMessageProps) => {
  return (
    <div className="silence-message my-4">
      <Card className="bg-black/30 border-border/20 border-dashed">
        <CardContent className="p-4">
          <div className="flex items-start gap-2">
            <Info className="h-4 w-4 text-white/40 mt-0.5 flex-shrink-0" />
            <div className="flex-1 space-y-1">
              <p className="text-sm text-white/80 leading-relaxed">
                {message.content}
              </p>
              {(message.disclaimer || message.metadata?.disclaimer) && (
                <small className="text-xs text-white/50 block">
                  {message.disclaimer || message.metadata?.disclaimer}
                </small>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

