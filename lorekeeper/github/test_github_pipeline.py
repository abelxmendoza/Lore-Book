from lorekeeper.github.classifier import GithubEvent, classify_event
from lorekeeper.github.classifier import GithubEvent, classify_event
from lorekeeper.github.milestone_detector import IngestedEvent, detect_milestones
from lorekeeper.github.summarizer import summarize_milestones

def test_classifier_labels_documentation():
    event = GithubEvent(type="commit", message="Update README", files=["README.md"])
    assert classify_event(event) == "DOCUMENTATION"


def test_milestone_detection_prefers_breakthrough():
    events = [
        IngestedEvent(type="commit", message="Breakthrough: new engine", files=["src/engine/core.ts"], additions=200)
    ]
    milestones = detect_milestones(events)
    assert milestones and milestones[0].significance >= 5


def test_summarizer_returns_top_entry():
    events = [
        {
            "type": "commit",
            "message": "Implement MemoryFabric v1",
            "files": ["src/core/memory.ts"],
            "additions": 120,
        }
    ]
    result = summarize_milestones(events)
    assert result and result[0].title
