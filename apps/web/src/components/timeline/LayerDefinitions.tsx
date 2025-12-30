import React from 'react';
import { Layers, Clock, BookOpen, Sparkles, GitBranch, Calendar, Zap, Target } from 'lucide-react';

export type TimelineLayer = 
  | 'mythos' 
  | 'epoch' 
  | 'era' 
  | 'saga' 
  | 'arc' 
  | 'chapter' 
  | 'scene' 
  | 'action' 
  | 'microaction';

export interface LayerDefinition {
  name: string;
  description: string;
  duration: string;
  examples: string[];
  icon: React.ReactNode;
  color: string;
}

export const LAYER_DEFINITIONS: Record<TimelineLayer, LayerDefinition> = {
  mythos: {
    name: 'Mythos',
    description: 'The overarching narrative of your entire life—the grand story that defines who you are. This is the highest level, spanning decades and representing your life\'s ultimate theme or journey.',
    duration: 'Decades to lifetime',
    examples: [
      'The Journey of Self-Discovery',
      'Building My Legacy',
      'The Quest for Meaning',
      'My Evolution as a Creator'
    ],
    icon: <Layers className="w-5 h-5" />,
    color: 'text-purple-400'
  },
  epoch: {
    name: 'Epoch',
    description: 'Major life phases that span years. These are distinct periods that fundamentally changed who you are or how you live. Think of them as "chapters" of your life story.',
    duration: 'Years (2-10+ years)',
    examples: [
      'The College Years',
      'Early Career Phase',
      'The Transformation Period',
      'The Nomadic Years'
    ],
    icon: <Calendar className="w-5 h-5" />,
    color: 'text-blue-400'
  },
  era: {
    name: 'Era',
    description: 'Significant periods within an epoch, typically lasting months to years. These represent distinct phases with their own themes, challenges, and growth.',
    duration: 'Months to years (6 months - 3 years)',
    examples: [
      'The Startup Era',
      'The Relationship Era',
      'The Learning Era',
      'The Creative Renaissance'
    ],
    icon: <BookOpen className="w-5 h-5" />,
    color: 'text-cyan-400'
  },
  saga: {
    name: 'Saga',
    description: 'Long narrative arcs that tell a complete story within an era. These are extended storylines with a beginning, middle, and end—like a book series about a particular theme.',
    duration: 'Months to years (3 months - 2 years)',
    examples: [
      'The Product Launch Saga',
      'The Breakup and Recovery Saga',
      'The Skill Mastery Saga',
      'The Adventure Saga'
    ],
    icon: <Sparkles className="w-5 h-5" />,
    color: 'text-pink-400'
  },
  arc: {
    name: 'Arc',
    description: 'Story arcs within a saga—specific narrative threads that have a clear progression. These are like chapters in a book, each with its own conflict and resolution.',
    duration: 'Weeks to months (2 weeks - 6 months)',
    examples: [
      'The First Product Launch Arc',
      'The Training Arc',
      'The Discovery Arc',
      'The Challenge Arc'
    ],
    icon: <GitBranch className="w-5 h-5" />,
    color: 'text-orange-400'
  },
  chapter: {
    name: 'Chapter',
    description: 'Discrete chapters within an arc—specific periods or events that mark significant moments. These are like scenes in a movie, each contributing to the larger story.',
    duration: 'Days to weeks (3 days - 4 weeks)',
    examples: [
      'Chapter 1: The Beginning',
      'The Interview Chapter',
      'The Decision Chapter',
      'The First Steps Chapter'
    ],
    icon: <BookOpen className="w-5 h-5" />,
    color: 'text-yellow-400'
  },
  scene: {
    name: 'Scene',
    description: 'Specific scenes or events within a chapter—concrete moments in time where something significant happened. These are the building blocks of your story.',
    duration: 'Hours to days (2 hours - 3 days)',
    examples: [
      'The Interview Scene',
      'The First Date Scene',
      'The Breakthrough Scene',
      'The Conversation Scene'
    ],
    icon: <Zap className="w-5 h-5" />,
    color: 'text-green-400'
  },
  action: {
    name: 'Action',
    description: 'Single actions or decisions within a scene—specific things you did or choices you made. These are the individual moments that drive the story forward.',
    duration: 'Minutes to hours (15 minutes - 2 hours)',
    examples: [
      'Made the Decision',
      'Sent the Email',
      'Had the Conversation',
      'Took the First Step'
    ],
    icon: <Target className="w-5 h-5" />,
    color: 'text-emerald-400'
  },
  microaction: {
    name: 'MicroAction',
    description: 'The smallest granular actions—very specific, brief moments that are part of a larger action. These capture the finest details of your experience.',
    duration: 'Seconds to minutes (30 seconds - 15 minutes)',
    examples: [
      'Clicked Send',
      'Made the Call',
      'Sent the Message',
      'Took the Photo'
    ],
    icon: <Zap className="w-5 h-5" />,
    color: 'text-teal-400'
  }
};

interface LayerDefinitionsProps {
  selectedLayers?: TimelineLayer[];
  onLayerToggle?: (layer: TimelineLayer) => void;
  showFilters?: boolean;
}

export const LayerDefinitions: React.FC<LayerDefinitionsProps> = ({
  selectedLayers = [],
  onLayerToggle,
  showFilters = false
}) => {
  return (
    <div className="space-y-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
          <Layers className="w-5 h-5 text-primary" />
          Timeline Layers Explained
        </h3>
        <p className="text-sm text-white/60">
          Your life is organized into 9 layers, from the grand narrative (Mythos) down to the smallest moments (MicroActions).
        </p>
      </div>

      {showFilters && (
        <div className="mb-6 p-4 bg-black/40 border border-border/60 rounded-lg">
          <p className="text-sm font-medium text-white mb-3">Filter by Layer Type:</p>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(LAYER_DEFINITIONS) as TimelineLayer[]).map((layer) => {
              const def = LAYER_DEFINITIONS[layer];
              const isSelected = selectedLayers.includes(layer);
              return (
                <button
                  key={layer}
                  onClick={() => onLayerToggle?.(layer)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border flex items-center gap-1.5 ${
                    isSelected
                      ? 'bg-primary/20 text-white border-primary/40'
                      : 'bg-black/40 text-white/80 border-border/60 hover:border-primary/40 hover:bg-black/60'
                  }`}
                >
                  <span className={def.color}>{def.icon}</span>
                  {def.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {(Object.entries(LAYER_DEFINITIONS) as [TimelineLayer, LayerDefinition][]).map(([layer, def]) => (
          <div
            key={layer}
            className="bg-black/40 border border-border/60 rounded-lg p-4 hover:border-primary/40 transition-colors"
          >
            <div className="flex items-start gap-3 mb-3">
              <div className={def.color}>{def.icon}</div>
              <div className="flex-1">
                <h4 className="text-base font-semibold text-white mb-1">{def.name}</h4>
                <p className="text-xs text-white/50 mb-2">
                  <Clock className="w-3 h-3 inline mr-1" />
                  {def.duration}
                </p>
              </div>
            </div>
            <p className="text-sm text-white/70 mb-3 leading-relaxed">{def.description}</p>
            <div className="mt-3 pt-3 border-t border-border/40">
              <p className="text-xs text-white/50 mb-2">Examples:</p>
              <ul className="space-y-1">
                {def.examples.slice(0, 2).map((example, idx) => (
                  <li key={idx} className="text-xs text-white/60 italic">
                    • {example}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
