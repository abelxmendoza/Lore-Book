"""Hypergraph Quantum Index (HQI) engine.

This module provides a small, dependency-light implementation of the HQI
ranking logic. It blends semantic similarity, metadata filters, and simple
hypergraph boosts into a single ranked list.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from math import sqrt
from typing import Any, Dict, Iterable, List, Optional, Sequence


@dataclass
class MemoryNode:
    """Minimal node representation for MemoryFabric compatibility."""

    id: str
    embedding: List[float]
    timestamp: Optional[datetime] = None
    type: str = "memory"
    data: Dict[str, Any] = field(default_factory=dict)


@dataclass
class MemoryEdge:
    """Lightweight edge representation used for boosting and context."""

    source: str
    target: str
    edge_type: str


class MemoryFabric:
    """Tiny in-memory hypergraph to support HQIEngine tests and demos."""

    def __init__(self) -> None:
        self.nodes: Dict[str, MemoryNode] = {}
        self.edges: Dict[str, List[MemoryEdge]] = {}

    def add_node(self, node: MemoryNode) -> None:
        self.nodes[node.id] = node

    def add_edge(self, edge: MemoryEdge) -> None:
        self.edges.setdefault(edge.source, []).append(edge)

    def get_node(self, node_id: str) -> Optional[MemoryNode]:
        return self.nodes.get(node_id)

    def neighbors(self, node_id: str) -> Iterable[MemoryNode]:
        for edge in self.edges.get(node_id, []):
            neighbor = self.nodes.get(edge.target)
            if neighbor:
                yield neighbor


@dataclass
class HQIResult:
    node_id: str
    score: float
    reasons: List[str]


class HQIEngine:
    """
    Hypergraph Quantum Index:
    Combines:
      - graph edges (from MemoryFabric)
      - embeddings (vector similarity)
      - timeline ranges
      - tags, characters, tasks, motifs
    into a unified ranked output.
    """

    def __init__(self, fabric: MemoryFabric, embeddings_index: Any):
        """
        fabric: MemoryFabric instance
        embeddings_index: vector index for similarity search
        """
        self.fabric = fabric
        self.embeddings = embeddings_index

    # -------------------------------
    #  Core Search API
    # -------------------------------
    def search(self, query_embedding: Sequence[float], filters: Optional[Dict[str, Any]] = None, k: int = 20) -> List[HQIResult]:
        """
        Unified search:
          1. semantic similarity (vectors)
          2. graph context (neighbor boosts)
          3. timeline filter
          4. tag/character/topic filters
        """

        filters = filters or {}

        # 1) semantic similarity
        semantic_hits = self._semantic_search(query_embedding, k)

        # 2) apply timeline + tag filters
        filtered = self._apply_filters(semantic_hits, filters)

        # 3) graph boost (hypergraph reasoning)
        scored = self._apply_graph_boosts(filtered, filters)

        # 4) return ranked
        scored.sort(key=lambda x: x.score, reverse=True)
        return scored[:k]

    # -------------------------------
    # 1. Semantic Search
    # -------------------------------
    def _semantic_search(self, embedding: Sequence[float], k: int) -> List[HQIResult]:
        # Prefer the embeddings index if it supports search
        if hasattr(self.embeddings, "search"):
            hits = self.embeddings.search(embedding, k=k * 3)
            results = [HQIResult(node_id=node_id, score=float(score), reasons=["semantic"]) for node_id, score in hits]
            results.sort(key=lambda r: r.score, reverse=True)
            return results

        # Basic vector dot product search over fabric nodes
        results: List[HQIResult] = []
        for node in self.fabric.nodes.values():
            sim = float(_dot_product(node.embedding, embedding))
            results.append(HQIResult(node_id=node.id, score=sim, reasons=["semantic"]))
        results.sort(key=lambda r: r.score, reverse=True)
        return results[: k * 3]  # take extra for post-filtering

    # -------------------------------
    # 2. Filters (timeline, tags, characters)
    # -------------------------------
    def _apply_filters(self, results: List[HQIResult], filters: Dict[str, Any]) -> List[HQIResult]:
        out: List[HQIResult] = []
        for result in results:
            node = self.fabric.get_node(result.node_id)
            if not node:
                continue

            ok = True

            # timeline range filter
            if "time_start" in filters and node.timestamp:
                if node.timestamp < filters["time_start"]:
                    ok = False

            if "time_end" in filters and node.timestamp:
                if node.timestamp > filters["time_end"]:
                    ok = False

            # tag filter
            if "tags" in filters:
                node_tags = node.data.get("tags", [])
                if not any(tag in node_tags for tag in filters["tags"]):
                    ok = False

            # character filter
            if "characters" in filters:
                node_chars = node.data.get("characters", [])
                if not any(character in node_chars for character in filters["characters"]):
                    ok = False

            if ok:
                out.append(result)

        return out

    # -------------------------------
    # 3. Hypergraph Boosting
    # -------------------------------
    def _apply_graph_boosts(self, results: List[HQIResult], filters: Dict[str, Any]) -> List[HQIResult]:
        out: List[HQIResult] = []
        for result in results:
            node_id = result.node_id
            node = self.fabric.get_node(node_id)
            if not node:
                continue
            reasons = list(result.reasons)
            score = result.score

            # graph neighbors → boost
            neighbors = self.fabric.edges.get(node_id, [])
            for edge in neighbors:
                score += 0.05  # tiny bump per relevant connection
                reasons.append(f"edge:{edge.edge_type}")

            # tag/theme/motif boost
            if "motifs" in filters:
                motifs = node.data.get("motifs", [])
                if any(motif in motifs for motif in filters["motifs"]):
                    score += 0.2
                    reasons.append("motif")

            # identity boost
            if node.type == "identity_node":
                score += 0.3
                reasons.append("identity")

            out.append(HQIResult(node_id=node_id, score=score, reasons=reasons))

        return out


def _dot_product(left: Sequence[float], right: Sequence[float]) -> float:
    return sum(a * b for a, b in zip(left, right))


def _normalize(vec: List[float]) -> List[float]:
    norm = sqrt(sum(component * component for component in vec))
    if norm == 0:
        return vec
    return [component / norm for component in vec]


def embed_text_to_unit_vector(text: str, dimensions: int = 5) -> List[float]:
    """Deterministic, tiny embedding helper for CLI demos and tests."""

    vec = [0.0 for _ in range(dimensions)]
    for index, token in enumerate(text.lower().split()):
        vec[index % dimensions] += (hash(token) % 100) / 100.0
    return _normalize(vec)


__all__ = [
    "HQIEngine",
    "HQIResult",
    "MemoryFabric",
    "MemoryEdge",
    "MemoryNode",
    "embed_text_to_unit_vector",
]
