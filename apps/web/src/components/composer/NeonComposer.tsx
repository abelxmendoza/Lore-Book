import { useState } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { ArcSuggestionBar } from './ArcSuggestionBar';
import { CharacterSuggestionBar } from './CharacterSuggestionBar';
import { EmotionalSlider } from './EmotionalSlider';
import { TagSuggestionBar } from './TagSuggestionBar';

export const NeonComposer = () => {
  const [draft, setDraft] = useState('');

  const save = () => {
    // Endpoint stub: /journal/create
    console.log('Saving draft', draft);
  };

  return (
    <Card className="neon-surface border border-primary/40">
      <CardHeader>
        <CardTitle className="font-techno text-lg">Neon Notebook</CardTitle>
        <p className="text-xs text-white/60">Auto-tagged, persona-aware composition</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Stream your memory..."
          className="h-40 w-full rounded-lg border border-border/40 bg-black/50 p-3 text-white focus:outline-none"
        />
        <TagSuggestionBar />
        <CharacterSuggestionBar />
        <ArcSuggestionBar />
        <EmotionalSlider />
        <Button onClick={save} className="w-full bg-primary text-background">
          Save Memory
        </Button>
      </CardContent>
    </Card>
  );
};
