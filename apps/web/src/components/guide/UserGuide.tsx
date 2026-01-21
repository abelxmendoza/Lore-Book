import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  BookOpen, MessageSquareText, CalendarDays, Search, Users, MapPin, 
  BookMarked, Compass, Sparkles, Layers, GitBranch, Clock, Target,
  ChevronRight, ChevronDown, Zap, Info, HelpCircle, ArrowLeft, Heart
} from 'lucide-react';

interface GuideSection {
  id: string;
  title: string;
  icon: React.ReactNode;
  content: React.ReactNode;
}

const UserGuide: React.FC = () => {
  const navigate = useNavigate();
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['getting-started']));

  const toggleSection = (id: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const sections: GuideSection[] = [
    {
      id: 'getting-started',
      title: 'Getting Started',
      icon: <Sparkles className="w-5 h-5" />,
      content: (
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-white mb-2">Welcome to Lore Book</h3>
            <p className="text-white/70 mb-4">
              Lore Book is your AI-powered journal that automatically organizes your life story into a comprehensive digital memoir. 
              Just write naturally—we handle the rest.
            </p>
          </div>
          
          <div className="bg-black/40 border border-border/60 rounded-lg p-4">
            <h4 className="text-base font-semibold text-white mb-2">Quick Start Steps</h4>
            <ol className="list-decimal list-inside space-y-2 text-white/70">
              <li>Start journaling in the <strong className="text-white">Chat</strong> section—just write naturally about your day</li>
              <li>Explore your <strong className="text-white">Omni Timeline</strong> to see your memories organized chronologically</li>
              <li>Check out <strong className="text-white">Characters</strong> and <strong className="text-white">Locations</strong> to see people and places automatically tracked</li>
              <li>Visit your <strong className="text-white">Lore Book</strong> to see your auto-generated biography</li>
            </ol>
          </div>

          <div className="bg-primary/10 border border-primary/30 rounded-lg p-4">
            <h4 className="text-base font-semibold text-primary mb-2 flex items-center gap-2">
              <Info className="w-4 h-4" />
              Pro Tip
            </h4>
            <p className="text-white/80">
              The more you journal, the better Lore Book understands your story. Your AI companion learns your writing style, 
              relationships, and life patterns to provide better insights and organization.
            </p>
          </div>
        </div>
      )
    },
    {
      id: 'chat',
      title: 'Chat - Your AI Companion',
      icon: <MessageSquareText className="w-5 h-5" />,
      content: (
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-white mb-2">Multi-Persona AI Chat</h3>
            <p className="text-white/70 mb-4">
              Chat with your AI companion that adapts to your needs. The system automatically switches between personas 
              based on what you're discussing.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-black/40 border border-border/60 rounded-lg p-4">
              <h4 className="text-base font-semibold text-white mb-2">Available Personas</h4>
              <ul className="space-y-2 text-sm text-white/70">
                <li><strong className="text-white">Gossip Buddy</strong> - For relationship talk</li>
                <li><strong className="text-white">Therapist</strong> - Emotional support</li>
                <li><strong className="text-white">Biography Writer</strong> - Story editing</li>
                <li><strong className="text-white">Soul Capturer</strong> - Identity tracking</li>
                <li><strong className="text-white">Strategist</strong> - Goal planning</li>
                <li><strong className="text-white">Memory Bank</strong> - Never forgets</li>
              </ul>
            </div>

            <div className="bg-black/40 border border-border/60 rounded-lg p-4">
              <h4 className="text-base font-semibold text-white mb-2">Slash Commands</h4>
              <ul className="space-y-2 text-sm text-white/70 font-mono">
                <li><code className="text-primary">/recent</code> - Show recent entries</li>
                <li><code className="text-primary">/characters</code> - List all characters</li>
                <li><code className="text-primary">/locations</code> - List all locations</li>
                <li><code className="text-primary">/arcs</code> - Show story arcs</li>
                <li><code className="text-primary">/soul</code> - View soul profile</li>
                <li><code className="text-primary">/search &lt;query&gt;</code> - Search memories</li>
                <li><code className="text-primary">/help</code> - Show all commands</li>
              </ul>
            </div>
          </div>

          <div className="bg-black/40 border border-border/60 rounded-lg p-4">
            <h4 className="text-base font-semibold text-white mb-2">Features</h4>
            <ul className="space-y-2 text-white/70">
              <li>✨ <strong className="text-white">Streaming Responses</strong> - Watch responses appear word-by-word</li>
              <li>📋 <strong className="text-white">Message Actions</strong> - Copy, regenerate, edit, or delete messages</li>
              <li>🔗 <strong className="text-white">Clickable Sources</strong> - Click citations to view entries/chapters</li>
              <li>🔍 <strong className="text-white">Search History</strong> - Search through your conversation history</li>
              <li>📥 <strong className="text-white">Export</strong> - Download conversations as Markdown or JSON</li>
            </ul>
          </div>
        </div>
      )
    },
    {
      id: 'timeline',
      title: 'Omni Timeline - Your Life Story',
      icon: <CalendarDays className="w-5 h-5" />,
      content: (
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-white mb-2">9-Layer Timeline Hierarchy</h3>
            <p className="text-white/70 mb-4">
              Your memories are automatically organized into a 9-layer hierarchy, from the grand narrative (Mythos) 
              down to the smallest moments (MicroActions).
            </p>
          </div>

          <div className="bg-black/40 border border-border/60 rounded-lg p-4">
            <h4 className="text-base font-semibold text-white mb-3 flex items-center gap-2">
              <Layers className="w-4 h-4 text-primary" />
              Timeline Layers
            </h4>
            <div className="grid md:grid-cols-3 gap-3 text-sm">
              <div>
                <p className="text-purple-400 font-semibold mb-1">1. Mythos</p>
                <p className="text-white/60 text-xs">Life-defining narrative (decades)</p>
              </div>
              <div>
                <p className="text-blue-400 font-semibold mb-1">2. Epoch</p>
                <p className="text-white/60 text-xs">Major life phases (years)</p>
              </div>
              <div>
                <p className="text-cyan-400 font-semibold mb-1">3. Era</p>
                <p className="text-white/60 text-xs">Significant periods (months-years)</p>
              </div>
              <div>
                <p className="text-pink-400 font-semibold mb-1">4. Saga</p>
                <p className="text-white/60 text-xs">Long narrative arcs (months-years)</p>
              </div>
              <div>
                <p className="text-orange-400 font-semibold mb-1">5. Arc</p>
                <p className="text-white/60 text-xs">Story arcs (weeks-months)</p>
              </div>
              <div>
                <p className="text-yellow-400 font-semibold mb-1">6. Chapter</p>
                <p className="text-white/60 text-xs">Discrete chapters (days-weeks)</p>
              </div>
              <div>
                <p className="text-green-400 font-semibold mb-1">7. Scene</p>
                <p className="text-white/60 text-xs">Specific events (hours-days)</p>
              </div>
              <div>
                <p className="text-emerald-400 font-semibold mb-1">8. Action</p>
                <p className="text-white/60 text-xs">Single actions (minutes-hours)</p>
              </div>
              <div>
                <p className="text-teal-400 font-semibold mb-1">9. MicroAction</p>
                <p className="text-white/60 text-xs">Smallest moments (seconds-minutes)</p>
              </div>
            </div>
          </div>

          <div className="bg-black/40 border border-border/60 rounded-lg p-4">
            <h4 className="text-base font-semibold text-white mb-2">View Modes</h4>
            <ul className="space-y-2 text-white/70">
              <li><strong className="text-white">Vertical</strong> - Default timeline view with most recent at top</li>
              <li><strong className="text-white">Chronology</strong> - Interactive horizontal timeline with zoom/pan</li>
              <li><strong className="text-white">Hierarchy</strong> - Nested tree view showing parent-child relationships</li>
              <li><strong className="text-white">Graph</strong> - Visual relationship graph between timelines</li>
              <li><strong className="text-white">List</strong> - Sortable list view of all memories</li>
            </ul>
          </div>

          <div className="bg-black/40 border border-border/60 rounded-lg p-4">
            <h4 className="text-base font-semibold text-white mb-2">Search & Filter</h4>
            <ul className="space-y-2 text-white/70">
              <li>🔍 <strong className="text-white">Search Timelines</strong> - Find specific timelines by name or description</li>
              <li>🏷️ <strong className="text-white">Filter by Layer</strong> - Filter by Mythos, Era, Saga, Arc, Chapter, etc.</li>
              <li>⭐ <strong className="text-white">Recommended Timelines</strong> - See ongoing or recently active timelines</li>
              <li>📅 <strong className="text-white">Date Range</strong> - Filter memories by time period</li>
            </ul>
          </div>
        </div>
      )
    },
    {
      id: 'characters-locations',
      title: 'Characters & Locations',
      icon: <Users className="w-5 h-5" />,
      content: (
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-white mb-2">Automatic Entity Tracking</h3>
            <p className="text-white/70 mb-4">
              Lore Book automatically detects and tracks people and places mentioned in your journal entries. 
              No manual tagging required!
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-black/40 border border-border/60 rounded-lg p-4">
              <h4 className="text-base font-semibold text-white mb-2 flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" />
                Characters
              </h4>
              <ul className="space-y-2 text-sm text-white/70">
                <li>• Automatically detected from entries</li>
                <li>• Relationship tracking</li>
                <li>• Timeline integration</li>
                <li>• Character profiles with stories</li>
                <li>• AI-generated insights</li>
              </ul>
            </div>

            <div className="bg-black/40 border border-border/60 rounded-lg p-4">
              <h4 className="text-base font-semibold text-white mb-2 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-primary" />
                Locations
              </h4>
              <ul className="space-y-2 text-sm text-white/70">
                <li>• Place detection from entries</li>
                <li>• Location-based memories</li>
                <li>• Geographic context</li>
                <li>• Location book organization</li>
              </ul>
            </div>
          </div>

          <div className="bg-primary/10 border border-primary/30 rounded-lg p-4">
            <h4 className="text-base font-semibold text-primary mb-2">Entity Modal</h4>
            <p className="text-white/80 text-sm">
              Click any character, location, or memory throughout the app to open a unified modal where you can:
            </p>
            <ul className="mt-2 space-y-1 text-sm text-white/70 list-disc list-inside">
              <li>Chat about the entity</li>
              <li>View key details and connections</li>
              <li>Update information</li>
              <li>See related memories and timelines</li>
            </ul>
          </div>
        </div>
      )
    },
    {
      id: 'love-relationships',
      title: 'Love & Relationships',
      icon: <Heart className="w-5 h-5" />,
      content: (
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-white mb-2">Automatic Relationship Tracking</h3>
            <p className="text-white/70 mb-4">
              Lore Book automatically detects and tracks your romantic relationships, crushes, and situationships 
              from your conversations. No manual forms—just chat naturally and we'll organize everything for you.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-black/40 border border-border/60 rounded-lg p-4">
              <h4 className="text-base font-semibold text-white mb-2 flex items-center gap-2">
                <Heart className="w-4 h-4 text-pink-400" />
                Relationship Types
              </h4>
              <ul className="space-y-2 text-sm text-white/70">
                <li>• Active relationships (boyfriend, girlfriend, etc.)</li>
                <li>• Past relationships (ex-partners)</li>
                <li>• Situationships</li>
                <li>• Crushes and infatuations</li>
                <li>• All tracked automatically from chat</li>
              </ul>
            </div>

            <div className="bg-black/40 border border-border/60 rounded-lg p-4">
              <h4 className="text-base font-semibold text-white mb-2 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-pink-400" />
                Key Features
              </h4>
              <ul className="space-y-2 text-sm text-white/70">
                <li>• Relationship rankings and comparisons</li>
                <li>• Pros, cons, red flags, green flags</li>
                <li>• Timeline of dates and milestones</li>
                <li>• Analytics and insights</li>
                <li>• Chat-based editing (no forms!)</li>
              </ul>
            </div>
          </div>

          <div className="bg-pink-950/20 border border-pink-500/30 rounded-lg p-4">
            <h4 className="text-base font-semibold text-pink-300 mb-2">How It Works</h4>
            <ol className="list-decimal list-inside space-y-2 text-sm text-white/70">
              <li><strong className="text-white">Just Chat</strong> - Mention relationships naturally in conversation</li>
              <li><strong className="text-white">Auto-Detection</strong> - AI identifies romantic relationships automatically</li>
              <li><strong className="text-white">View & Explore</strong> - Check the Love & Relationships section to see all tracked relationships</li>
              <li><strong className="text-white">Get Insights</strong> - See rankings, analytics, and recommendations</li>
              <li><strong className="text-white">Edit via Chat</strong> - Update relationship details by chatting about them</li>
            </ol>
          </div>

          <div className="bg-black/40 border border-border/60 rounded-lg p-4">
            <h4 className="text-base font-semibold text-white mb-2">Relationship Rankings</h4>
            <p className="text-white/70 text-sm mb-3">
              Compare your relationships across different metrics:
            </p>
            <ul className="space-y-2 text-sm text-white/70">
              <li>🏆 <strong className="text-white">Overall</strong> - Ranked by overall compatibility and health</li>
              <li>💚 <strong className="text-white">Active</strong> - Rankings among current relationships</li>
              <li>📊 <strong className="text-white">Compatibility</strong> - Sorted by compatibility score</li>
              <li>⚡ <strong className="text-white">Intensity</strong> - Ranked by emotional intensity</li>
              <li>❤️ <strong className="text-white">Health</strong> - Sorted by relationship health score</li>
            </ul>
          </div>

          <div className="bg-primary/10 border border-primary/30 rounded-lg p-4">
            <h4 className="text-base font-semibold text-primary mb-2 flex items-center gap-2">
              <Info className="w-4 h-4" />
              Pro Tip
            </h4>
            <p className="text-white/80 text-sm">
              Click on any relationship to see detailed analytics, timeline of dates, pros and cons, and chat 
              directly about that relationship. All updates happen through conversation—no manual forms required!
            </p>
          </div>
        </div>
      )
    },
    {
      id: 'lorebook',
      title: 'Lore Book - Your Biography',
      icon: <BookMarked className="w-5 h-5" />,
      content: (
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-white mb-2">Auto-Generated Biography</h3>
            <p className="text-white/70 mb-4">
              Your Lore Book is automatically generated from your journal entries. It organizes your life story 
              into a readable, book-like format that you can refine and edit.
            </p>
          </div>

          <div className="bg-black/40 border border-border/60 rounded-lg p-4">
            <h4 className="text-base font-semibold text-white mb-2">Features</h4>
            <ul className="space-y-2 text-white/70">
              <li>📖 <strong className="text-white">Automatic Generation</strong> - Built from your journal entries</li>
              <li>✏️ <strong className="text-white">Editable</strong> - Refine and customize your story</li>
              <li>📚 <strong className="text-white">Book-Like Reading</strong> - Clean, readable interface</li>
              <li>🔍 <strong className="text-white">Navigation</strong> - Easy section browsing</li>
              <li>🎨 <strong className="text-white">Customization</strong> - Adjust font size and spacing</li>
            </ul>
          </div>
        </div>
      )
    },
    {
      id: 'memory-explorer',
      title: 'Memory Explorer',
      icon: <Search className="w-5 h-5" />,
      content: (
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-white mb-2">Semantic Search</h3>
            <p className="text-white/70 mb-4">
              Search through all your memories using natural language. The system understands context, relationships, 
              and meaning—not just keywords.
            </p>
          </div>

          <div className="bg-black/40 border border-border/60 rounded-lg p-4">
            <h4 className="text-base font-semibold text-white mb-2">Smart Query Parsing</h4>
            <p className="text-white/70 mb-2">Try queries like:</p>
            <ul className="space-y-1 text-sm text-white/60 font-mono list-disc list-inside ml-4">
              <li>"entries about Sarah last month"</li>
              <li>"memories at the coffee shop"</li>
              <li>"when did I start learning guitar"</li>
              <li>"memories with happy mood"</li>
            </ul>
          </div>

          <div className="bg-black/40 border border-border/60 rounded-lg p-4">
            <h4 className="text-base font-semibold text-white mb-2">Automatic Filter Detection</h4>
            <ul className="space-y-2 text-white/70">
              <li>📅 <strong className="text-white">Dates</strong> - Automatically detects time references</li>
              <li>👤 <strong className="text-white">Characters</strong> - Finds entries mentioning people</li>
              <li>📍 <strong className="text-white">Locations</strong> - Searches by place</li>
              <li>🏷️ <strong className="text-white">Tags</strong> - Filters by tags and motifs</li>
              <li>😊 <strong className="text-white">Emotions</strong> - Searches by mood</li>
            </ul>
          </div>
        </div>
      )
    },
    {
      id: 'discovery',
      title: 'Discovery Hub',
      icon: <Compass className="w-5 h-5" />,
      content: (
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-white mb-2">Analytical Insights</h3>
            <p className="text-white/70 mb-4">
              Discover patterns, insights, and connections in your life story through 8 analytical panels.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-black/40 border border-border/60 rounded-lg p-4">
              <h4 className="text-base font-semibold text-white mb-2">Panels</h4>
              <ul className="space-y-2 text-sm text-white/70">
                <li>🔍 <strong className="text-white">Identity</strong> - Core identity elements</li>
                <li>👥 <strong className="text-white">Characters</strong> - Relationship insights</li>
                <li>📖 <strong className="text-white">Saga</strong> - Story arc analysis</li>
                <li>🕸️ <strong className="text-white">Fabric</strong> - Memory connections</li>
                <li>💡 <strong className="text-white">Insights</strong> - Pattern detection</li>
                <li>🤖 <strong className="text-white">Autopilot</strong> - Strategic guidance</li>
                <li>✨ <strong className="text-white">Soul Profile</strong> - Essence tracking</li>
                <li>✅ <strong className="text-white">Truth</strong> - Fact checking</li>
              </ul>
            </div>

            <div className="bg-primary/10 border border-primary/30 rounded-lg p-4">
              <h4 className="text-base font-semibold text-primary mb-2">Soul Profile</h4>
              <p className="text-white/80 text-sm mb-2">
                Automatically tracks your:
              </p>
              <ul className="space-y-1 text-sm text-white/70 list-disc list-inside">
                <li>Hopes & Dreams</li>
                <li>Fears & Concerns</li>
                <li>Strengths & Weaknesses</li>
                <li>Skills & Talents</li>
                <li>Values & Beliefs</li>
                <li>Relationship Patterns</li>
              </ul>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'tips',
      title: 'Tips & Best Practices',
      icon: <HelpCircle className="w-5 h-5" />,
      content: (
        <div className="space-y-4">
          <div className="bg-black/40 border border-border/60 rounded-lg p-4">
            <h4 className="text-base font-semibold text-white mb-3">Writing Tips</h4>
            <ul className="space-y-3 text-white/70">
              <li>
                <strong className="text-white">Write Naturally</strong> - Don't worry about structure or organization. 
                Just write as you would in a traditional journal. Lore Book handles the rest.
              </li>
              <li>
                <strong className="text-white">Include Details</strong> - The more context you provide (who, what, where, when, why), 
                the better the system can organize and connect your memories.
              </li>
              <li>
                <strong className="text-white">Be Consistent</strong> - Regular journaling helps build a richer, more connected story.
              </li>
              <li>
                <strong className="text-white">Use Natural Language</strong> - Write conversationally. The AI understands context 
                and can extract meaning from casual writing.
              </li>
            </ul>
          </div>

          <div className="bg-primary/10 border border-primary/30 rounded-lg p-4">
            <h4 className="text-base font-semibold text-primary mb-3">Keyboard Shortcuts</h4>
            <ul className="space-y-2 text-sm text-white/80">
              <li><kbd className="px-2 py-1 bg-black/40 rounded text-xs">/</kbd> - Open slash commands in chat</li>
              <li><kbd className="px-2 py-1 bg-black/40 rounded text-xs">Esc</kbd> - Close modals</li>
              <li><kbd className="px-2 py-1 bg-black/40 rounded text-xs">Ctrl/Cmd + K</kbd> - Quick search (where available)</li>
            </ul>
          </div>

          <div className="bg-black/40 border border-border/60 rounded-lg p-4">
            <h4 className="text-base font-semibold text-white mb-3">Getting the Most Out of Lore Book</h4>
            <ul className="space-y-2 text-white/70">
              <li>💬 <strong className="text-white">Chat Regularly</strong> - The more you interact, the better the AI understands you</li>
              <li>📝 <strong className="text-white">Journal Daily</strong> - Build a comprehensive memory bank</li>
              <li>🔍 <strong className="text-white">Explore Your Timeline</strong> - Discover patterns and connections</li>
              <li>📚 <strong className="text-white">Review Your Lore Book</strong> - See how your story is being told</li>
              <li>🎯 <strong className="text-white">Use Discovery Hub</strong> - Gain insights about yourself</li>
            </ul>
          </div>
        </div>
      )
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-purple-950 to-black p-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <button
            onClick={() => navigate('/chat')}
            className="flex items-center gap-2 text-white/70 hover:text-white transition-colors mb-4 group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            <span className="text-sm">Back to App</span>
          </button>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 bg-primary/20 rounded-lg">
              <BookOpen className="w-8 h-8 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">User Guide</h1>
              <p className="text-white/60 mt-1">Everything you need to know about Lore Book</p>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          {sections.map((section) => {
            const isExpanded = expandedSections.has(section.id);
            return (
              <div
                key={section.id}
                className="bg-black/40 border border-border/60 rounded-lg overflow-hidden backdrop-blur-sm"
              >
                <button
                  onClick={() => toggleSection(section.id)}
                  className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="text-primary">{section.icon}</div>
                    <h2 className="text-lg font-semibold text-white">{section.title}</h2>
                  </div>
                  {isExpanded ? (
                    <ChevronDown className="w-5 h-5 text-white/60" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-white/60" />
                  )}
                </button>
                {isExpanded && (
                  <div className="p-6 border-t border-border/60 bg-black/20">
                    {section.content}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-8 p-6 bg-primary/10 border border-primary/30 rounded-lg">
          <h3 className="text-lg font-semibold text-primary mb-2">Need More Help?</h3>
          <p className="text-white/80 text-sm">
            If you have questions or need assistance, you can always ask your AI companion in the Chat section. 
            It's designed to help you navigate and make the most of Lore Book.
          </p>
        </div>
      </div>
    </div>
  );
};

export default UserGuide;
