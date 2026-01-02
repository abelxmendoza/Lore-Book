import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { 
  Bold, Italic, Underline, List, ListOrdered, Heading1, Heading2, Heading3,
  Link, Quote, Code, Minus, Save, Undo2, Redo2, Eye, EyeOff, Type
} from 'lucide-react';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { MarkdownRenderer } from '../chat/MarkdownRenderer';
import { Badge } from '../ui/badge';

type RichTextEditorProps = {
  value: string;
  onChange: (value: string) => void;
  onSave?: () => void;
  placeholder?: string;
  minHeight?: string;
  showPreview?: boolean;
  autoSave?: boolean;
  autoSaveDelay?: number;
  onAutoSave?: (content: string) => void;
  className?: string;
  autoFocus?: boolean;
};

export const RichTextEditor = ({
  value,
  onChange,
  onSave,
  placeholder = 'Start writing...',
  minHeight = '400px',
  showPreview: initialShowPreview = false,
  autoSave = false,
  autoSaveDelay = 2000,
  onAutoSave,
  className = '',
  autoFocus = false
}: RichTextEditorProps) => {
  const [showPreview, setShowPreview] = useState(initialShowPreview);
  const [wordCount, setWordCount] = useState(0);
  const [charCount, setCharCount] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedRef = useRef<string>(value);

  // Calculate word and character counts
  useEffect(() => {
    const words = value.trim().split(/\s+/).filter(w => w.length > 0);
    setWordCount(words.length);
    setCharCount(value.length);
  }, [value]);

  // Auto-save functionality
  useEffect(() => {
    if (autoSave && value !== lastSavedRef.current) {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }

      autoSaveTimerRef.current = setTimeout(() => {
        lastSavedRef.current = value;
        onAutoSave?.(value);
      }, autoSaveDelay);
    }

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [value, autoSave, autoSaveDelay, onAutoSave]);

  // Insert text at cursor position
  const insertText = (before: string, after: string = '', placeholder?: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = value.substring(start, end);
    const textToInsert = selectedText || placeholder || '';

    const newValue = 
      value.substring(0, start) + 
      before + textToInsert + after + 
      value.substring(end);

    onChange(newValue);

    // Set cursor position after inserted text
    setTimeout(() => {
      const newCursorPos = start + before.length + textToInsert.length + after.length;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
      textarea.focus();
    }, 0);
  };

  // Formatting functions
  const formatBold = () => insertText('**', '**', 'bold text');
  const formatItalic = () => insertText('*', '*', 'italic text');
  const formatUnderline = () => insertText('<u>', '</u>', 'underlined text');
  const formatHeading1 = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    const lineEnd = value.indexOf('\n', start);
    const lineEndPos = lineEnd === -1 ? value.length : lineEnd;
    const line = value.substring(lineStart, lineEndPos);
    
    if (line.startsWith('# ')) {
      onChange(value.substring(0, lineStart) + line.substring(2) + value.substring(lineEndPos));
    } else {
      onChange(value.substring(0, lineStart) + '# ' + line + value.substring(lineEndPos));
    }
    setTimeout(() => textarea.focus(), 0);
  };
  const formatHeading2 = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    const lineEnd = value.indexOf('\n', start);
    const lineEndPos = lineEnd === -1 ? value.length : lineEnd;
    const line = value.substring(lineStart, lineEndPos);
    
    if (line.startsWith('## ')) {
      onChange(value.substring(0, lineStart) + line.substring(3) + value.substring(lineEndPos));
    } else {
      onChange(value.substring(0, lineStart) + '## ' + line + value.substring(lineEndPos));
    }
    setTimeout(() => textarea.focus(), 0);
  };
  const formatHeading3 = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    const lineEnd = value.indexOf('\n', start);
    const lineEndPos = lineEnd === -1 ? value.length : lineEnd;
    const line = value.substring(lineStart, lineEndPos);
    
    if (line.startsWith('### ')) {
      onChange(value.substring(0, lineStart) + line.substring(4) + value.substring(lineEndPos));
    } else {
      onChange(value.substring(0, lineStart) + '### ' + line + value.substring(lineEndPos));
    }
    setTimeout(() => textarea.focus(), 0);
  };
  const formatList = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    const lineEnd = value.indexOf('\n', start);
    const lineEndPos = lineEnd === -1 ? value.length : lineEnd;
    const line = value.substring(lineStart, lineEndPos);
    
    if (line.startsWith('- ')) {
      onChange(value.substring(0, lineStart) + line.substring(2) + value.substring(lineEndPos));
    } else {
      onChange(value.substring(0, lineStart) + '- ' + line + value.substring(lineEndPos));
    }
    setTimeout(() => textarea.focus(), 0);
  };
  const formatOrderedList = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    const lineEnd = value.indexOf('\n', start);
    const lineEndPos = lineEnd === -1 ? value.length : lineEnd;
    const line = value.substring(lineStart, lineEndPos);
    
    if (/^\d+\.\s/.test(line)) {
      onChange(value.substring(0, lineStart) + line.replace(/^\d+\.\s/, '') + value.substring(lineEndPos));
    } else {
      onChange(value.substring(0, lineStart) + '1. ' + line + value.substring(lineEndPos));
    }
    setTimeout(() => textarea.focus(), 0);
  };
  const formatQuote = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    const lineEnd = value.indexOf('\n', start);
    const lineEndPos = lineEnd === -1 ? value.length : lineEnd;
    const line = value.substring(lineStart, lineEndPos);
    
    if (line.startsWith('> ')) {
      onChange(value.substring(0, lineStart) + line.substring(2) + value.substring(lineEndPos));
    } else {
      onChange(value.substring(0, lineStart) + '> ' + line + value.substring(lineEndPos));
    }
    setTimeout(() => textarea.focus(), 0);
  };
  const formatCode = () => insertText('`', '`', 'code');
  const formatCodeBlock = () => insertText('```\n', '\n```', 'code block');
  const formatLink = () => insertText('[', '](url)', 'link text');
  const formatHorizontalRule = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const before = value.substring(0, start);
    const after = value.substring(start);
    const needsNewlineBefore = before.length > 0 && !before.endsWith('\n');
    const needsNewlineAfter = after.length > 0 && !after.startsWith('\n');
    
    onChange(
      before + 
      (needsNewlineBefore ? '\n' : '') + 
      '---\n' + 
      (needsNewlineAfter ? '' : '') + 
      after
    );
    setTimeout(() => {
      const newPos = start + (needsNewlineBefore ? 1 : 0) + 4;
      textarea.setSelectionRange(newPos, newPos);
      textarea.focus();
    }, 0);
  };

  // Keyboard shortcuts
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Cmd/Ctrl + B for bold
    if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
      e.preventDefault();
      formatBold();
    }
    // Cmd/Ctrl + I for italic
    if ((e.metaKey || e.ctrlKey) && e.key === 'i') {
      e.preventDefault();
      formatItalic();
    }
    // Cmd/Ctrl + S for save
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault();
      onSave?.();
    }
    // Tab for indentation
    if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      const textarea = textareaRef.current;
      if (!textarea) return;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      onChange(value.substring(0, start) + '  ' + value.substring(end));
      setTimeout(() => {
        textarea.setSelectionRange(start + 2, start + 2);
        textarea.focus();
      }, 0);
    }
  };

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.max(textarea.scrollHeight, parseInt(minHeight))}px`;
    }
  }, [value, minHeight]);

  // Auto-focus on mount
  useEffect(() => {
    if (autoFocus && textareaRef.current && !showPreview) {
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 100);
    }
  }, [autoFocus, showPreview]);

  return (
    <div className={`flex flex-col border border-border/50 rounded-lg bg-black/40 overflow-hidden ${className}`}>
      {/* Toolbar */}
      <div className="flex items-center gap-1 p-2 border-b border-border/30 bg-black/60 flex-wrap">
        <div className="flex items-center gap-1 border-r border-border/30 pr-2 mr-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={formatBold}
            className="h-7 px-2"
            title="Bold (⌘B)"
          >
            <Bold className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={formatItalic}
            className="h-7 px-2"
            title="Italic (⌘I)"
          >
            <Italic className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={formatUnderline}
            className="h-7 px-2"
            title="Underline"
          >
            <Underline className="h-3.5 w-3.5" />
          </Button>
        </div>

        <div className="flex items-center gap-1 border-r border-border/30 pr-2 mr-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={formatHeading1}
            className="h-7 px-2"
            title="Heading 1"
          >
            <Heading1 className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={formatHeading2}
            className="h-7 px-2"
            title="Heading 2"
          >
            <Heading2 className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={formatHeading3}
            className="h-7 px-2"
            title="Heading 3"
          >
            <Heading3 className="h-3.5 w-3.5" />
          </Button>
        </div>

        <div className="flex items-center gap-1 border-r border-border/30 pr-2 mr-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={formatList}
            className="h-7 px-2"
            title="Bullet List"
          >
            <List className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={formatOrderedList}
            className="h-7 px-2"
            title="Numbered List"
          >
            <ListOrdered className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={formatQuote}
            className="h-7 px-2"
            title="Quote"
          >
            <Quote className="h-3.5 w-3.5" />
          </Button>
        </div>

        <div className="flex items-center gap-1 border-r border-border/30 pr-2 mr-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={formatCode}
            className="h-7 px-2"
            title="Inline Code"
          >
            <Code className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={formatCodeBlock}
            className="h-7 px-2"
            title="Code Block"
          >
            <Type className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={formatLink}
            className="h-7 px-2"
            title="Link"
          >
            <Link className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={formatHorizontalRule}
            className="h-7 px-2"
            title="Horizontal Rule"
          >
            <Minus className="h-3.5 w-3.5" />
          </Button>
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-2">
          {autoSave && value !== lastSavedRef.current && (
            <Badge variant="outline" className="text-xs text-yellow-400 border-yellow-400/30">
              Saving...
            </Badge>
          )}
          {autoSave && value === lastSavedRef.current && value.length > 0 && (
            <Badge variant="outline" className="text-xs text-green-400 border-green-400/30">
              Saved
            </Badge>
          )}
          <div className="text-xs text-white/40 flex items-center gap-2">
            <span>{wordCount} words</span>
            <span>•</span>
            <span>{charCount} chars</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowPreview(!showPreview)}
            className="h-7 px-2"
            title={showPreview ? 'Hide Preview' : 'Show Preview'}
          >
            {showPreview ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </Button>
          {onSave && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onSave}
              className="h-7 px-2"
              title="Save (⌘S)"
            >
              <Save className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Editor/Preview */}
      <div className="flex flex-1 overflow-hidden">
        {showPreview ? (
          <div className="flex-1 overflow-y-auto p-4">
            <MarkdownRenderer content={value || '*No content yet*'} />
          </div>
        ) : (
          <Textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="flex-1 resize-none border-0 bg-transparent text-white font-mono text-sm focus:ring-0 focus:ring-offset-0 p-4"
            style={{ minHeight }}
          />
        )}
      </div>

      {/* Status Bar */}
      <div className="px-4 py-2 border-t border-border/30 bg-black/60 text-xs text-white/40 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span>Markdown supported</span>
          <span>•</span>
          <span>⌘B Bold</span>
          <span>⌘I Italic</span>
          <span>⌘S Save</span>
        </div>
        <div>
          {showPreview ? 'Preview Mode' : 'Edit Mode'}
        </div>
      </div>
    </div>
  );
};

