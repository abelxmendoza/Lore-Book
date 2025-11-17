import { useState, useEffect } from 'react';
import { X, Calendar, Users, FileText, Tag } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { HQIResult } from './HQIResultCard';
import { fetchJson } from '../../lib/api';
import { useLoreKeeper } from '../../hooks/useLoreKeeper';

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
  result: HQIResult;
  isOpen: boolean;
  onClose: () => void;
};

export const HQIResultModal = ({ result, isOpen, onClose }: Props) => {
  const [entryDetail, setEntryDetail] = useState<EntryDetail | null>(null);
  const [characters, setCharacters] = useState<CharacterInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const { entries, timeline } = useLoreKeeper();

  useEffect(() => {
    if (isOpen && result.node_id) {
      loadResultDetails();
    }
  }, [isOpen, result.node_id]);

  const loadResultDetails = async () => {
    setLoading(true);
    try {
      // Find the entry from the result
      const entry = entries.find(e => e.id === result.node_id || e.date === result.timestamp);
      
      if (entry) {
        // Get chapter info if available
        const chapter = entry.chapter_id 
          ? timeline.chapters.find(c => c.id === entry.chapter_id)
          : null;

        setEntryDetail({
          id: entry.id,
          date: entry.date,
          content: entry.content,
          summary: entry.summary || undefined,
          tags: entry.tags || [],
          mood: entry.mood || undefined,
          chapter_id: entry.chapter_id || undefined,
          chapter_title: chapter?.title
        });

        // Extract characters from tags and content
        const characterNames = extractCharacters(entry);
        if (characterNames.length > 0) {
          await loadCharacterDetails(characterNames);
        }
      } else {
        // Fallback: use result data if entry not found locally
        if (result.snippet || result.title) {
          setEntryDetail({
            id: result.node_id,
            date: result.timestamp || new Date().toISOString(),
            content: result.snippet || result.title || '',
            tags: result.tags || []
          });
          const characterNames = extractCharacters({
            content: result.snippet || result.title || '',
            tags: result.tags || []
          });
          if (characterNames.length > 0) {
            await loadCharacterDetails(characterNames);
          }
        }
      }
    } catch (error) {
      console.error('Failed to load result details:', error);
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

  if (!isOpen) return null;

  const entryDate = entryDetail?.date || result.timestamp || '';
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <div 
        className="relative w-full max-w-6xl max-h-[90vh] bg-black/95 border border-border/60 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border/50">
          <div>
            <h2 className="text-2xl font-semibold text-white">{result.title || 'Memory Details'}</h2>
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
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-black/60 transition-colors"
          >
            <X className="h-5 w-5 text-white/60" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main Content - Timeline & Memory */}
            <div className="lg:col-span-2 space-y-6">
              {/* Memory Content */}
              <Card className="bg-black/40 border-border/60">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-primary" />
                    <CardTitle>Memory</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {loading ? (
                    <div className="text-center py-8 text-white/60">Loading...</div>
                  ) : entryDetail ? (
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
                  ) : (
                    <div className="text-center py-8 text-white/60">
                      <p>{result.snippet || 'No content available'}</p>
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
                          className="p-3 rounded-lg border border-border/50 bg-black/60 hover:border-primary/50 transition-colors"
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

              {/* HQI Score */}
              <Card className="bg-black/40 border-border/60">
                <CardHeader>
                  <CardTitle className="text-sm">Relevance Score</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-primary">
                      {(result.score * 100).toFixed(1)}%
                    </div>
                    <p className="text-xs text-white/50 mt-2">HQI Score</p>
                    {result.reasons.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1 justify-center">
                        {result.reasons.map((reason, idx) => (
                          <Badge key={idx} className="bg-primary/20 text-primary text-xs">
                            {reason}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

