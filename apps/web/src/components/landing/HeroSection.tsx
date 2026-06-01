// © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.

import { useNavigate } from 'react-router-dom';
import { Button } from '../ui/button';
import { ArrowRight, Sparkles, Shield, MessageSquareText, Users, BookMarked, CalendarDays } from 'lucide-react';

// ─── Inline app preview mock ─────────────────────────────────────────────────

const AppPreview = () => (
  <div className="relative w-full max-w-sm mx-auto lg:mx-0">
    {/* Glow behind the card */}
    <div className="absolute -inset-4 bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-3xl blur-2xl" />

    {/* Mock app window */}
    <div className="relative rounded-2xl border border-white/10 bg-black/60 backdrop-blur-sm overflow-hidden shadow-2xl">
      {/* Window chrome */}
      <div className="flex items-center gap-1.5 px-4 py-3 border-b border-white/5 bg-white/3">
        <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
        <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
        <div className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
        <span className="ml-2 text-xs text-white/20">LoreBook · Chat</span>
      </div>

      {/* Mock sidebar strip */}
      <div className="flex">
        <div className="w-10 border-r border-white/5 bg-black/40 py-3 flex flex-col items-center gap-3">
          <MessageSquareText className="h-4 w-4 text-purple-400" />
          <Users className="h-4 w-4 text-white/20" />
          <CalendarDays className="h-4 w-4 text-white/20" />
          <BookMarked className="h-4 w-4 text-white/20" />
        </div>

        {/* Chat area */}
        <div className="flex-1 p-3 space-y-2.5 text-xs">
          {/* User message */}
          <div className="flex justify-end">
            <div className="rounded-xl rounded-tr-none bg-purple-500/20 border border-purple-500/20 px-3 py-2 text-white/90 max-w-[80%] leading-relaxed">
              I got the job. The one I've been working toward for two years.
            </div>
          </div>

          {/* AI message */}
          <div className="flex gap-2 items-start">
            <div className="w-5 h-5 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex-shrink-0 mt-0.5" />
            <div className="rounded-xl rounded-tl-none bg-white/5 border border-white/5 px-3 py-2 text-white/80 max-w-[85%] leading-relaxed">
              You almost talked yourself out of applying. Twice. The version of you from two years ago would've found a reason the timing wasn't right. Something changed.
            </div>
          </div>

          {/* User message 2 */}
          <div className="flex justify-end">
            <div className="rounded-xl rounded-tr-none bg-purple-500/20 border border-purple-500/20 px-3 py-2 text-white/90 max-w-[75%] leading-relaxed">
              I think I stopped waiting to feel ready.
            </div>
          </div>

          {/* AI message 2 */}
          <div className="flex gap-2 items-start">
            <div className="w-5 h-5 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex-shrink-0 mt-0.5" />
            <div className="rounded-xl rounded-tl-none bg-white/5 border border-white/5 px-3 py-2 text-white/80 max-w-[75%] leading-relaxed">
              That's exactly what changed.
            </div>
          </div>

          {/* Insight pills */}
          <div className="flex flex-wrap gap-1 pt-1">
            <span className="px-2 py-0.5 rounded-full bg-purple-500/15 border border-purple-500/20 text-purple-300 text-[10px]">Goal · Achieved</span>
            <span className="px-2 py-0.5 rounded-full bg-pink-500/15 border border-pink-500/20 text-pink-300 text-[10px]">Character · Grown</span>
          </div>

          {/* Input bar */}
          <div className="flex items-center gap-2 mt-2 rounded-lg border border-white/10 bg-white/3 px-3 py-2">
            <span className="text-white/20 text-[10px] flex-1">What's on your mind…</span>
            <div className="w-5 h-5 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
              <ArrowRight className="h-2.5 w-2.5 text-white" />
            </div>
          </div>
        </div>
      </div>
    </div>

    {/* Insight badge floating bottom-right */}
    <div className="absolute -bottom-3 -right-3 rounded-xl border border-white/10 bg-black/80 backdrop-blur-sm px-3 py-2 shadow-xl">
      <p className="text-xs text-white/40">Learning from</p>
      <p className="text-xl font-bold text-white">2 years</p>
    </div>
  </div>
);

// ─── Main component ───────────────────────────────────────────────────────────

export const HeroSection = () => {
  const navigate = useNavigate();

  return (
    <section className="relative min-h-[90vh] flex items-center px-4 sm:px-6 lg:px-8 pt-24 pb-16">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-black via-purple-950 to-black" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_25%_30%,rgba(154,77,255,0.18),transparent_55%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_75%_70%,rgba(255,31,174,0.12),transparent_55%)]" />
      {/* Subtle grid overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:64px_64px]" />

      <div className="relative z-10 max-w-7xl mx-auto w-full">

        {/* ── Main hero row: logo | copy | preview ──────────────── */}
        <div className="flex flex-col lg:flex-row items-center gap-10 lg:gap-12 xl:gap-16">

          {/* ── Logo ── */}
          <div className="relative shrink-0 flex justify-center">
            <div className="absolute -inset-8 bg-gradient-to-br from-purple-500/30 via-pink-500/15 to-purple-600/20 rounded-[40px] blur-3xl" />
            <img
              src="/images/LoreBookLogo.jpg"
              alt="LoreBook"
              className="relative w-56 sm:w-64 lg:w-72 xl:w-80 rounded-3xl object-contain shadow-2xl shadow-purple-500/40 border border-white/10"
            />
          </div>

          {/* ── Copy ── */}
          <div className="flex-1 flex flex-col items-center lg:items-start text-center lg:text-left min-w-0">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/30 bg-primary/10 mb-5">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-medium text-primary">Early Access · Now Open</span>
            </div>

            <h1 className="text-4xl sm:text-5xl xl:text-6xl font-bold text-white leading-[1.08] mb-5">
              The AI that{' '}
              <span className="bg-gradient-to-r from-purple-400 via-pink-400 to-purple-400 bg-clip-text text-transparent">
                learns
              </span>
              {' '}who you are
            </h1>

            <p className="text-lg text-white/55 mb-8 max-w-md leading-relaxed">
              LoreBook doesn't just remember your life. The longer you talk, the more it understands you — your patterns, your people, the things you keep coming back to.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 mb-8 w-full sm:w-auto">
              <Button
                type="button"
                onClick={() => navigate('/login')}
                size="lg"
                className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-base px-7 py-6 shadow-lg shadow-purple-500/30"
              >
                Start for free
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <Button
                type="button"
                onClick={() => navigate('/login')}
                variant="outline"
                size="lg"
                className="border-white/15 text-white/80 hover:bg-white/5 hover:border-white/30 text-base px-7 py-6"
              >
                Try demo mode
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 justify-center lg:justify-start text-sm text-white/40">
              <div className="flex items-center gap-1.5">
                <Shield className="h-4 w-4 text-green-400" />
                <span>End-to-end encrypted</span>
              </div>
              <span className="text-white/20">·</span>
              <span>No credit card required</span>
              <span className="text-white/20">·</span>
              <span>Cancel anytime</span>
            </div>
          </div>

          {/* ── App preview ── */}
          <div className="shrink-0 w-full max-w-sm lg:max-w-none lg:w-80 xl:w-96">
            <AppPreview />
          </div>
        </div>

        {/* ── Stat strip ────────────────────────────────────────── */}
        <div className="mt-16 grid grid-cols-2 sm:grid-cols-4 gap-6 border-t border-white/5 pt-10">
          {[
            { value: 'People',   sub: 'Understood, not just stored' },
            { value: 'Patterns', sub: 'Noticed across time'         },
            { value: 'Moments',  sub: 'Connected, not isolated'     },
            { value: 'Insight',  sub: 'Earned from your story'      },
          ].map(({ value, sub }) => (
            <div key={value} className="text-center">
              <p className="text-2xl font-bold text-primary mb-1">{value}</p>
              <p className="text-sm text-white/40">{sub}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
