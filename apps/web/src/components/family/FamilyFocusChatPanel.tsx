import { ArrowRight, MessageSquare } from 'lucide-react';

import { openChatWithFocus } from '../../lib/openChatWithFocus';
import { Button } from '../ui/button';

type FamilyFocusChatPanelProps = {
  memberCount: number;
  householdCount: number;
  groupCount: number;
};

export function FamilyFocusChatPanel({
  memberCount,
  householdCount,
  groupCount,
}: FamilyFocusChatPanelProps) {
  const openFamilyChat = () => {
    openChatWithFocus({
      entityId: 'family',
      entityName: 'My family',
      entityType: 'memory',
      sourceSurface: 'family',
      sourceLabel: 'Family',
      knowledgeScope:
        'my family tree, kinship relationships, households, family groups, relationship evidence, and unresolved family questions',
      startNewThread: true,
      arrivedAt: Date.now(),
    });
  };

  return (
    <section className="mx-auto max-w-2xl rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/15 via-emerald-500/[0.06] to-transparent p-4 sm:p-6">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-200">
          <MessageSquare className="h-5 w-5" />
        </span>
        <div>
          <h2 className="font-semibold text-white">Focus your family in main chat</h2>
          <p className="mt-1 text-xs leading-relaxed text-white/60 sm:text-sm">
            Talk through relatives, households, family groups, missing connections, or corrections with your Family context attached.
          </p>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-2 rounded-xl border border-white/10 bg-black/30 p-3 text-center">
        <div>
          <p className="text-lg font-semibold text-emerald-200">{memberCount}</p>
          <p className="text-[10px] uppercase tracking-wide text-white/40">Members</p>
        </div>
        <div>
          <p className="text-lg font-semibold text-emerald-200">{householdCount}</p>
          <p className="text-[10px] uppercase tracking-wide text-white/40">Households</p>
        </div>
        <div>
          <p className="text-lg font-semibold text-emerald-200">{groupCount}</p>
          <p className="text-[10px] uppercase tracking-wide text-white/40">Groups</p>
        </div>
      </div>

      <Button
        type="button"
        onClick={openFamilyChat}
        data-testid="family-open-focus-chat"
        className="group min-h-11 w-full bg-emerald-500 text-black hover:bg-emerald-400"
      >
        Open focused chat
        <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </Button>
      <p className="mt-3 text-center text-[11px] text-white/40">
        Opens a fresh focused thread. LoreBook will not invent missing family details.
      </p>
    </section>
  );
}
