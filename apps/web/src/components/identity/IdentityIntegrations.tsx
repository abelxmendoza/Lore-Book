import { Link2, Zap, Award, HeartPulse } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const IdentityIntegrations = () => {
  const navigate = useNavigate();

  return (
    <div className="pt-4 border-t border-border/20">
      <div className="flex flex-wrap items-center gap-4 text-xs">
        <span className="text-white/40">Identity Context:</span>
        
        <button
          onClick={() => navigate('/discovery?panel=xp')}
          className="flex items-center gap-1.5 text-primary/70 hover:text-primary transition-colors"
        >
          <Zap className="h-3 w-3" />
          <span>Related Skills</span>
        </button>

        <button
          onClick={() => navigate('/discovery?panel=achievements')}
          className="flex items-center gap-1.5 text-primary/70 hover:text-primary transition-colors"
        >
          <Award className="h-3 w-3" />
          <span>Key Achievements</span>
        </button>

        <button
          onClick={() => navigate('/discovery?panel=reactions')}
          className="flex items-center gap-1.5 text-primary/70 hover:text-primary transition-colors"
        >
          <HeartPulse className="h-3 w-3" />
          <span>Therapist View</span>
        </button>
      </div>
    </div>
  );
};
