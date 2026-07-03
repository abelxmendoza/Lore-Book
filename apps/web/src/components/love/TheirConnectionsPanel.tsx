// © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.

import { Link2 } from 'lucide-react';
import { Button } from '../ui/button';
import { RelationshipPeripheralsPanel } from '../characters/RelationshipPeripheralsPanel';
import { openCharacterBookModal } from '../../lib/openCharacterBookModal';

type TheirConnectionsPanelProps = {
  relationshipId: string;
  anchorName: string;
  anchorCharacterId?: string;
  onUpdate?: () => void;
  onCloseModal?: () => void;
};

/** Dating & Romance — romantic periphery tab (wraps shared panel). */
export function TheirConnectionsPanel({
  relationshipId,
  anchorName,
  anchorCharacterId,
  onUpdate,
  onCloseModal,
}: TheirConnectionsPanelProps) {
  const openAnchorNetwork = () => {
    if (!anchorCharacterId) return;
    onCloseModal?.();
    openCharacterBookModal({ characterId: anchorCharacterId, tab: 'network' });
  };

  const openPeripheralInBook = (characterId: string) => {
    onCloseModal?.();
    openCharacterBookModal({ characterId, tab: 'info' });
  };

  return (
    <div className="space-y-3 sm:space-y-4 min-w-0">
      {anchorCharacterId && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 rounded-xl border border-pink-500/20 bg-pink-950/15 px-3 py-2.5 sm:px-4 sm:py-3">
          <p className="text-xs sm:text-sm text-white/60 flex-1 min-w-0">
            Romantic links attributed to <span className="text-pink-200 font-medium">{anchorName}</span> — hearsay, overlap, or possessive mentions from chat.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={openAnchorNetwork}
            data-testid="their-connections-open-character-network"
            className="w-full sm:w-auto shrink-0 border-pink-500/30 text-pink-200 hover:bg-pink-500/10"
          >
            <Link2 className="w-3.5 h-3.5 mr-1.5 shrink-0" />
            {anchorName}&apos;s network in Character Book
          </Button>
        </div>
      )}

      <RelationshipPeripheralsPanel
        anchorKind="romantic_relationship"
        anchorId={relationshipId}
        anchorName={anchorName}
        title="Their connections"
        description={`Other partners or romantic links attributed to ${anchorName} — from chat hearsay, overlap signals, or possessive mentions.`}
        domainFilter="romantic"
        variant="romantic"
        onOpenCharacterBook={openPeripheralInBook}
        onUpdate={onUpdate}
      />
    </div>
  );
}
