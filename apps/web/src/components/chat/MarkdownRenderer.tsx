import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import rehypeRaw from 'rehype-raw';
import { Copy, Check } from 'lucide-react';
import { Button } from '../ui/button';
// @ts-ignore - highlight.js CSS
import 'highlight.js/styles/github-dark.css';

type MarkdownRendererProps = {
  content: string;
  isStreaming?: boolean;
};

export const MarkdownRenderer = ({ content, isStreaming }: MarkdownRendererProps) => {
  return (
    <div className="markdown-content prose prose-invert prose-sm max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, rehypeHighlight]}
        components={{
          // Code blocks with copy button
          code({ node, inline, className, children, ...props }: any) {
            const match = /language-(\w+)/.exec(className || '');
            const codeString = String(children).replace(/\n$/, '');
            const language = match ? match[1] : '';

            if (!inline && codeString) {
              return <CodeBlock code={codeString} language={language} />;
            }

            return (
              <code className="px-1.5 py-0.5 rounded bg-black/40 text-primary/90 text-xs font-mono" {...props}>
                {children}
              </code>
            );
          },
          // Headings
          h1: ({ children }) => <h1 className="text-xl font-bold mt-4 mb-2 text-white">{children}</h1>,
          h2: ({ children }) => <h2 className="text-lg font-semibold mt-3 mb-2 text-white">{children}</h2>,
          h3: ({ children }) => <h3 className="text-base font-semibold mt-2 mb-1 text-white">{children}</h3>,
          // Lists
          ul: ({ children }) => <ul className="list-disc list-inside space-y-1 my-2 text-white/90">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal list-inside space-y-1 my-2 text-white/90">{children}</ol>,
          li: ({ children }) => <li className="text-sm">{children}</li>,
          // Paragraphs
          p: ({ children }) => <p className="mb-2 text-white/90 leading-relaxed">{children}</p>,
          // Links
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80 underline">
              {children}
            </a>
          ),
          // Blockquotes
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-primary/30 pl-4 my-2 italic text-white/70">
              {children}
            </blockquote>
          ),
          // Tables
          table: ({ children }) => (
            <div className="overflow-x-auto my-2">
              <table className="min-w-full border-collapse border border-border/30">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-black/40">{children}</thead>,
          tbody: ({ children }) => <tbody>{children}</tbody>,
          tr: ({ children }) => <tr className="border-b border-border/30">{children}</tr>,
          th: ({ children }) => <th className="px-3 py-2 text-left text-xs font-semibold text-white/80">{children}</th>,
          td: ({ children }) => <td className="px-3 py-2 text-xs text-white/70">{children}</td>,
          // Horizontal rule
          hr: () => <hr className="my-4 border-border/30" />,
          // Strong and emphasis
          strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
          em: ({ children }) => <em className="italic text-white/90">{children}</em>,
        }}
      >
        {content}
      </ReactMarkdown>
      {isStreaming && (
        <span className="inline-block w-2 h-4 ml-1 bg-primary animate-pulse" />
      )}
    </div>
  );
};

type CodeBlockProps = {
  code: string;
  language?: string;
};

const CodeBlock = ({ code, language }: CodeBlockProps) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group my-2">
      <div className="flex items-center justify-between px-3 py-1.5 bg-black/60 border-b border-border/30 rounded-t">
        {language && (
          <span className="text-xs text-white/50 font-mono uppercase">{language}</span>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCopy}
          className="h-6 px-2 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
          title={copied ? 'Copied!' : 'Copy code'}
        >
          {copied ? (
            <Check className="h-3 w-3 text-green-400" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
        </Button>
      </div>
      <pre className="bg-black/80 rounded-b p-3 overflow-x-auto">
        <code className={`hljs language-${language || 'text'}`}>{code}</code>
      </pre>
    </div>
  );
};

