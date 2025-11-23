import { User, X, LogIn } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useGuest } from '../../contexts/GuestContext';
import { useAuth } from '../../lib/supabase';
import { Button } from '../ui/button';

export const GuestBanner = () => {
  const { isGuest, guestState, endGuestSession } = useGuest();
  const { user } = useAuth();
  const navigate = useNavigate();

  // Don't show if user is authenticated or not a guest
  if (user || !isGuest || !guestState) return null;

  const messagesRemaining = guestState.chatLimit - guestState.chatMessagesUsed;
  const limitReached = messagesRemaining <= 0;

  return (
    <div className="border-b border-primary/20 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent px-4 py-3">
      <div className="mx-auto flex max-w-7xl items-center justify-between">
        <div className="flex items-center gap-3">
          <User className="h-4 w-4 text-primary" />
          <div className="flex flex-col">
            <span className="text-sm font-medium text-white">
              {limitReached ? (
                <>Guest mode limit reached</>
              ) : (
                <>Guest Mode • {messagesRemaining} chat {messagesRemaining === 1 ? 'message' : 'messages'} remaining</>
              )}
            </span>
            {limitReached ? (
              <span className="text-xs text-white/60">
                Sign up to continue chatting and unlock all features
              </span>
            ) : (
              <span className="text-xs text-white/60">
                Explore freely, but chat is limited. Sign up for unlimited access.
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {limitReached ? (
            <Button
              size="sm"
              onClick={() => navigate('/login')}
              className="bg-primary text-white hover:bg-primary/90"
            >
              <LogIn className="mr-2 h-4 w-4" />
              Sign Up
            </Button>
          ) : (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => navigate('/login')}
                className="border-primary/30 text-primary hover:bg-primary/10"
              >
                <LogIn className="mr-2 h-4 w-4" />
                Sign Up
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={endGuestSession}
                className="text-white/60 hover:text-white"
              >
                <X className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

