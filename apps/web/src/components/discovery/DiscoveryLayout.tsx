import { DiscoveryNav } from './DiscoveryNav';
import { DiscoveryMobileNav } from './DiscoveryMobileNav';
import { DiscoveryMobileHeader } from './DiscoveryMobileHeader';

interface DiscoveryLayoutProps {
  children: React.ReactNode;
  onOpenAppSidebar?: () => void;
}

export const DiscoveryLayout = ({ children, onOpenAppSidebar }: DiscoveryLayoutProps) => {
  return (
    <div className="relative flex flex-col h-full min-h-0 overflow-hidden bg-[#060508]">
      {/* Atmospheric background */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_15%_0%,rgba(139,92,246,0.14),transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_85%_20%,rgba(236,72,153,0.08),transparent_45%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_100%,rgba(59,130,246,0.06),transparent_55%)]" />
        <div className="absolute inset-0 bg-gradient-to-b from-primary/[0.04] via-transparent to-black/80" />
      </div>

      <DiscoveryMobileHeader onOpenAppSidebar={onOpenAppSidebar} />

      <div className="relative flex flex-1 min-h-0">
        {/* Desktop sidebar */}
        <div className="hidden lg:flex lg:flex-shrink-0">
          <DiscoveryNav />
        </div>

        {/* Main scroll area */}
        <main
          className="flex-1 min-w-0 overflow-y-auto overscroll-contain px-3 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8 pb-[calc(4.75rem+env(safe-area-inset-bottom,0px))] lg:pb-8"
        >
          {children}
        </main>
      </div>

      <DiscoveryMobileNav />
    </div>
  );
};
