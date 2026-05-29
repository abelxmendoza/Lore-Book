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
          {/* AI message */}
          <div className="flex gap-2 items-start">
            <div className="w-5 h-5 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex-shrink-0 mt-0.5" />
            <div className="rounded-xl rounded-tl-none bg-white/5 border border-white/5 px-3 py-2 text-white/80 max-w-[80%] leading-relaxed">
              I remember you mentioned Sara last month — she got the promotion. How did her first week go?
            </div>
          </div>

          {/* User message */}
          <div className="flex justify-end">
            <div className="rounded-xl rounded-tr-none bg-purple-500/20 border border-purple-500/20 px-3 py-2 text-white/90 max-w-[75%] leading-relaxed">
              She's thriving actually. The team loves her already.
            </div>
          </div>

          {/* AI message 2 */}
          <div className="flex gap-2 items-start">
            <div className="w-5 h-5 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex-shrink-0 mt-0.5" />
            <div className="rounded-xl rounded-tl-none bg-white/5 border border-white/5 px-3 py-2 text-white/80 max-w-[80%] leading-relaxed">
              That's great — adding this to her record. You've now mentioned Sara in 12 conversations.
            </div>
          </div>

          {/* Entities extracted pill strip */}
          <div className="flex flex-wrap gap-1 pt-1">
            <span className="px-2 py-0.5 rounded-full bg-purple-500/15 border border-purple-500/20 text-purple-300 text-[10px]">Sara · Character</span>
            <span className="px-2 py-0.5 rounded-full bg-cyan-500/15 border border-cyan-500/20 text-cyan-300 text-[10px]">Promotion · Event</span>
          </div>

          {/* Input bar */}
          <div className="flex items-center gap-2 mt-2 rounded-lg border border-white/10 bg-white/3 px-3 py-2">
            <span className="text-white/20 text-[10px] flex-1">Tell me what happened today…</span>
            <div className="w-5 h-5 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
              <ArrowRight className="h-2.5 w-2.5 text-white" />
            </div>
          </div>
        </div>
      </div>
    </div>

    {/* Memory count badge floating bottom-right */}
    <div className="absolute -bottom-3 -right-3 rounded-xl border border-white/10 bg-black/80 backdrop-blur-sm px-3 py-2 shadow-xl">
      <p className="text-xs text-white/40">Memories stored</p>
      <p className="text-xl font-bold text-white">1,284</p>
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">

          {/* ── Left: copy ─────────────────────────────────────── */}
          <div className="text-center lg:text-left">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/30 bg-primary/10 mb-6">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-medium text-primary">Early Access · Now Open</span>
            </div>

            {/* Headline */}
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-[1.1] mb-6">
              The AI that{' '}
              <span className="bg-gradient-to-r from-purple-400 via-pink-400 to-purple-400 bg-clip-text text-transparent">
                remembers
              </span>
              {' '}your whole life
            </h1>

            {/* Subheading */}
            <p className="text-lg sm:text-xl text-white/60 mb-8 max-w-lg mx-auto lg:mx-0 leading-relaxed">
              Every conversation adds to a growing record of your people, places, and history. No re-explaining. No starting over.
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center lg:justify-start mb-10">
              <Button
                type="button"
                onClick={() => navigate('/login')}
                size="lg"
                className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-base px-8 py-6 shadow-lg shadow-purple-500/25"
              >
                Start for free
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <Button
                type="button"
                onClick={() => navigate('/login')}
                variant="outline"
                size="lg"
                className="border-white/15 text-white/80 hover:bg-white/5 hover:border-white/30 text-base px-8 py-6"
              >
                Try demo mode
              </Button>
            </div>

            {/* Trust row */}
            <div className="flex flex-col sm:flex-row items-center gap-4 justify-center lg:justify-start text-sm text-white/40">
              <div className="flex items-center gap-1.5">
                <Shield className="h-4 w-4 text-green-400" />
                <span>End-to-end encrypted</span>
              </div>
              <span className="hidden sm:block text-white/20">·</span>
              <span>No credit card required</span>
              <span className="hidden sm:block text-white/20">·</span>
              <span>Cancel anytime</span>
            </div>
          </div>

          {/* ── Right: app preview ─────────────────────────────── */}
          <div className="flex justify-center lg:justify-end">
            <AppPreview />
          </div>

        </div>

        {/* ── Anchor stat strip ──────────────────────────────────── */}
        <div className="mt-16 lg:mt-20 grid grid-cols-2 sm:grid-cols-4 gap-6 border-t border-white/5 pt-10">
          {[
            { value: 'People', sub: 'No re-introducing' },
            { value: 'Places', sub: 'Context that sticks' },
            { value: 'Projects', sub: 'History intact' },
            { value: 'Patterns', sub: 'Noticed over time' },
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
