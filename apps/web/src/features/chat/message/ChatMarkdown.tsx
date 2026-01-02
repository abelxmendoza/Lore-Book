import { MarkdownRenderer } from '../../../components/chat/MarkdownRenderer';
import { markdownConfig } from '../utils/markdownConfig';

type ChatMarkdownProps = {
  content: string;
  isStreaming?: boolean;
  className?: string;
};

export const ChatMarkdown = ({ content, isStreaming, className }: ChatMarkdownProps) => {
  return (
    <MarkdownRenderer 
      content={content} 
      isStreaming={isStreaming} 
      className={className}
    />
  );
};

