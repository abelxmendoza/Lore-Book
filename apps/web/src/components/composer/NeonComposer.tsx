import { useState } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { ArcSuggestionBar } from './ArcSuggestionBar';
import { CharacterSuggestionBar } from './CharacterSuggestionBar';
import { EmotionalSlider } from './EmotionalSlider';
import { TagSuggestionBar } from './TagSuggestionBar';
import { VoiceMemoButton } from './VoiceMemoButton';
import { MarkdownEditor } from './MarkdownEditor';

export const NeonComposer = () => {
  const [draft, setDraft] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const handleTranscriptionComplete = (content: string, tags?: string[], mood?: string) => {
    setDraft(content);
    if (tags && tags.length > 0) {
      setSelectedTags(tags);
    }
    // Note: mood could be used to set emotional slider if needed
  };

  const handleVoiceError = (error: string) => {
    console.error('Voice memo error:', error);
    // Could show a toast notification here
  };

  const handleTagSelect = (tag: string) => {
    if (selectedTags.includes(tag)) {
      setSelectedTags(selectedTags.filter(t => t !== tag));
    } else {
      setSelectedTags([...selectedTags, tag]);
    }
  };

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
        <VoiceMemoButton
          onTranscriptionComplete={handleTranscriptionComplete}
          onError={handleVoiceError}
        />
        <MarkdownEditor
          value={draft}
          onChange={setDraft}
          placeholder="Stream your memory... Use markdown for formatting!"
          className="w-full"
          minHeight="200px"
        />
        <TagSuggestionBar content={draft} selectedTags={selectedTags} onTagSelect={handleTagSelect} />
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
