import { useState, useEffect, useMemo, useRef } from 'react';
import { BookOpen, Edit2, Plus, Save, X, ChevronRight, ChevronDown, Sparkles, Loader2, AlertCircle, BookMarked, RefreshCw, Download, Copy, Clock, CheckCircle2, Upload, FileText } from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Textarea } from '../ui/textarea';
import { Input } from '../ui/input';
import { fetchJson } from '../../lib/api';
import { useLoreKeeper } from '../../hooks/useLoreKeeper';

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
};

type MemoirOutline = {
  id: string;
  title: string;
  sections: MemoirSection[];
  lastUpdated: string;
  autoUpdate: boolean;
};

export const MemoirView = () => {
  const [outline, setOutline] = useState<MemoirOutline | null>(null);
  const [loading, setLoading] = useState(false);
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [chatMode, setChatMode] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatContext, setChatContext] = useState<{ sectionId: string; focus: string } | null>(null);
  const [chatHistory, setChatHistory] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [showChapters, setShowChapters] = useState(false);
  const [generatingFull, setGeneratingFull] = useState(false);
  const [fullMemoir, setFullMemoir] = useState<string | null>(null);
  const [autoUpdateEnabled, setAutoUpdateEnabled] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<string | null>(null);
  const [languageStyle, setLanguageStyle] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { refreshTimeline, refreshChapters, timeline, chapters, entries, refreshEntries } = useLoreKeeper();

  useEffect(() => {
    loadMemoir();
    loadLanguageStyle();
  }, []);

  const loadLanguageStyle = async () => {
    try {
      const result = await fetchJson<{ languageStyle: string | null }>('/api/documents/language-style');
      setLanguageStyle(result.languageStyle);
    } catch (error) {
      console.error('Failed to load language style:', error);
    }
  };

  // Auto-update memoir when new entries are added
  useEffect(() => {
    if (autoUpdateEnabled && entries.length > 0) {
      const checkAndUpdate = async () => {
        try {
          await fetchJson('/api/memoir/auto-update', { method: 'POST' });
          await loadMemoir();
        } catch (error) {
          console.error('Auto-update failed:', error);
        }
      };
      
      // Debounce auto-updates
      const timeout = setTimeout(checkAndUpdate, 5000);
      return () => clearTimeout(timeout);
    }
  }, [entries.length, autoUpdateEnabled]);

  const loadMemoir = async () => {
    setLoading(true);
    try {
      const memoir = await fetchJson<MemoirOutline>('/api/memoir/outline');
      setOutline(memoir);
      setAutoUpdateEnabled(memoir.autoUpdate);
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
        autoUpdate: true
      });
    } finally {
      setLoading(false);
    }
  };

  const generateSection = async (focus?: string, period?: { from: string; to: string }, chapterId?: string) => {
    setLoading(true);
    try {
      const section = await fetchJson<MemoirSection>('/api/memoir/generate-section', {
        method: 'POST',
        body: JSON.stringify({ focus, period, chapterId })
      });
      await loadMemoir();
      return section;
    } catch (error) {
      console.error('Failed to generate section:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const generateFullMemoir = async (focus?: string, period?: { from: string; to: string }) => {
    setGeneratingFull(true);
    setFullMemoir(null);
    try {
      const result = await fetchJson<{ memoir: string }>('/api/memoir/generate-full', {
        method: 'POST',
        body: JSON.stringify({ focus, period })
      });
      setFullMemoir(result.memoir);
    } catch (error) {
      console.error('Failed to generate full memoir:', error);
      setFullMemoir('Failed to generate memoir. Please try again.');
    } finally {
      setGeneratingFull(false);
    }
  };

  const generateFromChapter = async (chapterId: string) => {
    const chapter = chapters.find(c => c.id === chapterId);
    if (!chapter) return;
    
    await generateSection(
      chapter.title,
      chapter.start_date && chapter.end_date ? { from: chapter.start_date, to: chapter.end_date } : undefined,
      chapterId
    );
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      // Get auth token
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
      
      // Refresh all data
      await Promise.all([
        loadMemoir(),
        refreshEntries(),
        refreshTimeline(),
        refreshChapters(),
        loadLanguageStyle()
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

  const updateSection = async (sectionId: string, updates: { title?: string; content?: string }) => {
    try {
      await fetchJson('/api/memoir/section', {
        method: 'PATCH',
        body: JSON.stringify({ sectionId, ...updates })
      });
      await loadMemoir();
    } catch (error) {
      console.error('Failed to update section:', error);
      throw error;
    }
  };

  const startEditing = (section: MemoirSection) => {
    setEditingSectionId(section.id);
    setEditTitle(section.title);
    setEditContent(section.content);
    setChatMode(false);
    setChatContext(null);
  };

  const saveEdit = async () => {
    if (!editingSectionId) return;
    try {
      await updateSection(editingSectionId, {
        title: editTitle,
        content: editContent
      });
      setEditingSectionId(null);
      setEditTitle('');
      setEditContent('');
    } catch (error) {
      alert('Failed to save changes');
    }
  };

  const cancelEdit = () => {
    setEditingSectionId(null);
    setEditTitle('');
    setEditContent('');
  };

  const startChatEdit = (section: MemoirSection) => {
    setChatMode(true);
    setChatContext({
      sectionId: section.id,
      focus: section.focus || section.title
    });
    setChatHistory([]);
    setChatInput('');
    setEditingSectionId(null);
  };

  const sendChatMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !chatContext || chatLoading) return;

    const userMessage = chatInput.trim();
    setChatHistory(prev => [...prev, { role: 'user', content: userMessage }]);
    setChatInput('');
    setChatLoading(true);

    try {
      const response = await fetchJson<{
        answer: string;
        updatedContent?: string;
        driftWarning?: string;
      }>('/api/memoir/chat-edit', {
        method: 'POST',
        body: JSON.stringify({
          sectionId: chatContext.sectionId,
          focus: chatContext.focus,
          message: userMessage,
          history: chatHistory
        })
      });

      setChatHistory(prev => [...prev, { role: 'assistant', content: response.answer }]);

      if (response.updatedContent) {
        await updateSection(chatContext.sectionId, { content: response.updatedContent });
      }

      if (response.driftWarning) {
        console.warn('Drift warning:', response.driftWarning);
      }
    } catch (error) {
      setChatHistory(prev => [...prev, {
        role: 'assistant',
        content: `Error: ${error instanceof Error ? error.message : 'Failed to process edit'}`
      }]);
    } finally {
      setChatLoading(false);
    }
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

  const renderSection = (section: MemoirSection, depth = 0): JSX.Element => {
    const isExpanded = expandedSections.has(section.id);
    const isEditing = editingSectionId === section.id;
    const isChatMode = chatMode && chatContext?.sectionId === section.id;

    return (
      <div key={section.id} className="space-y-2">
        <div
          className={`flex items-center gap-2 p-4 rounded-lg border ${
            isEditing || isChatMode
              ? 'border-primary bg-primary/10'
              : 'border-border/50 bg-black/40'
          }`}
          style={{ paddingLeft: `${depth * 1.5 + 0.75}rem` }}
        >
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
              <div className="space-y-2">
                <Input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="bg-black/60 border-border/50 text-white"
                  placeholder="Section title"
                />
                <Textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="bg-black/60 border-border/50 text-white min-h-[200px]"
                  placeholder="Section content"
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={saveEdit} leftIcon={<Save className="h-4 w-4" />}>
                    Save
                  </Button>
                  <Button size="sm" variant="outline" onClick={cancelEdit}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : isChatMode ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm text-white/70">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <span>Chat editing mode - Focus: {chatContext?.focus}</span>
                </div>
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {chatHistory.map((msg, idx) => (
                    <div
                      key={idx}
                      className={`p-2 rounded ${
                        msg.role === 'user'
                          ? 'bg-primary/10 text-white ml-4'
                          : 'bg-black/60 text-white/90 mr-4'
                      }`}
                    >
                      <div className="text-xs text-white/50 mb-1">
                        {msg.role === 'user' ? 'You' : 'Assistant'}
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
                </div>
                <form onSubmit={sendChatMessage} className="flex gap-2">
                  <Textarea
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Describe what you want to change..."
                    className="flex-1 bg-black/60 border-border/50 text-white"
                    rows={2}
                    disabled={chatLoading}
                  />
                  <Button type="submit" disabled={!chatInput.trim() || chatLoading}>
                    Send
                  </Button>
                </form>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setChatMode(false);
                    setChatContext(null);
                    setChatHistory([]);
                  }}
                >
                  Exit Chat Mode
                </Button>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <h3 className="font-semibold text-white">{section.title}</h3>
                    {section.period && (
                      <p className="text-xs text-white/50 mt-1">
                        <Clock className="h-3 w-3 inline mr-1" />
                        {section.period.from} {section.period.to && `→ ${section.period.to}`}
                      </p>
                    )}
                    {section.lastUpdated && (
                      <p className="text-xs text-white/40 mt-1">
                        Updated: {new Date(section.lastUpdated).toLocaleString()}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => startChatEdit(section)}
                      leftIcon={<Sparkles className="h-3 w-3" />}
                    >
                      Chat Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => startEditing(section)}
                      leftIcon={<Edit2 className="h-3 w-3" />}
                    >
                      Edit
                    </Button>
                  </div>
                </div>
                {section.content && (
                  <div className="mt-3">
                    <p className="text-sm text-white/80 whitespace-pre-wrap leading-relaxed">{section.content}</p>
                  </div>
                )}
                {section.corrections && section.corrections.length > 0 && (
                  <div className="mt-3 p-2 rounded bg-primary/10 border border-primary/30">
                    <div className="flex items-center gap-2 text-xs text-primary/80 mb-1">
                      <CheckCircle2 className="h-3 w-3" />
                      <span>Corrections Applied</span>
                    </div>
                    {section.corrections.map((correction, idx) => (
                      <div key={idx} className="text-xs text-white/60">
                        {new Date(correction.date).toLocaleDateString()}: {correction.reason}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
        {isExpanded && section.children && section.children.map(child => renderSection(child, depth + 1))}
      </div>
    );
  };

  const sortedSections = useMemo(() => {
    if (!outline?.sections) return [];
    return [...outline.sections].sort((a, b) => {
      const aDate = a.period?.from || '';
      const bDate = b.period?.from || '';
      return aDate.localeCompare(bDate);
    });
  }, [outline?.sections]);

  if (loading && !outline) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const fullBookContent = sortedSections.map(s => `# ${s.title}\n\n${s.content}`).join('\n\n---\n\n');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold flex items-center gap-3">
            <BookOpen className="h-8 w-8 text-primary" />
            My Memoir
          </h1>
          <p className="text-sm text-white/60 mt-2">
            A dynamic, truth-seeking memoir that updates automatically as you chat and document your life
          </p>
          {outline?.lastUpdated && (
            <p className="text-xs text-white/50 mt-1">
              Last updated: {new Date(outline.lastUpdated).toLocaleString()}
            </p>
          )}
          {languageStyle && (
            <p className="text-xs text-primary/70 mt-1 flex items-center gap-1">
              <FileText className="h-3 w-3" />
              Writing style: {languageStyle}
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
            onClick={() => setAutoUpdateEnabled(!autoUpdateEnabled)}
            leftIcon={autoUpdateEnabled ? <CheckCircle2 className="h-4 w-4" /> : <X className="h-4 w-4" />}
          >
            {autoUpdateEnabled ? 'Auto-Update On' : 'Auto-Update Off'}
          </Button>
          <Button
            variant="outline"
            onClick={() => setShowChapters(!showChapters)}
            leftIcon={<BookMarked className="h-4 w-4" />}
          >
            {showChapters ? 'Hide' : 'Show'} Chapters
          </Button>
          <Button
            onClick={() => generateSection()}
            disabled={loading}
            leftIcon={loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          >
            {loading ? 'Generating...' : 'New Section'}
          </Button>
        </div>
      </div>

      {/* Upload Result */}
      {uploadResult && (
        <Card className={`${uploadResult.includes('failed') ? 'bg-red-500/10 border-red-500/30' : 'bg-green-500/10 border-green-500/30'}`}>
          <CardContent className="p-4">
            <p className="text-sm text-white/90">{uploadResult}</p>
          </CardContent>
        </Card>
      )}

      {/* Auto-Update Status */}
      {autoUpdateEnabled && (
        <Card className="bg-primary/10 border-primary/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-white/90">
              <RefreshCw className="h-4 w-4 text-primary animate-spin" />
              <span>Auto-updating memoir based on your chats and entries...</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Chapters Panel */}
      {showChapters && (
        <Card className="bg-black/40 border-border/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookMarked className="h-5 w-5 text-primary" />
              Story Chapters
            </CardTitle>
            <p className="text-sm text-white/60 mt-2">
              Generate memoir sections from your existing chapters
            </p>
          </CardHeader>
          <CardContent>
            {chapters.length > 0 ? (
              <div className="space-y-3">
                {chapters.map((chapter) => (
                  <div
                    key={chapter.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-black/40"
                  >
                    <div className="flex-1">
                      <h4 className="font-semibold text-white">{chapter.title}</h4>
                      <p className="text-xs text-white/60">
                        {chapter.start_date} {chapter.end_date && `→ ${chapter.end_date}`}
                      </p>
                      {chapter.summary && (
                        <p className="text-sm text-white/70 mt-1">{chapter.summary}</p>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => generateFromChapter(chapter.id)}
                      disabled={loading}
                      leftIcon={<Sparkles className="h-3 w-3" />}
                    >
                      Generate Section
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-white/60">
                <BookMarked className="h-12 w-12 mx-auto mb-4 text-white/20" />
                <p className="text-sm mb-4">No chapters yet</p>
                <p className="text-xs text-white/50">
                  Create chapters in the Timeline view to organize your story
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Full Memoir Generator */}
      <Card className="bg-black/40 border-border/60">
        <CardHeader>
          <CardTitle>Generate Full Memoir</CardTitle>
          <p className="text-sm text-white/60 mt-2">
            Generate a complete memoir from all your entries
          </p>
        </CardHeader>
        <CardContent>
          <Button
            onClick={() => generateFullMemoir()}
            disabled={generatingFull}
            leftIcon={generatingFull ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          >
            {generatingFull ? 'Generating...' : 'Generate Full Memoir'}
          </Button>
          {fullMemoir && (
            <div className="mt-4 p-4 rounded-lg border border-primary/30 bg-black/60">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-white">Complete Memoir</h3>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const blob = new Blob([fullMemoir], { type: 'text/plain' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `memoir-${new Date().toISOString().split('T')[0]}.txt`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                    leftIcon={<Download className="h-3 w-3" />}
                  >
                    Download
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => navigator.clipboard.writeText(fullMemoir)}
                    leftIcon={<Copy className="h-3 w-3" />}
                  >
                    Copy
                  </Button>
                </div>
              </div>
              <div className="prose prose-invert max-w-none">
                <p className="text-white/90 whitespace-pre-wrap leading-relaxed">{fullMemoir}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Memoir Outline */}
      <Card className="bg-black/40 border-border/60">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Your Memoir Book</CardTitle>
              <p className="text-sm text-white/60 mt-2">
                Chronologically organized sections that update automatically. Use "Chat Edit" for AI-assisted editing that keeps you on track.
              </p>
            </div>
            {fullBookContent && (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const blob = new Blob([fullBookContent], { type: 'text/markdown' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `my-memoir-${new Date().toISOString().split('T')[0]}.md`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  leftIcon={<Download className="h-3 w-3" />}
                >
                  Download Book
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {sortedSections.length === 0 ? (
            <div className="text-center py-12 text-white/60">
              <BookOpen className="h-12 w-12 mx-auto mb-4 text-white/20" />
              <p className="text-lg font-medium mb-2">Start Writing Your Memoir</p>
              <p className="text-sm mb-4">Click "New Section" to begin, or generate from a chapter</p>
              <p className="text-xs text-white/50">
                Your memoir will automatically update as you chat and add entries
              </p>
            </div>
          ) : (
            sortedSections.map(section => renderSection(section))
          )}
        </CardContent>
      </Card>
    </div>
  );
};
