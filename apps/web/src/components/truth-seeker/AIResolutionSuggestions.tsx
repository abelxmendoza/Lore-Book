import { useState } from 'react';
import { Sparkles, CheckCircle2, XCircle, Loader2, Copy } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';

type AISuggestion = {
  suggestion: string;
  explanation: string;
  confidence: number;
  reasoning: string[];
  action: 'accept_left' | 'accept_right' | 'merge' | 'dismiss';
};

type AIResolutionSuggestionsProps = {
  leftText: string;
  rightText: string;
  onSuggestionAccept?: (suggestion: AISuggestion) => void;
  onSuggestionDismiss?: () => void;
  loading?: boolean;
};

export const AIResolutionSuggestions = ({
  leftText,
  rightText,
  onSuggestionAccept,
  onSuggestionDismiss,
  loading = false,
}: AIResolutionSuggestionsProps) => {
  const [suggestion, setSuggestion] = useState<AISuggestion | null>(null);
  const [expanded, setExpanded] = useState(true);

  // TODO: Fetch from API
  const fetchSuggestion = async () => {
    // Placeholder - will be replaced with actual API call
    setTimeout(() => {
      setSuggestion({
        suggestion: 'Consider keeping the original statement as it appears earlier in your timeline and has more supporting context.',
        explanation: 'The original statement has 3 supporting memories while the contradicting one has only 1.',
        confidence: 0.85,
        reasoning: [
          'Original statement appears in multiple related memories',
          'Contradicting statement is isolated',
          'Timeline context supports the original',
        ],
        action: 'accept_left',
      });
    }, 1000);
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'bg-green-500/20 text-green-400 border-green-500/30';
    if (confidence >= 0.6) return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
    return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
  };

  const getActionLabel = (action: AISuggestion['action']) => {
    switch (action) {
      case 'accept_left':
        return 'Accept Original';
      case 'accept_right':
        return 'Accept Contradicting';
      case 'merge':
        return 'Merge Both';
      case 'dismiss':
        return 'Dismiss Contradiction';
    }
  };

  if (loading) {
    return (
      <Card className="bg-black/40 border-border/60">
        <CardHeader>
          <CardTitle className="text-lg text-white flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Suggestions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="ml-3 text-white/60">Analyzing contradiction...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-black/40 border-border/60">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg text-white flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Suggestions
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
            className="text-white/60 hover:text-white"
          >
            {expanded ? 'Collapse' : 'Expand'}
          </Button>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent>
          {!suggestion ? (
            <div className="space-y-4">
              <p className="text-sm text-white/60">
                Get AI-powered suggestions for resolving this contradiction.
              </p>
              <Button
                onClick={fetchSuggestion}
                className="w-full bg-primary/20 hover:bg-primary/30 text-primary border-primary/30"
              >
                <Sparkles className="h-4 w-4 mr-2" />
                Get AI Suggestion
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Badge variant="outline" className={getConfidenceColor(suggestion.confidence)}>
                  {(suggestion.confidence * 100).toFixed(0)}% Confidence
                </Badge>
                <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
                  {getActionLabel(suggestion.action)}
                </Badge>
              </div>

              <div>
                <h4 className="text-sm font-semibold text-white mb-2">Suggestion</h4>
                <p className="text-sm text-white/90 bg-black/40 p-3 rounded-lg border border-border/60">
                  {suggestion.suggestion}
                </p>
              </div>

              <div>
                <h4 className="text-sm font-semibold text-white mb-2">Explanation</h4>
                <p className="text-sm text-white/80">{suggestion.explanation}</p>
              </div>

              {suggestion.reasoning.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-white mb-2">Reasoning</h4>
                  <ul className="space-y-1">
                    {suggestion.reasoning.map((reason, idx) => (
                      <li key={idx} className="text-sm text-white/70 flex items-start gap-2">
                        <span className="text-primary mt-1">•</span>
                        {reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <Button
                  onClick={() => onSuggestionAccept?.(suggestion)}
                  className="flex-1 bg-green-500/20 hover:bg-green-500/30 text-green-400 border-green-500/30"
                >
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Accept Suggestion
                </Button>
                <Button
                  onClick={onSuggestionDismiss}
                  variant="outline"
                  className="flex-1 border-border/60 text-white/60 hover:text-white"
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Dismiss
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
};

