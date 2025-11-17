import unittest

from lorekeeper.orchestrator import LoreOrchestrator


class TestOrchestrator(unittest.TestCase):
    def test_summary(self):
        orchestrator = LoreOrchestrator("demo")
        summary = orchestrator.get_summary()
        self.assertIn("identity", summary.identity)
        self.assertIsNotNone(summary.persona)


if __name__ == "__main__":
    unittest.main()
