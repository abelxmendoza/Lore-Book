import { Brain, HelpCircle } from 'lucide-react';
import type { ReflectiveInsight } from '../../api/identity';

interface ReflectiveInsightsProps {
  insights: ReflectiveInsight[];
}

export const ReflectiveInsights = ({ insights }: ReflectiveInsightsProps) => {
  if (insights.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-white mb-1">Reflections for You</h3>
        <p className="text-xs text-white/50">Observations about your patterns, designed to prompt self-reflection</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {insights.map((insight, index) => (
          <div
            key={index}
            className="p-5 bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/30 rounded-xl space-y-3 hover:border-primary/40 transition-colors"
          >
            <p className="text-sm text-white leading-relaxed">
              {insight.text}
            </p>
            {insight.question && (
              <div className="flex items-start gap-2 pt-3 border-t border-primary/20">
                <HelpCircle className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                <p className="text-sm text-primary/90 italic font-medium">
                  {insight.question}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
