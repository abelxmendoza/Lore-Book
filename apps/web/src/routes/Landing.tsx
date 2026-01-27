// © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.

import { LandingHeader } from '../components/landing/LandingHeader';
import { LandingFooter } from '../components/landing/LandingFooter';
import { HeroSection } from '../components/landing/HeroSection';
import { FeatureCard } from '../components/landing/FeatureCard';
import { CTASection } from '../components/landing/CTASection';
import {
  Brain,
  BookOpen,
  Shield,
  Sparkles,
  Users,
  TrendingUp,
  Zap,
  Database,
  Lock,
  Layers,
} from 'lucide-react';

export default function Landing() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-purple-950 to-black">
      <LandingHeader />
      
      <main>
        <HeroSection />

        {/* Key Features Preview */}
        <section className="py-12 sm:py-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-8 sm:mb-12">
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-3 sm:mb-4 px-2 sm:px-0">
                Your Life Story, <span className="text-primary">Automatically</span>
              </h2>
              <p className="text-base sm:text-lg md:text-xl text-white/70 max-w-2xl mx-auto px-4 sm:px-0">
                Just journal naturally. LoreBook transforms your entries into a complete, organized life story.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <FeatureCard
                icon={Brain}
                title="Continuity Intelligence"
                highlight="The Jarvis of your life"
                description="Automatically detects contradictions, emotional changes, identity drift, and repeating patterns. Your life's continuity engine runs after every entry."
              />
              <FeatureCard
                icon={BookOpen}
                title="Automatic Biography"
                highlight="Your biography writes itself"
                description="Transform journal entries into polished biographies automatically. No writing skills required—just chat and your story compiles."
              />
              <FeatureCard
                icon={Sparkles}
                title="9-Layer Timeline"
                highlight="Automatic organization"
                description="Your timeline builds itself with a hierarchical structure: Mythos → Eras → Sagas → Arcs → Chapters → Scenes → Actions."
              />
              <FeatureCard
                icon={Users}
                title="AI Companions"
                highlight="Multiple personas"
                description="Gossip Buddy, Therapist, Historian, Strategist, and Memory Bank. Your AI adapts to be exactly what you need."
              />
              <FeatureCard
                icon={Shield}
                title="Privacy First"
                highlight="Enterprise security"
                description="GDPR compliant, encrypted by default. Your data is never sold, never shared, and accessible only to you."
              />
              <FeatureCard
                icon={TrendingUp}
                title="Cost Optimized"
                highlight="Free operations"
                description="Rule-based extraction, aggressive caching, and efficient algorithms ensure fast, cost-effective operations."
              />
            </div>
          </div>
        </section>

        {/* Social Proof Section */}
        <section className="py-12 sm:py-16 px-4 sm:px-6 lg:px-8 bg-black/20">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-6 sm:mb-8 px-2 sm:px-0">
              Trusted by People Who Value Their Story
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
              <div className="rounded-lg border border-border/60 bg-black/40 p-6">
                <p className="text-white/80 mb-4 italic">
                  "Finally, a journal that actually understands my life story."
                </p>
                <p className="text-sm text-white/60">— Early User</p>
              </div>
              <div className="rounded-lg border border-border/60 bg-black/40 p-6">
                <p className="text-white/80 mb-4 italic">
                  "The continuity engine caught patterns I never noticed. It's like having a life coach that never forgets."
                </p>
                <p className="text-sm text-white/60">— Beta Tester</p>
              </div>
              <div className="rounded-lg border border-border/60 bg-black/40 p-6">
                <p className="text-white/80 mb-4 italic">
                  "My biography wrote itself. This is the future of personal memory systems."
                </p>
                <p className="text-sm text-white/60">— Writer & Creator</p>
              </div>
            </div>
          </div>
        </section>

        {/* How We're Different Section */}
        <section className="py-12 sm:py-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-4">
                Not Just Another <span className="text-primary">Chatbot</span>
              </h2>
              <p className="text-lg text-white/70 max-w-3xl mx-auto">
                LoreBook is a structured system for long-term personal evolution, not ad-hoc conversations
              </p>
            </div>

            <div className="space-y-6">
              <div className="rounded-lg border border-border/60 bg-black/40 p-6 sm:p-8">
                <div className="flex items-start gap-4">
                  <div className="rounded-lg bg-purple-500/20 p-3">
                    <Database className="h-6 w-6 text-purple-400" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-semibold text-white mb-2">
                      1. Specialization vs. Generality
                    </h3>
                    <p className="text-white/80 mb-3">
                      <strong className="text-primary">ChatGPT/Grok:</strong> One-off queries, conversations reset, no persistent personal database
                    </p>
                    <p className="text-white/80 mb-3">
                      <strong className="text-primary">LoreBook:</strong> Continuity intelligence that auto-tracks arcs over years, generates timelines/biographies without manual prompting
                    </p>
                    <p className="text-sm text-white/60 italic">
                      Analogy: Personal CRM for your life vs. blank-slate bot
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-border/60 bg-black/40 p-6 sm:p-8">
                <div className="flex items-start gap-4">
                  <div className="rounded-lg bg-pink-500/20 p-3">
                    <Brain className="h-6 w-6 text-pink-400" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-semibold text-white mb-2">
                      2. Depth in Personal Analytics
                    </h3>
                    <p className="text-white/80 mb-3">
                      <strong className="text-primary">ChatGPT/Grok:</strong> You'd need to paste journals manually for analysis
                    </p>
                    <p className="text-white/80 mb-3">
                      <strong className="text-primary">LoreBook:</strong> 20+ engines (Toxicity Detection, Belief Challenger, Continuity Engine) are purpose-built and proactive
                    </p>
                    <p className="text-sm text-white/60 italic">
                      Analogy: Therapist/coach hybrid vs. reactive Q&A tool
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-border/60 bg-black/40 p-6 sm:p-8">
                <div className="flex items-start gap-4">
                  <div className="rounded-lg bg-cyan-500/20 p-3">
                    <Lock className="h-6 w-6 text-cyan-400" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-semibold text-white mb-2">
                      3. Privacy and Ownership
                    </h3>
                    <p className="text-white/80 mb-3">
                      <strong className="text-primary">ChatGPT/Grok:</strong> Data stored on corporate servers
                    </p>
                    <p className="text-white/80 mb-3">
                      <strong className="text-primary">LoreBook:</strong> E2E encryption, GDPR exports, user-owned data
                    </p>
                    <p className="text-sm text-white/60 italic">
                      Analogy: Your "digital self" vs. corporate data
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-border/60 bg-black/40 p-6 sm:p-8">
                <div className="flex items-start gap-4">
                  <div className="rounded-lg bg-green-500/20 p-3">
                    <Layers className="h-6 w-6 text-green-400" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-semibold text-white mb-2">
                      4. Structured Output
                    </h3>
                    <p className="text-white/80 mb-3">
                      <strong className="text-primary">ChatGPT/Grok:</strong> Unstructured conversations
                    </p>
                    <p className="text-white/80 mb-3">
                      <strong className="text-primary">LoreBook:</strong> 9-layer hierarchy (Mythos → MicroActions), structured for future AI systems
                    </p>
                    <p className="text-sm text-white/60 italic">
                      Analogy: Organized library vs. random notes
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-border/60 bg-black/40 p-6 sm:p-8">
                <div className="flex items-start gap-4">
                  <div className="rounded-lg bg-yellow-500/20 p-3">
                    <Zap className="h-6 w-6 text-yellow-400" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-semibold text-white mb-2">
                      5. Proactive Intelligence
                    </h3>
                    <p className="text-white/80 mb-3">
                      <strong className="text-primary">ChatGPT/Grok:</strong> You ask, it answers
                    </p>
                    <p className="text-white/80 mb-3">
                      <strong className="text-primary">LoreBook:</strong> Continuity Engine automatically detects contradictions, identity drift, abandoned goals, repeating loops
                    </p>
                    <p className="text-sm text-white/60 italic">
                      Analogy: Active life coach vs. passive assistant
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-12 rounded-xl border border-primary/30 bg-gradient-to-br from-purple-950/50 to-black/60 p-6 sm:p-8 max-w-4xl mx-auto text-center">
              <h3 className="text-2xl font-bold text-white mb-4">
                Positioning: "The Notion for Your Soul"
              </h3>
              <p className="text-white/80 mb-6">
                Don't position as "another chatbot." Position as structured, evolving, personal—your life's Jarvis with proactive continuity intelligence.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div className="rounded-lg bg-black/40 p-4">
                  <p className="font-semibold text-primary mb-1">Writers</p>
                  <p className="text-white/70">Character development, memoir generation</p>
                </div>
                <div className="rounded-lg bg-black/40 p-4">
                  <p className="font-semibold text-primary mb-1">Professionals</p>
                  <p className="text-white/70">Goal tracking, career journey</p>
                </div>
                <div className="rounded-lg bg-black/40 p-4">
                  <p className="font-semibold text-primary mb-1">Families</p>
                  <p className="text-white/70">Legacy building, shared memories</p>
                </div>
                <div className="rounded-lg bg-black/40 p-4">
                  <p className="font-semibold text-primary mb-1">Self-Improvers</p>
                  <p className="text-white/70">Pattern recognition, growth tracking</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <CTASection
          title="Ready to Start Your Story?"
          description="Join LoreBook and let your biography write itself. Start free, then $15/month for full AI features."
          primaryAction={{
            label: 'Get Started Free',
            path: '/login',
          }}
          secondaryAction={{
            label: 'Learn More',
            path: '/features',
          }}
        />

        {/* Team / Founder */}
        <section className="py-12 sm:py-16 px-4 sm:px-6 lg:px-8 bg-black/20">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-6 sm:mb-8 text-center px-2 sm:px-0">Team</h2>
            <div className="rounded-xl border border-border/60 bg-black/40 backdrop-blur-sm p-4 sm:p-6 md:p-8">
              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 sm:gap-6">
                <img
                  src="/branding/mePro.JPG"
                  alt="Abel Mendoza, Founder"
                  className="w-24 h-24 sm:w-28 sm:h-28 rounded-full object-cover flex-shrink-0 border-2 border-white/10"
                />
                <div className="flex-1 text-center sm:text-left">
                  <h3 className="text-xl sm:text-2xl font-semibold text-white mb-2">Abel Mendoza</h3>
                  <p className="text-sm sm:text-base text-white/70 leading-relaxed">
                    Founder & Lead Developer. Crafting AI-first storytelling infrastructure with care for privacy and agency.
                    Building LoreBook as a lifelong digital companion that understands complete life stories.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

      </main>

      <LandingFooter />
    </div>
  );
}
