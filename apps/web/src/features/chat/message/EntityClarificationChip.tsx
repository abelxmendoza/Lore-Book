import React, { useState } from 'react';
import { User, MapPin, Building2, HelpCircle, X } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { Card, CardContent } from '../../../components/ui/card';
import { fetchJson } from '../../../lib/api';

export interface EntityAmbiguity {
  surface_text: string;
  candidates: {
    entity_id: string;
    name: string;
    type: 'CHARACTER' | 'LOCATION' | 'ORG' | 'PERSON';
    confidence: number;
    last_seen: string;
    context_hint?: string;
  }[];
}

interface EntityClarificationChipProps {
  ambiguity: EntityAmbiguity;
  messageId: string;
  onResolved?: () => void;
  hasCreateNewOption?: boolean;
}

const getEntityIcon = (type: string) => {
  switch (type) {
    case 'CHARACTER':
    case 'PERSON':
      return <User className="h-3 w-3" />;
    case 'LOCATION':
      return <MapPin className="h-3 w-3" />;
    case 'ORG':
      return <Building2 className="h-3 w-3" />;
    default:
      return <HelpCircle className="h-3 w-3" />;
  }
};

const getEntityTypeColor = (type: string) => {
  switch (type) {
    case 'CHARACTER':
    case 'PERSON':
      return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    case 'LOCATION':
      return 'bg-green-500/20 text-green-400 border-green-500/30';
    case 'ORG':
      return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
    default:
      return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
  }
};

export const EntityClarificationChip: React.FC<EntityClarificationChipProps> = ({
  ambiguity,
  messageId,
  onResolved,
  hasCreateNewOption = true
}) => {
  const [isResolving, setIsResolving] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  const handleResolve = async (chosenEntityId: string, chosenEntityName: string) => {
    if (isResolving) return;

    setIsResolving(true);
    try {
      await fetchJson('/api/entity-ambiguity/resolve', {
        method: 'POST',
        body: JSON.stringify({
          message_id: messageId,
          surface_text: ambiguity.surface_text,
          chosen_entity_id: chosenEntityId,
          chosen_entity_name: chosenEntityName,
        }),
      });

      setIsDismissed(true);
      onResolved?.();
    } catch (error) {
      console.error('Failed to resolve entity ambiguity:', error);
      // Still dismiss on error to not block user
      setIsDismissed(true);
    } finally {
      setIsResolving(false);
    }
  };

  const handleCreateNew = async () => {
    if (isResolving) return;

    setIsResolving(true);
    try {
      await fetchJson('/api/entity-ambiguity/resolve', {
        method: 'POST',
        body: JSON.stringify({
          message_id: messageId,
          surface_text: ambiguity.surface_text,
          create_new: true,
        }),
      });

      setIsDismissed(true);
      onResolved?.();
    } catch (error) {
      console.error('Failed to create new entity:', error);
      setIsDismissed(true);
    } finally {
      setIsResolving(false);
    }
  };

  const handleSkip = () => {
    setIsDismissed(true);
  };

  if (isDismissed) {
    return null;
  }

  return (
    <Card className="mt-3 bg-primary/5 border-primary/30">
      <CardContent className="p-3 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <p className="text-sm text-white/90 mb-2">
              When you said <span className="font-semibold text-primary">{ambiguity.surface_text}</span>, did you mean:
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSkip}
            className="h-6 w-6 p-0 text-white/50 hover:text-white"
            title="Skip"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          {ambiguity.candidates.map((candidate) => (
            <Button
              key={candidate.entity_id}
              variant="outline"
              size="sm"
              onClick={() => handleResolve(candidate.entity_id, candidate.name)}
              disabled={isResolving}
              className={`${getEntityTypeColor(candidate.type)} hover:opacity-80 transition-opacity`}
            >
              <div className="flex items-center gap-2">
                {getEntityIcon(candidate.type)}
                <div className="flex flex-col items-start">
                  <span className="font-medium">{candidate.name}</span>
                  {candidate.context_hint && (
                    <span className="text-xs opacity-70">{candidate.context_hint}</span>
                  )}
                </div>
              </div>
            </Button>
          ))}

          {hasCreateNewOption && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleCreateNew}
              disabled={isResolving}
              className="bg-gray-500/20 text-gray-300 border-gray-500/30 hover:bg-gray-500/30"
            >
              <div className="flex items-center gap-2">
                <HelpCircle className="h-3 w-3" />
                <span>Someone else</span>
              </div>
            </Button>
          )}
        </div>

        {isResolving && (
          <p className="text-xs text-white/50">Processing...</p>
        )}
      </CardContent>
    </Card>
  );
};

