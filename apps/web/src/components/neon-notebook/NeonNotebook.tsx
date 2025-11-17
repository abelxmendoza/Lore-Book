import { AutoTagSuggestions } from './AutoTagSuggestions';
import { CharacterLinker } from './CharacterLinker';
import { MoodBar } from './MoodBar';
import { ArcLinker } from './ArcLinker';
import { MemoryPreviewPanel } from './MemoryPreviewPanel';
import { NeonFrame } from './NeonFrame';
import { NotebookComposer } from './NotebookComposer';
import { useNotebookEngine } from '../../hooks/useNotebookEngine';
import './styles.css';

export const NeonNotebook = () => {
  const engine = useNotebookEngine();

  return (
    <NeonFrame moodColor={engine.moodEngine.mood.color}>
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <NotebookComposer
            value={engine.text}
            onChange={engine.setText}
            moodColor={engine.moodEngine.mood.color}
            moodScore={engine.moodEngine.mood.score}
            saving={engine.saving}
            lastSavedAt={engine.lastSavedAt}
            onSubmit={engine.submit}
          />
          <AutoTagSuggestions tagger={engine.autoTagger} />
          <CharacterLinker indexer={engine.characterIndexer} />
          <MoodBar moodEngine={engine.moodEngine} />
          <ArcLinker arcs={engine.arcSuggestions} />
        </div>
        <div className="space-y-6">
          <MemoryPreviewPanel previews={engine.memoryPreview} />
        </div>
      </div>
    </NeonFrame>
  );
};
