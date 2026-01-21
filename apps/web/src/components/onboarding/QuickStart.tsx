import { Rocket, Sparkles, Waypoints } from 'lucide-react';

import { Button } from '../ui/button';

export const QuickStart = () => (
  <div className="space-y-4 rounded-2xl border border-border/60 bg-gradient-to-br from-purple-900/40 to-black p-6 shadow-panel">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-xs uppercase tracking-widest text-white/60">Guided onboarding</p>
        <h2 className="text-2xl font-semibold text-white">Start your first week</h2>
      </div>
      <Rocket className="h-8 w-8 text-primary" />
    </div>
    <div className="grid gap-3 md:grid-cols-3">
      {["Create your origin story", "Import past notes", "Schedule first briefing"].map((item) => (
        <div key={item} className="rounded-xl border border-border/60 bg-white/5 p-4 text-sm text-white/80">
          <div className="flex items-center gap-2 text-white">
            <Sparkles className="h-4 w-4 text-primary" />
            <span>{item}</span>
          </div>
          <p className="mt-2 text-xs text-white/60">
            Lore Book will tag and track everything for the opening chapter.
          </p>
        </div>
      ))}
    </div>
    <div className="flex items-center justify-between rounded-xl border border-border/60 bg-white/5 px-4 py-3 text-sm text-white/70">
      <div className="flex items-center gap-2">
        <Waypoints className="h-5 w-5 text-primary" />
        <div>
          <p className="font-semibold text-white">Book Zero: Prologue</p>
          <p className="text-xs text-white/60">A guided story to align your identity baseline.</p>
        </div>
      </div>
      <Button variant="outline">Start now</Button>
    </div>
  </div>
);
