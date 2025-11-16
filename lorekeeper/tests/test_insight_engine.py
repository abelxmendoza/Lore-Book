import json
import unittest

from lorekeeper.insight_engine import InsightEngine


class InsightEngineTests(unittest.TestCase):
    def setUp(self) -> None:
        self.timeline = [
            {
                "date": "2024-01-01",
                "title": "Morning run with Alex",
                "details": "5k loop around the park to train for the marathon",
                "tags": ["health", "running", "habit"],
            },
            {
                "date": "2024-01-08",
                "title": "Another Monday run",
                "details": "Matched the same pace as last week",
                "tags": ["health", "running", "routine"],
            },
            {
                "date": "2024-01-15",
                "title": "Coaching session",
                "details": "Trained Alex on tempo runs and pacing",
                "tags": ["coaching", "running", "training"],
            },
            {
                "date": "2024-02-10",
                "title": "Design sprint complete",
                "details": "Wrapped up a big product design milestone",
                "tags": ["work", "design", "milestone"],
            },
            {
                "date": "2024-02-20",
                "title": "Design review with team",
                "details": "Feedback loop showed strong visual motifs",
                "tags": ["work", "design", "review"],
            },
        ]
        self.identity = [
            {"date": "2024-01-01", "traits": ["runner", "designer"]},
            {"date": "2024-02-01", "traits": ["coach", "designer"]},
        ]

        self.engine = InsightEngine()
        self.engine.load_inputs(
            timeline=self.timeline,
            arcs=[{"title": "Winter Training"}],
            identity=self.identity,
            tasks=[{"title": "Complete sprint"}],
            characters=[{"name": "Alex"}],
            locations=[{"name": "Central Park"}],
        )

    def test_clustering_patterns(self):
        patterns = self.engine.detect_patterns()
        self.assertGreaterEqual(len(patterns), 2)
        self.assertTrue(any("running" in insight.pattern for insight in patterns))

    def test_correlations(self):
        correlations = self.engine.detect_correlations()
        tags = [item.variables for item in correlations]
        flattened = [val for sub in tags for val in sub]
        self.assertIn("running", flattened)
        self.assertTrue(any(insight.confidence > 0.2 for insight in correlations))

    def test_motif_detection(self):
        motifs = self.engine.detect_motifs()
        motif_labels = [m.motif for m in motifs]
        self.assertIn("running", motif_labels)

    def test_cycle_detection(self):
        cycles = self.engine.detect_cycles()
        self.assertTrue(any(c.period == "weekly" for c in cycles))

    def test_identity_shift_detection(self):
        shifts = self.engine.detect_identity_shifts()
        self.assertEqual(len(shifts), 1)
        self.assertIn("coach", shifts[0].description)

    def test_predictions(self):
        predictions = self.engine.predict_future_arcs()
        self.assertGreaterEqual(len(predictions), 1)
        self.assertTrue(any(p.horizon == "next-month" for p in predictions))

    def test_renderers_output(self):
        markdown = self.engine.render_markdown()
        console = self.engine.render_console()
        json_blob = self.engine.render_json()

        self.assertIn("Insight Engine Report", markdown)
        self.assertIn("PATTERNS", console)
        parsed = json.loads(json_blob)
        self.assertIn("patterns", parsed)
        self.assertIsInstance(parsed["patterns"], list)


if __name__ == "__main__":
    unittest.main()
