from __future__ import annotations

"""Agent that builds and updates the Memory Fabric graph."""

from typing import Any, Callable, Dict, Iterable, List, Mapping, Sequence

from .agent_manager import BaseAgent
from ..memory_fabric import FabricNode, MemoryFabric


class FabricAgent(BaseAgent):
    name = "fabric_builder"
    description = "Builds and updates the Memory Fabric (global life graph)."

    def __init__(
        self,
        embeddings_service: Callable[[str], Sequence[float]],
        timeline: Iterable[Mapping[str, Any]] | None = None,
        arcs: Iterable[Mapping[str, Any]] | None = None,
        characters: Iterable[Mapping[str, Any]] | None = None,
        tasks: Iterable[Mapping[str, Any]] | None = None,
        insights: Iterable[Mapping[str, Any]] | None = None,
        identity: Iterable[Mapping[str, Any]] | None = None,
    ) -> None:
        self.embeddings_service = embeddings_service
        self.timeline = list(timeline or [])
        self.arcs = list(arcs or [])
        self.characters = list(characters or [])
        self.tasks = list(tasks or [])
        self.insights = list(insights or [])
        self.identity = list(identity or [])

    # -------- Helpers --------
    def _embedding_from_item(self, item: Mapping[str, Any]) -> List[float]:
        text = (
            str(item.get("content")
                or item.get("description")
                or item.get("summary")
                or item.get("title")
                or item.get("name")
                or item)
        )
        return [float(value) for value in self.embeddings_service(text)]

    def _add_collection(self, fabric: MemoryFabric, collection: Iterable[Mapping[str, Any]], node_type: str) -> None:
        for item in collection:
            node_id = str(item["id"])
            timestamp = item.get("timestamp") if isinstance(item.get("timestamp"), (int, float)) else None
            node = FabricNode(
                id=node_id,
                type=item.get("type", node_type),
                data=dict(item),
                embedding=self._embedding_from_item(item),
                timestamp=timestamp,
            )
            fabric.add_node(node)

    def _connect_arcs(self, fabric: MemoryFabric) -> None:
        for arc in self.arcs:
            event_ids = arc.get("events") or []
            for event_id in event_ids:
                if event_id in fabric.nodes:
                    fabric.add_edge(arc["id"], event_id, 1.0, "narrative")

    def _connect_characters(self, fabric: MemoryFabric) -> None:
        # character to event links
        for event in self.timeline:
            for character_id in event.get("characters", []):
                if character_id in fabric.nodes and event["id"] in fabric.nodes:
                    fabric.add_edge(character_id, event["id"], 1.0, "character")

        # explicit character relationships
        for character in self.characters:
            for rel in character.get("relationships", []):
                target = rel.get("target")
                if target and target in fabric.nodes:
                    fabric.add_edge(character["id"], target, rel.get("weight", 1.0), "character")

    def _connect_identity(self, fabric: MemoryFabric) -> None:
        for motif in self.identity:
            for event_id in motif.get("events", []):
                if event_id in fabric.nodes:
                    fabric.add_edge(motif["id"], event_id, 1.0, "identity")

    def _connect_tasks(self, fabric: MemoryFabric) -> None:
        for task in self.tasks:
            for event_id in task.get("events", []):
                if event_id in fabric.nodes:
                    fabric.add_edge(task["id"], event_id, 1.0, "task")

    # -------- Run --------
    def run(self) -> Dict[str, Any]:
        fabric = MemoryFabric()

        self._add_collection(fabric, self.timeline, "event")
        self._add_collection(fabric, self.arcs, "arc")
        self._add_collection(fabric, self.characters, "character")
        self._add_collection(fabric, self.tasks, "task")
        self._add_collection(fabric, self.insights, "insight")
        self._add_collection(fabric, self.identity, "identity_node")

        # Semantic edges
        if fabric.nodes:
            fabric.build_semantic_edges(k=5, min_weight=0.1)

        # Temporal edges across events
        ordered_events = sorted(
            [node for node in fabric.nodes.values() if node.type == "event" and node.timestamp is not None],
            key=lambda node: node.timestamp,
        )
        fabric.connect_temporal_chain([node.id for node in ordered_events])

        # Narrative, character, identity, and task edges
        self._connect_arcs(fabric)
        self._connect_characters(fabric)
        self._connect_identity(fabric)
        self._connect_tasks(fabric)

        return {
            "status": "ok",
            "nodes": len(fabric.nodes),
            "edges": len(fabric.get_edges()),
            "fabric": fabric,
        }
