import datetime as dt
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.append(str(ROOT))

from lorekeeper.external.adapters import (
    normalize_calendar,
    normalize_github,
    normalize_instagram,
    normalize_photos,
    normalize_x,
)
from lorekeeper.external.classifiers import detect_milestone
from lorekeeper.external.filters import filter_noise
from lorekeeper.external.hub import ExternalHub
from lorekeeper.external.schemas import ExternalEvent
from lorekeeper.external.summarizer import summarize_milestones


def test_filter_noise_removes_empty_text():
    events = [
        ExternalEvent(source="instagram", timestamp="2024-01-01", type="post", text=""),
        ExternalEvent(source="instagram", timestamp="2024-01-01", type="post", text=" Hello "),
        ExternalEvent(source="instagram", timestamp="2024-01-01", type="milestone"),
    ]

    filtered = filter_noise(events)
    assert len(filtered) == 2
    assert all(evt.type in {"milestone", "post"} for evt in filtered)


def test_detect_milestone_keywords():
    event = ExternalEvent(source="x", timestamp="2024-01-01", type="post", text="We shipped v1.0!")
    assert detect_milestone(event) == "ship"


def test_external_hub_pipeline_summarizes():
    now = dt.datetime.utcnow().isoformat()
    normalized = [
        ExternalEvent(source="github", timestamp=now, type="commit", text="fix typo"),
        ExternalEvent(source="github", timestamp=now, type="milestone", text="Release candidate"),
    ]

    hub = ExternalHub()
    summaries = hub.run(normalized)

    assert len(summaries) == 1
    assert summaries[0].summary.startswith("github milestone")
    assert summaries[0].text == "Release candidate"


def test_adapters_normalize_sources():
    github_events = normalize_github({
        "commits": [{"message": "Add feature", "timestamp": "2024-01-01T00:00:00Z"}],
        "milestones": [{"title": "v1", "closed_at": "2024-01-02T00:00:00Z"}],
    })
    instagram_events = normalize_instagram({"items": [{"timestamp": "2024-01-03T00:00:00Z", "media_type": "story", "caption": "hello"}]})
    x_events = normalize_x({"posts": [{"created_at": "2024-01-04T00:00:00Z", "text": "tweet"}]})
    calendar_events = normalize_calendar({"events": [{"start": "2024-01-05T00:00:00Z", "title": "Meeting"}]})
    photo_events = normalize_photos({"photos": [{"captured_at": "2024-01-06T00:00:00Z", "location": "Paris"}]})

    assert len(github_events) == 2
    assert instagram_events[0].tags == []
    assert x_events[0].source == "x"
    assert calendar_events[0].tags == ["meeting"]
    assert photo_events[0].tags[0] == "photo"


def test_summarizer_preserves_fields():
    event = ExternalEvent(
        source="calendar",
        timestamp="2024-02-02T00:00:00Z",
        type="event",
        text="Planning meeting",
        tags=["meeting"],
        characters=["alice"],
        milestone="meeting",
    )

    summary = summarize_milestones([event])[0]
    assert summary.characters == ["alice"]
    assert "Planning" in summary.summary
