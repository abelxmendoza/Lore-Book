import { MessageSquare, MessageCircle } from 'lucide-react';
import type { IdentityStatement } from '../../api/identity';

interface IdentityStatementsProps {
  statements: IdentityStatement[];
}

export const IdentityStatements = ({ statements }: IdentityStatementsProps) => {
  if (statements.length === 0) {
    return (
      <div className="text-sm text-white/50 italic">
        No identity statements detected yet. Keep journaling to see how you describe yourself.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-white mb-1">How You Describe Yourself</h3>
        <p className="text-xs text-white/50">
          Statements extracted from your journal entries. Discuss any of these in chat to refine or correct them.
        </p>
      </div>

      <div className="space-y-3">
        {statements.slice(0, 10).map((statement, index) => (
          <div
            key={index}
            className="p-4 bg-gradient-to-br from-black/50 to-black/30 border border-white/10 rounded-xl space-y-3 hover:border-primary/30 transition-colors group"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm text-white flex-1 leading-relaxed italic">
                "{statement.text}"
              </p>
              <div 
                className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                title="Talk about this in chat to refine it"
              >
                <MessageCircle className="h-4 w-4 text-primary/60" />
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="px-2 py-0.5 bg-primary/20 text-primary rounded-full">
                {(statement.confidence * 100).toFixed(0)}% confidence
              </span>
              <span className="text-white/40">{statement.timeSpan}</span>
            </div>
            <div className="text-xs text-white/40 italic pt-1 border-t border-white/5">
              You can discuss this in chat to refine or correct it
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
