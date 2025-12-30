import { useState, useEffect } from 'react';
import { ChevronRight, ChevronLeft, CheckCircle2, Sparkles, BookOpen, MessageSquare, Calendar, Search, Users, Zap, Loader2, Heart } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { useLoreKeeper } from '../../hooks/useLoreKeeper';
import { fetchJson } from '../../lib/api';
import { useAuth } from '../../lib/supabase';
import { config } from '../../config/env';
import { FirstMemoryStep } from './FirstMemoryStep';

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

type PersonaType = 'journaler' | 'developer' | 'writer' | 'explorer';

export const OnboardingWizard = ({ onComplete }: OnboardingWizardProps) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [userDescription, setUserDescription] = useState('');
  const [personalizedResponse, setPersonalizedResponse] = useState<string | null>(null);
  const [detectedPersonas, setDetectedPersonas] = useState<PersonaType[]>([]);
  const [detectingPersonas, setDetectingPersonas] = useState(false);
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
      title: 'Welcome to Lore Book',
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
              Lore Book helps you capture, organize, and understand your life's story through AI-powered memory management.
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
      id: 'why-here',
      title: 'Why Lore Book?',
      description: 'Tell us what brings you here',
      icon: Heart,
      content: (
        <div className="space-y-6">
          <div className="text-center space-y-4">
            <p className="text-white/70 text-lg">
              What brings you to Lore Book? What are you hoping to capture, discover, or create?
            </p>
            <p className="text-white/50 text-sm">
              Share your story, goals, or what you're looking for. We'll personalize your experience.
            </p>
          </div>
          <Textarea
            value={userDescription}
            onChange={(e) => setUserDescription(e.target.value)}
            placeholder="I'm here because... I want to track my journey as a developer, capture memories with my family, explore patterns in my life, write my story..."
            className="min-h-[200px] bg-black/40 border-border/60 text-white placeholder:text-white/40 resize-none"
            disabled={detectingPersonas}
          />
          {detectingPersonas && (
            <div className="flex items-center justify-center gap-2 text-primary/70">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Creating your personalized experience...</span>
            </div>
          )}
        </div>
      ),
    },
    {
      id: 'features',
      title: 'Key Features Tour',
      description: 'Discover what makes Lore Book special',
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
      id: 'personas-detected',
      title: 'Your Journey Awaits',
      description: 'We\'ve personalized your Lore Book experience',
      icon: Sparkles,
      content: (
        <div className="space-y-6">
          {personalizedResponse && (
            <div className="rounded-xl border border-primary/40 bg-gradient-to-br from-primary/20 to-purple-900/20 p-6 space-y-3 mb-6">
              <div className="flex items-center gap-2 text-primary mb-2">
                <Sparkles className="h-5 w-5" />
                <h3 className="font-semibold text-white">Your Lore Book Journey</h3>
              </div>
              <p className="text-white/90 leading-relaxed whitespace-pre-wrap text-lg">{personalizedResponse}</p>
            </div>
          )}
          <div className="text-center space-y-2 mb-6">
            <p className="text-white/70">
              Based on what you shared, we've identified these journey types that match your style:
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            {[
              {
                id: 'journaler' as PersonaType,
                title: 'The Journaler',
                desc: 'Capture daily thoughts and memories',
                icon: BookOpen,
                color: 'from-blue-500 to-cyan-500',
              },
              {
                id: 'developer' as PersonaType,
                title: 'The Developer',
                desc: 'Build things and track projects',
                icon: Zap,
                color: 'from-purple-500 to-pink-500',
              },
              {
                id: 'writer' as PersonaType,
                title: 'The Writer',
                desc: 'Create stories and find inspiration',
                icon: MessageSquare,
                color: 'from-orange-500 to-red-500',
              },
              {
                id: 'explorer' as PersonaType,
                title: 'The Explorer',
                desc: 'Discover patterns in your life',
                icon: Search,
                color: 'from-green-500 to-emerald-500',
              },
            ].map((persona) => {
              const isDetected = detectedPersonas.includes(persona.id);
              
              return (
                <div
                  key={persona.id}
                  className={`rounded-xl border-2 p-6 transition-all ${
                    isDetected
                      ? 'border-primary bg-primary/20 shadow-lg shadow-primary/20'
                      : 'border-border/30 bg-white/5 opacity-40'
                  }`}
                >
                  <div className={`w-12 h-12 rounded-lg bg-gradient-to-br ${persona.color} flex items-center justify-center mb-4`}>
                    <persona.icon className="h-6 w-6 text-white" />
                  </div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-white">{persona.title}</h3>
                    {isDetected && (
                      <CheckCircle2 className="h-5 w-5 text-primary" />
                    )}
                  </div>
                  <p className="text-sm text-white/60">{persona.desc}</p>
                </div>
              );
            })}
          </div>
          {detectedPersonas.length > 0 && (
            <p className="text-center text-sm text-white/50 mt-4">
              All detected personas will be active in your Lore Book experience
            </p>
          )}
        </div>
      ),
    },
    {
      id: 'complete',
      title: 'You\'re All Set!',
      description: 'Welcome to your Lore Book',
      icon: CheckCircle2,
      content: (
        <div className="space-y-6 text-center">
          <div className="mx-auto w-32 h-32 rounded-full bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center">
            <CheckCircle2 className="h-16 w-16 text-white" />
          </div>
          <div>
            <h2 className="text-3xl font-bold text-white mb-4">Ready to Begin Your Journey</h2>
            <p className="text-lg text-white/70 max-w-2xl mx-auto">
              Your Lore Book is set up and ready. Start capturing memories, explore your timeline, or chat with your AI companion.
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
    // Handle user description step - generate personalized response and detect personas
    // Step 1 is "why-here" (index 1)
    if (currentStep === 1 && userDescription.trim()) {
      try {
        setSaving(true);
        setDetectingPersonas(true);
        setError(null);
        
        // Generate personalized response and detect personas
        try {
          const result = await fetchJson<{
            personalizedResponse: string;
            personas: PersonaType[];
            confidence: Record<string, number>;
            reasoning: string;
          }>('/api/onboarding/analyze-user', {
            method: 'POST',
            body: JSON.stringify({ description: userDescription.trim() }),
          });
          
          setPersonalizedResponse(result.personalizedResponse || '');
          setDetectedPersonas(result.personas || ['journaler']);
          
          if (config.env.isDevelopment) {
            console.log('User analyzed:', result);
          }
        } catch (err: any) {
          console.warn('Failed to analyze user, using defaults:', err);
          setPersonalizedResponse('Welcome to Lore Book! We\'re excited to help you on your journey.');
          setDetectedPersonas(['journaler']); // Default fallback
        } finally {
          setDetectingPersonas(false);
        }
      } catch (err: any) {
        console.error('Failed to analyze user:', err);
        setError('Failed to generate personalized response. You can continue anyway.');
      } finally {
        setSaving(false);
      }
    }

    // Handle first memory step - create entry
    // Step 3 is "first-memory" (index 3)
    if (currentStep === 3 && firstMemory.trim()) {
      try {
        setSaving(true);
        setDetectingPersonas(true);
        setError(null);
        
        // First, detect personas from the memory content
        try {
          const detectionResult = await fetchJson<{
            personas: PersonaType[];
            confidence: Record<string, number>;
            reasoning: string;
          }>('/api/onboarding/detect-personas', {
            method: 'POST',
            body: JSON.stringify({ content: firstMemory.trim() }),
          });
          
          setDetectedPersonas(detectionResult.personas || ['journaler']);
          
          if (config.env.isDevelopment) {
            console.log('Detected personas:', detectionResult);
          }
        } catch (err: any) {
          console.warn('Failed to detect personas, using default:', err);
          setDetectedPersonas(['journaler']); // Default fallback
        } finally {
          setDetectingPersonas(false);
        }
        
        // Create the first memory entry
        await createEntry(firstMemory.trim(), {
          tags: firstMemoryTags,
          // Note: location and people would need to be handled via the entry creation API
        });
        
        if (config.env.isDevelopment) {
          console.log('First memory created');
        }
      } catch (err: any) {
        console.error('Failed to create first memory:', err);
        setError('Failed to save your first memory. You can continue anyway.');
      } finally {
        setSaving(false);
      }
    }

    // Move to next step (personas will be shown on step 3 if detected)
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
      
      // Mark onboarding as complete in backend with all detected personas
      try {
        await fetchJson('/api/onboarding/complete', {
          method: 'POST',
          body: JSON.stringify({
            personas: detectedPersonas.length > 0 ? detectedPersonas : ['journaler'],
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
              {error && (
                <div className="mb-4 rounded-lg bg-red-500/20 border border-red-500/50 p-4 text-red-200 text-sm">
                  {error}
                </div>
              )}
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
              disabled={
                saving || 
                detectingPersonas || 
                (currentStep === 1 && !userDescription.trim()) || 
                (currentStep === 3 && !firstMemory.trim())
              }
              className="flex items-center gap-2 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving || detectingPersonas ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {detectingPersonas ? 'Creating your personalized experience...' : 'Saving...'}
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

