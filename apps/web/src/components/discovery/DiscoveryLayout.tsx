interface DiscoveryLayoutProps {
  children: React.ReactNode;
}

export const DiscoveryLayout = ({ children }: DiscoveryLayoutProps) => {
  return (
    <div className="flex flex-col h-full">
      {/* Main Content */}
      <div className="flex-1 min-w-0 overflow-auto">
        {children}
      </div>
    </div>
  );
};

