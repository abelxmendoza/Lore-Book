import { MessageCircle } from 'lucide-react';
import { Card, CardContent } from '../../ui/card';
import { Button } from '../../ui/button';

/**
 * ChatRefinementHint - Critical boundary component
 * The ONLY affordance for change in the read-only panel
 */
export const ChatRefinementHint = () => {
  const handleClick = () => {
    // Focus chat input (this would need to be wired to chat context)
    // For now, just scroll to top or show a message
    const chatInput = document.querySelector('textarea[placeholder*="chat"], input[placeholder*="message"]') as HTMLElement;
    if (chatInput) {
      chatInput.focus();
      chatInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  return (
    <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/30 rounded-xl">
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/20 rounded-lg">
            <MessageCircle className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <p className="text-sm text-white font-medium mb-1">
              Want to refine or question anything here?
            </p>
            <p className="text-xs text-white/60">
              Talk it through with the chatbot. All insights can be discussed and adjusted through conversation.
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClick}
            className="text-primary hover:text-primary/80"
          >
            Go to Chat
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
