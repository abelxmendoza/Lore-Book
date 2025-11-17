"""Audit trail for continuity decisions."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import List

from .conflicts import ContinuityConflict


@dataclass
class AuditRecord:
    action: str
    detail: str
    confidence: float
    evidence: List[str] = field(default_factory=list)


@dataclass
class ContinuityAudit:
    merges: List[AuditRecord] = field(default_factory=list)
    conflicts: List[ContinuityConflict] = field(default_factory=list)
    suggestions: List[str] = field(default_factory=list)

    def add_merge(self, action: str, detail: str, confidence: float, evidence: List[str] | None = None) -> None:
        self.merges.append(AuditRecord(action=action, detail=detail, confidence=confidence, evidence=evidence or []))

    def add_conflicts(self, conflicts: List[ContinuityConflict]) -> None:
        self.conflicts.extend(conflicts)

    def suggest(self, message: str) -> None:
        self.suggestions.append(message)
