import { useState, useEffect } from 'react';
import { X, Calendar, Users, FileText, Tag, ChevronLeft, ChevronRight, BookOpen, Edit2, Save } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { fetchJson } from '../../lib/api';
import { useLoreKeeper } from '../../hooks/useLoreKeeper';
import { TagSuggestionBar } from '../composer/TagSuggestionBar';

type EntryDetail = {
  id: string;
  date: string;
  content: string;
  summary?: string;
  tags: string[];
  mood?: string;
  chapter_id?: string;
  chapter_title?: string;
};

type CharacterInfo = {
  id: string;
  name: string;
  summary?: string;
  role?: string;
};

type Props = {
  entryId: string;
  isOpen: boolean;
  onClose: () => void;
  onNavigate?: (entryId: string) => void;
};

export const TimelineEntryModal = ({ entryId, isOpen, onClose, onNavigate }: Props) => {
  const [entryDetail, setEntryDetail] = useState<EntryDetail | null>(null);
  const [characters, setCharacters] = useState<CharacterInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [prevEntryId, setPrevEntryId] = useState<string | null>(null);
  const [nextEntryId, setNextEntryId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [editSummary, setEditSummary] = useState('');
  const [editTags, setEditTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const { entries, timeline, refreshEntries, refreshTimeline } = useLoreKeeper();

  useEffect(() => {
    if (isOpen && entryId) {
      loadEntryDetails();
    }
  }, [isOpen, entryId]);

  const loadEntryDetails = async () => {
    setLoading(true);
    try {
      // Find the entry from local data
      const entry = entries.find(e => e.id === entryId);
      
      if (entry) {
        // Get chapter info if available
        const chapter = entry.chapter_id 
          ? timeline.chapters.find(c => c.id === entry.chapter_id)
          : null;

        const detail: EntryDetail = {
          id: entry.id,
          date: entry.date,
          content: entry.content,
          summary: entry.summary || undefined,
          tags: entry.tags || [],
          mood: entry.mood || undefined,
          chapter_id: entry.chapter_id || undefined,
          chapter_title: chapter?.title
        };
        setEntryDetail(detail);
        setEditContent(detail.content);
        setEditSummary(detail.summary || '');
        setEditTags(detail.tags);

        // Find previous and next entries
        const allEntries = timeline.chapters.flatMap(ch => 
          ch.months.flatMap(m => m.entries)
        ).concat(timeline.unassigned.flatMap(m => m.entries));
        
        const sortedEntries = allEntries.sort((a, b) => 
          new Date(a.date).getTime() - new Date(b.date).getTime()
        );
        
        const currentIndex = sortedEntries.findIndex(e => e.id === entryId);
        if (currentIndex > 0) {
          setPrevEntryId(sortedEntries[currentIndex - 1].id);
        } else {
          setPrevEntryId(null);
        }
        if (currentIndex < sortedEntries.length - 1) {
          setNextEntryId(sortedEntries[currentIndex + 1].id);
        } else {
          setNextEntryId(null);
        }

        // Extract characters from tags and content
        const characterNames = extractCharacters(entry);
        if (characterNames.length > 0) {
          await loadCharacterDetails(characterNames);
        }
      } else {
        // Try to fetch from API
        try {
          const data = await fetchJson<EntryDetail>(`/api/entries/${entryId}`);
          setEntryDetail(data);
        } catch (error) {
          console.error('Failed to load entry:', error);
        }
      }
    } catch (error) {
      console.error('Failed to load entry details:', error);
    } finally {
      setLoading(false);
    }
  };

  const extractCharacters = (entry: EntryDetail | { content: string; tags?: string[] }): string[] => {
    const characterNames: string[] = [];
    
    // Check tags for character names (capitalized)
    if (entry.tags) {
      entry.tags.forEach(tag => {
        if (/^[A-Z][a-z]+/.test(tag)) {
          characterNames.push(tag);
        }
      });
    }

    // Extract from content (simple heuristic - capitalized words that might be names)
    const contentWords = entry.content.match(/\b[A-Z][a-z]+\b/g) || [];
    const commonWords = new Set(['I', 'The', 'This', 'That', 'It', 'He', 'She', 'They', 'We', 'You', 'A', 'An']);
    contentWords.forEach(word => {
      if (!commonWords.has(word) && word.length > 2 && !characterNames.includes(word)) {
        characterNames.push(word);
      }
    });

    return characterNames.slice(0, 10); // Limit to 10
  };

  const loadCharacterDetails = async (characterNames: string[]) => {
    try {
      const allCharacters = await fetchJson<{ characters: CharacterInfo[] }>('/api/characters/list');
      const matched = allCharacters.characters.filter(char => 
        characterNames.some(name => 
          char.name.toLowerCase().includes(name.toLowerCase()) ||
          name.toLowerCase().includes(char.name.toLowerCase())
        )
      );
      setCharacters(matched);
    } catch (error) {
      console.error('Failed to load characters:', error);
    }
  };

  const handleSaveEdit = async () => {
    if (!entryDetail || saving) return;
    
    setSaving(true);
    try {
      const updated = await fetchJson<EntryDetail>(`/api/entries/${entryDetail.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          content: editContent,
          summary: editSummary || null,
          tags: editTags
        })
      });
      
      setEntryDetail(updated);
      setIsEditing(false);
      await Promise.all([refreshEntries(), refreshTimeline()]);
    } catch (error) {
      console.error('Failed to save entry:', error);
      alert('Failed to save changes. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    if (entryDetail) {
      setEditContent(entryDetail.content);
      setEditSummary(entryDetail.summary || '');
      setEditTags(entryDetail.tags);
    }
    setIsEditing(false);
  };

  if (!isOpen) return null;

  const entryDate = entryDetail?.date || '';
  const timelineEntries = timeline.chapters.flatMap(ch => 
    ch.months.flatMap(m => m.entries)
  ).concat(timeline.unassigned.flatMap(m => m.entries));

  // Find entries around the same time period (±7 days)
  const resultDate = entryDate ? new Date(entryDate) : null;
  const relatedEntries = resultDate
    ? timelineEntries.filter(e => {
        const entryDate = new Date(e.date);
        const diffDays = Math.abs((entryDate.getTime() - resultDate.getTime()) / (1000 * 60 * 60 * 24));
        return diffDays <= 7 && e.id !== entryDetail?.id;
      }).slice(0, 5)
    : [];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="entry-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div 
        className="relative w-full max-w-6xl max-h-[90vh] bg-black/95 border border-border/60 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            onClose();
          }
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border/50">
          <div className="flex items-center gap-4">
            {prevEntryId && (
              <Button
                variant="ghost"
                size="sm"
                aria-label="Previous entry"
                onClick={(e) => {
                  e.stopPropagation();
                  if (onNavigate && prevEntryId) {
                    onNavigate(prevEntryId);
                  }
                }}
                className="p-2"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            )}
            <div className="flex-1">
              <h2 id="entry-modal-title" className="text-2xl font-semibold text-white">
                {entryDetail?.summary || 'Memory Details'}
              </h2>
              {entryDate && (
                <p className="text-sm text-white/60 mt-1">
                  {new Date(entryDate).toLocaleDateString('en-US', { 
                    weekday: 'long', 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                  })}
                </p>
              )}
            </div>
            {nextEntryId && (
              <Button
                variant="ghost"
                size="sm"
                aria-label="Next entry"
                onClick={(e) => {
                  e.stopPropagation();
                  if (onNavigate && nextEntryId) {
                    onNavigate(nextEntryId);
                  }
                }}
                className="p-2"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            )}
            <button
              onClick={onClose}
              aria-label="Close modal"
              className="p-2 rounded-lg hover:bg-black/60 transition-colors"
            >
              <X className="h-5 w-5 text-white/60" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main Content - Timeline & Memory */}
            <div className="lg:col-span-2 space-y-6">
              {/* Memory Content */}
              <Card className="bg-black/40 border-border/60">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileText className="h-5 w-5 text-primary" />
                      <CardTitle>Memory</CardTitle>
                      {entryDetail?.chapter_title && (
                        <Badge variant="outline" className="ml-2 border-primary/50 text-primary">
                          <BookOpen className="h-3 w-3 mr-1" />
                          {entryDetail.chapter_title}
                        </Badge>
                      )}
                    </div>
                    {entryDetail && !isEditing && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setIsEditing(true)}
                        leftIcon={<Edit2 className="h-3 w-3" />}
                      >
                        Edit
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {loading ? (
                    <div className="text-center py-8 text-white/60">Loading...</div>
                  ) : entryDetail ? (
                    <>
                      {isEditing ? (
                        <div className="space-y-4">
                          <div>
                            <label className="text-xs text-white/60 mb-1 block">Summary</label>
                            <Textarea
                              value={editSummary}
                              onChange={(e) => setEditSummary(e.target.value)}
                              className="bg-black/60 border-border/50 text-white min-h-[80px]"
                              placeholder="Optional summary..."
                            />
                          </div>
                          <div>
                            <label className="text-xs text-white/60 mb-1 block">Content</label>
                            <Textarea
                              value={editContent}
                              onChange={(e) => setEditContent(e.target.value)}
                              className="bg-black/60 border-border/50 text-white min-h-[200px]"
                              placeholder="Entry content..."
                            />
                          </div>
                          <div>
                            <label className="text-xs text-white/60 mb-1 block">Tags</label>
                            <Textarea
                              value={editTags.join(', ')}
                              onChange={(e) => setEditTags(e.target.value.split(',').map(t => t.trim()).filter(Boolean))}
                              className="bg-black/60 border-border/50 text-white min-h-[60px]"
                              placeholder="tag1, tag2, tag3..."
                            />
                            <div className="mt-2">
                              <TagSuggestionBar
                                content={editContent}
                                selectedTags={editTags}
                                onTagSelect={(tag) => {
                                  if (!editTags.includes(tag)) {
                                    setEditTags([...editTags, tag]);
                                  }
                                }}
                              />
                            </div>
                          </div>
                          <div className="flex gap-2 justify-end">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={handleCancelEdit}
                              disabled={saving}
                            >
                              Cancel
                            </Button>
                            <Button
                              size="sm"
                              onClick={handleSaveEdit}
                              disabled={saving || !editContent.trim()}
                              leftIcon={<Save className="h-3 w-3" />}
                            >
                              {saving ? 'Saving...' : 'Save'}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          {entryDetail.summary && (
                            <div className="p-3 rounded-lg bg-primary/10 border border-primary/30">
                              <p className="text-sm font-semibold text-primary mb-1">Summary</p>
                              <p className="text-sm text-white/90">{entryDetail.summary}</p>
                            </div>
                          )}
                          <div className="prose prose-invert max-w-none">
                            <p className="text-white/90 whitespace-pre-wrap leading-relaxed">
                              {entryDetail.content}
                            </p>
                          </div>
                          {entryDetail.mood && (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-white/50">Mood:</span>
                              <Badge className="bg-purple-500/20 text-purple-200">{entryDetail.mood}</Badge>
                            </div>
                          )}
                          {entryDetail.tags.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                              {entryDetail.tags.map(tag => (
                                <Badge key={tag} variant="outline" className="border-primary/50 text-primary">
                                  <Tag className="h-3 w-3 mr-1" />
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </>
                  ) : (
                    <div className="text-center py-8 text-white/60">
                      <p>No content available</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Timeline Context */}
              {relatedEntries.length > 0 && (
                <Card className="bg-black/40 border-border/60">
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-5 w-5 text-primary" />
                      <CardTitle>Timeline Context</CardTitle>
                    </div>
                    <p className="text-sm text-white/60">Entries from the same time period</p>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {relatedEntries.map(entry => (
                        <div 
                          key={entry.id}
                          className="p-3 rounded-lg border border-border/50 bg-black/60 hover:border-primary/50 transition-colors cursor-pointer"
                          onClick={() => {
                            if (onNavigate) {
                              onNavigate(entry.id);
                            }
                          }}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs text-white/50">
                              {new Date(entry.date).toLocaleDateString()}
                            </span>
                            {entry.chapter_id && (
                              <Badge variant="outline" className="border-primary/50 text-primary text-xs">
                                {timeline.chapters.find(c => c.id === entry.chapter_id)?.title || 'Chapter'}
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-white/80 line-clamp-2">
                            {entry.summary || entry.content.substring(0, 150)}...
                          </p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Sidebar - Characters */}
            <div className="space-y-4">
              <Card className="bg-black/40 border-border/60">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-primary" />
                    <CardTitle>Characters Involved</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="text-center py-4 text-white/60 text-sm">Loading...</div>
                  ) : characters.length > 0 ? (
                    <div className="space-y-3">
                      {characters.map(char => (
                        <div 
                          key={char.id}
                          className="p-3 rounded-lg border border-border/50 bg-black/60"
                        >
                          <h4 className="font-semibold text-white mb-1">{char.name}</h4>
                          {char.role && (
                            <p className="text-xs text-primary/70 mb-2">{char.role}</p>
                          )}
                          {char.summary && (
                            <p className="text-xs text-white/60 line-clamp-3">{char.summary}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-white/60">
                      <Users className="h-8 w-8 mx-auto mb-2 text-white/20" />
                      <p className="text-sm">No characters detected</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

