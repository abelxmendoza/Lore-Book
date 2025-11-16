"""Templates for rendering book content."""
from __future__ import annotations

from typing import Any


def render_full_book(book: dict[str, Any]) -> str:
    metadata = book.get("metadata", {})
    toc = book.get("table_of_contents", [])
    chapters = book.get("chapters", [])
    characters = book.get("character_compendium", [])
    locations = book.get("location_index", [])
    turning_points = book.get("turning_points", [])
    prompts = book.get("visual_prompts", [])

    lines: list[str] = []
    lines.append(f"# {metadata.get('title', 'LoreKeeper Autobiography')}")
    subtitle = metadata.get("subtitle")
    if subtitle:
        lines.append(f"## {subtitle}")
    if metadata.get("preface"):
        lines.append("\n---\n### Preface\n" + metadata["preface"])

    lines.append("\n## Table of Contents")
    for entry in toc:
        lines.append(f"- Chapter {entry.get('number')}: {entry.get('title')}")
        for sub in entry.get("subchapters", []):
            lines.append(f"  - {sub}")

    lines.append("\n---\n## Chapters")
    for chapter in chapters:
        lines.append(f"### {chapter.get('title', 'Chapter')}\n")
        if chapter.get("hook"):
            lines.append(f"Hook: {chapter['hook']}")
        if chapter.get("conflicts"):
            lines.append("Conflicts: " + ", ".join(chapter.get("conflicts", [])))
        if chapter.get("themes"):
            lines.append("Themes: " + ", ".join(chapter.get("themes", [])))
        if chapter.get("identity_transitions"):
            lines.append("Identity Transitions: " + "; ".join(map(str, chapter.get("identity_transitions", []))))
        for season in chapter.get("season_breakdowns", []):
            lines.append(f"- {season.get('label')}: {season.get('summary', '')}")
            for sub in season.get("subchapters", []):
                if isinstance(sub, dict):
                    lines.append(f"  - {sub.get('label', sub.get('month', 'subchapter'))}: {sub.get('summary', '')}")
                else:
                    lines.append(f"  - {sub}")

    lines.append("\n---\n## Character Compendium")
    for character in characters:
        lines.append(f"- **{character.get('name')}**: {character.get('bio', '')}")
        if character.get("significance"):
            lines.append(f"  Significance: {character['significance']}")
        if character.get("first_appearance"):
            lines.append(f"  First appearance: {character['first_appearance']}")
        if character.get("last_appearance"):
            lines.append(f"  Last appearance: {character['last_appearance']}")

    lines.append("\n---\n## Locations")
    for location in locations:
        lines.append(
            f"- {location.get('name')} (first seen {location.get('first_seen')}, last seen {location.get('last_seen')})"
        )

    lines.append("\n---\n## Turning Points")
    for tp in turning_points:
        lines.append(f"- {tp.get('type').title() if tp.get('type') else 'Turning Points'}: {len(tp.get('entries', []))} entries")

    lines.append("\n---\n## Illustration Prompts")
    for prompt in prompts:
        lines.append(f"- {prompt.get('chapter')}: {prompt.get('identity_metamorphosis')}")

    closing = book.get("closing_reflections")
    if closing:
        lines.append("\n---\n## Closing Reflections")
        if closing.get("summary"):
            lines.append(closing["summary"])
        if closing.get("gratitude"):
            lines.append(closing["gratitude"])

    return "\n".join(lines)


def render_snapshot_edition(book: dict[str, Any]) -> str:
    metadata = book.get("metadata", {})
    chapters = book.get("chapters", [])

    lines = [f"# {metadata.get('title', 'LoreKeeper Snapshot')}"]
    if metadata.get("subtitle"):
        lines.append(f"## {metadata['subtitle']}")

    lines.append("\n## Snapshot")
    for chapter in chapters:
        label = chapter.get("title", "Chapter")
        hook = chapter.get("hook", "")
        themes = ", ".join(chapter.get("themes", []))
        lines.append(f"- {label}: {hook} (Themes: {themes})")

    lines.append("\n## Turning Points")
    for tp in book.get("turning_points", []):
        lines.append(f"- {tp.get('type', 'type')}: {len(tp.get('entries', []))} entries")

    return "\n".join(lines)
