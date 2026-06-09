import { useState } from 'react';
import { Target, Flame } from 'lucide-react';
import { GoalsAndValuesPanel } from './GoalsAndValuesPanel';
import { HabitValuesPanel } from './HabitValuesPanel';

type Tab = 'goals' | 'habits';

const TABS: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'goals', label: 'Goals & Values', icon: Target },
  { id: 'habits', label: 'Habits & Patterns', icon: Flame },
];

export const ValuesAndHabitsPanel = () => {
  const [activeTab, setActiveTab] = useState<Tab>('goals');

  return (
    <div className="space-y-0">
      {/* Tab bar */}
      <div className="flex gap-1 border-b border-border/50 mb-6">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === id
                ? 'border-primary text-primary'
                : 'border-transparent text-white/50 hover:text-white/80 hover:border-white/20'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'goals' ? <GoalsAndValuesPanel /> : <HabitValuesPanel />}
    </div>
  );
};
