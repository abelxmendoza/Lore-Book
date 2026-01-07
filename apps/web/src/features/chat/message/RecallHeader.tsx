/**
 * Recall Header Component
 * 
 * Displays confidence badge and Archivist persona indicator
 */

import { Badge } from '../../../components/ui/badge';
import { Archive } from 'lucide-react';

type RecallHeaderProps = {
  confidence?: 'Strong match' | 'Tentative';
  persona?: 'ARCHIVIST' | 'DEFAULT';
};

export const RecallHeader = ({ confidence, persona }: RecallHeaderProps) => {
  return (
    <div className="recall-header flex items-center gap-2 flex-wrap">
      {confidence && (
        <ConfidenceBadge level={confidence} />
      )}
      {persona === 'ARCHIVIST' && (
        <ArchivistBadge />
      )}
    </div>
  );
};

function ConfidenceBadge({ level }: { level: 'Strong match' | 'Tentative' }) {
  const color = level === 'Strong match' ? 'green' : 'yellow';
  
  return (
    <Badge
      variant="outline"
      className={
        color === 'green'
          ? 'border-green-500/50 text-green-400 bg-green-500/10'
          : 'border-yellow-500/50 text-yellow-400 bg-yellow-500/10'
      }
    >
      {level}
    </Badge>
  );
}

function ArchivistBadge() {
  return (
    <Badge
      variant="outline"
      className="border-blue-500/50 text-blue-400 bg-blue-500/10 flex items-center gap-1"
    >
      <Archive className="h-3 w-3" />
      Archivist
    </Badge>
  );
}

