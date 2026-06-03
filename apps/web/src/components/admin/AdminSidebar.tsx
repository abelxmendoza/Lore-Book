/**
 * Admin Sidebar Component
 */

import {
  LayoutDashboard,
  Users,
  FileText,
  Zap,
  Settings,
  Flag,
  DollarSign,
  Activity,
  Crown,
  LogIn,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export type AdminSection = 'dashboard' | 'users' | 'subscribers' | 'login-activity' | 'logs' | 'ai-events' | 'tools' | 'feature-flags' | 'finance' | 'engine-health';

interface AdminSidebarProps {
  activeSection: AdminSection;
  onSectionChange: (section: AdminSection) => void;
}

const MENU_GROUPS = [
  {
    label: 'Overview',
    items: [
      { id: 'dashboard' as AdminSection, label: 'Dashboard', icon: LayoutDashboard },
    ],
  },
  {
    label: 'Users',
    items: [
      { id: 'users' as AdminSection, label: 'All Users', icon: Users },
      { id: 'subscribers' as AdminSection, label: 'Subscribers', icon: Crown },
      { id: 'login-activity' as AdminSection, label: 'Login Activity', icon: LogIn },
    ],
  },
  {
    label: 'System',
    items: [
      { id: 'logs' as AdminSection, label: 'Logs', icon: FileText },
      { id: 'ai-events' as AdminSection, label: 'AI Events', icon: Zap },
      { id: 'engine-health' as AdminSection, label: 'Engine Health', icon: Activity },
      { id: 'tools' as AdminSection, label: 'Tools', icon: Settings },
      { id: 'feature-flags' as AdminSection, label: 'Feature Flags', icon: Flag },
    ],
  },
  {
    label: 'Finance',
    items: [
      { id: 'finance' as AdminSection, label: 'Finance', icon: DollarSign },
    ],
  },
];

export const AdminSidebar = ({ activeSection, onSectionChange }: AdminSidebarProps) => {
  const navigate = useNavigate();

  return (
    <aside className="w-64 bg-black/40 border-r border-border/60 p-4">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-white">Admin Console</h2>
        <p className="text-xs text-white/60 mt-1">Production Administration</p>
      </div>

      <nav className="space-y-4">
        {MENU_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="text-xs font-semibold text-white/30 uppercase tracking-widest px-4 mb-1">{group.label}</p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSectionChange(item.id)}
                    className={`w-full text-left px-4 py-2.5 rounded-lg flex items-center gap-3 transition-colors ${
                      isActive
                        ? 'bg-primary/20 text-primary border border-primary/30'
                        : 'hover:bg-white/5 text-white/70'
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="text-sm font-medium">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="mt-8 pt-6 border-t border-border/60">
        <button
          onClick={() => navigate('/')}
          className="w-full text-left px-4 py-2 text-sm text-white/60 hover:text-white transition-colors"
        >
          ← Back to App
        </button>
      </div>
    </aside>
  );
};
