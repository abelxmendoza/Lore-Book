"""Simple LRU cache for semantic embedding queries."""
from __future__ import annotations

from collections import OrderedDict
from typing import Any


class SemanticCache:
    def __init__(self, capacity: int = 200) -> None:
        self.capacity = capacity
        self._data: OrderedDict[str, Any] = OrderedDict()

    def get(self, key: str) -> Any:
        if key not in self._data:
            return None
        value = self._data.pop(key)
        self._data[key] = value
        return value

    def put(self, key: str, value: Any) -> None:
        if key in self._data:
            self._data.pop(key)
        elif len(self._data) >= self.capacity:
            self._data.popitem(last=False)
        self._data[key] = value

    def __len__(self) -> int:  # pragma: no cover - trivial
        return len(self._data)

    def __contains__(self, key: str) -> bool:  # pragma: no cover - trivial
        return key in self._data
