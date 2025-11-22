import { useState, useRef, useEffect } from 'react';
import { Bold, Italic, List, Link, Code, Heading1, Eye, Edit } from 'lucide-react';
import { Button } from '../ui/button';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import './markdown-editor.css';

type MarkdownEditorProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: string;
};

/**
 * MarkdownEditor Component
 * 
 * Rich text editor with markdown support, live preview, and toolbar.
 */
export const MarkdownEditor = ({
  value,
  onChange,
  placeholder = 'Start writing...',
  className = '',
  minHeight = '200px',
}: MarkdownEditorProps) => {
  const [mode, setMode] = useState<'edit' | 'preview' | 'split'>('edit');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const insertText = (before: string, after: string = '') => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = value.substring(start, end);
    const newText = value.substring(0, start) + before + selectedText + after + value.substring(end);
    
    onChange(newText);
    
    // Restore cursor position
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + before.length, start + before.length + selectedText.length);
    }, 0);
  };

  const toolbarActions = {
    bold: () => insertText('**', '**'),
    italic: () => insertText('*', '*'),
    heading: () => insertText('# ', ''),
    link: () => insertText('[', '](url)'),
    code: () => insertText('`', '`'),
    list: () => insertText('- ', ''),
  };

  return (
    <div className={`border border-border/60 rounded-lg bg-black/40 ${className}`}>
      {/* Toolbar */}
      <div className="flex items-center justify-between p-2 border-b border-border/60">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={toolbarActions.bold}
            className="h-7 px-2"
            title="Bold (Ctrl+B)"
          >
            <Bold className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={toolbarActions.italic}
            className="h-7 px-2"
            title="Italic (Ctrl+I)"
          >
            <Italic className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={toolbarActions.heading}
            className="h-7 px-2"
            title="Heading"
          >
            <Heading1 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={toolbarActions.link}
            className="h-7 px-2"
            title="Link"
          >
            <Link className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={toolbarActions.code}
            className="h-7 px-2"
            title="Code"
          >
            <Code className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={toolbarActions.list}
            className="h-7 px-2"
            title="List"
          >
            <List className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant={mode === 'edit' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setMode('edit')}
            className="h-7 px-2"
          >
            <Edit className="h-4 w-4 mr-1" />
            Edit
          </Button>
          <Button
            variant={mode === 'preview' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setMode('preview')}
            className="h-7 px-2"
          >
            <Eye className="h-4 w-4 mr-1" />
            Preview
          </Button>
          <Button
            variant={mode === 'split' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setMode('split')}
            className="h-7 px-2"
          >
            Split
          </Button>
        </div>
      </div>

      {/* Editor/Preview Area */}
      <div className="flex" style={{ minHeight }}>
        {(mode === 'edit' || mode === 'split') && (
          <div className={mode === 'split' ? 'w-1/2 border-r border-border/60' : 'w-full'}>
            <textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={placeholder}
              className="w-full h-full p-4 bg-transparent text-white placeholder:text-white/40 resize-none focus:outline-none"
              style={{ minHeight }}
            />
          </div>
        )}
        {(mode === 'preview' || mode === 'split') && (
          <div className={`${mode === 'split' ? 'w-1/2' : 'w-full'} overflow-y-auto p-4`} style={{ minHeight }}>
            {value.trim() ? (
              <div className="prose prose-invert max-w-none">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeHighlight]}
                  components={{
                    // Custom styling for markdown elements
                    h1: ({ children }) => <h1 className="text-2xl font-bold text-white mb-4">{children}</h1>,
                    h2: ({ children }) => <h2 className="text-xl font-bold text-white mb-3">{children}</h2>,
                    h3: ({ children }) => <h3 className="text-lg font-semibold text-white mb-2">{children}</h3>,
                    p: ({ children }) => <p className="text-white/90 mb-2 leading-relaxed">{children}</p>,
                    ul: ({ children }) => <ul className="list-disc list-inside text-white/90 mb-2 space-y-1">{children}</ul>,
                    ol: ({ children }) => <ol className="list-decimal list-inside text-white/90 mb-2 space-y-1">{children}</ol>,
                    li: ({ children }) => <li className="text-white/90">{children}</li>,
                    code: ({ className, children }) => {
                      const isInline = !className;
                      return isInline ? (
                        <code className="bg-black/60 text-primary px-1 py-0.5 rounded text-sm">{children}</code>
                      ) : (
                        <code className={className}>{children}</code>
                      );
                    },
                    pre: ({ children }) => (
                      <pre className="bg-black/60 p-3 rounded-lg overflow-x-auto mb-2">
                        {children}
                      </pre>
                    ),
                    a: ({ href, children }) => (
                      <a href={href} className="text-primary hover:text-primary/80 underline" target="_blank" rel="noopener noreferrer">
                        {children}
                      </a>
                    ),
                    blockquote: ({ children }) => (
                      <blockquote className="border-l-4 border-primary/50 pl-4 italic text-white/70 my-2">
                        {children}
                      </blockquote>
                    ),
                  }}
                >
                  {value}
                </ReactMarkdown>
              </div>
            ) : (
              <p className="text-white/40 italic">{placeholder}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};


