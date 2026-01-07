/**
 * Contract Badge Component
 * 
 * Displays the active Sensemaking Contract with tooltip
 * showing what the contract can and cannot do.
 */

import React, { useState } from 'react';
import { Info, FileText, Eye, BarChart3 } from 'lucide-react';

export type ContractType = 'archivist' | 'analyst' | 'reflector' | 'default';

interface ContractBadgeProps {
  contract: ContractType;
  className?: string;
}

const CONTRACT_INFO: Record<ContractType, {
  name: string;
  description: string;
  icon: React.ReactNode;
  capabilities: string[];
  limitations: string[];
}> = {
  archivist: {
    name: 'Archivist',
    description: 'Strict factual recall. No interpretation, no advice, no synthesis beyond listing.',
    icon: <FileText className="h-3 w-3" />,
    capabilities: [
      'Can access your experiences',
      'Can access verified facts',
      'Cites sources',
      'Shows all contradictions',
    ],
    limitations: [
      'Cannot access beliefs',
      'Cannot access feelings',
      'Cannot make inferences',
      'Cannot give advice',
    ],
  },
  analyst: {
    name: 'Analyst',
    description: 'Pattern observation without prescription. Identifies trends and patterns, but never gives advice.',
    icon: <BarChart3 className="h-3 w-3" />,
    capabilities: [
      'Can access your experiences',
      'Can identify patterns',
      'Can make insights',
      'Surfaces contradictions',
    ],
    limitations: [
      'Cannot access beliefs',
      'Cannot access feelings',
      'Cannot give advice',
      'Only shows stable patterns',
    ],
  },
  reflector: {
    name: 'Reflector',
    description: 'Helps you see yourself. Shows your experiences, feelings, and beliefs without judgment or advice.',
    icon: <Eye className="h-3 w-3" />,
    capabilities: [
      'Can access your experiences',
      'Can access your feelings',
      'Can access your beliefs',
      'Shows parallel contradictions',
    ],
    limitations: [
      'Cannot give advice',
      'Cannot make predictions',
      'May not cite sources',
    ],
  },
  default: {
    name: 'Default',
    description: 'Standard memory access with full capabilities.',
    icon: <FileText className="h-3 w-3" />,
    capabilities: [
      'Can access all memory types',
      'Can make inferences',
      'Can provide advice',
    ],
    limitations: [],
  },
};

export const ContractBadge: React.FC<ContractBadgeProps> = ({ contract, className = '' }) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const info = CONTRACT_INFO[contract];

  return (
    <div className={`relative inline-flex items-center ${className}`}>
      <button
        type="button"
        className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-primary/10 border border-primary/20 text-primary text-xs font-medium hover:bg-primary/20 transition-colors"
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        onClick={() => setShowTooltip(!showTooltip)}
        aria-label={`Active contract: ${info.name}`}
      >
        {info.icon}
        <span>{info.name}</span>
        <Info className="h-3 w-3 opacity-60" />
      </button>

      {showTooltip && (
        <div className="absolute bottom-full left-0 mb-2 w-80 p-4 rounded-lg bg-black/95 border border-border/50 shadow-xl z-50 text-left">
          <div className="flex items-start gap-3 mb-3">
            <div className="flex-shrink-0 mt-0.5">
              {info.icon}
            </div>
            <div className="flex-1">
              <h4 className="text-sm font-semibold text-white mb-1">{info.name}</h4>
              <p className="text-xs text-white/70">{info.description}</p>
            </div>
          </div>

          {info.capabilities.length > 0 && (
            <div className="mb-3">
              <h5 className="text-xs font-medium text-white/90 mb-1.5">Can:</h5>
              <ul className="space-y-1">
                {info.capabilities.map((cap, idx) => (
                  <li key={idx} className="text-xs text-white/60 flex items-start gap-2">
                    <span className="text-primary mt-0.5">✓</span>
                    <span>{cap}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {info.limitations.length > 0 && (
            <div>
              <h5 className="text-xs font-medium text-white/90 mb-1.5">Cannot:</h5>
              <ul className="space-y-1">
                {info.limitations.map((lim, idx) => (
                  <li key={idx} className="text-xs text-white/60 flex items-start gap-2">
                    <span className="text-red-400/60 mt-0.5">✗</span>
                    <span>{lim}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-3 pt-3 border-t border-border/30">
            <p className="text-xs text-white/50 italic">
              This mode declares how it interprets truth. No system may consume memory without declaring its epistemic rules.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

