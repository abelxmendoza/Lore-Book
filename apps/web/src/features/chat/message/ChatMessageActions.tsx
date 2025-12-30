import { Copy, RotateCw, Edit2, Trash2, ThumbsUp, ThumbsDown } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import type { Message } from './ChatMessage';

type ChatMessageActionsProps = {
  message: Message;
  isUser: boolean;
  copied?: boolean;
  onCopy?: () => void;
  onRegenerate?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onFeedback?: (feedback: 'positive' | 'negative') => void;
};

export const ChatMessageActions = ({
  message,
  isUser,
  copied = false,
  onCopy,
  onRegenerate,
  onEdit,
  onDelete,
  onFeedback
}: ChatMessageActionsProps) => {
  return (
    <div className={`absolute ${isUser ? 'left-0' : 'right-0'} -top-8 flex gap-1 bg-black/90 border border-border/60 rounded-lg p-1 z-10 shadow-lg`}>
      {!isUser && onRegenerate && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onRegenerate}
          className="h-7 px-2 text-xs hover:bg-black/60"
          title="Regenerate response"
        >
          <RotateCw className="h-3 w-3" />
        </Button>
      )}
      {onCopy && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onCopy}
          className="h-7 px-2 text-xs hover:bg-black/60"
          title={copied ? 'Copied!' : 'Copy message'}
        >
          <Copy className={`h-3 w-3 ${copied ? 'text-green-400' : ''}`} />
        </Button>
      )}
      {!isUser && onFeedback && (
        <>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onFeedback('positive')}
            className={`h-7 px-2 text-xs hover:bg-black/60 ${message.feedback === 'positive' ? 'text-green-400' : ''}`}
            title="Good response"
          >
            <ThumbsUp className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onFeedback('negative')}
            className={`h-7 px-2 text-xs hover:bg-black/60 ${message.feedback === 'negative' ? 'text-red-400' : ''}`}
            title="Poor response"
          >
            <ThumbsDown className="h-3 w-3" />
          </Button>
        </>
      )}
      {isUser && onEdit && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onEdit}
          className="h-7 px-2 text-xs hover:bg-black/60"
          title="Edit message"
        >
          <Edit2 className="h-3 w-3" />
        </Button>
      )}
      {onDelete && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onDelete}
          className="h-7 px-2 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10"
          title="Delete message"
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
};

