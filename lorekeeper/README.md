# LoreKeeper Timeline

A minimal, drift-proof timeline system that keeps every life event as an immutable atomic object. Events are stored in year-sharded JSON files managed by `TimelineManager` and accessed via a lightweight agent interface.

## Layout

```
/lorekeeper/
  event_schema.py
  timeline_manager.py
  agent_timeline_interface.py
  persona/               # Omega Persona Engine (state, rules, templates)
  timeline/                # Year-sharded JSON files live here
  test_timeline.py
```

## Omega Persona Engine

The persona package anchors the user-facing AI voice in identity, seasonal arcs, and emotional trajectories. It layers on top of
the IdentityEngine and SeasonEngine to compute a `PersonaState` with motifs, tone guidance, and behavioral biases.

- `persona_engine.py` exposes `OmegaPersonaEngine`, which derives persona versions, motifs, behavioral slopes, and a narrative description.
- `persona_state.py` defines the persisted persona snapshot structure.
- `persona_rules.py` turns persona state into deterministic guidance for tone, language, and goal alignment.
- `templates/` includes markdown/JSON stubs for persona description, motifs, and voice defaults.

Use it alongside onboarding, saga, season, and chat flows to keep replies aligned to the user's current identity arc.

## Event Schema

Events are immutable dataclass instances defined in [`event_schema.py`](event_schema.py):

```python
from lorekeeper.event_schema import TimelineEvent

TimelineEvent(
    date="2025-02-14",
    title="Earned BJJ Blue Belt",
    type="milestone",
    details="Promoted by Master Felipe Fogolin at Triunfo.",
    tags=["bjj", "martial_arts", "belt"],
    source="user_entry",
    archived=False,
)
```

- `id` is auto-generated (UUID) and never reused.
- `archived` marks superseded items but nothing is deleted.

## Managing the Timeline

Use `TimelineManager` to append-only manage year shards stored under `timeline/`.

```python
from lorekeeper.timeline_manager import TimelineManager
from lorekeeper.event_schema import TimelineEvent

manager = TimelineManager()
manager.add_event(
    TimelineEvent(
        date="2025-02-14",
        title="Earned BJJ Blue Belt",
        type="milestone",
        details="Promoted by Master Felipe Fogolin at Triunfo.",
        tags=["bjj", "martial_arts", "belt"],
        source="user_entry",
    )
)

# Retrieve
recent = manager.get_events(start_date="2025-01-01", end_date="2025-12-31", tags=["martial_arts"])

# Archive and correct
archived = manager.archive_event("some-id")
manager.correct_event("some-id", corrected_event)
```

Key behaviors:
- **Add**: append only; shard by year derived from the event's `date`.
- **Load**: initializes missing year files as empty lists.
- **Filter**: by year, tags, date range, and archive state.
- **Archive**: sets `archived=True` without deleting the record.
- **Correct**: archives the original and adds a new event with `source="correction"`.

## Agent Interface

[`agent_timeline_interface.py`](agent_timeline_interface.py) provides helper methods for agent workflows:
- `load_timeline_context()`: returns the newest events (default 20) for prompt context.
- `add_event_from_text(text, ...)`: converts free text into a structured event and appends it.
- `correct_event_from_text(event_id, text, ...)`: archives the target and writes a corrected entry.
- `verify_facts(query, tags=None)`: surfaces authoritative matches to answer questions without guessing.

## Testing

Run the included end-to-end tests:

```
python -m lorekeeper.test_timeline
```

## Guidelines to Prevent Drift

- Always append new events; never overwrite existing records.
- Archive before correcting so history is never lost.
- Use descriptive tags (e.g., `robotics`, `career`, `martial_arts`, `relationships`) to improve retrieval.
- Keep `source` set to `"user_entry"`, `"system"`, or `"correction"` for traceability.

## Future Extensions

- Migrate storage to SQLite for stronger consistency guarantees.
- Add a UI dashboard with filters for date, category, and tags.
- Provide timeline visualizations and story threads.
- Integrate with personal APIs and LoreKeeper's memory agent for synchronized updates.
