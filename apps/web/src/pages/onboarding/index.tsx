import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';

import { ImportWizard } from '../../components/onboarding/ImportWizard';
import { QuickStart } from '../../components/onboarding/QuickStart';
import { FirstWeekBriefing } from '../../components/onboarding/FirstWeekBriefing';
import { Button } from '../../components/ui/button';

const OnboardingPage = () => {
  const [finished, setFinished] = useState(false);

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-purple-950 to-black p-8 text-white">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-2xl border border-border/60 bg-black/50 p-6 shadow-panel">
          <p className="text-xs uppercase tracking-widest text-white/60">Onboarding</p>
          <h1 className="text-3xl font-semibold">Welcome to Lore Book</h1>
          <p className="mt-2 text-sm text-white/70">
            Guided setup, import wizards, and a first-week briefing to seed your memory graph.
          </p>
        </header>

        <QuickStart />
        <ImportWizard onComplete={() => setFinished(true)} />
        <FirstWeekBriefing />

        {finished && (
          <div className="flex items-center justify-between rounded-2xl border border-primary/60 bg-primary/10 p-4 text-white">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-6 w-6" />
              <div>
                <p className="font-semibold">Your Lore Book is ready</p>
                <p className="text-sm text-white/70">Sample data is available if you skipped imports.</p>
              </div>
            </div>
            <Button variant="default">Go to timeline</Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default OnboardingPage;
