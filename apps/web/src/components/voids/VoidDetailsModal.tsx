import React from 'react';
import { X, Calendar, Clock, AlertCircle, Sparkles, ArrowRight } from 'lucide-react';
import { format, parseISO, differenceInDays } from 'date-fns';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';

interface VoidPeriod {
  id: string;
  start: string;
  end: string;
  durationDays: number;
  type: 'short_gap' | 'medium_gap' | 'long_silence' | 'void';
  significance: 'low' | 'medium' | 'high';
  prompts: string[];
  engagementScore: number;
  context?: {
    beforePeriod?: string;
    afterPeriod?: string;
    estimatedActivity?: string;
    surroundingThemes?: string[];
  };
}

interface VoidDetailsModalProps {
  voidPeriod: VoidPeriod;
  onClose: () => void;
  onFillGap: (voidPeriod: VoidPeriod) => void;
}

export const VoidDetailsModal: React.FC<VoidDetailsModalProps> = ({
  voidPeriod,
  onClose,
  onFillGap,
}) => {
  const startDate = parseISO(voidPeriod.start);
  const endDate = parseISO(voidPeriod.end);

  const getSignificanceColor = () => {
    switch (voidPeriod.significance) {
      case 'high':
        return 'text-red-400 border-red-500/50 bg-red-500/10';
      case 'medium':
        return 'text-yellow-400 border-yellow-500/50 bg-yellow-500/10';
      default:
        return 'text-gray-400 border-gray-500/50 bg-gray-500/10';
    }
  };

  const handleFillGap = () => {
    onFillGap(voidPeriod);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto border-2 border-yellow-500/50 bg-black/90 shadow-2xl">
        <CardHeader className="border-b border-yellow-500/30">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl text-yellow-200 flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              Missing Period in Your Story
            </CardTitle>
            <button
              onClick={onClose}
              className="text-white/60 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </CardHeader>
        <CardContent className="p-6 space-y-6">
          {/* Period Information */}
          <div className="space-y-3">
            <div className="flex items-center gap-4 text-white/80">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-yellow-400" />
                <span className="text-sm">
                  {format(startDate, 'MMM d, yyyy')} - {format(endDate, 'MMM d, yyyy')}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-yellow-400" />
                <span className="text-sm">{voidPeriod.durationDays} days</span>
              </div>
              <div className={`px-2 py-1 rounded text-xs font-semibold ${getSignificanceColor()}`}>
                {voidPeriod.significance.toUpperCase()} PRIORITY
              </div>
            </div>
          </div>

          {/* Context Information */}
          {voidPeriod.context && (
            <div className="space-y-2">
              {voidPeriod.context.beforePeriod && (
                <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                  <p className="text-xs text-white/60 mb-1">Before this period:</p>
                  <p className="text-sm text-white/80">{voidPeriod.context.beforePeriod}</p>
                </div>
              )}
              {voidPeriod.context.afterPeriod && (
                <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                  <p className="text-xs text-white/60 mb-1">After this period:</p>
                  <p className="text-sm text-white/80">{voidPeriod.context.afterPeriod}</p>
                </div>
              )}
              {voidPeriod.context.estimatedActivity && (
                <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/30">
                  <p className="text-xs text-blue-300 mb-1">Estimated activity:</p>
                  <p className="text-sm text-blue-200">{voidPeriod.context.estimatedActivity}</p>
                </div>
              )}
            </div>
          )}

          {/* Engaging Prompts */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-yellow-200 flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              Prompts to Help You Remember
            </h3>
            <div className="space-y-2">
              {voidPeriod.prompts.map((prompt, index) => (
                <div
                  key={index}
                  className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 hover:bg-yellow-500/20 transition-colors cursor-pointer"
                  onClick={() => {
                    // Pre-fill with this prompt
                    const promptText = encodeURIComponent(prompt);
                    const dateText = format(startDate, 'yyyy-MM-dd');
                    window.location.href = `/?surface=chat&date=${dateText}&prompt=${promptText}`;
                  }}
                >
                  <p className="text-sm text-yellow-100">{prompt}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Action Button */}
          <div className="pt-4 border-t border-yellow-500/30">
            <Button
              onClick={handleFillGap}
              className="w-full bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-200 border border-yellow-500/50"
            >
              Fill This Gap
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
            <p className="text-xs text-white/60 mt-2 text-center">
              This will open the journal entry composer with the date pre-filled
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
