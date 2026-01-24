import React, { useState, useEffect } from 'react';
import { AlertCircle } from 'lucide-react';
import { fetchJson } from '../../lib/api';

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

interface VoidMemoryOverlayProps {
  startDate: Date;
  endDate: Date;
  pixelsPerDay: number;
  onVoidClick?: (voidPeriod: VoidPeriod) => void;
}

export const VoidMemoryOverlay: React.FC<VoidMemoryOverlayProps> = ({
  startDate,
  endDate,
  pixelsPerDay,
  onVoidClick,
}) => {
  const [voidData, setVoidData] = useState<{ voids: VoidPeriod[] } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadVoids = async () => {
      try {
        setIsLoading(true);
        const data = await fetchJson<{ voids: VoidPeriod[] }>('/api/voids/gaps');
        setVoidData(data);
      } catch (error) {
        console.error('Failed to fetch voids:', error);
        setVoidData({ voids: [] });
      } finally {
        setIsLoading(false);
      }
    };
    loadVoids();
  }, []);

  if (isLoading) return null;
  if (!voidData?.voids.length) return null;

  // Color scheme based on significance
  const getVoidStyle = (significance: VoidPeriod['significance']) => {
    const colors = {
      low: {
        bg: 'rgba(100, 100, 100, 0.2)',
        border: 'rgba(100, 100, 100, 0.5)',
        text: 'rgba(200, 200, 200, 0.8)',
      },
      medium: {
        bg: 'rgba(255, 193, 7, 0.3)',
        border: 'rgba(255, 193, 7, 0.6)',
        text: 'rgba(255, 235, 59, 0.9)',
      },
      high: {
        bg: 'rgba(220, 53, 69, 0.4)',
        border: 'rgba(220, 53, 69, 0.7)',
        text: 'rgba(255, 200, 200, 0.95)',
      },
    };
    return colors[significance];
  };

  return (
    <div className="absolute inset-0 pointer-events-none z-10">
      {voidData.voids.map((voidPeriod) => {
        const voidStart = new Date(voidPeriod.start);
        const voidEnd = new Date(voidPeriod.end);

        // Calculate position relative to timeline start
        const daysFromStart = Math.floor(
          (voidStart.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
        );
        const voidDuration = Math.floor(
          (voidEnd.getTime() - voidStart.getTime()) / (1000 * 60 * 60 * 24)
        );

        // Only render if void is within visible range
        if (daysFromStart < 0 || daysFromStart + voidDuration > (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) {
          return null;
        }

        const left = daysFromStart * pixelsPerDay;
        const width = Math.max(20, voidDuration * pixelsPerDay); // Minimum width for visibility

        const style = getVoidStyle(voidPeriod.significance);

        return (
          <div
            key={voidPeriod.id}
            className="absolute pointer-events-auto cursor-pointer hover:opacity-90 transition-opacity border-2 border-dashed"
            style={{
              left: `${left}px`,
              width: `${width}px`,
              top: 0,
              height: '100%',
              backgroundColor: style.bg,
              borderColor: style.border,
            }}
            onClick={() => onVoidClick?.(voidPeriod)}
            title={`Missing ${voidPeriod.durationDays} days: ${voidPeriod.start} to ${voidPeriod.end}`}
          >
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center p-1">
                <AlertCircle className="w-3 h-3 mx-auto mb-0.5" style={{ color: style.text }} />
                <span className="text-xs font-semibold block" style={{ color: style.text }}>
                  {voidPeriod.durationDays}d
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
