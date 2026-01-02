"""InsightEngine extracts patterns, correlations, motifs, and predictions.

This module intentionally uses lightweight embeddings and clustering instead of
heavy training loops so it can run quickly inside agent workflows.
"""
from __future__ import annotations

import json
import math
import statistics
import sys
from collections import Counter, defaultdict
from datetime import datetime
from typing import Any, Dict, Iterable, List, Sequence, Tuple

from .insights_types import (
    CorrelationInsight,
    CyclicBehaviorInsight,
    IdentityShiftInsight,
    MotifInsight,
    PatternInsight,
    PredictionInsight,
)


def _safe_date(value: str) -> datetime:
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except Exception:
        return datetime.utcnow()


class InsightEngine:
    def __init__(self) -> None:
        self.timeline: List[Dict[str, Any]] = []
        self.arcs: List[Dict[str, Any]] = []
        self.identity: List[Dict[str, Any]] = []
        self.tasks: List[Dict[str, Any]] = []
        self.characters: List[Dict[str, Any]] = []
        self.locations: List[Dict[str, Any]] = []

    def load_inputs(
        self,
        timeline: Sequence[Dict[str, Any]] | None = None,
        arcs: Sequence[Dict[str, Any]] | None = None,
        identity: Sequence[Dict[str, Any]] | None = None,
        tasks: Sequence[Dict[str, Any]] | None = None,
        characters: Sequence[Dict[str, Any]] | None = None,
        locations: Sequence[Dict[str, Any]] | None = None,
    ) -> None:
        self.timeline = list(timeline or [])
        self.arcs = list(arcs or [])
        self.identity = list(identity or [])
        self.tasks = list(tasks or [])
        self.characters = list(characters or [])
        self.locations = list(locations or [])

    # Embeddings -----------------------------------------------------------
    @staticmethod
    def _tokenize(text: str) -> List[str]:
        tokens = []
        current = []
        for ch in text:
            if ch.isalnum():
                current.append(ch.lower())
            else:
                if current:
                    tokens.append("".join(current))
                    current = []
        if current:
            tokens.append("".join(current))
        return tokens

    def _build_vocabulary(self, texts: Iterable[str]) -> List[str]:
        vocab: Counter[str] = Counter()
        for text in texts:
            vocab.update(self._tokenize(text))
        return [word for word, count in vocab.items() if count > 1]

    def _vectorize(self, text: str, vocabulary: List[str]) -> List[float]:
        token_counts = Counter(self._tokenize(text))
        total = sum(token_counts.values()) or 1
        return [token_counts.get(word, 0) / total for word in vocabulary]

    @staticmethod
    def _cosine(a: Sequence[float], b: Sequence[float]) -> float:
        dot = sum(x * y for x, y in zip(a, b))
        norm_a = math.sqrt(sum(x * x for x in a)) or 1
        norm_b = math.sqrt(sum(y * y for y in b)) or 1
        return dot / (norm_a * norm_b)

    def _kmeans(self, vectors: List[List[float]], k: int) -> Dict[int, List[int]]:
        if k <= 1 or len(vectors) <= 1:
            return {0: list(range(len(vectors)))}

        centroids = vectors[:k]
        assignments: Dict[int, List[int]] = {i: [] for i in range(k)}
        for _ in range(4):  # few fast iterations
            assignments = {i: [] for i in range(k)}
            for idx, vector in enumerate(vectors):
                sims = [self._cosine(vector, centroid) for centroid in centroids]
                best = sims.index(max(sims))
                assignments[best].append(idx)

            new_centroids = []
            for cluster_idx in range(k):
                members = assignments.get(cluster_idx, [])
                if not members:
                    new_centroids.append(centroids[cluster_idx])
                    continue
                centroid = [0.0] * len(vectors[0])
                for member_idx in members:
                    for dim, value in enumerate(vectors[member_idx]):
                        centroid[dim] += value
                new_centroids.append([v / len(members) for v in centroid])
            centroids = new_centroids

        return {c: idxs for c, idxs in assignments.items() if idxs}

    # Detection -----------------------------------------------------------
    def detect_patterns(self) -> List[PatternInsight]:
        if not self.timeline:
            return []

        texts = [
            f"{item.get('title','')} {item.get('details','')} {' '.join(item.get('tags', []))}"
            for item in self.timeline
        ]
        vocabulary = self._build_vocabulary(texts)
        vectors = [self._vectorize(text, vocabulary) for text in texts]
        clusters = self._kmeans(vectors, k=min(3, len(vectors)))

        insights: List[PatternInsight] = []
        for cluster_id, member_indices in clusters.items():
            if not member_indices:
                continue
            centroid = [
                sum(vectors[idx][dim] for idx in member_indices) / len(member_indices)
                for dim in range(len(vocabulary))
            ]
            cohesion = statistics.fmean(
                self._cosine(vectors[idx], centroid) for idx in member_indices
            )
            top_terms = [term for term, score in sorted(
                ((vocabulary[dim], centroid[dim]) for dim in range(len(vocabulary))),
                key=lambda pair: pair[1],
                reverse=True,
            ) if score > 0][:4]
            evidence = [self.timeline[idx].get("title", "") for idx in member_indices][:6]
            description = (
                f"Cluster {cluster_id + 1} centers around {', '.join(top_terms) or 'recurring themes'}."
            )
            suggestion = "Lean into the strongest cluster by logging more detail and tags."
            insights.append(
                PatternInsight(
                    confidence=min(1.0, cohesion),
                    evidence=evidence,
                    description=description,
                    action_suggestion=suggestion,
                    pattern=", ".join(top_terms) or "emerging theme",
                    metadata={"cluster_size": len(member_indices)},
                )
            )
        return insights

    def detect_correlations(self) -> List[CorrelationInsight]:
        co_counts: Dict[Tuple[str, str], int] = defaultdict(int)
        tag_counts: Counter[str] = Counter()
        for item in self.timeline:
            tags = [tag.lower() for tag in item.get("tags", [])]
            for tag in tags:
                tag_counts[tag] += 1
            for i, tag_a in enumerate(tags):
                for tag_b in tags[i + 1 :]:
                    pair = tuple(sorted((tag_a, tag_b)))
                    co_counts[pair] += 1

        correlations: List[CorrelationInsight] = []
        for (tag_a, tag_b), count in co_counts.items():
            support = count / max(tag_counts[tag_a], 1)
            if count >= 2 and support >= 0.2:
                description = f"{tag_a} often appears with {tag_b} (co-occurred {count}×)."
                variables = [tag_a, tag_b]
                evidence = [f"{tag_a} ↔ {tag_b}"]
                correlations.append(
                    CorrelationInsight(
                        confidence=min(1.0, support + count * 0.05),
                        evidence=evidence,
                        description=description,
                        action_suggestion="Capture why these tags pair up to strengthen retrieval.",
                        variables=variables,
                        metadata={"count": count},
                    )
                )

        if self.characters and self.timeline:
            character_mentions = Counter()
            for entry in self.timeline:
                content = f"{entry.get('title','')} {entry.get('details','')}`".lower()
                for character in self.characters:
                    name = character.get("name", "").lower()
                    if name and name in content:
                        character_mentions[name] += 1
            for name, count in character_mentions.items():
                if count >= 2:
                    correlations.append(
                        CorrelationInsight(
                            confidence=min(1.0, 0.4 + 0.1 * count),
                            evidence=[f"{name} mentioned {count}×"],
                            description=f"{name.title()} shows up across multiple entries.",
                            action_suggestion="Track relationships or arcs involving this character.",
                            variables=[name, "presence"],
                        )
                    )

        return correlations

    def detect_cycles(self) -> List[CyclicBehaviorInsight]:
        if len(self.timeline) < 3:
            return []
        weekday_counts = Counter()
        month_counts = Counter()
        for item in self.timeline:
            dt = _safe_date(item.get("date", ""))
            weekday_counts[dt.weekday()] += 1
            month_counts[dt.month] += 1

        dominant_weekday, weekday_hits = weekday_counts.most_common(1)[0]
        dominant_month, month_hits = month_counts.most_common(1)[0]

        insights: List[CyclicBehaviorInsight] = []
        if weekday_hits >= max(2, len(self.timeline) // 3):
            insights.append(
                CyclicBehaviorInsight(
                    confidence=min(1.0, weekday_hits / len(self.timeline) + 0.2),
                    evidence=[f"{weekday_hits} entries on weekday {dominant_weekday}"],
                    description="Entries peak on a specific weekday, signaling a weekly rhythm.",
                    action_suggestion="Schedule check-ins on that day to leverage the habit.",
                    period="weekly",
                )
            )

        if month_hits >= 3:
            insights.append(
                CyclicBehaviorInsight(
                    confidence=min(1.0, month_hits / len(self.timeline) + 0.1),
                    evidence=[f"{month_hits} entries in month {dominant_month}"],
                    description="This month repeatedly shows spikes in activity.",
                    action_suggestion="Plan milestones around that seasonal energy.",
                    period="seasonal",
                )
            )

        return insights

    def detect_motifs(self) -> List[MotifInsight]:
        if not self.timeline:
            return []
        token_counts: Counter[str] = Counter()
        for item in self.timeline:
            text = f"{item.get('title','')} {item.get('details','')} {' '.join(item.get('tags', []))}"
            token_counts.update(self._tokenize(text))
        motifs = [motif for motif, count in token_counts.items() if count >= 3]
        insights: List[MotifInsight] = []
        for motif in motifs[:5]:
            insights.append(
                MotifInsight(
                    confidence=min(1.0, 0.3 + 0.05 * token_counts[motif]),
                    evidence=[f"{motif} appears {token_counts[motif]}×"],
                    description=f"Motif '{motif}' threads through many entries.",
                    action_suggestion="Collect representative stories for this motif to build a vignette.",
                    motif=motif,
                )
            )
        return insights

    def detect_identity_shifts(self) -> List[IdentityShiftInsight]:
        if len(self.identity) < 2:
            return []
        shifts: List[IdentityShiftInsight] = []
        sorted_identity = sorted(self.identity, key=lambda item: item.get("date", ""))
        for previous, current in zip(sorted_identity, sorted_identity[1:]):
            prev_traits = set(map(str.lower, previous.get("traits", [])))
            current_traits = set(map(str.lower, current.get("traits", [])))
            gained = current_traits - prev_traits
            lost = prev_traits - current_traits
            if gained or lost:
                description = "Identity markers evolved: "
                details = []
                if gained:
                    details.append(f"gained {', '.join(sorted(gained))}")
                if lost:
                    details.append(f"less emphasis on {', '.join(sorted(lost))}")
                description += "; ".join(details)
                shifts.append(
                    IdentityShiftInsight(
                        confidence=0.6 + 0.1 * len(gained | lost),
                        evidence=[f"{previous.get('date')} → {current.get('date')}"] ,
                        description=description,
                        action_suggestion="Reflect on why these traits shifted and what they unlock.",
                        shift=description,
                    )
                )
        return shifts

    def predict_future_arcs(self) -> List[PredictionInsight]:
        if not self.timeline:
            return []
        tags_by_month: Dict[str, Counter[str]] = defaultdict(Counter)
        for item in self.timeline:
            dt = _safe_date(item.get("date", ""))
            month_key = f"{dt.year}-{dt.month:02d}"
            for tag in item.get("tags", []):
                tags_by_month[month_key][tag.lower()] += 1

        if len(tags_by_month) < 2:
            return []

        months_sorted = sorted(tags_by_month.items(), key=lambda pair: pair[0])
        recent_months = months_sorted[-2:]
        trend_candidates: List[Tuple[str, float]] = []
        for tag, current_count in recent_months[-1][1].items():
            previous_count = recent_months[-2][1].get(tag, 0)
            if current_count > previous_count:
                trend_candidates.append((tag, current_count - previous_count))

        predictions: List[PredictionInsight] = []
        for tag, momentum in sorted(trend_candidates, key=lambda pair: pair[1], reverse=True)[:3]:
            predictions.append(
                PredictionInsight(
                    confidence=min(1.0, 0.5 + 0.1 * momentum),
                    evidence=[f"{tag} is rising with Δ{momentum}"],
                    description=f"{tag.title()} is gaining momentum and may define the next arc.",
                    action_suggestion="Plan supporting tasks or milestones around this tag.",
                    horizon="next-month",
                )
            )
        return predictions

    # Rendering -----------------------------------------------------------
    def build_insight_objects(self) -> Dict[str, List[Dict[str, Any]]]:
        return {
            "patterns": [insight.to_dict() for insight in self.detect_patterns()],
            "correlations": [insight.to_dict() for insight in self.detect_correlations()],
            "cycles": [insight.to_dict() for insight in self.detect_cycles()],
            "motifs": [insight.to_dict() for insight in self.detect_motifs()],
            "identity_shifts": [insight.to_dict() for insight in self.detect_identity_shifts()],
            "predictions": [insight.to_dict() for insight in self.predict_future_arcs()],
        }

    def render_markdown(self) -> str:
        insights = self.build_insight_objects()
        lines = ["# Insight Engine Report"]
        for section, items in insights.items():
            lines.append(f"\n## {section.replace('_', ' ').title()}")
            if not items:
                lines.append("- No signals yet.")
                continue
            for item in items:
                lines.append(f"- **{item.get('description','Insight')}** (confidence: {item.get('confidence', 0):.2f})")
                if item.get("action_suggestion"):
                    lines.append(f"  - Action: {item['action_suggestion']}")
                if item.get("evidence"):
                    lines.append(f"  - Evidence: {', '.join(item['evidence'])}")
        return "\n".join(lines)

    def render_json(self) -> str:
        return json.dumps(self.build_insight_objects(), ensure_ascii=False, indent=2)

    def render_console(self) -> str:
        insights = self.build_insight_objects()
        parts = []
        for section, items in insights.items():
            parts.append(section.upper())
            if not items:
                parts.append("  (no signals)")
            for item in items:
                parts.append(f"- {item.get('description','')}")
        return "\n".join(parts)


def _main() -> int:
    if sys.stdin.isatty():
        return 0
    raw = sys.stdin.read().strip()
    if not raw:
        return 0
    payload = json.loads(raw)
    engine = InsightEngine()
    engine.load_inputs(
        timeline=payload.get("timeline"),
        arcs=payload.get("arcs"),
        identity=payload.get("identity"),
        tasks=payload.get("tasks"),
        characters=payload.get("characters"),
        locations=payload.get("locations"),
    )
    sys.stdout.write(engine.render_json())
    return 0


if __name__ == "__main__":
    sys.exit(_main())
