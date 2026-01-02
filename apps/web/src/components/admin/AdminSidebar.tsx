/**
 * Admin Sidebar Component
 */

import { 
  LayoutDashboard, 
  Users, 
  FileText, 
  Zap, 
  Settings, 
  Database,
  Flag,
  DollarSign,
  Activity
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';

export type AdminSection = 'dashboard' | 'users' | 'logs' | 'ai-events' | 'tools' | 'feature-flags' | 'finance' | 'engine-health';

interface AdminSidebarProps {
  activeSection: AdminSection;
  onSectionChange: (section: AdminSection) => void;
}

export const AdminSidebar = ({ activeSection, onSectionChange }: AdminSidebarProps) => {
  const navigate = useNavigate();
  const location = useLocation();

  const menuItems = [
    { id: 'dashboard' as AdminSection, label: 'Dashboard', icon: LayoutDashboard },
    { id: 'users' as AdminSection, label: 'Users', icon: Users },
    { id: 'logs' as AdminSection, label: 'Logs', icon: FileText },
    { id: 'ai-events' as AdminSection, label: 'AI Gen Events', icon: Zap },
    { id: 'engine-health' as AdminSection, label: 'Engine Health', icon: Activity },
    { id: 'tools' as AdminSection, label: 'Tools', icon: Settings },
    { id: 'feature-flags' as AdminSection, label: 'Feature Flags', icon: Flag },
    { id: 'finance' as AdminSection, label: 'Finance', icon: DollarSign },
  ];

  return (
    <aside className="w-64 bg-black/40 border-r border-border/60 p-4">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-white">Admin Console</h2>
        <p className="text-xs text-white/60 mt-1">Production Administration</p>
      </div>

      <nav className="space-y-2">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeSection === item.id;
          
          return (
            <button
              key={item.id}
              onClick={() => onSectionChange(item.id)}
              className={`w-full text-left px-4 py-3 rounded-lg flex items-center gap-3 transition-colors ${
                isActive 
                  ? 'bg-primary/20 text-primary border border-primary/30' 
                  : 'hover:bg-white/5 text-white/80'
              }`}
            >
              <Icon className="h-5 w-5" />
              <span className="font-medium">{item.label}</span>
            </button>
          );
        })}
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
