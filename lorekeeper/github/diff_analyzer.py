from __future__ import annotations

from typing import Iterable


def estimate_change_size(files_changed: Iterable[str], additions: int = 0, deletions: int = 0) -> int:
    """Rudimentary significance score based on file touchpoints and diff size."""

    file_bonus = sum(2 for name in files_changed if name.endswith(('.py', '.ts', '.tsx', '.rs')))
    churn = int((additions + deletions) / 50)
    return max(1, file_bonus + churn)
