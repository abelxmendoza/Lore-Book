from __future__ import annotations

import argparse
import json
from datetime import datetime
from typing import Any, Dict, List, Sequence

from .hqi_engine import HQIEngine, MemoryEdge, MemoryFabric, MemoryNode, embed_text_to_unit_vector


class SimpleEmbeddingIndex:
    """Minimal search wrapper used for CLI demos."""

    def __init__(self, fabric: MemoryFabric):
        self.fabric = fabric

    def search(self, query_embedding: Sequence[float], k: int = 10):
        hits = []
        for node in self.fabric.nodes.values():
            score = float(sum(a * b for a, b in zip(node.embedding, query_embedding)))
            hits.append((node.id, score))
        hits.sort(key=lambda item: item[1], reverse=True)
        return hits[:k]


def build_demo_fabric() -> MemoryFabric:
    fabric = MemoryFabric()
    now = datetime.utcnow()
    nodes = [
        MemoryNode(
            id="robotics-1",
            embedding=embed_text_to_unit_vector("robotics breakthrough emotion"),
            timestamp=now,
            data={"tags": ["robotics", "lab"], "characters": ["Kai"], "motifs": ["momentum"]},
        ),
        MemoryNode(
            id="family-1",
            embedding=embed_text_to_unit_vector("family dinner laughter"),
            timestamp=now,
            data={"tags": ["family"], "characters": ["Mom", "Dad"], "motifs": ["togetherness"]},
        ),
        MemoryNode(
            id="identity-kai",
            embedding=embed_text_to_unit_vector("kai identity core"),
            timestamp=now,
            type="identity_node",
            data={"tags": ["identity"], "characters": ["Kai"], "motifs": ["self"]},
        ),
    ]

    for node in nodes:
        fabric.add_node(node)

    fabric.add_edge(MemoryEdge(source="robotics-1", target="identity-kai", edge_type="character"))
    fabric.add_edge(MemoryEdge(source="identity-kai", target="family-1", edge_type="family"))
    return fabric


def parse_filters(args: argparse.Namespace) -> Dict[str, Any]:
    filters: Dict[str, Any] = {}
    if args.time_start:
        filters["time_start"] = datetime.fromisoformat(args.time_start)
    if args.time_end:
        filters["time_end"] = datetime.fromisoformat(args.time_end)
    if args.tags:
        filters["tags"] = args.tags
    if args.characters:
        filters["characters"] = args.characters
    if args.motifs:
        filters["motifs"] = args.motifs
    return filters


def run_search(args: argparse.Namespace) -> None:
    fabric = build_demo_fabric()
    index = SimpleEmbeddingIndex(fabric)
    engine = HQIEngine(fabric, index)

    embedding = embed_text_to_unit_vector(args.query)
    filters = parse_filters(args)
    results = engine.search(embedding, filters=filters, k=args.k)

    payload = [
        {
            "node_id": result.node_id,
            "score": round(result.score, 3),
            "reasons": result.reasons,
        }
        for result in results
    ]
    print(json.dumps(payload, indent=2))


def run_context(args: argparse.Namespace) -> None:
    fabric = build_demo_fabric()
    node = fabric.get_node(args.node_id)
    if not node:
        print(json.dumps({"error": "node not found"}))
        return

    context: Dict[str, Any] = {
        "node_id": node.id,
        "timestamp": node.timestamp.isoformat() if node.timestamp else None,
        "data": node.data,
        "neighbors": [edge.target for edge in fabric.edges.get(node.id, [])],
    }
    print(json.dumps(context, indent=2))


def main(argv: List[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Hypergraph Quantum Index CLI")
    subparsers = parser.add_subparsers(dest="command")

    search_parser = subparsers.add_parser("search", help="Search across HQI")
    search_parser.add_argument("query", help="text to search")
    search_parser.add_argument("-k", type=int, default=5, help="top k results")
    search_parser.add_argument("--time-start")
    search_parser.add_argument("--time-end")
    search_parser.add_argument("--tags", nargs="*")
    search_parser.add_argument("--characters", nargs="*")
    search_parser.add_argument("--motifs", nargs="*")
    search_parser.set_defaults(func=run_search)

    context_parser = subparsers.add_parser("context", help="View node context")
    context_parser.add_argument("node_id", help="node identifier")
    context_parser.set_defaults(func=run_context)

    args = parser.parse_args(argv)
    if not args.command:
        parser.print_help()
        return
    args.func(args)


if __name__ == "__main__":
    main()
