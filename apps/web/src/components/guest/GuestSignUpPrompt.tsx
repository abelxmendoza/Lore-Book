import { LogIn, Sparkles, Zap, Infinity } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../ui/button';
import { Card } from '../ui/card';

export const GuestSignUpPrompt = () => {
  const navigate = useNavigate();

  return (
    <Card className="border-primary/30 bg-gradient-to-br from-primary/10 to-primary/5 p-6">
      <div className="flex items-start gap-4">
        <div className="rounded-full bg-primary/20 p-3">
          <Sparkles className="h-6 w-6 text-primary" />
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-white mb-2">
            Unlock Unlimited Access
          </h3>
          <p className="text-sm text-white/70 mb-4">
            You've reached the guest chat limit. Sign up to continue chatting and unlock all features!
          </p>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="flex items-center gap-2 text-sm text-white/80">
              <Infinity className="h-4 w-4 text-primary" />
              <span>Unlimited chat</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-white/80">
              <Zap className="h-4 w-4 text-primary" />
              <span>All features</span>
            </div>
          </div>
          <Button
            onClick={() => navigate('/login')}
            className="w-full bg-primary text-white hover:bg-primary/90"
          >
            <LogIn className="mr-2 h-4 w-4" />
            Sign Up Free
          </Button>
        </div>
      </div>
    </Card>
  );
};

