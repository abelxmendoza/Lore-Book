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
  ArrowRight,
} from 'lucide-react';
import { Link } from 'react-router-dom';

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

        {/* CTA Section */}
        <CTASection
          title="Ready to Start Your Story?"
          description="Join LoreBook and let your biography write itself. Free to start, no credit card required."
          primaryAction={{
            label: 'Get Started Free',
            path: '/login',
          }}
          secondaryAction={{
            label: 'Learn More',
            path: '/features',
          }}
        />

        {/* Investor CTA */}
        <section className="py-8 sm:py-12 px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto text-center">
            <div className="rounded-lg border border-cyan-500/30 bg-cyan-950/20 p-4 sm:p-6">
              <p className="text-sm sm:text-base text-white/80 mb-3 sm:mb-4 px-2 sm:px-0">
                <strong className="text-cyan-400">Investors:</strong> Building the future of personal memory systems and digital immortality.
              </p>
              <Link
                to="/investors"
                className="text-cyan-400 hover:text-cyan-300 font-medium inline-flex items-center text-sm sm:text-base"
              >
                Learn more about investing
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <LandingFooter />
    </div>
  );
}
