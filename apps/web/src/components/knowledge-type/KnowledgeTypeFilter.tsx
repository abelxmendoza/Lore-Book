import React from 'react';
import { KnowledgeTypeBadge, type KnowledgeType } from './KnowledgeTypeBadge';
import { Button } from '../ui/button';

interface KnowledgeTypeFilterProps {
  selectedTypes: KnowledgeType[];
  onToggleType: (type: KnowledgeType) => void;
  showAll?: boolean;
  onShowAll?: () => void;
}

export const KnowledgeTypeFilter: React.FC<KnowledgeTypeFilterProps> = ({
  selectedTypes,
  onToggleType,
  showAll = false,
  onShowAll,
}) => {
  const allTypes: KnowledgeType[] = ['EXPERIENCE', 'FEELING', 'BELIEF', 'FACT', 'DECISION', 'QUESTION'];

  return (
    <div className="flex flex-wrap items-center gap-2">
      {showAll && onShowAll && (
        <Button
          variant={selectedTypes.length === 0 ? 'default' : 'outline'}
          size="sm"
          onClick={onShowAll}
          className="text-xs"
        >
          All
        </Button>
      )}
      {allTypes.map((type) => {
        const isSelected = selectedTypes.includes(type);
        return (
          <button
            key={type}
            onClick={() => onToggleType(type)}
            className={`transition-all ${
              isSelected
                ? 'opacity-100 scale-105'
                : 'opacity-50 hover:opacity-75'
            }`}
          >
            <KnowledgeTypeBadge type={type} showLabel={true} size="sm" />
          </button>
        );
      })}
    </div>
  );
};

