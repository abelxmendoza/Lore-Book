import React, { useState } from 'react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Hash, X, User, MapPin, Building2, Sparkles } from 'lucide-react';

export interface DisambiguationOption {
  label: string;
  subtitle?: string;
  entity_id: string;
  entity_type: string;
}

export interface DisambiguationPromptProps {
  mention_text: string;
  options: DisambiguationOption[];
  skippable: boolean;
  explanation: string;
  onSelect: (option: DisambiguationOption | 'CREATE_NEW' | 'SKIP') => void;
}

const getEntityIcon = (entityType: string) => {
  switch (entityType) {
    case 'CHARACTER':
    case 'PERSON':
      return <User className="h-4 w-4" />;
    case 'LOCATION':
      return <MapPin className="h-4 w-4" />;
    case 'ORG':
      return <Building2 className="h-4 w-4" />;
    default:
      return <Hash className="h-4 w-4" />;
  }
};

export const DisambiguationPrompt: React.FC<DisambiguationPromptProps> = ({
  mention_text,
  options,
  skippable,
  explanation,
  onSelect,
}) => {
  const [selectedOption, setSelectedOption] = useState<string | null>(null);

  const handleSelect = (option: DisambiguationOption | 'CREATE_NEW' | 'SKIP') => {
    setSelectedOption(typeof option === 'string' ? option : option.entity_id);
    onSelect(option);
  };

  // Separate "Someone else" option from entity options
  const entityOptions = options.filter(opt => opt.entity_id);
  const createNewOption = options.find(opt => !opt.entity_id);

  return (
    <Card className="border-primary/30 bg-gradient-to-r from-primary/10 to-primary/5 my-4">
      <CardContent className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-1">
            <Sparkles className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-white">
                When you mentioned <span className="text-primary font-semibold">"{mention_text}"</span>, who did you mean?
              </p>
              {explanation && (
                <p className="text-xs text-white/60 mt-1">{explanation}</p>
              )}
            </div>
          </div>
          {skippable && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleSelect('SKIP')}
              className="h-6 w-6 p-0 text-white/40 hover:text-white/70 hover:bg-transparent"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Options */}
        <div className="space-y-2">
          {entityOptions.map((option) => (
            <button
              key={option.entity_id}
              onClick={() => handleSelect(option)}
              className={`w-full text-left p-3 rounded-lg border transition-all ${
                selectedOption === option.entity_id
                  ? 'border-primary bg-primary/20 text-white'
                  : 'border-border/30 bg-black/20 text-white/80 hover:border-primary/50 hover:bg-primary/10'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`mt-0.5 ${
                  selectedOption === option.entity_id ? 'text-primary' : 'text-white/40'
                }`}>
                  {getEntityIcon(option.entity_type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white">{option.label}</div>
                  {option.subtitle && (
                    <div className="text-xs text-white/50 mt-0.5">{option.subtitle}</div>
                  )}
                </div>
              </div>
            </button>
          ))}

          {/* "Someone else" option */}
          {createNewOption && (
            <button
              onClick={() => handleSelect('CREATE_NEW')}
              className={`w-full text-left p-3 rounded-lg border transition-all ${
                selectedOption === 'CREATE_NEW'
                  ? 'border-primary bg-primary/20 text-white'
                  : 'border-border/30 bg-black/20 text-white/80 hover:border-primary/50 hover:bg-primary/10'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`mt-0.5 ${
                  selectedOption === 'CREATE_NEW' ? 'text-primary' : 'text-white/40'
                }`}>
                  <Hash className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white">{createNewOption.label}</div>
                  {createNewOption.subtitle && (
                    <div className="text-xs text-white/50 mt-0.5">{createNewOption.subtitle}</div>
                  )}
                </div>
              </div>
            </button>
          )}
        </div>

        {/* Skip button (if skippable) */}
        {skippable && (
          <div className="pt-2 border-t border-border/20">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleSelect('SKIP')}
              className="w-full text-xs text-white/50 hover:text-white/70 hover:bg-transparent"
            >
              Skip for now
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

