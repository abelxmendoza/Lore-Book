// © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.

import { LandingHeader } from '../components/landing/LandingHeader';
import { LandingFooter } from '../components/landing/LandingFooter';
import { FeatureCard } from '../components/landing/FeatureCard';
import { CTASection } from '../components/landing/CTASection';
import {
  Brain,
  BookOpen,
  Shield,
  Sparkles,
  Users,
  TrendingUp,
  Search,
  Heart,
  Target,
  Database,
  Lock,
  Zap,
  GitBranch,
  FileText,
  Calendar,
  MapPin,
} from 'lucide-react';

export default function Features() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-purple-950 to-black">
      <LandingHeader />
      
      <main className="pt-20">
        {/* Hero */}
        <section className="py-12 sm:py-16 px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto text-center">
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-4 sm:mb-6 px-2 sm:px-0">
              Powerful Features for Your <span className="text-primary">Life Story</span>
            </h1>
            <p className="text-base sm:text-lg md:text-xl text-white/70 px-4 sm:px-0">
              Everything you need to capture, organize, and understand your complete life narrative.
            </p>
          </div>
        </section>

        {/* Core Features */}
        <section className="py-8 sm:py-12 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-6 sm:mb-8 text-center px-2 sm:px-0">Core Capabilities</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FeatureCard
                icon={Brain}
                title="Continuity Intelligence"
                highlight="The Jarvis of your life"
                description="Automatically detects contradictions, emotional changes, identity drift, abandoned goals, and repeating loops. Runs after every journal entry to maintain narrative coherence."
              />
              <FeatureCard
                icon={BookOpen}
                title="Automatic Biography Generation"
                highlight="Your biography writes itself"
                description="Transform journal entries into polished, comprehensive biographies automatically. Multi-version generation with PDF export, chapter navigation, and AI-powered recommendations."
              />
              <FeatureCard
                icon={Sparkles}
                title="9-Layer Timeline Hierarchy"
                highlight="Automatic organization"
                description="Your timeline builds itself: Mythos → Eras → Sagas → Arcs → Chapters → Scenes → Actions → MicroActions. Visual timeline with emotion heatmaps and highlights."
              />
              <FeatureCard
                icon={Search}
                title="Semantic Memory Search"
                highlight="Never forget anything"
                description="AI-powered semantic search with HQI integration. Find memories by meaning, not just keywords. Memory cards with linked memories and advanced filters."
              />
            </div>
          </div>
        </section>

        {/* AI Companions */}
        <section className="py-8 sm:py-12 px-4 sm:px-6 lg:px-8 bg-black/20">
          <div className="max-w-7xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4 sm:mb-6 md:mb-8 text-center px-2 sm:px-0">AI Companions</h2>
            <p className="text-center text-sm sm:text-base text-white/70 mb-6 sm:mb-8 max-w-2xl mx-auto px-4 sm:px-0">
              Your AI adapts to be exactly what you need—multiple personas for different conversations.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <FeatureCard
                icon={Users}
                title="Gossip Buddy"
                description="Curious, engaging, relationship-focused. Discusses characters, relationships, and social dynamics with enthusiasm and curiosity."
              />
              <FeatureCard
                icon={Heart}
                title="Therapist"
                description="Deep, reflective, supportive. Validates emotions, helps process experiences, asks gentle exploratory questions."
              />
              <FeatureCard
                icon={BookOpen}
                title="Historian"
                description="Preserves your complete story, organizes your timeline, and maintains truth and continuity across your entire narrative."
              />
              <FeatureCard
                icon={Target}
                title="Strategist"
                description="Goal-oriented, actionable. Provides strategic guidance, helps with planning, offers actionable insights based on your patterns."
              />
              <FeatureCard
                icon={Database}
                title="Memory Bank"
                description="Remembers everything. Your complete digital memory that never forgets and can answer questions about your past, present, and patterns."
              />
            </div>
          </div>
        </section>

        {/* Advanced Features */}
        <section className="py-8 sm:py-12 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-6 sm:mb-8 text-center px-2 sm:px-0">Advanced Features</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <FeatureCard
                icon={Users}
                title="Character System"
                description="Relationship tracking, knowledge base, auto-generated avatars, relationship graphs, and character modals. Automatically tracks romantic relationships, crushes, and situationships."
              />
              <FeatureCard
                icon={MapPin}
                title="Location Tracking"
                description="Location profiles, visit timelines, and location modals. Track where your story unfolds."
              />
              <FeatureCard
                icon={FileText}
                title="Intelligent Lorebooks"
                description="Natural language query parser. Generate lorebooks based on timeline, characters, locations, events, skills, and themes. Smart recommendations engine."
              />
              <FeatureCard
                icon={Calendar}
                title="Event Tracking"
                description="Automatically extract and organize events from your entries. Build a comprehensive event timeline."
              />
              <FeatureCard
                icon={GitBranch}
                title="Relationship Dynamics"
                description="Track relationship evolution, sentiment shifts, attachment patterns, and relationship analytics with pros/cons, red flags, and green flags."
              />
              <FeatureCard
                icon={Zap}
                title="Grok-Style Transitions"
                description="Advanced conversation flow tracking. Detects tangents, emotional transitions, thought process changes, and intent evolution. The AI naturally follows where your mind wants to go."
              />
            </div>
          </div>
        </section>

        {/* Security & Privacy */}
        <section className="py-8 sm:py-12 px-4 sm:px-6 lg:px-8 bg-black/20">
          <div className="max-w-7xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-6 sm:mb-8 text-center px-2 sm:px-0">Security & Privacy</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FeatureCard
                icon={Shield}
                title="Enterprise-Grade Security"
                description="CSRF protection, rate limiting, secure headers, XSS protection, data encryption (AES-256-GCM), and comprehensive security testing with 100% coverage."
              />
              <FeatureCard
                icon={Lock}
                title="Privacy First"
                description="GDPR compliant, encrypted by default. Your data is never sold, never shared with advertisers, and accessible only to you. Complete privacy controls and data ownership."
              />
            </div>
          </div>
        </section>

        {/* Performance */}
        <section className="py-8 sm:py-12 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-6 sm:mb-8 text-center px-2 sm:px-0">Performance & Technology</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FeatureCard
                icon={TrendingUp}
                title="Cost Optimized"
                description="Rule-based extraction, aggressive caching, and efficient algorithms ensure fast, free operations. 10-100x faster than traditional approaches."
              />
              <FeatureCard
                icon={Zap}
                title="Compiler-Inspired Architecture"
                description="LoreKeeper Narrative Compiler (LNC) for epistemic safety. Incremental compilation, symbol resolution, and deterministic entity resolution."
              />
            </div>
          </div>
        </section>

        {/* CTA */}
        <CTASection
          title="Ready to Experience These Features?"
          description="Start your free account and see how LoreBook transforms your journal entries into a complete life story."
          primaryAction={{
            label: 'Get Started Free',
            path: '/login',
          }}
          secondaryAction={{
            label: 'Back to Home',
            path: '/home',
          }}
        />
      </main>

      <LandingFooter />
    </div>
  );
}
