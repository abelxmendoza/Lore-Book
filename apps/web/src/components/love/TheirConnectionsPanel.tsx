// © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.

import { RelationshipPeripheralsPanel } from '../characters/RelationshipPeripheralsPanel';

type TheirConnectionsPanelProps = {
  relationshipId: string;
  anchorName: string;
  onUpdate?: () => void;
};

/** Love & Relationships — romantic periphery tab (wraps shared panel). */
export function TheirConnectionsPanel({
  relationshipId,
  anchorName,
  onUpdate,
}: TheirConnectionsPanelProps) {
  return (
    <RelationshipPeripheralsPanel
      anchorKind="romantic_relationship"
      anchorId={relationshipId}
      anchorName={anchorName}
      title="Their connections"
      description={`Other partners or romantic links attributed to ${anchorName} — from chat hearsay, overlap signals, or possessive mentions.`}
      domainFilter="romantic"
      onUpdate={onUpdate}
    />
  );
}
