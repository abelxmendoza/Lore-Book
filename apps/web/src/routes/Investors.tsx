// © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.

import { LandingHeader } from '../components/landing/LandingHeader';
import { LandingFooter } from '../components/landing/LandingFooter';
import { FeatureCard } from '../components/landing/FeatureCard';
import { CTASection } from '../components/landing/CTASection';
import {
  TrendingUp,
  Shield,
  Zap,
  Target,
  Database,
  DollarSign,
  BarChart3,
  Rocket,
  Code,
} from 'lucide-react';

export default function Investors() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-purple-950 to-black">
      <LandingHeader />
      
      <main className="pt-20">
        {/* Hero */}
        <section className="py-12 sm:py-16 px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto text-center">
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-4 sm:mb-6 px-2 sm:px-0">
              Building the Future of <span className="text-cyan-400">Personal Memory Systems</span>
            </h1>
            <p className="text-base sm:text-lg md:text-xl text-white/70 mb-6 sm:mb-8 px-4 sm:px-0">
              LoreBook is positioned at the intersection of AI, personal data, and digital immortality.
              We're building the infrastructure for how people will preserve and understand their life stories.
            </p>
            <div className="inline-flex items-center space-x-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full border border-cyan-500/30 bg-cyan-950/20">
              <Rocket className="h-4 w-4 sm:h-5 sm:w-5 text-cyan-400" />
              <span className="text-xs sm:text-sm md:text-base text-cyan-400 font-medium">Early Stage • Seeking Investment</span>
            </div>
          </div>
        </section>

        {/* Market Opportunity */}
        <section className="py-8 sm:py-12 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-6 sm:mb-8 text-center px-2 sm:px-0">Market Opportunity</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 mb-6 sm:mb-8">
              <div className="rounded-lg border border-cyan-500/30 bg-cyan-950/20 p-4 sm:p-6 text-center">
                <div className="text-3xl sm:text-4xl font-bold text-cyan-400 mb-2">$2.5B+</div>
                <div className="text-sm sm:text-base text-white/70">Journaling & Personal Development Market</div>
              </div>
              <div className="rounded-lg border border-cyan-500/30 bg-cyan-950/20 p-4 sm:p-6 text-center">
                <div className="text-3xl sm:text-4xl font-bold text-cyan-400 mb-2">$50B+</div>
                <div className="text-sm sm:text-base text-white/70">AI & Personal Data Market</div>
              </div>
              <div className="rounded-lg border border-cyan-500/30 bg-cyan-950/20 p-4 sm:p-6 text-center">
                <div className="text-3xl sm:text-4xl font-bold text-cyan-400 mb-2">Growing</div>
                <div className="text-sm sm:text-base text-white/70">Digital Immortality & Legacy Market</div>
              </div>
            </div>
            <div className="rounded-lg border border-border/60 bg-black/40 p-4 sm:p-6 md:p-8">
              <h3 className="text-lg sm:text-xl font-semibold text-white mb-3 sm:mb-4">The Opportunity</h3>
              <p className="text-sm sm:text-base text-white/70 leading-relaxed mb-3 sm:mb-4">
                Traditional journaling apps capture fragments—dates and events—but miss the deeper essence of who people are.
                As AI becomes more capable and people become more aware of their digital legacy, there's a massive opportunity
                to build the infrastructure for personal memory systems.
              </p>
              <p className="text-sm sm:text-base text-white/70 leading-relaxed">
                LoreBook is positioned as the first-mover in AI-powered life story management with automatic biography generation,
                continuity intelligence, and digital preservation capabilities. We're building for a future where people expect
                their AI systems to understand their complete life narrative.
              </p>
            </div>
          </div>
        </section>

        {/* Technology Differentiators */}
        <section className="py-8 sm:py-12 px-4 sm:px-6 lg:px-8 bg-black/20">
          <div className="max-w-7xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-6 sm:mb-8 text-center px-2 sm:px-0">Technology Differentiators</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FeatureCard
                icon={Zap}
                title="Compiler-Inspired Architecture"
                description="LoreKeeper Narrative Compiler (LNC) provides epistemic safety, incremental compilation, and deterministic entity resolution. This is not just an app—it's a compiler for life stories."
              />
              <FeatureCard
                icon={Database}
                title="Cost-Optimized Operations"
                description="Rule-based extraction, aggressive caching, and efficient algorithms ensure 10-100x faster operations than traditional approaches. Free operations for users, low infrastructure costs."
              />
              <FeatureCard
                icon={Shield}
                title="Enterprise Security from Day One"
                description="CSRF protection, encryption, GDPR compliance, comprehensive security testing. Built with security and privacy as core principles, not afterthoughts."
              />
              <FeatureCard
                icon={Code}
                title="Production-Ready Foundation"
                description="Comprehensive testing (unit, integration, E2E), CI/CD pipeline, code quality enforcement. Not a prototype—a production-ready system with enterprise-grade infrastructure."
              />
            </div>
          </div>
        </section>

        {/* Business Model */}
        <section className="py-8 sm:py-12 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-6 sm:mb-8 text-center px-2 sm:px-0">Business Model</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
              <div className="rounded-lg border border-border/60 bg-black/40 p-4 sm:p-6 md:p-8">
                <div className="flex items-center space-x-3 mb-3 sm:mb-4">
                  <DollarSign className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
                  <h3 className="text-lg sm:text-xl font-semibold text-white">Freemium Model</h3>
                </div>
                <p className="text-sm sm:text-base text-white/70 leading-relaxed mb-3 sm:mb-4">
                  Free tier with core features (journaling, basic AI chat, timeline). Premium subscriptions
                  for advanced features (biography generation, advanced analytics, priority support).
                </p>
                <ul className="space-y-1.5 sm:space-y-2 text-sm sm:text-base text-white/70">
                  <li>• Free: Core features</li>
                  <li>• Premium: Advanced features ($9-19/month)</li>
                  <li>• Enterprise: Custom solutions for organizations</li>
                </ul>
              </div>
              <div className="rounded-lg border border-border/60 bg-black/40 p-4 sm:p-6 md:p-8">
                <div className="flex items-center space-x-3 mb-3 sm:mb-4">
                  <Target className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
                  <h3 className="text-lg sm:text-xl font-semibold text-white">Future Revenue Streams</h3>
                </div>
                <ul className="space-y-1.5 sm:space-y-2 text-sm sm:text-base text-white/70">
                  <li>• API access for developers</li>
                  <li>• White-label solutions for therapists, coaches, organizations</li>
                  <li>• Data export and digital immortality services</li>
                  <li>• Enterprise partnerships (healthcare, education, research)</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* Traction & Metrics */}
        <section className="py-8 sm:py-12 px-4 sm:px-6 lg:px-8 bg-black/20">
          <div className="max-w-7xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-6 sm:mb-8 text-center px-2 sm:px-0">Current Status</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
              <div className="rounded-lg border border-primary/30 bg-primary/10 p-4 sm:p-6 text-center">
                <BarChart3 className="h-6 w-6 sm:h-8 sm:w-8 text-primary mx-auto mb-2 sm:mb-3" />
                <div className="text-xl sm:text-2xl font-bold text-white mb-1 sm:mb-2">v0.1.0</div>
                <div className="text-xs sm:text-sm text-white/60">Production Version</div>
              </div>
              <div className="rounded-lg border border-primary/30 bg-primary/10 p-4 sm:p-6 text-center">
                <Code className="h-6 w-6 sm:h-8 sm:w-8 text-primary mx-auto mb-2 sm:mb-3" />
                <div className="text-xl sm:text-2xl font-bold text-white mb-1 sm:mb-2">100%</div>
                <div className="text-xs sm:text-sm text-white/60">Security Test Coverage</div>
              </div>
              <div className="rounded-lg border border-primary/30 bg-primary/10 p-4 sm:p-6 text-center">
                <Shield className="h-6 w-6 sm:h-8 sm:w-8 text-primary mx-auto mb-2 sm:mb-3" />
                <div className="text-xl sm:text-2xl font-bold text-white mb-1 sm:mb-2">Enterprise</div>
                <div className="text-xs sm:text-sm text-white/60">Security Grade</div>
              </div>
              <div className="rounded-lg border border-primary/30 bg-primary/10 p-4 sm:p-6 text-center">
                <Zap className="h-6 w-6 sm:h-8 sm:w-8 text-primary mx-auto mb-2 sm:mb-3" />
                <div className="text-xl sm:text-2xl font-bold text-white mb-1 sm:mb-2">10-100x</div>
                <div className="text-xs sm:text-sm text-white/60">Performance Boost</div>
              </div>
            </div>
            <div className="mt-6 sm:mt-8 rounded-lg border border-border/60 bg-black/40 p-4 sm:p-6 md:p-8">
              <h3 className="text-lg sm:text-xl font-semibold text-white mb-3 sm:mb-4">What We've Built</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 text-sm sm:text-base text-white/70">
                <div>✅ Production-ready application with full feature set</div>
                <div>✅ Enterprise-grade security and privacy infrastructure</div>
                <div>✅ Comprehensive testing suite (unit, integration, E2E)</div>
                <div>✅ CI/CD pipeline and code quality enforcement</div>
                <div>✅ Compiler-inspired architecture (LNC)</div>
                <div>✅ Cost-optimized operations</div>
                <div>✅ Multi-persona AI system</div>
                <div>✅ Automatic biography and timeline generation</div>
              </div>
            </div>
          </div>
        </section>

        {/* Team */}
        <section className="py-8 sm:py-12 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-6 sm:mb-8 text-center px-2 sm:px-0">Team</h2>
            <div className="rounded-lg border border-border/60 bg-black/40 p-4 sm:p-6 md:p-8 max-w-3xl mx-auto">
              <div className="flex flex-col sm:flex-row items-start space-y-4 sm:space-y-0 sm:space-x-6">
                <img
                  src="/branding/mePro.JPG"
                  alt="Abel Mendoza, Founder"
                  className="w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover flex-shrink-0 mx-auto sm:mx-0 border-2 border-white/10"
                />
                <div className="flex-1 text-center sm:text-left">
                  <h3 className="text-lg sm:text-xl font-semibold text-white mb-2">Abel Mendoza</h3>
                  <p className="text-sm sm:text-base text-white/70 mb-3 sm:mb-4">
                    Founder & Lead Developer. Crafting AI-first storytelling infrastructure with care for privacy and agency.
                    Building LoreBook as a lifelong digital companion that understands complete life stories.
                  </p>
                  <p className="text-sm sm:text-base text-white/70">
                    <strong className="text-white">Vision:</strong> To give people self-awareness, continuity, identity clarity,
                    and a long-term companion that understands the story they're living.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Investment Ask */}
        <section className="py-8 sm:py-12 px-4 sm:px-6 lg:px-8 bg-black/20">
          <div className="max-w-4xl mx-auto">
            <div className="rounded-lg border border-cyan-500/30 bg-cyan-950/20 p-4 sm:p-6 md:p-8 text-center">
              <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3 sm:mb-4 px-2 sm:px-0">Interested in Investing?</h2>
              <p className="text-base sm:text-lg md:text-xl text-white/70 mb-6 sm:mb-8 px-2 sm:px-0">
                We're seeking strategic investors who understand the future of personal AI, digital legacy, and memory systems.
                Join us in building the infrastructure for how people will preserve and understand their life stories.
              </p>
              <div className="space-y-3 sm:space-y-4">
                <p className="text-sm sm:text-base text-white/80">
                  <strong className="text-cyan-400">What We're Looking For:</strong>
                </p>
                <ul className="text-sm sm:text-base text-white/70 space-y-2 max-w-2xl mx-auto text-left px-4 sm:px-0">
                  <li>• Strategic investors with expertise in AI, personal data, or consumer SaaS</li>
                  <li>• Investors who understand the digital immortality and legacy market</li>
                  <li>• Partners who can help with distribution, partnerships, or technical expertise</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* Contact CTA */}
        <CTASection
          title="Let's Build the Future Together"
          description="Contact us to learn more about investment opportunities, partnerships, or how LoreBook can transform personal memory systems."
          primaryAction={{
            label: 'Contact Us',
            path: 'mailto:investors@lorebook.ai',
          }}
          secondaryAction={{
            label: 'View Features',
            path: '/features',
          }}
          variant="investor"
        />
      </main>

      <LandingFooter />
    </div>
  );
}
