// © 2026 Abel Mendoza — Omega Technologies. All Rights Reserved.

import { LandingHeader } from '../components/landing/LandingHeader';
import { LandingFooter } from '../components/landing/LandingFooter';
import { LoreOfLoreBookContent } from '../components/landing/LoreOfLoreBook';
import { CTASection } from '../components/landing/CTASection';

export default function Lore() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-purple-950 to-black overflow-x-clip">
      <LandingHeader />

      <main className="pt-16 min-w-0 overflow-x-clip">
        <LoreOfLoreBookContent />

        <CTASection
          title="Write your own lore."
          description="LoreBook Chronicle is the product remembering itself. Your story works the same way — talk once, carry forward forever."
          primaryAction={{
            label: 'Start a conversation',
            path: '/login',
          }}
          secondaryAction={{
            label: 'Explore features',
            path: '/features',
          }}
        />
      </main>

      <LandingFooter />
    </div>
  );
}
