from datetime import datetime

from lorekeeper.hqi_engine import HQIEngine, MemoryEdge, MemoryFabric, MemoryNode


class DummyIndex:
    def __init__(self, fabric: MemoryFabric):
        self.fabric = fabric

    def search(self, embedding, k: int = 10):
        scores = []
        for node in self.fabric.nodes.values():
            scores.append((node.id, sum(a * b for a, b in zip(node.embedding, embedding))))
        scores.sort(key=lambda item: item[1], reverse=True)
        return scores[:k]


def build_engine() -> tuple[HQIEngine, MemoryFabric]:
    fabric = MemoryFabric()
    base_time = datetime(2024, 1, 1)
    nodes = [
        MemoryNode(
            id="robotics",
            embedding=[1.0, 0.0, 0.0],
            timestamp=base_time,
            data={"tags": ["robotics", "lab"], "characters": ["Kai"], "motifs": ["momentum"]},
        ),
        MemoryNode(
            id="art",
            embedding=[0.2, 1.0, 0.0],
            timestamp=base_time.replace(month=2),
            data={"tags": ["art"], "characters": ["Ivy"], "motifs": ["color"]},
        ),
        MemoryNode(
            id="identity",
            embedding=[0.6, 0.0, 0.4],
            timestamp=base_time.replace(month=3),
            type="identity_node",
            data={"tags": ["identity"], "characters": ["Kai"], "motifs": ["self"]},
        ),
    ]
    for node in nodes:
        fabric.add_node(node)

    fabric.add_edge(MemoryEdge(source="robotics", target="identity", edge_type="character"))
    fabric.add_edge(MemoryEdge(source="identity", target="art", edge_type="interest"))
    fabric.add_edge(MemoryEdge(source="art", target="robotics", edge_type="inspiration"))

    index = DummyIndex(fabric)
    return HQIEngine(fabric, index), fabric


def test_vector_similarity_ranks_by_dot_product():
    engine, _ = build_engine()
    query = [1.0, 0.0, 0.0]

    results = engine.search(query, k=2)

    assert results[0].node_id == "robotics"
    assert "semantic" in results[0].reasons


def test_timeline_and_metadata_filters():
    engine, _ = build_engine()
    query = [1.0, 0.0, 0.0]

    results = engine.search(
        query,
        filters={
            "time_start": datetime(2024, 1, 1),
            "time_end": datetime(2024, 1, 31),
            "tags": ["robotics"],
            "characters": ["Kai"],
        },
        k=5,
    )

    assert [result.node_id for result in results] == ["robotics"]


def test_graph_and_motif_boosts_raise_scores():
    engine, fabric = build_engine()
    query = [0.6, 0.3, 0.1]

    base_results = engine._semantic_search(query, k=3)
    robotics_score = next(r.score for r in base_results if r.node_id == "robotics")
    art_score = next(r.score for r in base_results if r.node_id == "art")
    assert robotics_score > art_score  # baseline ordering

    boosted = engine.search(query, filters={"motifs": ["color"]}, k=3)
    order = [result.node_id for result in boosted]
    assert order.index("art") < order.index("robotics")
    art_result = next(result for result in boosted if result.node_id == "art")
    assert any(reason.startswith("edge:") for reason in art_result.reasons)
    assert "motif" in art_result.reasons


def test_identity_nodes_receive_bonus():
    engine, _ = build_engine()
    query = [0.4, 0.0, 0.6]

    results = engine.search(query, k=3)

    assert results[0].node_id == "identity"
    assert "identity" in results[0].reasons


def test_reason_traces_are_preserved_through_filters():
    engine, _ = build_engine()
    query = [1.0, 0.0, 0.0]

    results = engine.search(query, filters={"tags": ["robotics"]}, k=1)
    assert results[0].reasons[0] == "semantic"
    assert any(reason.startswith("edge:") for reason in results[0].reasons)
