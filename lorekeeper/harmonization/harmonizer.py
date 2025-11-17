from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Sequence


@dataclass
class SmartHighlight:
    title: str
    summary: str
    reason: str
    timestamp: str


class Harmonizer:
    def run(self, timeline: Iterable[Dict[str, Any]], identities: Dict[str, Any], arcs: Any, continuity: Dict[str, Any]) -> Dict[str, Any]:
        timeline_list = list(timeline)
        return {
            "highlights": self.highlights(timeline_list),
            "clusters": self.cluster(timeline_list),
            "identityHints": self.identity_hints(identities),
            "stability": continuity.get("stability", 1.0),
        }

    def highlights(self, timeline: Iterable[Dict[str, Any]]) -> List[SmartHighlight]:
        important = [entry for entry in timeline if entry.get("impact") == "high"]
        if not important and timeline:
            sorted_by_recency = sorted(timeline, key=lambda item: item.get("timestamp", ""), reverse=True)
            important = [sorted_by_recency[0]]
        return [
            SmartHighlight(
                title=entry.get("title", "Untitled"),
                summary=entry.get("summary", ""),
                reason="high-impact",
                timestamp=entry.get("timestamp", ""),
            )
            for entry in important
        ]

    def cluster(self, timeline: Iterable[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
        clusters: Dict[str, List[Dict[str, Any]]] = {}
        for entry in timeline:
            tags = entry.get("tags", []) or ["untagged"]
            for tag in tags:
                clusters.setdefault(tag, []).append(entry)
        return clusters

    def identity_hints(self, identities: Dict[str, Any]) -> List[Any]:
        motifs = identities.get("active_motifs", [])
        if motifs:
            return motifs
        energy = identities.get("energy", [])
        if isinstance(energy, Sequence) and not isinstance(energy, (str, bytes)):
            return list(energy)
        return []
