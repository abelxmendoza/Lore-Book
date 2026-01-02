import { Link, useLocation } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { ANALYTICS_MODULES, getModulesByTier, type AnalyticsModuleTier } from '../../config/analyticsModules';

export const DiscoveryNav = () => {
  const location = useLocation();
  const currentPath = location.pathname;

  const coreModules = getModulesByTier('core');
  const advancedModules = getModulesByTier('advanced');
  const labModules = getModulesByTier('lab');

  const isActive = (route: string) => {
    return currentPath === route;
  };

  const renderNavGroup = (title: string, modules: typeof ANALYTICS_MODULES, tier: AnalyticsModuleTier) => {
    if (modules.length === 0) return null;

    return (
      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider px-3 py-2">
          {title}
        </h3>
        <nav className="space-y-1">
          {modules.map((module) => {
            const Icon = module.icon;
            const active = isActive(module.route);
            
            return (
              <Link
                key={module.key}
                to={module.route}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                  active
                    ? 'bg-primary/20 text-primary border border-primary/30'
                    : 'text-white/70 hover:bg-white/5 hover:text-white'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="text-sm font-medium">{module.title}</span>
                {module.tier === 'lab' && (
                  <span className="ml-auto text-xs text-white/40 bg-white/10 px-2 py-0.5 rounded">
                    Lab
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>
    );
  };

  return (
    <aside className="w-64 flex-shrink-0 border-r border-border/60 bg-black/20 p-4">
      <div className="mb-6">
        <Link
          to="/discovery"
          className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
            currentPath === '/discovery'
              ? 'bg-primary/20 text-primary border border-primary/30'
              : 'text-white/70 hover:bg-white/5 hover:text-white'
          }`}
        >
          <Compass className="h-4 w-4" />
          <span className="text-sm font-medium">Overview</span>
        </Link>
      </div>

      <div className="space-y-6">
        {renderNavGroup('Core', coreModules, 'core')}
        {renderNavGroup('Advanced', advancedModules, 'advanced')}
        {renderNavGroup('Labs', labModules, 'lab')}
      </div>
    </aside>
  );
};

