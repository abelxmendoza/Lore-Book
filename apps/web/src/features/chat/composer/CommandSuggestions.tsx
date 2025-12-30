import { Command } from 'lucide-react';
import { Card } from '../../../components/ui/card';

type CommandSuggestion = {
  command: string;
  description: string;
};

type CommandSuggestionsProps = {
  suggestions: CommandSuggestion[];
  onSelect: (command: string) => void;
};

export const CommandSuggestions = ({ suggestions, onSelect }: CommandSuggestionsProps) => {
  return (
    <Card className="mx-4 mt-2 mb-2 bg-black/60 border-border/50">
      <div className="p-2 space-y-1">
        <div className="flex items-center gap-2 text-xs text-white/50 mb-1">
          <Command className="h-3 w-3" />
          <span>Commands</span>
        </div>
        {suggestions.map((suggestion, idx) => (
          <button
            key={idx}
            onClick={() => onSelect(suggestion.command)}
            className="w-full text-left px-2 py-1 rounded hover:bg-black/40 text-xs text-white/70 hover:text-white transition-colors"
          >
            <span className="font-mono text-primary/70">{suggestion.command}</span>
            <span className="ml-2 text-white/50">{suggestion.description}</span>
          </button>
        ))}
      </div>
    </Card>
  );
};

