from __future__ import annotations

"""Memory Fabric: unified graph + vector lattice for Lore Keeper."""

from collections import defaultdict
import math
from dataclasses import dataclass
from typing import Dict, Iterable, List, Optional, Sequence, Set, Tuple


@dataclass
class FabricNode:
    """A single node within the Memory Fabric graph."""

    id: str
    type: str  # event, character, arc, insight, task, identity_node, etc.
    data: dict  # the raw object
    embedding: Sequence[float]
    timestamp: float | None  # epoch or None for abstract nodes


@dataclass
class FabricEdge:
    """Directed edge connecting two FabricNodes."""

    source: str
    target: str
    weight: float
    edge_type: str  # semantic, temporal, narrative, emotional, identity, tag, character


class MemoryFabric:
    """Lightweight in-memory representation of the Memory Fabric graph."""

    def __init__(self) -> None:
        self.nodes: Dict[str, FabricNode] = {}
        self.edges: defaultdict[str, List[FabricEdge]] = defaultdict(list)
        self.index_by_type: defaultdict[str, List[str]] = defaultdict(list)

    # -------- Node Management --------
    def add_node(self, node: FabricNode) -> None:
        if node.id in self.nodes:
            raise ValueError(f"Node with id {node.id} already exists")
        self.nodes[node.id] = node
        self.index_by_type[node.type].append(node.id)

    def get_node(self, node_id: str) -> Optional[FabricNode]:
        return self.nodes.get(node_id)

    # -------- Edge Management --------
    def add_edge(self, source: str, target: str, weight: float, edge_type: str) -> None:
        if source not in self.nodes:
            raise ValueError(f"Source node {source} not found")
        if target not in self.nodes:
            raise ValueError(f"Target node {target} not found")
        edge = FabricEdge(source, target, weight, edge_type)
        self.edges[source].append(edge)

    def get_edges(self, source: Optional[str] = None, edge_type: Optional[str] = None) -> List[FabricEdge]:
        if source is None:
            all_edges = [edge for edges in self.edges.values() for edge in edges]
        else:
            all_edges = list(self.edges.get(source, []))
        if edge_type:
            return [edge for edge in all_edges if edge.edge_type == edge_type]
        return all_edges

    # -------- Similarity --------
    @staticmethod
    def _cosine_similarity(a: Sequence[float], b: Sequence[float]) -> float:
        a_norm = math.sqrt(sum(x * x for x in a))
        b_norm = math.sqrt(sum(x * x for x in b))
        if a_norm == 0 or b_norm == 0:
            return 0.0
        dot_product = sum(x * y for x, y in zip(a, b))
        return dot_product / (a_norm * b_norm)

    def nearest_neighbors(self, embedding: Sequence[float], k: int = 10) -> List[Tuple[float, str]]:
        items: List[Tuple[float, str]] = []
        for node in self.nodes.values():
            sim = self._cosine_similarity(node.embedding, embedding)
            items.append((sim, node.id))
        items.sort(key=lambda item: item[0], reverse=True)
        return items[:k]

    def build_semantic_edges(self, k: int = 5, min_weight: float = 0.0) -> None:
        """Create semantic edges between similar nodes based on cosine similarity."""

        for node in self.nodes.values():
            neighbors = self.nearest_neighbors(node.embedding, k=k + 1)
            for sim, nid in neighbors:
                if nid == node.id or sim < min_weight:
                    continue
                self.add_edge(node.id, nid, sim, "semantic")

    # -------- Graph Traversal --------
    def bfs(self, start_id: str, depth: int = 3) -> List[str]:
        visited: Set[str] = set()
        queue: List[Tuple[str, int]] = [(start_id, 0)]
        out: List[str] = []

        while queue:
            nid, d = queue.pop(0)
            if d > depth:
                break
            if nid in visited:
                continue
            visited.add(nid)
            out.append(nid)

            for edge in self.edges.get(nid, []):
                queue.append((edge.target, d + 1))

        return out

    def detect_cycles(self) -> bool:
        visited: Set[str] = set()
        stack: Set[str] = set()

        def _visit(node_id: str) -> bool:
            visited.add(node_id)
            stack.add(node_id)
            for edge in self.edges.get(node_id, []):
                if edge.target not in visited:
                    if _visit(edge.target):
                        return True
                elif edge.target in stack:
                    return True
            stack.remove(node_id)
            return False

        for node_id in self.nodes:
            if node_id not in visited:
                if _visit(node_id):
                    return True
        return False

    # -------- Relationships --------
    def neighbors(self, node_id: str, edge_type: Optional[str] = None) -> List[str]:
        edges = self.edges.get(node_id, [])
        if edge_type:
            edges = [edge for edge in edges if edge.edge_type == edge_type]
        return [edge.target for edge in edges]

    def narrative_events(self, arc_id: str) -> List[str]:
        return self.neighbors(arc_id, edge_type="narrative")

    def character_events(self, character_id: str) -> List[str]:
        return self.neighbors(character_id, edge_type="character")

    # -------- Temporal helpers --------
    def connect_temporal_chain(self, ordered_ids: Iterable[str]) -> None:
        """Create temporal edges along an ordered sequence of node ids."""

        ordered_list = list(ordered_ids)
        for current, nxt in zip(ordered_list, ordered_list[1:]):
            current_node = self.get_node(current)
            next_node = self.get_node(nxt)
            if not current_node or not next_node:
                continue
            delta = 1.0
            if current_node.timestamp is not None and next_node.timestamp is not None:
                delta_time = max(next_node.timestamp - current_node.timestamp, 1e-9)
                delta = 1 / delta_time
            self.add_edge(current, nxt, delta, "temporal")

    # -------- Export --------
    def export(self) -> dict:
        return {
            "nodes": [
                {
                    "id": node.id,
                    "type": node.type,
                    "data": node.data,
                    "timestamp": node.timestamp,
                }
                for node in self.nodes.values()
            ],
            "edges": [
                {
                    "source": edge.source,
                    "target": edge.target,
                    "weight": edge.weight,
                    "edge_type": edge.edge_type,
                }
                for edge in self.get_edges()
            ],
        }

    # -------- Fabric Reasoning --------
    def infer_missing_links(self, min_similarity: float = 0.7) -> List[FabricEdge]:
        """Infer semantic links between unconnected but similar nodes."""

        inferred: List[FabricEdge] = []
        for node in self.nodes.values():
            neighbors = self.nearest_neighbors(node.embedding, k=5)
            for sim, nid in neighbors:
                if nid == node.id or sim < min_similarity:
                    continue
                existing = [edge for edge in self.edges.get(node.id, []) if edge.target == nid]
                if existing:
                    continue
                edge = FabricEdge(node.id, nid, sim, "semantic")
                inferred.append(edge)
                self.edges[node.id].append(edge)
        return inferred
