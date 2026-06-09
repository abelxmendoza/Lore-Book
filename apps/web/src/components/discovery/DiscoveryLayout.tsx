import { DiscoveryNav } from './DiscoveryNav';

interface DiscoveryLayoutProps {
  children: React.ReactNode;
}

export const DiscoveryLayout = ({ children }: DiscoveryLayoutProps) => {
  return (
    <div className="flex h-full min-h-[calc(100vh-8rem)] sm:min-h-[calc(100vh-4rem)]">
      {/* Sidebar — hidden on mobile, shown from lg breakpoint */}
      <div className="hidden lg:flex lg:flex-shrink-0">
        <DiscoveryNav />
      </div>

      {/* Main content — owns its own scroll */}
      <div className="flex-1 min-w-0 overflow-auto p-4 sm:p-6 lg:p-8">
        {children}
      </div>
    </div>
  );
};
