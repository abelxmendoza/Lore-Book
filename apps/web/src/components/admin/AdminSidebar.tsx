import {
  LayoutDashboard, Users, FileText, Zap, Settings,
  Flag, DollarSign, Activity, Crown, LogIn, X, Menu, BookOpen, ExternalLink,
  ShieldCheck,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '../../lib/cn';

export type AdminSection =
  | 'dashboard' | 'users' | 'subscribers' | 'login-activity'
  | 'logs' | 'ai-events' | 'engine-health' | 'integrations' | 'tools' | 'feature-flags' | 'finance'
  | 'cost' | 'chronicle' | 'chat-diagnostics';

interface AdminSidebarProps {
  activeSection: AdminSection;
  onSectionChange: (section: AdminSection) => void;
  /** Mobile-only: whether the drawer is open */
  mobileOpen?: boolean;
  /** Mobile-only: called when backdrop or X is clicked */
  onMobileClose?: () => void;
}

const MENU_GROUPS = [
  {
    label: 'Overview',
    items: [{ id: 'dashboard' as AdminSection, label: 'Dashboard', icon: LayoutDashboard }],
  },
  {
    label: 'Users',
    items: [
      { id: 'users' as AdminSection,          label: 'All Users',       icon: Users },
      { id: 'subscribers' as AdminSection,    label: 'Subscribers',     icon: Crown },
      { id: 'login-activity' as AdminSection, label: 'Login Activity',  icon: LogIn },
    ],
  },
  {
    label: 'System',
    items: [
      { id: 'logs' as AdminSection,          label: 'Logs',           icon: FileText },
      { id: 'ai-events' as AdminSection,     label: 'AI Events',      icon: Zap },
      { id: 'engine-health' as AdminSection, label: 'Engine Health',  icon: Activity },
      { id: 'chat-diagnostics' as AdminSection, label: 'System Health', icon: ShieldCheck },
      { id: 'integrations' as AdminSection,  label: 'Integrations',   icon: ExternalLink },
      { id: 'tools' as AdminSection,         label: 'Tools',          icon: Settings },
      { id: 'feature-flags' as AdminSection, label: 'Feature Flags',  icon: Flag },
    ],
  },
  {
    label: 'LoreBook',
    items: [{ id: 'chronicle' as AdminSection, label: 'Chronicle', icon: BookOpen }],
  },
  {
    label: 'Finance',
    items: [
      { id: 'finance' as AdminSection, label: 'Finance', icon: DollarSign },
      { id: 'cost' as AdminSection, label: 'AI Cost', icon: DollarSign },
    ],
  },
];

// ── Shared nav content ────────────────────────────────────────────────────────

function NavContent({
  activeSection,
  onSectionChange,
  onClose,
}: {
  activeSection: AdminSection;
  onSectionChange: (s: AdminSection) => void;
  onClose?: () => void;
}) {
  const navigate = useNavigate();
  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-base font-bold text-white">Admin Console</h2>
          <p className="text-[10px] text-white/35 mt-0.5 uppercase tracking-wider">Production</p>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Close navigation" className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/8 transition lg:hidden">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <nav className="space-y-4 flex-1">
        {MENU_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="text-[10px] font-semibold text-white/25 uppercase tracking-widest px-3 mb-1">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => { onSectionChange(item.id); onClose?.(); }}
                    className={cn(
                      'w-full text-left px-3 py-2 rounded-xl flex items-center gap-2.5 transition-all text-sm',
                      isActive
                        ? 'bg-primary/15 text-primary border border-primary/25'
                        : 'hover:bg-white/[0.05] text-white/55 hover:text-white/85'
                    )}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="font-medium">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="mt-auto pt-4 border-t border-white/8">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="w-full text-left px-3 py-2 text-xs text-white/35 hover:text-white/70 transition"
        >
          ← Back to app
        </button>
      </div>
    </>
  );
}

// ── Exported sidebar ──────────────────────────────────────────────────────────

export const AdminSidebar = ({
  activeSection,
  onSectionChange,
  mobileOpen = false,
  onMobileClose,
}: AdminSidebarProps) => (
  <>
    {/* Desktop sidebar — always visible on lg+ */}
    <aside className="hidden lg:flex flex-col w-56 flex-shrink-0 bg-black/40 border-r border-white/8 p-4 min-h-screen">
      <NavContent activeSection={activeSection} onSectionChange={onSectionChange} />
    </aside>

    {/* Mobile drawer — shown when mobileOpen */}
    {mobileOpen && (
      <>
        {/* Backdrop */}
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={onMobileClose}
          aria-hidden
        />
        {/* Drawer */}
        <aside className="fixed inset-y-0 left-0 z-50 w-64 flex flex-col bg-[#080510] border-r border-white/10 p-4 lg:hidden">
          <NavContent
            activeSection={activeSection}
            onSectionChange={onSectionChange}
            onClose={onMobileClose}
          />
        </aside>
      </>
    )}
  </>
);

// ── Mobile trigger button — used in the main header ───────────────────────────

export function AdminMenuButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="lg:hidden flex items-center gap-2 px-3 py-2 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-sm text-white transition"
    >
      <Menu className="h-4 w-4" />
      Menu
    </button>
  );
}
