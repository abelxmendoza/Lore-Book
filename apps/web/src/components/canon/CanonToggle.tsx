import React from 'react';
import { BookOpen, Theater, Lightbulb, PenTool, Brain, Settings } from 'lucide-react';
import { Button } from '../ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import type { CanonStatus } from './CanonBadge';

interface CanonToggleProps {
  value: CanonStatus;
  onChange: (status: CanonStatus) => void;
  disabled?: boolean;
}

const canonOptions: Array<{ value: CanonStatus; label: string; icon: React.ComponentType<{ className?: string }>; description: string }> = [
  {
    value: 'CANON',
    label: 'Canon',
    icon: BookOpen,
    description: 'Real life, factual content',
  },
  {
    value: 'ROLEPLAY',
    label: 'Roleplay',
    icon: Theater,
    description: 'Acting as a character',
  },
  {
    value: 'HYPOTHETICAL',
    label: 'Hypothetical',
    icon: Lightbulb,
    description: '"What if..." exploration',
  },
  {
    value: 'FICTIONAL',
    label: 'Fictional',
    icon: PenTool,
    description: 'Creative writing',
  },
  {
    value: 'THOUGHT_EXPERIMENT',
    label: 'Thought Experiment',
    icon: Brain,
    description: 'Abstract/philosophical reasoning',
  },
  {
    value: 'META',
    label: 'Meta',
    icon: Settings,
    description: 'Talking about the system itself',
  },
];

export const CanonToggle: React.FC<CanonToggleProps> = ({
  value,
  onChange,
  disabled = false,
}) => {
  const currentOption = canonOptions.find(opt => opt.value === value);
  const CurrentIcon = currentOption?.icon || BookOpen;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          className="flex items-center gap-2"
        >
          <CurrentIcon className="h-4 w-4" />
          <span>{currentOption?.label || 'Canon'}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2">
        <div className="space-y-1">
          {canonOptions.map((option) => {
            const Icon = option.icon;
            const isSelected = option.value === value;

            return (
              <button
                key={option.value}
                onClick={() => onChange(option.value)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                  isSelected
                    ? 'bg-primary/20 text-primary border border-primary/30'
                    : 'hover:bg-white/5 text-white/80'
                }`}
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                <div className="flex-1 text-left">
                  <div className="font-medium">{option.label}</div>
                  <div className="text-xs text-white/50">{option.description}</div>
                </div>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
};

