import { BookOpen, Users, MapPin, BookMarked, Edit } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { MarkdownRenderer } from '../chat/MarkdownRenderer';
import { DateRangeDisplay } from '../temporal/DateRangeDisplay';
import { DateDisplay } from '../temporal/DateDisplay';
import type { LoreNavigatorData } from '../../hooks/useLoreNavigatorData';
import type { SelectedItem } from './LoreNavigator';

type LoreContentViewerProps = {
  data: LoreNavigatorData;
  selectedItem: SelectedItem;
  onEdit: (item: SelectedItem) => void;
};

export const LoreContentViewer = ({ data, selectedItem, onEdit }: LoreContentViewerProps) => {
  if (!selectedItem) {
    return (
      <div className="h-full flex items-center justify-center p-12">
        <div className="text-center">
          <BookOpen className="h-16 w-16 mx-auto mb-4 text-white/20" />
          <h3 className="text-xl font-semibold text-white/60 mb-2">Select an item to view</h3>
          <p className="text-sm text-white/40">
            Choose a biography section, character, location, or chapter from the sidebar
          </p>
        </div>
      </div>
    );
  }

  const renderContent = () => {
    switch (selectedItem.type) {
      case 'biography': {
        const section = data.biography.find(s => s.id === selectedItem.id);
        if (!section) return null;
        return (
          <Card className="bg-black/40 border-border/50">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <CardTitle className="text-2xl text-white mb-2">{section.title}</CardTitle>
                  {section.period && (
                    <DateRangeDisplay
                      startDate={section.period.from}
                      endDate={section.period.to}
                      precision={(section as any).dateMetadata?.precision || 'day'}
                      variant="compact"
                      className="mt-1"
                    />
                  )}
                  {(section as any).dateMetadata && (
                    <p className="text-xs text-white/40 mt-1">
                      {(section as any).dateMetadata.confidence && (
                        <span>Confidence: {Math.round((section as any).dateMetadata.confidence * 100)}%</span>
                      )}
                      {(section as any).dateMetadata.source && (
                        <span className="ml-2">Source: {(section as any).dateMetadata.source}</span>
                      )}
                    </p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onEdit(selectedItem)}
                  leftIcon={<Edit className="h-4 w-4" />}
                >
                  Edit
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="prose prose-invert max-w-none">
                <MarkdownRenderer
                  content={
                    section.content || '*No content yet. Ask me to write this section.*'
                  }
                />
              </div>
              {section.lastUpdated && (
                <p className="text-xs text-white/40 mt-4">
                  Last updated: {new Date(section.lastUpdated).toLocaleString()}
                </p>
              )}
            </CardContent>
          </Card>
        );
      }

      case 'character': {
        const character = data.characters.find(c => c.id === selectedItem.id);
        if (!character) return null;
        return (
          <Card className="bg-black/40 border-border/50">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/20 rounded-lg">
                    <Users className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-2xl text-white">{character.name}</CardTitle>
                    {character.alias && character.alias.length > 0 && (
                      <p className="text-sm text-white/50 mt-1">
                        Also known as: {character.alias.join(', ')}
                      </p>
                    )}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onEdit(selectedItem)}
                  leftIcon={<Edit className="h-4 w-4" />}
                >
                  Edit
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {character.summary ? (
                <div className="prose prose-invert max-w-none">
                  <MarkdownRenderer content={character.summary} />
                </div>
              ) : (
                <p className="text-white/60">No summary available. Ask me to add details about this character.</p>
              )}
            </CardContent>
          </Card>
        );
      }

      case 'location': {
        const location = data.locations.find(l => l.id === selectedItem.id);
        if (!location) return null;
        return (
          <Card className="bg-black/40 border-border/50">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/20 rounded-lg">
                    <MapPin className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-2xl text-white">{location.name}</CardTitle>
                    {location.visitCount !== undefined && (
                      <p className="text-sm text-white/50 mt-1">
                        Visited {location.visitCount} time{location.visitCount !== 1 ? 's' : ''}
                      </p>
                    )}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onEdit(selectedItem)}
                  leftIcon={<Edit className="h-4 w-4" />}
                >
                  Edit
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-white/60">
                Location details will be displayed here. Ask me to add more information about this location.
              </p>
            </CardContent>
          </Card>
        );
      }

      case 'chapter': {
        const chapter = data.chapters.find(c => c.id === selectedItem.id);
        if (!chapter) return null;
        return (
          <Card className="bg-black/40 border-border/50">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/20 rounded-lg">
                    <BookMarked className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-2xl text-white">{chapter.title}</CardTitle>
                    {(chapter.start_date || chapter.end_date) && (
                      <DateRangeDisplay
                        startDate={chapter.start_date}
                        endDate={chapter.end_date}
                        precision="day"
                        variant="compact"
                        className="mt-1"
                      />
                    )}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onEdit(selectedItem)}
                  leftIcon={<Edit className="h-4 w-4" />}
                >
                  Edit
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {chapter.summary ? (
                <div className="prose prose-invert max-w-none">
                  <MarkdownRenderer content={chapter.summary} />
                </div>
              ) : (
                <p className="text-white/60">No summary available. Ask me to add details about this chapter.</p>
              )}
            </CardContent>
          </Card>
        );
      }

      default:
        return null;
    }
  };

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-4xl mx-auto">
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
          {renderContent()}
        </div>
      </div>
    </div>
  );
};

