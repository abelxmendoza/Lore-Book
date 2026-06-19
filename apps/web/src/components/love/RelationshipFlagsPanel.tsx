import { AlertTriangle, CheckCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';

type RelationshipFlagsPanelProps = {
  redFlags: string[];
  greenFlags: string[];
  compact?: boolean;
};

function FlagCard({
  variant,
  flags,
  title,
  emptyMessage,
  compact,
}: {
  variant: 'green' | 'red';
  flags: string[];
  title: string;
  emptyMessage: string;
  compact?: boolean;
}) {
  const isGreen = variant === 'green';
  return (
    <Card
      className={
        isGreen
          ? 'border-green-500/30 bg-green-950/10 min-w-0'
          : 'border-red-500/30 bg-red-950/10 min-w-0'
      }
    >
      <CardHeader className={compact ? 'p-3 pb-1' : undefined}>
        <CardTitle
          className={`${compact ? 'text-sm' : ''} ${isGreen ? 'text-green-300' : 'text-red-300'} flex items-center gap-2`}
        >
          {isGreen ? <CheckCircle className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
          {title} ({flags.length})
        </CardTitle>
      </CardHeader>
      <CardContent className={compact ? 'p-3 pt-1' : undefined}>
        {flags.length === 0 ? (
          <p className="text-white/45 text-xs sm:text-sm italic">{emptyMessage}</p>
        ) : (
          <ul className="space-y-1.5 sm:space-y-2">
            {flags.map((flag, idx) => (
              <li key={idx} className="text-xs sm:text-sm text-white/80 flex items-start gap-2 min-w-0">
                <span className={`${isGreen ? 'text-green-400' : 'text-red-400'} mt-0.5 shrink-0`}>
                  {isGreen ? '✓' : '⚠'}
                </span>
                <span className="min-w-0 break-words">{flag}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function RelationshipFlagsPanel({ redFlags, greenFlags, compact }: RelationshipFlagsPanelProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
      <FlagCard
        variant="green"
        flags={greenFlags}
        title="Green Flags"
        emptyMessage="No green flags logged yet — healthy signals will appear here."
        compact={compact}
      />
      <FlagCard
        variant="red"
        flags={redFlags}
        title="Red Flags"
        emptyMessage="No red flags identified — watch items will surface if patterns emerge."
        compact={compact}
      />
    </div>
  );
}
