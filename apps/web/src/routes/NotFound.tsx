import { useNavigate } from 'react-router-dom';
import { Home, Search, ArrowLeft, AlertCircle } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Logo } from '../components/Logo';

export default function NotFound() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-purple-950 to-black flex items-center justify-center p-4">
      <div className="w-full max-w-2xl text-center space-y-8">
        {/* 404 Visual */}
        <div className="relative">
          <div className="text-9xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
            404
          </div>
          <div className="absolute inset-0 text-9xl font-bold text-purple-500/20 blur-2xl">
            404
          </div>
        </div>

        {/* Error Message */}
        <div className="space-y-4">
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-full bg-red-500/20 border border-red-500/50 flex items-center justify-center">
              <AlertCircle className="h-8 w-8 text-red-400" />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-white">Page Not Found</h1>
          <p className="text-lg text-white/70 max-w-md mx-auto">
            The page you're looking for doesn't exist or has been moved to a different location.
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
          <Button
            onClick={() => navigate('/')}
            className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
          >
            <Home className="h-4 w-4 mr-2" />
            Go Home
          </Button>
          <Button
            variant="outline"
            onClick={() => navigate(-1)}
            className="border-border/60 bg-white/5 hover:bg-white/10 text-white"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Go Back
          </Button>
          <Button
            variant="outline"
            onClick={() => navigate('/search')}
            className="border-border/60 bg-white/5 hover:bg-white/10 text-white"
          >
            <Search className="h-4 w-4 mr-2" />
            Search
          </Button>
        </div>

        {/* Quick Links */}
        <div className="pt-8 border-t border-white/10">
          <p className="text-sm text-white/60 mb-4">Quick Links:</p>
          <div className="flex flex-wrap justify-center gap-4">
            {[
              { label: 'Chat', path: '/chat' },
              { label: 'Timeline', path: '/timeline' },
              { label: 'Characters', path: '/characters' },
              { label: 'Account', path: '/account' },
            ].map((link) => (
              <button
                key={link.path}
                onClick={() => navigate(link.path)}
                className="text-primary hover:text-primary/80 text-sm transition"
              >
                {link.label}
              </button>
            ))}
          </div>
        </div>

        {/* Logo */}
        <div className="pt-8">
          <Logo size="md" showText={true} />
        </div>
      </div>
    </div>
  );
}

