import { useEffect, useState } from 'react';
import { OnboardingWizard } from '../components/onboarding/OnboardingWizard';

export default function Onboarding() {
  const [showWizard, setShowWizard] = useState(true);

  // Check if user has already completed onboarding
  useEffect(() => {
    const completed = localStorage.getItem('onboarding_completed');
    if (completed === 'true') {
      // Optionally redirect to main app or show a "redo onboarding" option
      setShowWizard(false);
    }
  }, []);

  if (!showWizard) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-black via-purple-950 to-black flex items-center justify-center p-4">
        <div className="text-center text-white">
          <p className="text-lg mb-4">You've already completed onboarding!</p>
          <button
            onClick={() => {
              localStorage.removeItem('onboarding_completed');
              setShowWizard(true);
            }}
            className="px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary/80"
          >
            Redo Onboarding
          </button>
        </div>
      </div>
    );
  }

  return <OnboardingWizard onComplete={() => setShowWizard(false)} />;
}

