import { useNavigate } from 'react-router-dom';
import { MessageCircle } from 'lucide-react';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';

/**
 * ChatFirstViewHint - Shown on dashboard views (Timeline, Characters, Quest log, etc.)
 * Explains that the view is built from conversations and nudges users to Chat to add or change things.
 */
export const ChatFirstViewHint = () => {
  const navigate = useNavigate();

  const handleGoToChat = () => {
    navigate('/chat');
  };

  return (
    <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/30 rounded-xl">
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/20 rounded-lg flex-shrink-0">
            <MessageCircle className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs sm:text-sm text-white font-medium mb-0.5">
              This view is built from your conversations.
            </p>
            <p className="text-xs text-white/60">
              To add or change things here, bring it up in Chat — that&apos;s where your story is built.
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleGoToChat}
            className="text-primary hover:text-primary/80 flex-shrink-0 text-xs sm:text-sm"
          >
            Go to Chat
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
