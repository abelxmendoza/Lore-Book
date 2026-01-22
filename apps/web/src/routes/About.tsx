// © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.

import { LandingHeader } from '../components/landing/LandingHeader';
import { LandingFooter } from '../components/landing/LandingFooter';
import { FeatureCard } from '../components/landing/FeatureCard';
import { CTASection } from '../components/landing/CTASection';
import { Logo } from '../components/Logo';
import {
  Target,
  Shield,
  Heart,
  Code,
  Users,
  Sparkles,
} from 'lucide-react';

export default function About() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-purple-950 to-black">
      <LandingHeader />
      
      <main className="pt-20">
        {/* Hero */}
        <section className="py-12 sm:py-16 px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto text-center">
            <div className="flex justify-center mb-6 sm:mb-8">
              <Logo size="lg" showText={true} />
            </div>
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-4 sm:mb-6 px-2 sm:px-0">
              About <span className="text-primary">Omega Technologies</span>
            </h1>
            <p className="text-base sm:text-lg md:text-xl text-white/70 px-4 sm:px-0">
              Building resilient memory systems that help people preserve, understand, and act on their lived experiences.
            </p>
          </div>
        </section>

        {/* Mission */}
        <section className="py-8 sm:py-12 px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <div className="rounded-xl sm:rounded-2xl border border-border/60 bg-black/40 backdrop-blur-sm p-4 sm:p-6 md:p-8 lg:p-12">
              <div className="flex flex-col sm:flex-row items-start space-y-3 sm:space-y-0 sm:space-x-4 mb-4 sm:mb-6">
                <Target className="h-6 w-6 sm:h-8 sm:w-8 text-primary flex-shrink-0 mt-1 mx-auto sm:mx-0" />
                <div className="flex-1 text-center sm:text-left">
                  <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3 sm:mb-4">Mission</h2>
                  <p className="text-sm sm:text-base md:text-lg text-white/80 leading-relaxed mb-3 sm:mb-4">
                    We build resilient memory systems that help people preserve, understand, and act on their lived experiences.
                    LoreBook is the Memory OS that remembers for you.
                  </p>
                  <p className="text-sm sm:text-base md:text-lg text-white/80 leading-relaxed">
                    Our purpose is to give people self-awareness, continuity, identity clarity, and a long-term companion
                    that understands the story they're living. We're not just building a journaling app—we're building
                    the infrastructure for digital immortality and personal AI systems.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Core Values */}
        <section className="py-8 sm:py-12 px-4 sm:px-6 lg:px-8 bg-black/20">
          <div className="max-w-7xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-6 sm:mb-8 text-center px-2 sm:px-0">Our Core Values</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FeatureCard
                icon={Shield}
                title="Privacy First"
                description="Your LoreBook is completely private by default. Everything you share—journal entries, memories, conversations, characters, and timeline—is encrypted and accessible only to you. We never sell your data, never share it with advertisers, and never allow other users to see your content unless you explicitly choose to publish it. Your trust is our foundation."
              />
              <FeatureCard
                icon={Heart}
                title="Human-Centered Design"
                description="We honor human stories by combining encryption options, strict data boundaries, and transparent AI disclaimers. Every feature is designed with the user's agency and privacy in mind."
              />
              <FeatureCard
                icon={Code}
                title="Technical Excellence"
                description="We build with compiler-inspired architecture, enterprise-grade security, and cost-optimized operations. Our code is production-ready from day one, with comprehensive testing and CI/CD pipelines."
              />
              <FeatureCard
                icon={Sparkles}
                title="Innovation"
                description="We're pioneering the future of personal memory systems. From the LoreKeeper Narrative Compiler to automatic biography generation, we're building technology that doesn't exist elsewhere."
              />
            </div>
          </div>
        </section>

        {/* Team */}
        <section className="py-8 sm:py-12 px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-6 sm:mb-8 text-center px-2 sm:px-0">Team</h2>
            <div className="rounded-xl sm:rounded-2xl border border-border/60 bg-black/40 backdrop-blur-sm p-4 sm:p-6 md:p-8">
              <div className="flex flex-col sm:flex-row items-start space-y-4 sm:space-y-0 sm:space-x-6">
                <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center flex-shrink-0 mx-auto sm:mx-0">
                  <Users className="h-10 w-10 sm:h-12 sm:w-12 text-white" />
                </div>
                <div className="flex-1 text-center sm:text-left">
                  <h3 className="text-xl sm:text-2xl font-semibold text-white mb-2 sm:mb-3">Abel Mendoza</h3>
                  <p className="text-sm sm:text-base text-white/70 mb-3 sm:mb-4 leading-relaxed">
                    Founder & Lead Developer. Crafting AI-first storytelling infrastructure with care for privacy and agency.
                    Building LoreBook as a lifelong digital companion that understands complete life stories.
                  </p>
                  <p className="text-sm sm:text-base text-white/70 leading-relaxed">
                    Led by Abel Mendoza, Omega Technologies is focused on building the future of personal memory systems.
                    We believe that human stories deserve secure, contextual recall, and we honor that by combining
                    encryption options, strict data boundaries, and transparent AI disclaimers.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Technology Stack */}
        <section className="py-8 sm:py-12 px-4 sm:px-6 lg:px-8 bg-black/20">
          <div className="max-w-7xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-6 sm:mb-8 text-center px-2 sm:px-0">Technology Stack</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              <div className="rounded-lg border border-border/60 bg-black/40 p-4 sm:p-6">
                <h3 className="text-base sm:text-lg font-semibold text-white mb-2 sm:mb-3">Frontend</h3>
                <ul className="space-y-1.5 sm:space-y-2 text-white/70 text-xs sm:text-sm">
                  <li>• React + TypeScript</li>
                  <li>• Tailwind CSS</li>
                  <li>• React Router</li>
                  <li>• Lucide Icons</li>
                </ul>
              </div>
              <div className="rounded-lg border border-border/60 bg-black/40 p-4 sm:p-6">
                <h3 className="text-base sm:text-lg font-semibold text-white mb-2 sm:mb-3">Backend</h3>
                <ul className="space-y-1.5 sm:space-y-2 text-white/70 text-xs sm:text-sm">
                  <li>• Node.js + Express</li>
                  <li>• TypeScript</li>
                  <li>• Supabase (Database & Auth)</li>
                  <li>• PostgreSQL</li>
                </ul>
              </div>
              <div className="rounded-lg border border-border/60 bg-black/40 p-4 sm:p-6">
                <h3 className="text-base sm:text-lg font-semibold text-white mb-2 sm:mb-3">AI & Infrastructure</h3>
                <ul className="space-y-1.5 sm:space-y-2 text-white/70 text-xs sm:text-sm">
                  <li>• OpenAI API</li>
                  <li>• Custom AI Systems</li>
                  <li>• Cost-Optimized Architecture</li>
                  <li>• Enterprise Security</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* Philosophy */}
        <section className="py-8 sm:py-12 px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <div className="rounded-xl sm:rounded-2xl border border-border/60 bg-black/40 backdrop-blur-sm p-4 sm:p-6 md:p-8 lg:p-12">
              <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4 sm:mb-6">Philosophy</h2>
              <p className="text-sm sm:text-base md:text-lg text-white/80 leading-relaxed mb-3 sm:mb-4">
                Human stories deserve secure, contextual recall. We honor that by combining encryption options,
                strict data boundaries, and transparent AI disclaimers.
              </p>
              <p className="text-sm sm:text-base md:text-lg text-white/80 leading-relaxed mb-3 sm:mb-4">
                LoreBook isn't just a journaling app—it's a lifelong digital companion that:
              </p>
              <ul className="space-y-2 sm:space-y-3 text-sm sm:text-base md:text-lg text-white/80">
                <li>• Understands your complete life story</li>
                <li>• Tracks your evolution and patterns</li>
                <li>• Provides continuity intelligence</li>
                <li>• Preserves your essence for the future</li>
                <li>• Helps you understand yourself better</li>
              </ul>
            </div>
          </div>
        </section>

        {/* Rights */}
        <section className="py-8 sm:py-12 px-4 sm:px-6 lg:px-8 bg-black/20">
          <div className="max-w-4xl mx-auto text-center">
            <div className="rounded-lg border border-border/60 bg-black/40 p-4 sm:p-6 md:p-8">
              <h2 className="text-xl sm:text-2xl font-semibold text-white mb-3 sm:mb-4">Rights & Licensing</h2>
              <p className="text-sm sm:text-base text-white/70 leading-relaxed">
                © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.
              </p>
              <p className="text-sm sm:text-base text-white/70 leading-relaxed mt-3 sm:mt-4">
                Licensed under MIT for code, with ownership retained for brand and product identity.
                Viewing and self-hosting allowed, commercial use restricted.
              </p>
            </div>
          </div>
        </section>

        {/* CTA */}
        <CTASection
          title="Join Us on This Journey"
          description="Experience how LoreBook can transform your relationship with your life story. Start free, no credit card required."
          primaryAction={{
            label: 'Get Started',
            path: '/login',
          }}
          secondaryAction={{
            label: 'View Features',
            path: '/features',
          }}
        />
      </main>

      <LandingFooter />
    </div>
  );
}
