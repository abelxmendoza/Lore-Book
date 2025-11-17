import { useState, useEffect, useRef } from 'react';
import { BookOpen, Edit2, Save, X, ChevronRight, ChevronDown, Sparkles, Loader2, MessageSquare, FileText, Eye, EyeOff, Undo2, Redo2, Upload, Layout, Plus, Shield, Search } from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Textarea } from '../ui/textarea';
import { Input } from '../ui/input';
import { fetchJson } from '../../lib/api';
import { useLoreKeeper } from '../../hooks/useLoreKeeper';
import { MemoirOutlineEditor } from './MemoirOutlineEditor';
import { ContinuityPanel } from '../ContinuityPanel';
import { ColorCodedTimeline } from '../timeline/ColorCodedTimeline';
import { parseQuery } from '../../utils/parseQuery';
import { Badge } from '../ui/badge';

type MemoirSection = {
  id: string;
  title: string;
  content: string;
  order: number;
  parentId?: string;
  children?: MemoirSection[];
  focus?: string;
  period?: { from: string; to: string };
  lastUpdated?: string;
  corrections?: Array<{ date: string; reason: string; change: string }>;
  originalContent?: string; // Store original AI-generated content
  isEdited?: boolean;
};

type MemoirOutline = {
  id: string;
  title: string;
  sections: MemoirSection[];
  lastUpdated: string;
  autoUpdate: boolean;
  metadata?: {
    languageStyle?: string;
    originalDocument?: boolean;
  };
};

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
};

export const MemoirEditor = () => {
  const [outline, setOutline] = useState<MemoirOutline | null>(null);
  const [loading, setLoading] = useState(false);
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [showChat, setShowChat] = useState(false);
  const [chatSectionId, setChatSectionId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [showOriginal, setShowOriginal] = useState<Record<string, boolean>>({});
  const [history, setHistory] = useState<Record<string, Array<{ content: string; timestamp: Date }>>>({});
  const [historyIndex, setHistoryIndex] = useState<Record<string, number>>({});
  const [showOutline, setShowOutline] = useState(true);
  const [showCanonKeeper, setShowCanonKeeper] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<string | null>(null);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [detectedFilters, setDetectedFilters] = useState<string[]>([]);
  const [highlightedSectionId, setHighlightedSectionId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const { refreshTimeline, refreshChapters, entries, refreshEntries, chapters } = useLoreKeeper();

  useEffect(() => {
    loadMemoir();
  }, []);

  // Auto-generate outline from chats/entries (like timeline)
  useEffect(() => {
    if (entries.length > 0 && outline && outline.sections.length === 0) {
      // Auto-generate sections from recent entries
      autoGenerateOutline();
    }
  }, [entries.length]);

  const autoGenerateOutline = async () => {
    try {
      // Get recent entries and generate sections
      const recentEntries = entries.slice(-20); // Last 20 entries
      if (recentEntries.length < 3) return;

      // Group entries by date ranges or themes
      const dateRanges = groupEntriesByDateRange(recentEntries);
      
      for (const range of dateRanges) {
        await generateSectionFromRange(range);
      }
      
      await loadMemoir();
    } catch (error) {
      console.error('Failed to auto-generate outline:', error);
    }
  };

  const groupEntriesByDateRange = (entries: any[]) => {
    // Group entries into date ranges (e.g., weekly or monthly)
    const ranges: Array<{ from: string; to: string; entries: any[] }> = [];
    let currentRange: { from: string; to: string; entries: any[] } | null = null;

    entries.forEach(entry => {
      const entryDate = new Date(entry.date);
      if (!currentRange) {
        currentRange = { from: entry.date, to: entry.date, entries: [entry] };
      } else {
        const rangeStart = new Date(currentRange.from);
        const daysDiff = Math.abs((entryDate.getTime() - rangeStart.getTime()) / (1000 * 60 * 60 * 24));
        
        if (daysDiff <= 7) {
          // Same week
          currentRange.entries.push(entry);
          if (entryDate < new Date(currentRange.from)) {
            currentRange.from = entry.date;
          }
          if (entryDate > new Date(currentRange.to)) {
            currentRange.to = entry.date;
          }
        } else {
          // New range
          ranges.push(currentRange);
          currentRange = { from: entry.date, to: entry.date, entries: [entry] };
        }
      }
    });

    if (currentRange) {
      ranges.push(currentRange);
    }

    return ranges;
  };

  const generateSectionFromRange = async (range: { from: string; to: string; entries: any[] }) => {
    try {
      await fetchJson('/api/memoir/generate-section', {
        method: 'POST',
        body: JSON.stringify({
          period: { from: range.from, to: range.to }
        })
      });
    } catch (error) {
      console.error('Failed to generate section from range:', error);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const { supabase } = await import('../../lib/supabase');
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;

      const result = await fetch('/api/documents/upload', {
        method: 'POST',
        headers: {
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: formData
      });

      if (!result.ok) {
        const errorData = await result.json().catch(() => ({}));
        throw new Error(errorData.error || 'Upload failed');
      }

      const data = await result.json();
      setUploadResult(data.message || 'Document uploaded successfully');
      
      await Promise.all([
        loadMemoir(),
        refreshEntries(),
        refreshTimeline(),
        refreshChapters()
      ]);
    } catch (error) {
      console.error('Upload failed:', error);
      setUploadResult(`Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleSectionAdd = async (parentId?: string) => {
    try {
      const newSection = await fetchJson('/api/memoir/generate-section', {
        method: 'POST',
        body: JSON.stringify({})
      });
      await loadMemoir();
      if (newSection.id) {
        setSelectedSectionId(newSection.id);
        startEditing(outline!.sections.find(s => s.id === newSection.id)!);
      }
    } catch (error) {
      console.error('Failed to add section:', error);
    }
  };

  const handleSectionDelete = async (sectionId: string) => {
    // Note: We'll need to add a delete endpoint
    console.log('Delete section:', sectionId);
  };

  const handleSectionUpdate = async (sectionId: string, title: string) => {
    try {
      await fetchJson('/api/memoir/section', {
        method: 'PATCH',
        body: JSON.stringify({ sectionId, title })
      });
      await loadMemoir();
    } catch (error) {
      console.error('Failed to update section:', error);
    }
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const loadMemoir = async () => {
    setLoading(true);
    try {
      const memoir = await fetchJson<MemoirOutline>('/api/memoir/outline');
      setOutline(memoir);
      // Expand all sections by default
      const allIds = new Set<string>();
      const collectIds = (sections: MemoirSection[]) => {
        sections.forEach(s => {
          allIds.add(s.id);
          if (s.children) collectIds(s.children);
        });
      };
      collectIds(memoir.sections);
      setExpandedSections(allIds);
    } catch (error) {
      console.error('Failed to load memoir:', error);
      setOutline({
        id: 'default',
        title: 'My Memoir',
        sections: [],
        lastUpdated: new Date().toISOString(),
        autoUpdate: false
      });
    } finally {
      setLoading(false);
    }
  };

  const startEditing = (section: MemoirSection) => {
    setEditingSectionId(section.id);
    setEditTitle(section.title);
    setEditContent(section.content);
    setShowChat(false);
    
    // Initialize history for this section
    if (!history[section.id]) {
      setHistory(prev => ({
        ...prev,
        [section.id]: [{ content: section.content, timestamp: new Date() }]
      }));
      setHistoryIndex(prev => ({ ...prev, [section.id]: 0 }));
    }
    
    // Focus editor after a brief delay
    setTimeout(() => {
      editorRef.current?.focus();
    }, 100);
  };

  const saveEdit = async () => {
    if (!editingSectionId || !outline) return;
    
    try {
      // Save current state to history
      const section = outline.sections.find(s => s.id === editingSectionId);
      if (section) {
        const newHistory = [...(history[editingSectionId] || [])];
        newHistory.push({ content: editContent, timestamp: new Date() });
        setHistory(prev => ({ ...prev, [editingSectionId]: newHistory }));
        setHistoryIndex(prev => ({ ...prev, [editingSectionId]: newHistory.length - 1 }));
      }

      await fetchJson('/api/memoir/section', {
        method: 'PATCH',
        body: JSON.stringify({
          sectionId: editingSectionId,
          title: editTitle,
          content: editContent
        })
      });

      // Update local state
      const updatedSections = outline.sections.map(s => {
        if (s.id === editingSectionId) {
          return {
            ...s,
            title: editTitle,
            content: editContent,
            isEdited: true,
            originalContent: s.originalContent || s.content,
            lastUpdated: new Date().toISOString()
          };
        }
        return s;
      });

      setOutline({ ...outline, sections: updatedSections });
      setEditingSectionId(null);
      setEditTitle('');
      setEditContent('');
    } catch (error) {
      console.error('Failed to save:', error);
      alert('Failed to save changes. Please try again.');
    }
  };

  const cancelEdit = () => {
    setEditingSectionId(null);
    setEditTitle('');
    setEditContent('');
  };

  const startChatEdit = (section: MemoirSection) => {
    setChatSectionId(section.id);
    setShowChat(true);
    setChatMessages([]);
    setChatInput('');
    setEditingSectionId(null);
  };

  const sendChatMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !chatSectionId || !outline || chatLoading) return;

    const userMessage: ChatMessage = {
      role: 'user',
      content: chatInput.trim(),
      timestamp: new Date()
    };

    setChatMessages(prev => [...prev, userMessage]);
    setChatInput('');
    setChatLoading(true);

    try {
      const section = outline.sections.find(s => s.id === chatSectionId);
      if (!section) return;

      const response = await fetchJson<{
        answer: string;
        updatedContent?: string;
        driftWarning?: string;
      }>('/api/memoir/chat-edit', {
        method: 'POST',
        body: JSON.stringify({
          sectionId: chatSectionId,
          focus: section.focus || section.title,
          message: userMessage.content,
          history: chatMessages.map(m => ({ role: m.role, content: m.content }))
        })
      });

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: response.answer,
        timestamp: new Date()
      };

      setChatMessages(prev => [...prev, assistantMessage]);

      // If AI provided updated content, update the section
      if (response.updatedContent) {
        const updatedSections = outline.sections.map(s => {
          if (s.id === chatSectionId) {
            return {
              ...s,
              content: response.updatedContent!,
              isEdited: true,
              originalContent: s.originalContent || s.content,
              lastUpdated: new Date().toISOString()
            };
          }
          return s;
        });
        setOutline({ ...outline, sections: updatedSections });
      }
    } catch (error) {
      const errorMessage: ChatMessage = {
        role: 'assistant',
        content: `Error: ${error instanceof Error ? error.message : 'Failed to process edit'}`,
        timestamp: new Date()
      };
      setChatMessages(prev => [...prev, errorMessage]);
    } finally {
      setChatLoading(false);
    }
  };

  const applyChatSuggestion = (content: string) => {
    if (!chatSectionId || !outline) return;
    
    const updatedSections = outline.sections.map(s => {
      if (s.id === chatSectionId) {
        return {
          ...s,
          content,
          isEdited: true,
          originalContent: s.originalContent || s.content,
          lastUpdated: new Date().toISOString()
        };
      }
      return s;
    });
    setOutline({ ...outline, sections: updatedSections });
    setShowChat(false);
    setChatMessages([]);
  };

  const toggleSection = (sectionId: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  };

  const toggleOriginal = (sectionId: string) => {
    setShowOriginal(prev => ({
      ...prev,
      [sectionId]: !prev[sectionId]
    }));
  };

  const undo = (sectionId: string) => {
    const sectionHistory = history[sectionId];
    const currentIndex = historyIndex[sectionId] || 0;
    
    if (currentIndex > 0 && sectionHistory) {
      const newIndex = currentIndex - 1;
      setHistoryIndex(prev => ({ ...prev, [sectionId]: newIndex }));
      
      if (editingSectionId === sectionId) {
        setEditContent(sectionHistory[newIndex].content);
      } else if (outline) {
        const updatedSections = outline.sections.map(s => {
          if (s.id === sectionId) {
            return { ...s, content: sectionHistory[newIndex].content };
          }
          return s;
        });
        setOutline({ ...outline, sections: updatedSections });
      }
    }
  };

  const redo = (sectionId: string) => {
    const sectionHistory = history[sectionId];
    const currentIndex = historyIndex[sectionId] || 0;
    
    if (sectionHistory && currentIndex < sectionHistory.length - 1) {
      const newIndex = currentIndex + 1;
      setHistoryIndex(prev => ({ ...prev, [sectionId]: newIndex }));
      
      if (editingSectionId === sectionId) {
        setEditContent(sectionHistory[newIndex].content);
      } else if (outline) {
        const updatedSections = outline.sections.map(s => {
          if (s.id === sectionId) {
            return { ...s, content: sectionHistory[newIndex].content };
          }
          return s;
        });
        setOutline({ ...outline, sections: updatedSections });
      }
    }
  };

  const renderSection = (section: MemoirSection, depth = 0): JSX.Element => {
    const isExpanded = expandedSections.has(section.id);
    const isEditing = editingSectionId === section.id;
    const isChatActive = showChat && chatSectionId === section.id;
    const showingOriginal = showOriginal[section.id];

    return (
      <div key={section.id} className="space-y-2" data-section-id={section.id}>
        <div
          className={`border rounded-lg transition-all ${
            highlightedSectionId === section.id
              ? 'border-primary bg-primary/10 shadow-lg shadow-primary/20'
              : isEditing || isChatActive
              ? 'border-primary bg-primary/5'
              : 'border-border/50 bg-black/40'
          }`}
        >
          {/* Section Header */}
          <div className="flex items-center gap-2 p-3 border-b border-border/50">
            {section.children && section.children.length > 0 && (
              <button
                onClick={() => toggleSection(section.id)}
                className="text-white/60 hover:text-white"
              >
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </button>
            )}
            <div className="flex-1">
              {isEditing ? (
                <Input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="bg-black/60 border-border/50 text-white font-semibold"
                  placeholder="Section title"
                />
              ) : (
                <h3 className="font-semibold text-white">{section.title}</h3>
              )}
            </div>
            <div className="flex gap-1">
              {section.originalContent && section.isEdited && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => toggleOriginal(section.id)}
                  leftIcon={showingOriginal ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                  title="Show original AI content"
                >
                  {showingOriginal ? 'Hide' : 'Show'} Original
                </Button>
              )}
              {isEditing && (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => undo(section.id)}
                    disabled={!history[section.id] || (historyIndex[section.id] || 0) === 0}
                    leftIcon={<Undo2 className="h-3 w-3" />}
                    title="Undo"
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => redo(section.id)}
                    disabled={!history[section.id] || (historyIndex[section.id] || 0) >= (history[section.id]?.length || 1) - 1}
                    leftIcon={<Redo2 className="h-3 w-3" />}
                    title="Redo"
                  />
                </>
              )}
              {!isEditing && (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => startChatEdit(section)}
                    leftIcon={<MessageSquare className="h-3 w-3" />}
                  >
                    AI Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => startEditing(section)}
                    leftIcon={<Edit2 className="h-3 w-3" />}
                  >
                    Edit
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Section Content */}
          <div className="p-4">
            {isEditing ? (
              <div className="space-y-3">
                <Textarea
                  ref={editorRef}
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="bg-black/60 border-border/50 text-white min-h-[400px] font-mono text-sm"
                  placeholder="Edit your memoir section here..."
                />
                <div className="flex gap-2 justify-end">
                  <Button size="sm" variant="outline" onClick={cancelEdit}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={saveEdit} leftIcon={<Save className="h-3 w-3" />}>
                    Save
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="prose prose-invert max-w-none">
                  <p className="text-white/90 whitespace-pre-wrap leading-relaxed text-sm">
                    {showingOriginal && section.originalContent
                      ? section.originalContent
                      : section.content}
                  </p>
                </div>
                {section.isEdited && (
                  <div className="text-xs text-primary/70 flex items-center gap-1">
                    <FileText className="h-3 w-3" />
                    Manually edited
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* AI Chat Panel */}
        {isChatActive && (
          <Card className="bg-primary/5 border-primary/30">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  AI Editing Assistant
                </CardTitle>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setShowChat(false);
                    setChatSectionId(null);
                    setChatMessages([]);
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-white/60 mt-1">
                Editing: {section.title}
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {chatMessages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`p-2 rounded ${
                      msg.role === 'user'
                        ? 'bg-primary/10 text-white ml-4'
                        : 'bg-black/60 text-white/90 mr-4'
                    }`}
                  >
                    <div className="text-xs text-white/50 mb-1">
                      {msg.role === 'user' ? 'You' : 'AI Assistant'}
                    </div>
                    <div className="text-sm whitespace-pre-wrap">{msg.content}</div>
                  </div>
                ))}
                {chatLoading && (
                  <div className="flex items-center gap-2 text-white/60">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Thinking...</span>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
              <form onSubmit={sendChatMessage} className="flex gap-2">
                <Textarea
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Ask AI to help edit this section..."
                  className="flex-1 bg-black/60 border-border/50 text-white"
                  rows={2}
                  disabled={chatLoading}
                />
                <Button type="submit" disabled={!chatInput.trim() || chatLoading}>
                  Send
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {isExpanded && section.children && section.children.map(child => renderSection(child, depth + 1))}
      </div>
    );
  };

  if (loading && !outline) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const sortedSections = outline?.sections ? [...outline.sections].sort((a, b) => {
    const aDate = a.period?.from || '';
    const bDate = b.period?.from || '';
    return aDate.localeCompare(bDate);
  }) : [];

  const handleSearch = async (query: string = searchQuery) => {
    if (!query.trim()) {
      setSearchResults([]);
      setDetectedFilters([]);
      setHighlightedSectionId(null);
      return;
    }

    setSearchLoading(true);
    try {
      // Parse the query to extract filters
      const parsed = parseQuery(query);
      const filters: Record<string, unknown> = {};
      
      if (parsed.filters.timeStart) filters.time_start = parsed.filters.timeStart;
      if (parsed.filters.timeEnd) filters.time_end = parsed.filters.timeEnd;
      if (parsed.filters.tags?.length) filters.tags = parsed.filters.tags;
      if (parsed.filters.characters?.length) filters.characters = parsed.filters.characters;
      if (parsed.filters.motifs?.length) filters.motifs = parsed.filters.motifs;

      // Show detected filters
      const filterLabels: string[] = [];
      if (parsed.filters.timeStart || parsed.filters.timeEnd) {
        filterLabels.push('Time range');
      }
      if (parsed.filters.characters?.length) {
        filterLabels.push(`${parsed.filters.characters.length} character${parsed.filters.characters.length > 1 ? 's' : ''}`);
      }
      if (parsed.filters.tags?.length) {
        filterLabels.push(`${parsed.filters.tags.length} tag${parsed.filters.tags.length > 1 ? 's' : ''}`);
      }
      if (parsed.filters.motifs?.length) {
        filterLabels.push(`${parsed.filters.motifs.length} motif${parsed.filters.motifs.length > 1 ? 's' : ''}`);
      }
      setDetectedFilters(filterLabels);

      const response = await fetch('/api/hqi/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: parsed.query, filters })
      });
      
      const payload = await response.json();
      const results = payload.results ?? [];
      setSearchResults(results);

      // If results include memoir sections, highlight the first matching section
      if (results.length > 0) {
        const firstResult = results[0];
        if (firstResult.type === 'memoir_section' && firstResult.id) {
          const sectionId = firstResult.id.replace('section-', '');
          const matchingSection = sortedSections.find(s => s.id === sectionId);
          if (matchingSection) {
            setHighlightedSectionId(sectionId);
            setSelectedSectionId(sectionId);
            // Scroll to section after a brief delay
            setTimeout(() => {
              const sectionElement = document.querySelector(`[data-section-id="${sectionId}"]`);
              sectionElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 100);
          }
        } else if (firstResult.type === 'entry' && firstResult.entryId) {
          // Find section that contains this entry
          // This would require checking which section the entry belongs to
        }
      }
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setSearchLoading(false);
    }
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSearch();
    }
  };

  const handleResultClick = (result: any) => {
    if (result.type === 'memoir_section' && result.id) {
      const sectionId = result.id.replace('section-', '');
      const matchingSection = sortedSections.find(s => s.id === sectionId);
      if (matchingSection) {
        setSelectedSectionId(sectionId);
        setHighlightedSectionId(sectionId);
        startEditing(matchingSection);
        setTimeout(() => {
          const sectionElement = document.querySelector(`[data-section-id="${sectionId}"]`);
          sectionElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
      }
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b border-border/50">
        <div>
          <h1 className="text-3xl font-semibold flex items-center gap-3">
            <BookOpen className="h-8 w-8 text-primary" />
            My Memoir Editor
          </h1>
          <p className="text-sm text-white/60 mt-2">
            Manual editing tool with AI assistance. Edit your memoir like a word processor, maintaining your original voice.
          </p>
          {outline?.lastUpdated && (
            <p className="text-xs text-white/50 mt-1">
              Last updated: {new Date(outline.lastUpdated).toLocaleString()}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.md,.pdf,.doc,.docx"
            onChange={handleFileUpload}
            className="hidden"
          />
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            leftIcon={uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          >
            {uploading ? 'Uploading...' : 'Upload Document'}
          </Button>
          <Button
            variant="outline"
            onClick={() => setShowOutline(!showOutline)}
            leftIcon={<Layout className="h-4 w-4" />}
          >
            {showOutline ? 'Hide' : 'Show'} Outline
          </Button>
          <Button
            variant={showCanonKeeper ? 'default' : 'outline'}
            onClick={() => setShowCanonKeeper(!showCanonKeeper)}
            leftIcon={<Shield className="h-4 w-4" />}
          >
            {showCanonKeeper ? 'Hide' : 'Show'} Canon Keeper
          </Button>
        </div>
      </div>

      {/* Color-Coded Timeline */}
      {outline && outline.sections.length > 0 && (() => {
        const sortedSections = [...outline.sections].sort((a, b) => {
          const aDate = a.period?.from || '';
          const bDate = b.period?.from || '';
          return aDate.localeCompare(bDate);
        });
        
        return (
          <div className="px-6 py-4 border-b border-border/50 bg-black/20">
            <ColorCodedTimeline
              chapters={chapters || []}
              sections={sortedSections.map(s => ({
                id: s.id,
                title: s.title,
                period: s.period,
                order: s.order
              }))}
              currentItemId={highlightedSectionId ? `section-${highlightedSectionId}` : selectedSectionId ? `section-${selectedSectionId}` : undefined}
              onItemClick={(item) => {
                if (item.type === 'section' && item.sectionIndex !== undefined) {
                  const section = sortedSections[item.sectionIndex];
                  if (section) {
                    setSelectedSectionId(section.id);
                    startEditing(section);
                  }
                } else if (item.type === 'chapter' && item.chapterId) {
                  // Could navigate to chapter view if needed
                  console.log('Chapter clicked:', item.chapterId);
                }
              }}
              showLabel={true}
              sectionIndexMap={new Map(sortedSections.map((s, idx) => [s.id, idx]))}
            />
          </div>
        );
      })()}

      {/* Upload Result */}
      {uploadResult && (
        <div className={`mx-6 mt-4 p-3 rounded-lg ${uploadResult.includes('failed') ? 'bg-red-500/10 border border-red-500/30' : 'bg-green-500/10 border border-green-500/30'}`}>
          <p className="text-sm text-white/90">{uploadResult}</p>
        </div>
      )}

      {/* Memory Explorer Search Bar */}
      <div className="px-6 py-4 border-b border-border/50 bg-black/20">
        <div className="relative">
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-white/40" />
              <Input
                ref={searchInputRef}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Search your memoir... (e.g., 'times I felt overwhelmed last spring', 'entries about Sarah')"
                className="pl-10 pr-4 py-3 bg-black/60 border-border/50 text-white placeholder:text-white/30 focus:border-primary"
              />
            </div>
            <Button
              onClick={() => handleSearch()}
              disabled={searchLoading || !searchQuery.trim()}
              leftIcon={searchLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            >
              {searchLoading ? 'Searching...' : 'Search'}
            </Button>
          </div>
          
          {/* Detected Filters */}
          {detectedFilters.length > 0 && (
            <div className="flex items-center gap-2 mt-3">
              <span className="text-xs text-white/50">Detected:</span>
              {detectedFilters.map((filter, idx) => (
                <Badge key={idx} variant="outline" className="text-xs">
                  {filter}
                </Badge>
              ))}
            </div>
          )}

          {/* Search Results Preview */}
          {searchResults.length > 0 && (
            <div className="mt-3 space-y-2 max-h-48 overflow-y-auto">
              {searchResults.slice(0, 5).map((result, idx) => (
                <button
                  key={idx}
                  onClick={() => handleResultClick(result)}
                  className="w-full text-left p-2 rounded-lg bg-black/40 border border-border/30 hover:border-primary/50 hover:bg-black/60 transition text-sm"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-primary/70 text-xs uppercase">
                      {result.type === 'memoir_section' ? 'Section' : result.type === 'entry' ? 'Entry' : result.type}
                    </span>
                    <span className="text-white/90 truncate flex-1">{result.title || result.snippet}</span>
                    {result.relevance && (
                      <span className="text-xs text-white/50">{Math.round(result.relevance * 100)}%</span>
                    )}
                  </div>
                </button>
              ))}
              {searchResults.length > 5 && (
                <p className="text-xs text-white/50 text-center py-1">
                  +{searchResults.length - 5} more results
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Outline Editor */}
        {showOutline && (
          <div className="w-80 border-r border-border/50 flex-shrink-0 overflow-y-auto">
            <MemoirOutlineEditor
              sections={outline?.sections || []}
              onSectionSelect={(id) => {
                setSelectedSectionId(id);
                const section = outline?.sections.find(s => s.id === id);
                if (section) {
                  startEditing(section);
                }
              }}
              onSectionAdd={handleSectionAdd}
              onSectionDelete={handleSectionDelete}
              onSectionUpdate={handleSectionUpdate}
              onSectionReorder={() => {}} // TODO: Implement reordering
              selectedSectionId={selectedSectionId || undefined}
            />
          </div>
        )}

        {/* Editor Content */}
        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 overflow-y-auto p-6">

          {/* Memoir Sections */}
          <div className="space-y-4">
            {sortedSections.length === 0 ? (
              <div className="text-center py-12 text-white/60">
                <BookOpen className="h-12 w-12 mx-auto mb-4 text-white/20" />
                <p className="text-lg font-medium mb-2">No sections yet</p>
                <p className="text-sm mb-4">Generate sections from chats, chapters, or upload a document to get started</p>
                <Button onClick={() => handleSectionAdd()} leftIcon={<Plus className="h-4 w-4" />}>
                  Create First Section
                </Button>
              </div>
            ) : (
              sortedSections.map(section => renderSection(section))
            )}
          </div>
          </div>

          {/* Omega Canon Keeper Panel */}
          {showCanonKeeper && (
            <div className="w-96 border-l border-border/50 flex-shrink-0 overflow-y-auto bg-black/20">
              <div className="p-4">
                <ContinuityPanel />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

