"""Bidirectional character relationship graph."""
from __future__ import annotations

from collections import defaultdict
from typing import Dict, Iterable, List, Optional, Set, Tuple


class CharacterGraph:
    def __init__(self) -> None:
        self.graph: Dict[str, Dict[str, dict]] = defaultdict(dict)

    def add_character(self, character: str) -> None:
        self.graph.setdefault(character, {})

    def add_relationship(
        self,
        a: str,
        b: str,
        strength: float = 1.0,
        shared_memories: Optional[List[str]] = None,
        season_interactions: Optional[List[str]] = None,
    ) -> None:
        shared_memories = shared_memories or []
        season_interactions = season_interactions or []
        self.add_character(a)
        self.add_character(b)
        payload = {
            "strength": strength,
            "shared_memories": shared_memories,
            "season_interactions": season_interactions,
        }
        self.graph[a][b] = payload
        self.graph[b][a] = payload

    def neighbors(self, character: str) -> Dict[str, dict]:
        return self.graph.get(character, {})

    def dfs(self, start: str) -> List[str]:
        visited: Set[str] = set()
        order: List[str] = []
        stack = [start]
        while stack:
            node = stack.pop()
            if node in visited:
                continue
            visited.add(node)
            order.append(node)
            stack.extend([neighbor for neighbor in self.graph.get(node, {}) if neighbor not in visited])
        return order

    def degree_centrality(self) -> Dict[str, float]:
        total = max(len(self.graph) - 1, 1)
        return {node: len(edges) / total for node, edges in self.graph.items()}

    def top_characters_for_saga(self, limit: int = 5) -> List[Tuple[str, float]]:
        centrality = self.degree_centrality()
        return sorted(centrality.items(), key=lambda item: item[1], reverse=True)[:limit]

    def relationship_strength(self, a: str, b: str) -> float:
        return float(self.graph.get(a, {}).get(b, {}).get("strength", 0.0))

    def shared_context(self, a: str, b: str) -> List[str]:
        return list(self.graph.get(a, {}).get(b, {}).get("shared_memories", []))
