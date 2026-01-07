// =====================================================
// EVENT META TAGS
// Purpose: Show transparency tags for meta overrides
// =====================================================

import { useState, useEffect } from 'react';
import { MessageSquare, Clock, Archive, EyeOff, AlertCircle } from 'lucide-react';
import { Badge } from '../ui/badge';
import { fetchJson } from '../../lib/api';

interface MetaOverride {
  id: string;
  override_type: string;
  user_note?: string;
}

interface EventMetaTagsProps {
  eventId: string;
}

export const EventMetaTags: React.FC<EventMetaTagsProps> = () => {
  const [overrides, setOverrides] = useState<MetaOverride[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadOverrides();
  }, []);

  const loadOverrides = async () => {
    setLoading(true);
    try {
      const result = await fetchJson<{ success: boolean; overrides: MetaOverride[] }>(
        `/api/meta/override/check?scope=EVENT&target_id=${eventId}`
      );
      if (result.success) {
        setOverrides(result.overrides || []);
      }
    } catch (err: any) {
      console.error('Failed to load overrides:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading || overrides.length === 0) {
    return null;
  }

  const getTagForOverride = (overrideType: string) => {
    switch (overrideType) {
      case 'JUST_VENTING':
        return { label: 'Marked as venting', icon: MessageSquare, color: 'bg-blue-500/10 border-blue-500/30' };
      case 'OUTDATED':
        return { label: 'Outdated context', icon: Clock, color: 'bg-yellow-500/10 border-yellow-500/30' };
      case 'ARCHIVE':
        return { label: 'Archived', icon: Archive, color: 'bg-gray-500/10 border-gray-500/30' };
      case 'NOT_IMPORTANT':
        return { label: 'Not important', icon: EyeOff, color: 'bg-gray-500/10 border-gray-500/30' };
      case 'MISINTERPRETED':
        return { label: 'Misinterpreted', icon: AlertCircle, color: 'bg-orange-500/10 border-orange-500/30' };
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {overrides.map(override => {
        const tag = getTagForOverride(override.override_type);
        if (!tag) return null;

        const Icon = tag.icon;
        return (
          <Badge
            key={override.id}
            variant="outline"
            className={`${tag.color} text-xs flex items-center gap-1`}
            title={override.user_note || undefined}
          >
            <Icon className="w-3 h-3" />
            {tag.label}
          </Badge>
        );
      })}
    </div>
  );
};

