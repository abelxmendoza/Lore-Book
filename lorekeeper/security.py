"""Security helpers for local timeline operations."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

SAFE_EXTENSIONS = {".json"}


def secure_load_json(path: str | Path, base_dir: Path | None = None) -> Any:
    """Load JSON from a constrained, safe path.

    Ensures the path stays within the allowed base directory and only
    whitelisted extensions are read to prevent arbitrary filesystem access.
    """

    target_path = Path(path).resolve()
    allowed_base = (base_dir or Path(__file__).resolve().parent / "timeline").resolve()

    try:
        target_path.relative_to(allowed_base)
    except ValueError as exc:  # pragma: no cover - guard clause
        raise ValueError("Attempted access outside of allowed timeline directory") from exc

    if target_path.suffix.lower() not in SAFE_EXTENSIONS:
        raise ValueError("Unsupported file type; only JSON is allowed")

    if not target_path.exists():
        target_path.parent.mkdir(parents=True, exist_ok=True)
        target_path.write_text("[]", encoding="utf-8")

    return json.loads(target_path.read_text(encoding="utf-8"))
