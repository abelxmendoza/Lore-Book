"""Canonical fact representations and extraction helpers."""
from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field
from typing import Any, Dict, Iterable, List, Tuple

from lorekeeper.event_schema import TimelineEvent


@dataclass
class FactSource:
    """Provenance for how a fact was derived."""

    kind: str
    reference: str
    confidence: float = 1.0
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class CanonicalFact:
    """Represents a canonicalized fact in the continuity bible."""

    subject: str
    attribute: str
    value: Any
    confidence: float = 1.0
    sources: List[FactSource] = field(default_factory=list)
    scope: str = "general"
    tags: List[str] = field(default_factory=list)
    permanent: bool = False

    def add_source(self, source: FactSource) -> None:
        self.sources.append(source)


class CanonicalRegistry:
    """Registry for canonical facts keyed by subject + attribute."""

    def __init__(self) -> None:
        self._facts: Dict[Tuple[str, str], CanonicalFact] = {}

    def add_fact(self, fact: CanonicalFact) -> None:
        key = (fact.subject.lower(), fact.attribute.lower())
        if key not in self._facts:
            self._facts[key] = fact
            return

        existing = self._facts[key]
        merged_value, confidence, audit_notes = _merge_fact_values(existing.value, fact.value)
        existing.value = merged_value
        existing.confidence = max(existing.confidence, confidence, fact.confidence)
        existing.tags = sorted(set(existing.tags + fact.tags))
        existing.permanent = existing.permanent or fact.permanent
        existing.scope = existing.scope if existing.scope == "identity" else fact.scope or existing.scope
        existing.sources.extend(fact.sources)
        if audit_notes:
            existing.add_source(
                FactSource(
                    kind="merge", reference=f"merge-{fact.attribute}", confidence=confidence, metadata={"notes": audit_notes}
                )
            )

    def get(self, subject: str, attribute: str) -> CanonicalFact | None:
        return self._facts.get((subject.lower(), attribute.lower()))

    @property
    def facts(self) -> List[CanonicalFact]:
        return list(self._facts.values())

    def summarize(self) -> Dict[str, Any]:
        summary: Dict[str, Any] = {}
        for fact in self._facts.values():
            subject_entry = summary.setdefault(fact.subject, {})
            subject_entry[fact.attribute] = {
                "value": fact.value,
                "confidence": fact.confidence,
                "scope": fact.scope,
                "permanent": fact.permanent,
                "sources": len(fact.sources),
            }
        return summary


def extract_facts_from_events(events: Iterable[TimelineEvent]) -> List[CanonicalFact]:
    """Extract stable facts from timeline events.

    Facts are inferred from structured event metadata. An event contributes a fact when it
    declares a subject, attribute, and value. Identity-level constants are marked by either
    the `scope` metadata key or presence of an `identity` tag.
    """

    facts: List[CanonicalFact] = []
    for event in events:
        meta = event.metadata or {}
        subject = meta.get("subject")
        attribute = meta.get("attribute")
        if not subject or not attribute or "value" not in meta:
            continue

        scope = meta.get("scope") or ("identity" if "identity" in event.tags else "event")
        source = FactSource(
            kind=event.type or "event",
            reference=event.id,
            confidence=float(meta.get("confidence", 1.0)),
            metadata={"date": event.date, "title": event.title, "tags": event.tags},
        )

        facts.append(
            CanonicalFact(
                subject=subject,
                attribute=attribute,
                value=meta["value"],
                confidence=float(meta.get("confidence", 1.0)),
                sources=[source],
                scope=scope,
                permanent=bool(meta.get("permanent", False)),
                tags=event.tags,
            )
        )

        # Treat explicit rules as permanent lore entries
        if meta.get("rule"):
            rule_fact = CanonicalFact(
                subject=subject,
                attribute=f"rule:{attribute}",
                value=meta["rule"],
                confidence=1.0,
                scope="rule",
                permanent=True,
                sources=[source],
                tags=event.tags,
            )
            facts.append(rule_fact)
    return facts


def _merge_fact_values(existing: Any, new_value: Any) -> Tuple[Any, float, str | None]:
    """Heuristic merge that preserves stability while allowing small drift."""

    if isinstance(existing, (int, float)) and isinstance(new_value, (int, float)):
        merged = (existing + new_value) / 2
        return merged, 0.95, "Numerical drift merged via average"

    if isinstance(existing, list) or isinstance(new_value, list):
        existing_list = existing if isinstance(existing, list) else [existing]
        new_list = new_value if isinstance(new_value, list) else [new_value]
        merged_list = sorted(set(existing_list + new_list))
        return merged_list, 0.9, "Tags merged to prevent drift"

    # Prefer the most common value if multiple observations exist
    candidates = [existing, new_value]
    counts = Counter(candidates)
    winner, _ = counts.most_common(1)[0]
    confidence = 1.0 if counts[winner] > 1 else 0.75
    note = "Selected majority value" if counts[winner] > 1 else "No majority; kept latest"
    return winner, confidence, note
