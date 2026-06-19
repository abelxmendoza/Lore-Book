import { useState, useRef, useEffect } from 'react';
import {
  BookOpen, Users, MapPin, BookMarked, Edit, Save, X, MessageSquare,
  Eye, EyeOff, Undo2, Redo2, Loader2, Sparkles, FileText,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { MarkdownRenderer } from '../chat/MarkdownRenderer';
import { DateRangeDisplay } from '../temporal/DateRangeDisplay';
import { RichTextEditor } from './RichTextEditor';
import { useIsMobile } from '../../hooks/useIsMobile';
import type { LoreNavigatorData, BiographySection } from '../../hooks/useLoreNavigatorData';
import type { SelectedItem } from './LoreNavigator';
import type { SectionChatResult } from '../../api/lorebookEditor';

type LoreContentViewerProps = {
  data: LoreNavigatorData;
  selectedItem: SelectedItem;
  onEdit: (item: SelectedItem) => void;
  onSaveSection?: (sectionId: string, updates: { title?: string; content?: string }) => Promise<void>;
  onSectionChat?: (
    sectionId: string,
    message: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }>,
    focus: string
  ) => Promise<SectionChatResult>;
};

type HistoryEntry = { content: string; title: string; timestamp: Date };

const BiographySectionView = ({
  section,
  onEdit,
  onSaveSection,
  onSectionChat,
}: {
  section: BiographySection;
  onEdit: () => void;
  onSaveSection?: LoreContentViewerProps['onSaveSection'];
  onSectionChat?: LoreContentViewerProps['onSectionChat'];
}) => {
  const isMobile = useIsMobile(768);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(section.title);
  const [editContent, setEditContent] = useState(section.content);
  const [saving, setSaving] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const [showSectionChat, setShowSectionChat] = useState(false);
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isEditing) {
      setEditTitle(section.title);
      setEditContent(section.content);
    }
  }, [section.id, section.title, section.content, isEditing]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, chatLoading]);

  const startEditing = () => {
    setIsEditing(true);
    setShowSectionChat(false);
    setEditTitle(section.title);
    setEditContent(section.content);
    if (history.length === 0) {
      setHistory([{ content: section.content, title: section.title, timestamp: new Date() }]);
      setHistoryIndex(0);
    }
  };

  const pushHistory = (content: string, title: string) => {
    setHistory((prev) => {
      const trimmed = prev.slice(0, historyIndex + 1);
      return [...trimmed, { content, title, timestamp: new Date() }];
    });
    setHistoryIndex((i) => i + 1);
  };

  const undo = () => {
    if (historyIndex <= 0) return;
    const nextIndex = historyIndex - 1;
    setHistoryIndex(nextIndex);
    setEditContent(history[nextIndex].content);
    setEditTitle(history[nextIndex].title);
  };

  const redo = () => {
    if (historyIndex >= history.length - 1) return;
    const nextIndex = historyIndex + 1;
    setHistoryIndex(nextIndex);
    setEditContent(history[nextIndex].content);
    setEditTitle(history[nextIndex].title);
  };

  const saveEdit = async () => {
    if (!onSaveSection) {
      setIsEditing(false);
      return;
    }
    setSaving(true);
    try {
      pushHistory(editContent, editTitle);
      await onSaveSection(section.id, { title: editTitle, content: editContent });
      setIsEditing(false);
    } catch (error) {
      console.error('Failed to save section:', error);
    } finally {
      setSaving(false);
    }
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setEditTitle(section.title);
    setEditContent(section.content);
  };

  const sendSectionChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !onSectionChat || chatLoading) return;

    const userMessage = chatInput.trim();
    setChatInput('');
    setChatMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
    setChatLoading(true);

    try {
      const result = await onSectionChat(section.id, userMessage, chatMessages, section.title);
      setChatMessages((prev) => [...prev, { role: 'assistant', content: result.answer }]);
      if (result.updatedContent) {
        setEditContent(result.updatedContent);
        if (!isEditing) {
          setEditTitle(section.title);
          setIsEditing(false);
        }
      }
    } catch (error) {
      setChatMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `Error: ${error instanceof Error ? error.message : 'Failed to process edit'}` },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const displayContent =
    showOriginal && section.originalContent ? section.originalContent : section.content;
  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  return (
    <Card className="bg-black/40 border-border/50 border-0 sm:border rounded-none sm:rounded-lg shadow-none sm:shadow-sm">
      <CardHeader className="px-3 py-3 sm:px-6 sm:py-6 sticky top-0 z-10 bg-black/80 sm:bg-transparent backdrop-blur-sm sm:backdrop-blur-none border-b border-border/30 sm:border-0">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="flex-1 min-w-0">
            {isEditing ? (
              <Input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="bg-black/60 border-border/50 text-white text-base sm:text-xl font-semibold mb-2 min-h-[44px]"
                placeholder="Section title"
              />
            ) : (
              <CardTitle className="text-lg sm:text-2xl text-white mb-1 sm:mb-2 leading-snug">{section.title}</CardTitle>
            )}
            {section.period && !isEditing && (
              <DateRangeDisplay
                startDate={section.period.from}
                endDate={section.period.to}
                precision={section.dateMetadata?.precision || 'day'}
                variant="compact"
                className="mt-1"
              />
            )}
          </div>
          <div className="flex flex-wrap gap-1.5 shrink-0 w-full sm:w-auto">
            {section.originalContent && section.isEdited && !isEditing && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowOriginal((v) => !v)}
                leftIcon={showOriginal ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                className="text-xs min-h-[40px]"
              >
                <span className="hidden sm:inline">{showOriginal ? 'Current' : 'Original'}</span>
              </Button>
            )}
            {isEditing && (
              <>
                <Button size="sm" variant="ghost" onClick={undo} disabled={!canUndo} leftIcon={<Undo2 className="h-3 w-3" />} aria-label="Undo" className="min-h-[40px] min-w-[40px]" />
                <Button size="sm" variant="ghost" onClick={redo} disabled={!canRedo} leftIcon={<Redo2 className="h-3 w-3" />} aria-label="Redo" className="min-h-[40px] min-w-[40px]" />
              </>
            )}
            {!isEditing && onSectionChat && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => { setShowSectionChat((v) => !v); setIsEditing(false); }}
                leftIcon={<MessageSquare className="h-3 w-3" />}
                className="text-xs min-h-[40px]"
              >
                <span className="sm:hidden">AI</span>
                <span className="hidden sm:inline">AI Edit</span>
              </Button>
            )}
            {!isEditing ? (
              <Button size="sm" variant="outline" onClick={startEditing} leftIcon={<Edit className="h-3 w-3" />} className="text-xs min-h-[40px] flex-1 sm:flex-none">
                Edit
              </Button>
            ) : (
              <>
                <Button size="sm" variant="outline" onClick={cancelEdit} disabled={saving} className="text-xs min-h-[40px]">
                  Cancel
                </Button>
                <Button size="sm" onClick={() => void saveEdit()} disabled={saving} leftIcon={saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />} className="min-h-[40px]">
                  Save
                </Button>
              </>
            )}
            {!isEditing && (
              <Button size="sm" variant="ghost" onClick={onEdit} leftIcon={<Sparkles className="h-3 w-3" />} className="min-h-[40px]">
                <span className="sm:hidden">Chat</span>
                <span className="hidden sm:inline">Chat</span>
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-3 pb-4 sm:px-6 sm:pb-6">
        {isEditing ? (
          <RichTextEditor
            value={editContent}
            onChange={setEditContent}
            onSave={() => void saveEdit()}
            placeholder="Edit your lorebook section… Markdown supported."
            minHeight={isMobile ? '240px' : '420px'}
            autoFocus
            className="w-full"
          />
        ) : (
          <div className="space-y-3">
            <div className="prose prose-sm sm:prose-base prose-invert max-w-none">
              <MarkdownRenderer content={displayContent || '*No content yet. Tap Edit to write this section.*'} />
            </div>
            {section.isEdited && (
              <div className="text-xs text-primary/70 flex items-center gap-1">
                <FileText className="h-3 w-3" />
                Manually edited
              </div>
            )}
          </div>
        )}

        {showSectionChat && onSectionChat && (
          <div className="mt-4 rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-white flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                Section AI Editor
              </p>
              <button type="button" onClick={() => setShowSectionChat(false)} className="text-white/40 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-2 max-h-56 overflow-y-auto">
              {chatMessages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`p-2 rounded text-sm ${msg.role === 'user' ? 'bg-primary/10 ml-4' : 'bg-black/60 mr-4'}`}
                >
                  {msg.content}
                </div>
              ))}
              {chatLoading && (
                <div className="flex items-center gap-2 text-white/60 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Thinking…
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
            <form onSubmit={(e) => void sendSectionChat(e)} className="flex gap-2">
              <Textarea
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Ask AI to refine this section…"
                className="flex-1 bg-black/60 border-border/50 text-white text-sm"
                rows={2}
                disabled={chatLoading}
              />
              <Button type="submit" disabled={!chatInput.trim() || chatLoading} className="self-end">
                Send
              </Button>
            </form>
          </div>
        )}

        {section.lastUpdated && (
          <p className="text-xs text-white/40 mt-4">
            Last updated: {new Date(section.lastUpdated).toLocaleString()}
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export const LoreContentViewer = ({
  data,
  selectedItem,
  onEdit,
  onSaveSection,
  onSectionChat,
}: LoreContentViewerProps) => {
  if (!selectedItem) {
    return (
      <div className="h-full flex items-center justify-center p-6 sm:p-12">
        <div className="text-center max-w-sm">
          <BookOpen className="h-12 w-12 sm:h-16 sm:w-16 mx-auto mb-4 text-white/20" />
          <h3 className="text-lg sm:text-xl font-semibold text-white/60 mb-2">Select an item to view</h3>
          <p className="text-sm text-white/40">
            Choose a section, character, location, or chapter from Browse
          </p>
        </div>
      </div>
    );
  }

  const renderContent = () => {
    switch (selectedItem.type) {
      case 'biography': {
        const section = data.biography.find((s) => s.id === selectedItem.id);
        if (!section) return null;
        return (
          <BiographySectionView
            section={section}
            onEdit={() => onEdit(selectedItem)}
            onSaveSection={onSaveSection}
            onSectionChat={onSectionChat}
          />
        );
      }

      case 'character': {
        const character = data.characters.find((c) => c.id === selectedItem.id);
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
                <Button size="sm" variant="outline" onClick={() => onEdit(selectedItem)} leftIcon={<Edit className="h-4 w-4" />}>
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
        const location = data.locations.find((l) => l.id === selectedItem.id);
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
                <Button size="sm" variant="outline" onClick={() => onEdit(selectedItem)} leftIcon={<Edit className="h-4 w-4" />}>
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
        const chapter = data.chapters.find((c) => c.id === selectedItem.id);
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
                <Button size="sm" variant="outline" onClick={() => onEdit(selectedItem)} leftIcon={<Edit className="h-4 w-4" />}>
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
    <div className="h-full overflow-y-auto p-0 sm:p-4 min-h-0">
      <div className="max-w-4xl mx-auto">
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
          {renderContent()}
        </div>
      </div>
    </div>
  );
};
