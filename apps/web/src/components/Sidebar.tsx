import { BookMarked, CalendarDays, MessageSquareText, Plus, Sparkles } from 'lucide-react';

import { Button } from './ui/button';

const menu = [
  { label: 'Memory Log', icon: MessageSquareText },
  { label: 'Timeline', icon: CalendarDays },
  { label: 'Chapters', icon: BookMarked },
  { label: 'Ask Lore Keeper', icon: Sparkles }
];

export const Sidebar = () => (
  <aside className="hidden w-64 flex-col border-r border-border/60 bg-black/20 p-6 text-white lg:flex">
    <div>
      <p className="font-techno text-xs uppercase text-white/60">Omega Technologies</p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight">Lore Keeper</h2>
      <p className="text-xs text-white/50">Cyberpunk journal with GPT-4 memory.</p>
    </div>
    <div className="mt-8 space-y-2">
      {menu.map((item) => (
        <button
          key={item.label}
          className="flex w-full items-center gap-3 rounded-lg border border-transparent px-3 py-2 text-sm text-white/70 transition hover:border-primary hover:bg-primary/10"
        >
          <item.icon className="h-4 w-4 text-primary" />
          {item.label}
        </button>
      ))}
    </div>
    <div className="mt-auto">
      <Button className="w-full" leftIcon={<Plus className="h-4 w-4" />}>New Chapter</Button>
    </div>
  </aside>
);
