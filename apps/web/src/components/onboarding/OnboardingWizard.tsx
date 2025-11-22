import { useState, useEffect } from 'react';
import { ChevronRight, ChevronLeft, CheckCircle2, Sparkles, BookOpen, MessageSquare, Calendar, Search, Users, Zap, Loader2, Tag, MapPin, UserPlus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../ui/button';
import { useLoreKeeper } from '../../hooks/useLoreKeeper';
import { updateUserProfile } from '../../api/user';
import { fetchJson } from '../../lib/api';
import { useAuth } from '../../lib/supabase';
import { config } from '../../config/env';

type Step = {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  content: React.ReactNode;
};

interface OnboardingWizardProps {
  onComplete?: () => void;
}

type PersonaType = 'journaler' | 'developer' | 'writer' | 'explorer' | null;

export const OnboardingWizard = ({ onComplete }: OnboardingWizardProps) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [selectedPersona, setSelectedPersona] = useState<PersonaType>(null);
  const [firstMemory, setFirstMemory] = useState('');
  const [firstMemoryTags, setFirstMemoryTags] = useState<string[]>([]);
  const [firstMemoryLocation, setFirstMemoryLocation] = useState<string>('');
  const [firstMemoryPeople, setFirstMemoryPeople] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { createEntry } = useLoreKeeper();
  const { user } = useAuth();

  const steps: Step[] = [
    {
      id: 'welcome',
      title: 'Welcome to LoreKeeper',
      description: 'Your AI-powered memory and journaling companion',
      icon: Sparkles,
      content: (
        <div className="space-y-6">
          <div className="text-center space-y-4">
            <div className="mx-auto w-24 h-24 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
              <Sparkles className="h-12 w-12 text-white" />
            </div>
            <h2 className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
              Your Digital Memory Palace
            </h2>
            <p className="text-lg text-white/70 max-w-2xl mx-auto">
              LoreKeeper helps you capture, organize, and understand your life's story through AI-powered memory management.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-4 mt-8">
            {[
              { icon: BookOpen, title: 'Journal Everything', desc: 'Capture thoughts, memories, and moments' },
              { icon: MessageSquare, title: 'AI Companion', desc: 'Chat with your memories and get insights' },
              { icon: Calendar, title: 'Timeline View', desc: 'See your life story unfold chronologically' },
            ].map((feature, idx) => (
              <div key={idx} className="rounded-xl border border-border/60 bg-white/5 p-6 text-center">
                <feature.icon className="h-8 w-8 text-primary mx-auto mb-3" />
                <h3 className="font-semibold text-white mb-2">{feature.title}</h3>
                <p className="text-sm text-white/60">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      ),
    },
    {
      id: 'persona',
      title: 'Choose Your Journey',
      description: 'Tell us about yourself to personalize your experience',
      icon: Users,
      content: (
        <div className="space-y-6">
          <p className="text-center text-white/70 mb-6">
            What best describes you? (You can change this later)
          </p>
          <div className="grid md:grid-cols-2 gap-4">
            {[
              {
                title: 'The Journaler',
                desc: 'I want to capture daily thoughts and memories',
                icon: BookOpen,
                color: 'from-blue-500 to-cyan-500',
              },
              {
                title: 'The Developer',
                desc: 'I build things and want to track my projects',
                icon: Zap,
                color: 'from-purple-500 to-pink-500',
              },
              {
                title: 'The Writer',
                desc: 'I create stories and need inspiration',
                icon: MessageSquare,
                color: 'from-orange-500 to-red-500',
              },
              {
                title: 'The Explorer',
                desc: 'I want to discover patterns in my life',
                icon: Search,
                color: 'from-green-500 to-emerald-500',
              },
            ].map((persona, idx) => {
              const personaKey: PersonaType = idx === 0 ? 'journaler' : idx === 1 ? 'developer' : idx === 2 ? 'writer' : 'explorer';
              const isSelected = selectedPersona === personaKey;
              
              return (
                <button
                  key={idx}
                  onClick={() => setSelectedPersona(personaKey)}
                  className={`rounded-xl border-2 p-6 text-left transition-all group ${
                    isSelected
                      ? 'border-primary bg-primary/20 shadow-lg shadow-primary/20'
                      : 'border-border/60 bg-white/5 hover:border-primary/50 hover:bg-primary/10'
                  }`}
                >
                  <div className={`w-12 h-12 rounded-lg bg-gradient-to-br ${persona.color} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                    <persona.icon className="h-6 w-6 text-white" />
                  </div>
                  <h3 className="font-semibold text-white mb-2">{persona.title}</h3>
                  <p className="text-sm text-white/60">{persona.desc}</p>
                </button>
              );
            })}
          </div>
        </div>
      ),
    },
    {
      id: 'features',
      title: 'Key Features Tour',
      description: 'Discover what makes LoreKeeper special',
      icon: Zap,
      content: (
        <div className="space-y-6">
          <div className="grid gap-4">
            {[
              {
                icon: MessageSquare,
                title: 'Chat with Your Memories',
                desc: 'Ask questions about your past and get AI-powered insights',
                route: '/chat',
              },
              {
                icon: Calendar,
                title: 'Omni Timeline',
                desc: 'See your entire life story in chronological order',
                route: '/timeline',
              },
              {
                icon: Search,
                title: 'Memory Explorer',
                desc: 'Search and discover connections across your memories',
                route: '/search',
              },
              {
                icon: Users,
                title: 'Character Tracking',
                desc: 'Keep track of people and relationships in your story',
                route: '/characters',
              },
            ].map((feature, idx) => (
              <div
                key={idx}
                className="rounded-xl border border-border/60 bg-white/5 p-6 hover:bg-primary/10 hover:border-primary/50 transition-all cursor-pointer"
                onClick={() => navigate(feature.route)}
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center flex-shrink-0">
                    <feature.icon className="h-6 w-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-white mb-2">{feature.title}</h3>
                    <p className="text-sm text-white/60">{feature.desc}</p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-white/40" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ),
    },
    {
      id: 'first-memory',
      title: 'Create Your First Memory',
      description: 'Let\'s start building your memory graph',
      icon: BookOpen,
      content: (
        <FirstMemoryStep
          memory={firstMemory}
          setMemory={setFirstMemory}
          tags={firstMemoryTags}
          setTags={setFirstMemoryTags}
          location={firstMemoryLocation}
          setLocation={setFirstMemoryLocation}
          people={firstMemoryPeople}
          setPeople={setFirstMemoryPeople}
        />
      ),
    },
    {
      id: 'complete',
      title: 'You\'re All Set!',
      description: 'Welcome to your LoreKeeper',
      icon: CheckCircle2,
      content: (
        <div className="space-y-6 text-center">
          <div className="mx-auto w-32 h-32 rounded-full bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center">
            <CheckCircle2 className="h-16 w-16 text-white" />
          </div>
          <div>
            <h2 className="text-3xl font-bold text-white mb-4">Ready to Begin Your Journey</h2>
            <p className="text-lg text-white/70 max-w-2xl mx-auto">
              Your LoreKeeper is set up and ready. Start capturing memories, explore your timeline, or chat with your AI companion.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-4 mt-8">
            <Button
              variant="outline"
              className="h-auto py-6 flex flex-col items-center gap-2"
              onClick={() => navigate('/chat')}
            >
              <MessageSquare className="h-6 w-6" />
              <span>Start Chatting</span>
            </Button>
            <Button
              variant="outline"
              className="h-auto py-6 flex flex-col items-center gap-2"
              onClick={() => navigate('/timeline')}
            >
              <Calendar className="h-6 w-6" />
              <span>View Timeline</span>
            </Button>
            <Button
              variant="outline"
              className="h-auto py-6 flex flex-col items-center gap-2"
              onClick={() => navigate('/search')}
            >
              <Search className="h-6 w-6" />
              <span>Explore Memories</span>
            </Button>
          </div>
        </div>
      ),
    },
  ];

  const handleNext = async () => {
    // Handle persona selection step
    if (currentStep === 1 && selectedPersona) {
      try {
        setSaving(true);
        setError(null);
        // Save persona to user profile
        await updateUserProfile({ persona: selectedPersona });
        if (config.isDevelopment) {
          console.log('Persona saved:', selectedPersona);
        }
      } catch (err: any) {
        console.error('Failed to save persona:', err);
        setError('Failed to save persona selection. You can continue anyway.');
      } finally {
        setSaving(false);
      }
    }

    // Handle first memory step
    if (currentStep === 3 && firstMemory.trim()) {
      try {
        setSaving(true);
        setError(null);
        // Create the first memory entry
        await createEntry(firstMemory.trim(), {
          tags: firstMemoryTags,
          // Note: location and people would need to be handled via the entry creation API
        });
        if (config.isDevelopment) {
          console.log('First memory created');
        }
      } catch (err: any) {
        console.error('Failed to create first memory:', err);
        setError('Failed to save your first memory. You can continue anyway.');
      } finally {
        setSaving(false);
      }
    }

    if (currentStep < steps.length - 1) {
      setCompletedSteps(new Set([...completedSteps, currentStep]));
      setCurrentStep(currentStep + 1);
    } else {
      await handleComplete();
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleComplete = async () => {
    try {
      setSaving(true);
      setError(null);
      
      // Mark onboarding as complete in backend
      try {
        await fetchJson('/api/onboarding/complete', {
          method: 'POST',
          body: JSON.stringify({
            persona: selectedPersona,
            completedAt: new Date().toISOString(),
          }),
        });
      } catch (err) {
        // If backend fails, still mark in localStorage
        console.warn('Failed to mark onboarding complete in backend:', err);
      }
      
      // Mark onboarding as complete in localStorage
      localStorage.setItem('onboarding_completed', 'true');
      localStorage.setItem('onboardingComplete', 'true');
      
      setCompletedSteps(new Set([...Array(steps.length).keys()]));
      onComplete?.();
      
      // Navigate to chat
      navigate('/chat');
    } catch (err: any) {
      console.error('Failed to complete onboarding:', err);
      setError('Failed to complete onboarding. Redirecting anyway...');
      // Still navigate even if there's an error
      setTimeout(() => {
        localStorage.setItem('onboarding_completed', 'true');
        navigate('/chat');
      }, 2000);
    } finally {
      setSaving(false);
    }
  };

  const progress = ((currentStep + 1) / steps.length) * 100;
  const StepIcon = steps[currentStep].icon;

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-purple-950 to-black flex items-center justify-center p-4">
      <div className="w-full max-w-4xl">
        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-white/60">
              Step {currentStep + 1} of {steps.length}
            </span>
            <span className="text-sm text-white/60">{Math.round(progress)}%</span>
          </div>
          <div className="h-2 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Step Card */}
        <div className="rounded-2xl border border-border/60 bg-black/40 backdrop-blur-sm shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-purple-900/40 to-pink-900/40 p-6 border-b border-border/60">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                <StepIcon className="h-8 w-8 text-white" />
              </div>
              <div className="flex-1">
                <h1 className="text-2xl font-bold text-white mb-1">{steps[currentStep].title}</h1>
                <p className="text-white/70">{steps[currentStep].description}</p>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="p-8 min-h-[400px] flex items-center">
            <div className="w-full transition-all duration-500 ease-in-out">
              {steps[currentStep].content}
            </div>
          </div>

          {/* Footer */}
          <div className="bg-black/20 p-6 border-t border-border/60 flex items-center justify-between">
            <Button
              variant="outline"
              onClick={handleBack}
              disabled={currentStep === 0}
              className="flex items-center gap-2"
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </Button>

            <div className="flex gap-2">
              {steps.map((_, idx) => (
                <div
                  key={idx}
                  className={`w-2 h-2 rounded-full transition-all ${
                    idx === currentStep
                      ? 'bg-primary w-8'
                      : completedSteps.has(idx)
                      ? 'bg-primary/50'
                      : 'bg-white/20'
                  }`}
                />
              ))}
            </div>

            <Button
              onClick={handleNext}
              disabled={saving || (currentStep === 1 && !selectedPersona) || (currentStep === 3 && !firstMemory.trim())}
              className="flex items-center gap-2 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  {currentStep === steps.length - 1 ? 'Get Started' : 'Next'}
                  <ChevronRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

