import unittest

from lorekeeper.memory_fabric import FabricNode, MemoryFabric
from lorekeeper.agents.fabric_agent import FabricAgent


class MemoryFabricTests(unittest.TestCase):
    def setUp(self) -> None:
        self.fabric = MemoryFabric()

    def _add_basic_nodes(self) -> None:
        node_a = FabricNode("a", "event", {"label": "a"}, [1.0, 0.0], 1.0)
        node_b = FabricNode("b", "event", {"label": "b"}, [0.0, 1.0], 2.0)
        self.fabric.add_node(node_a)
        self.fabric.add_node(node_b)

    def test_add_node_tracks_index(self) -> None:
        node = FabricNode("e1", "event", {"title": "T"}, [0.2, 0.8], 123.0)
        self.fabric.add_node(node)
        self.assertIn("e1", self.fabric.nodes)
        self.assertIn("e1", self.fabric.index_by_type["event"])

    def test_add_edge_connects_nodes(self) -> None:
        self._add_basic_nodes()
        self.fabric.add_edge("a", "b", 0.5, "semantic")
        edges = self.fabric.get_edges("a")
        self.assertEqual(len(edges), 1)
        self.assertEqual(edges[0].edge_type, "semantic")

    def test_nearest_neighbors_prefers_high_similarity(self) -> None:
        node_primary = FabricNode("p", "event", {}, [1.0, 0.0], 0.0)
        node_close = FabricNode("c", "event", {}, [0.9, 0.1], 0.0)
        node_far = FabricNode("f", "event", {}, [0.0, 1.0], 0.0)
        for node in (node_primary, node_close, node_far):
            self.fabric.add_node(node)
        neighbors = self.fabric.nearest_neighbors([1.0, 0.0], k=3)
        ordered_ids = [nid for _, nid in neighbors]
        self.assertEqual(ordered_ids[0], "p")
        self.assertEqual(ordered_ids[1], "c")

    def test_bfs_traversal_respects_depth(self) -> None:
        self._add_basic_nodes()
        node_c = FabricNode("c", "event", {}, [0.5, 0.5], 3.0)
        self.fabric.add_node(node_c)
        self.fabric.add_edge("a", "b", 1.0, "semantic")
        self.fabric.add_edge("b", "c", 1.0, "semantic")
        traversal = self.fabric.bfs("a", depth=1)
        self.assertEqual(traversal, ["a", "b"])

    def test_cycle_detection_identifies_loop(self) -> None:
        self._add_basic_nodes()
        self.fabric.add_edge("a", "b", 1.0, "semantic")
        self.fabric.add_edge("b", "a", 1.0, "semantic")
        self.assertTrue(self.fabric.detect_cycles())

    def test_narrative_arc_mapping(self) -> None:
        arc = FabricNode("arc-1", "arc", {}, [0.1, 0.9], None)
        event_1 = FabricNode("event-1", "event", {}, [0.9, 0.1], 1.0)
        event_2 = FabricNode("event-2", "event", {}, [0.8, 0.2], 2.0)
        for node in (arc, event_1, event_2):
            self.fabric.add_node(node)
        self.fabric.add_edge("arc-1", "event-1", 1.0, "narrative")
        self.fabric.add_edge("arc-1", "event-2", 1.0, "narrative")
        self.assertEqual(set(self.fabric.narrative_events("arc-1")), {"event-1", "event-2"})

    def test_character_relationships(self) -> None:
        character = FabricNode("char-1", "character", {}, [0.2, 0.3], None)
        partner = FabricNode("char-2", "character", {}, [0.3, 0.2], None)
        event = FabricNode("evt", "event", {}, [0.5, 0.5], 4.0)
        for node in (character, partner, event):
            self.fabric.add_node(node)
        self.fabric.add_edge("char-1", "evt", 1.0, "character")
        self.fabric.add_edge("char-1", "char-2", 0.8, "character")
        self.assertIn("evt", self.fabric.character_events("char-1"))
        self.assertIn("char-2", self.fabric.neighbors("char-1", edge_type="character"))

    def test_connect_temporal_chain_weights_inverse_time(self) -> None:
        early = FabricNode("early", "event", {}, [1.0, 0.0], 1.0)
        late = FabricNode("late", "event", {}, [0.0, 1.0], 2.0)
        self.fabric.add_node(early)
        self.fabric.add_node(late)
        self.fabric.connect_temporal_chain(["early", "late"])
        edges = self.fabric.get_edges("early", edge_type="temporal")
        self.assertEqual(len(edges), 1)
        self.assertAlmostEqual(edges[0].weight, 1.0, places=6)

    def test_fabric_agent_builds_edges(self) -> None:
        embeddings = lambda text: [len(str(text)), 0.0]
        timeline = [
            {"id": "e1", "content": "First entry", "timestamp": 1.0, "characters": ["c1"]},
            {"id": "e2", "content": "Second entry", "timestamp": 2.0},
        ]
        arcs = [{"id": "a1", "type": "weekly_arc", "events": ["e1", "e2"], "content": "Arc"}]
        characters = [
            {"id": "c1", "name": "Ada", "relationships": [{"target": "c2", "weight": 0.9}]},
            {"id": "c2", "name": "Lin"},
        ]
        tasks = [{"id": "t1", "description": "Do thing", "events": ["e2"]}]
        identity = [{"id": "i1", "events": ["e1"], "name": "Builder"}]

        agent = FabricAgent(
            embeddings_service=embeddings,
            timeline=timeline,
            arcs=arcs,
            characters=characters,
            tasks=tasks,
            insights=[],
            identity=identity,
        )
        result = agent.run()
        fabric: MemoryFabric = result["fabric"]

        self.assertEqual(result["status"], "ok")
        self.assertGreaterEqual(result["edges"], 5)
        self.assertEqual(set(fabric.narrative_events("a1")), {"e1", "e2"})
        self.assertIn("e1", fabric.character_events("c1"))
        self.assertIn("c2", fabric.neighbors("c1", edge_type="character"))
        self.assertTrue(any(edge.edge_type == "temporal" for edge in fabric.get_edges("e1")))


if __name__ == "__main__":
    unittest.main()
