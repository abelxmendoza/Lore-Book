import { X, BookOpen, Sparkles, AlertCircle, TrendingUp, Brain, Users, Zap } from 'lucide-react';
import { Button } from '../ui/button';

type EngineType = 
  | 'storyOfSelf' 
  | 'archetype' 
  | 'shadow' 
  | 'growth' 
  | 'innerDialogue' 
  | 'alternateSelf' 
  | 'cognitiveBias' 
  | 'paracosm';

type AIInsightModalProps = {
  isOpen: boolean;
  onClose: () => void;
  engineType: EngineType;
  engineData: any;
};

const engineConfig = {
  storyOfSelf: {
    title: 'Your Story',
    icon: BookOpen,
    color: 'text-primary',
    bgColor: 'bg-primary/10',
    borderColor: 'border-primary/30',
  },
  archetype: {
    title: 'Archetype Profile',
    icon: Sparkles,
    color: 'text-primary',
    bgColor: 'bg-primary/10',
    borderColor: 'border-primary/30',
  },
  shadow: {
    title: 'Shadow Patterns',
    icon: AlertCircle,
    color: 'text-red-300',
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-500/30',
  },
  growth: {
    title: 'Growth Trajectory',
    icon: TrendingUp,
    color: 'text-green-300',
    bgColor: 'bg-green-500/10',
    borderColor: 'border-green-500/30',
  },
  innerDialogue: {
    title: 'Inner Dialogue',
    icon: Brain,
    color: 'text-primary',
    bgColor: 'bg-primary/10',
    borderColor: 'border-primary/30',
  },
  alternateSelf: {
    title: 'Alternate Self',
    icon: Users,
    color: 'text-primary',
    bgColor: 'bg-primary/10',
    borderColor: 'border-primary/30',
  },
  cognitiveBias: {
    title: 'Cognitive Bias Patterns',
    icon: AlertCircle,
    color: 'text-yellow-300',
    bgColor: 'bg-yellow-500/10',
    borderColor: 'border-yellow-500/30',
  },
  paracosm: {
    title: 'Paracosm',
    icon: Zap,
    color: 'text-primary',
    bgColor: 'bg-primary/10',
    borderColor: 'border-primary/30',
  },
};

const generateInsight = (engineType: EngineType, data: any): { meaning: string; why: string; insights: string[] } => {
  switch (engineType) {
    case 'storyOfSelf': {
      const mode = data?.mode?.mode || 'Reflective';
      const topTheme = data?.themes?.[0]?.theme || 'Self-Discovery';
      return {
        meaning: `Your narrative mode is **${mode}**, which means you tend to process experiences through introspection and reflection. Your dominant theme is **${topTheme}**, appearing frequently throughout your entries.`,
        why: `This pattern suggests you're naturally drawn to understanding yourself and your journey. The ${mode.toLowerCase()} mode indicates you value deep thinking and personal growth, while the ${topTheme.toLowerCase()} theme shows what matters most to you right now.`,
        insights: [
          `Your ${mode.toLowerCase()} approach helps you make sense of complex experiences`,
          `${topTheme} appears in ${data?.themes?.[0]?.frequency || 0}% of your entries, showing its importance`,
          `Your story coherence is ${Math.round((data?.coherence?.score || 0) * 100)}%, indicating consistent self-understanding`,
        ],
      };
    }
    case 'archetype': {
      const dominant = data?.profile?.dominant || 'The Seeker';
      const secondary = data?.profile?.secondary?.[0] || 'The Sage';
      return {
        meaning: `Your dominant archetype is **${dominant}**, which represents your core identity pattern. You also embody **${secondary}**, showing the complexity of your character.`,
        why: `Archetypes reveal the fundamental patterns that shape how you see yourself and navigate the world. ${dominant} suggests you're driven by exploration and growth, while ${secondary} adds wisdom and understanding to your journey.`,
        insights: [
          `${dominant} archetypes are often on a quest for meaning and purpose`,
          `Your secondary archetype (${secondary}) complements your primary pattern`,
          `These patterns help explain your motivations and decision-making style`,
        ],
      };
    }
    case 'shadow': {
      const shadow = data?.dominant_shadow || 'The Perfectionist';
      const focus = data?.projection?.recommended_focus || 'Self-compassion';
      return {
        meaning: `Your shadow pattern is **${shadow}**, representing suppressed or unacknowledged aspects of yourself. The recommended focus is **${focus}**.`,
        why: `Shadow work is essential for authentic growth. Recognizing the ${shadow.toLowerCase()} pattern helps you understand what you might be avoiding or overcompensating for. ${focus} is the key to integrating this shadow energy constructively.`,
        insights: [
          `Shadow patterns aren't negative—they're parts of yourself seeking expression`,
          `Working with your shadow (${shadow.toLowerCase()}) can unlock hidden strengths`,
          `${focus} helps you transform shadow energy into positive growth`,
        ],
      };
    }
    case 'growth': {
      const trajectory = data?.trajectory || 'Ascending';
      return {
        meaning: `Your growth trajectory is **${trajectory}**, indicating the direction and momentum of your personal development journey.`,
        why: `Understanding your growth pattern helps you see the bigger picture of your evolution. An ${trajectory.toLowerCase()} trajectory suggests you're making meaningful progress and building on past experiences.`,
        insights: [
          `Your ${trajectory.toLowerCase()} trajectory shows consistent forward movement`,
          `Growth velocity of ${Math.round((data?.velocity || 0) * 100)}% indicates steady progress`,
          `Your milestones show key moments that shaped your journey`,
        ],
      };
    }
    case 'innerDialogue': {
      const voice = data?.voices?.[0];
      const role = voice?.role || 'future_self';
      const tone = voice?.tone || 'encouraging';
      return {
        meaning: `Your dominant inner voice is **${role.replace('_', ' ')}**, speaking in a **${tone}** tone. This voice appears in ${Math.round((voice?.frequency || 0) * 100)}% of your inner reflections.`,
        why: `Your inner dialogue shapes how you process experiences and make decisions. A ${tone} ${role.replace('_', ' ')} voice suggests you're developing a supportive internal narrative that guides you forward.`,
        insights: [
          `The ${role.replace('_', ' ')} voice represents how you see your potential`,
          `A ${tone} tone indicates healthy self-relationship`,
          `Multiple voices show the complexity of your inner world`,
        ],
      };
    }
    case 'alternateSelf': {
      const selfType = data?.clusters?.[0]?.self_type || 'The Ideal Self';
      const trajectory = data?.clusters?.[0]?.trajectory || 'aspiring';
      return {
        meaning: `Your alternate self is **${selfType}**, with a **${trajectory}** trajectory. This represents how you envision or reflect on different versions of yourself.`,
        why: `Alternate selves reveal your aspirations, regrets, and self-concepts. ${selfType} shows what you're moving toward or away from, while the ${trajectory} trajectory indicates the direction of that movement.`,
        insights: [
          `${selfType} represents an important aspect of your identity exploration`,
          `The ${trajectory} trajectory shows how you're relating to this self-concept`,
          `Understanding alternate selves helps clarify your values and goals`,
        ],
      };
    }
    case 'cognitiveBias': {
      const bias = data?.dominant_bias || 'Confirmation Bias';
      const impact = Math.round((data?.impact_score || 0) * 100);
      return {
        meaning: `Your dominant cognitive bias is **${bias}**, with an impact score of **${impact}%**. This shows how your thinking patterns might be influencing your perceptions.`,
        why: `Cognitive biases are mental shortcuts that affect how we process information. ${bias} means you might be seeking or interpreting information in ways that confirm existing beliefs. Awareness of this pattern helps you think more clearly.`,
        insights: [
          `${bias} affects ${impact}% of your decision-making and perceptions`,
          `Recognizing this bias helps you question your assumptions`,
          `Other biases in your profile show additional thinking patterns to be aware of`,
        ],
      };
    }
    case 'paracosm': {
      const category = data?.clusters?.[0]?.category || 'Imagined Worlds';
      const signalCount = data?.clusters?.[0]?.signals?.length || 0;
      return {
        meaning: `Your paracosm category is **${category}**, with **${signalCount} signals** detected. Paracosms are rich, detailed imaginary worlds or scenarios you create.`,
        why: `Paracosms reveal your creativity, aspirations, and how you process complex ideas. ${category} shows the type of imaginative spaces you inhabit, which often reflect your values, fears, and hopes.`,
        insights: [
          `${category} represents a significant part of your inner creative world`,
          `${signalCount} signals show how frequently this appears in your thoughts`,
          `Paracosms often reveal deeper patterns about what you're exploring or avoiding`,
        ],
      };
    }
    default:
      return {
        meaning: 'This insight is being processed.',
        why: 'We\'re analyzing your patterns to provide personalized insights.',
        insights: [],
      };
  }
};

export const AIInsightModal = ({ isOpen, onClose, engineType, engineData }: AIInsightModalProps) => {
  if (!isOpen) return null;

  const config = engineConfig[engineType];
  const Icon = config.icon;
  const { meaning, why, insights } = generateInsight(engineType, engineData);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-insight-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl max-h-[90vh] bg-black/95 border border-border/60 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            onClose();
          }
        }}
      >
        {/* Header */}
        <div className={`flex items-center justify-between p-6 border-b ${config.borderColor}`}>
          <div className="flex items-center gap-3">
            <div className={`p-3 rounded-lg ${config.bgColor}`}>
              <Icon className={`h-6 w-6 ${config.color}`} />
            </div>
            <div>
              <h2 id="ai-insight-modal-title" className="text-2xl font-semibold text-white">
                {config.title}
              </h2>
              <p className="text-sm text-white/60 mt-1">Personalized insight about your patterns</p>
            </div>
          </div>
          <Button variant="ghost" onClick={onClose} className="p-2">
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* What This Means */}
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-primary"></span>
              What This Means
            </h3>
            <div className="bg-black/40 rounded-lg p-4 border border-border/50">
              <p className="text-white/80 leading-relaxed" dangerouslySetInnerHTML={{ __html: meaning.replace(/\*\*(.*?)\*\*/g, '<strong class="text-primary">$1</strong>') }} />
            </div>
          </div>

          {/* Why This Matters */}
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-primary"></span>
              Why This Matters
            </h3>
            <div className="bg-black/40 rounded-lg p-4 border border-border/50">
              <p className="text-white/80 leading-relaxed">{why}</p>
            </div>
          </div>

          {/* Key Insights */}
          {insights.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-primary"></span>
                Key Insights
              </h3>
              <div className="space-y-2">
                {insights.map((insight, idx) => (
                  <div key={idx} className="bg-black/40 rounded-lg p-3 border border-border/50 flex items-start gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0"></div>
                    <p className="text-white/70 text-sm leading-relaxed">{insight}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action Suggestion */}
          <div className={`${config.bgColor} rounded-lg p-4 border ${config.borderColor}`}>
            <p className="text-sm text-white/80">
              <strong className="text-white">💡 Next Step:</strong> Explore this insight further in the{' '}
              <button
                onClick={() => {
                  onClose();
                  // Navigate will be handled by parent
                }}
                className="text-primary hover:text-primary/80 underline"
              >
                Discovery Hub
              </button>{' '}
              for deeper analysis and recommendations.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

