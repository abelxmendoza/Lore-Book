import React, { useState } from 'react';
import { User, MapPin, Building2, HelpCircle, X, Check } from 'lucide-react';
import { Button } from '../../../components/ui/button';
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
  /** Persisted entity_questions row — resolution goes to the questions endpoint
   * and supports selecting multiple people for one mention. */
  questionId?: string;
  multiSelect?: boolean;
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
  hasCreateNewOption = true,
  questionId,
  multiSelect = false,
}) => {
  const [isResolving, setIsResolving] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [createNewSelected, setCreateNewSelected] = useState(false);

  const isQuestionMode = Boolean(questionId);

  const finish = () => {
    setIsDismissed(true);
    onResolved?.();
  };

  const resolveQuestion = async (body: { selected_character_ids?: string[]; create_new?: boolean; skip?: boolean }) => {
    if (isResolving) return;
    setIsResolving(true);
    try {
      await fetchJson(`/api/entity-resolution/questions/${questionId}/resolve`, {
        method: 'POST',
        body: JSON.stringify({
          selected_character_ids: body.selected_character_ids ?? [],
          create_new: body.create_new ?? false,
          skip: body.skip ?? false,
        }),
      });
    } catch (error) {
      console.error('Failed to resolve entity question:', error);
    } finally {
      setIsResolving(false);
      finish();
    }
  };

  // ── Legacy ambiguity flow (no persisted question) ─────────────────────────
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
    } catch (error) {
      console.error('Failed to resolve entity ambiguity:', error);
    } finally {
      setIsResolving(false);
      finish();
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
    } catch (error) {
      console.error('Failed to create new entity:', error);
    } finally {
      setIsResolving(false);
      finish();
    }
  };

  const handleSkip = () => {
    if (isQuestionMode) {
      // Persist the skip so this question is never asked again
      void resolveQuestion({ skip: true });
      return;
    }
    setIsDismissed(true);
  };

  const toggleCandidate = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else {
        if (!multiSelect) next.clear();
        next.add(id);
      }
      return next;
    });
  };

  const hasSelection = selectedIds.size > 0 || createNewSelected;

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
              {isQuestionMode && multiSelect && ambiguity.candidates.length > 1 && (
                <span className="block text-xs text-white/50 mt-0.5">You can pick more than one.</span>
              )}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSkip}
            className="h-6 w-6 p-0 text-white/50 hover:text-white"
            title="Skip — don't ask again"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          {ambiguity.candidates.map((candidate) => {
            const selected = selectedIds.has(candidate.entity_id);
            return (
              <Button
                key={candidate.entity_id}
                variant="outline"
                size="sm"
                onClick={() =>
                  isQuestionMode
                    ? toggleCandidate(candidate.entity_id)
                    : handleResolve(candidate.entity_id, candidate.name)
                }
                disabled={isResolving}
                className={`${getEntityTypeColor(candidate.type)} hover:opacity-80 transition-opacity ${selected ? 'ring-2 ring-primary' : ''}`}
              >
                <div className="flex items-center gap-2">
                  {selected ? <Check className="h-3 w-3" /> : getEntityIcon(candidate.type)}
                  <div className="flex flex-col items-start">
                    <span className="font-medium">{candidate.name}</span>
                    {candidate.context_hint && (
                      <span className="text-xs opacity-70">{candidate.context_hint}</span>
                    )}
                  </div>
                </div>
              </Button>
            );
          })}

          {hasCreateNewOption && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => (isQuestionMode ? setCreateNewSelected(v => !v) : handleCreateNew())}
              disabled={isResolving}
              className={`bg-gray-500/20 text-gray-300 border-gray-500/30 hover:bg-gray-500/30 ${createNewSelected ? 'ring-2 ring-primary' : ''}`}
            >
              <div className="flex items-center gap-2">
                {createNewSelected ? <Check className="h-3 w-3" /> : <HelpCircle className="h-3 w-3" />}
                <span>Someone else</span>
              </div>
            </Button>
          )}
        </div>

        {isQuestionMode && hasSelection && (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() =>
                resolveQuestion({
                  selected_character_ids: [...selectedIds],
                  create_new: createNewSelected,
                })
              }
              disabled={isResolving}
              className="bg-primary/80 hover:bg-primary text-white"
            >
              Confirm
            </Button>
            <span className="text-xs text-white/40">
              {selectedIds.size > 0 && `${selectedIds.size} selected`}
              {selectedIds.size > 0 && createNewSelected && ' + '}
              {createNewSelected && 'new person'}
            </span>
          </div>
        )}

        {isResolving && (
          <p className="text-xs text-white/50">Processing...</p>
        )}
      </CardContent>
    </Card>
  );
};
