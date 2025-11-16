"""Probabilistic skip list for fast recency queries."""
from __future__ import annotations

import random
from dataclasses import dataclass, field
from typing import Generic, Iterable, Iterator, List, Optional, Tuple, TypeVar

K = TypeVar("K")
V = TypeVar("V")


@dataclass
class _SkipNode(Generic[K, V]):
    key: K
    value: V
    forward: List[Optional["_SkipNode[K, V]"]] = field(default_factory=list)


class SkipList(Generic[K, V]):
    def __init__(self, max_level: int = 8, probability: float = 0.5) -> None:
        self.max_level = max_level
        self.probability = probability
        self.header = _SkipNode[K, V](key=None, value=None, forward=[None] * max_level)  # type: ignore[arg-type]
        self.level = 0
        self.size = 0

    def _random_level(self) -> int:
        lvl = 0
        while random.random() < self.probability and lvl < self.max_level - 1:
            lvl += 1
        return lvl

    def insert(self, key: K, value: V) -> None:
        update: List[_SkipNode[K, V]] = [self.header] * self.max_level
        current = self.header

        for i in reversed(range(self.level + 1)):
            while current.forward[i] and current.forward[i].key < key:
                current = current.forward[i]
            update[i] = current

        current = current.forward[0]
        if current and current.key == key:
            current.value = value
            return

        node_level = self._random_level()
        if node_level > self.level:
            for i in range(self.level + 1, node_level + 1):
                update[i] = self.header
            self.level = node_level

        new_node = _SkipNode(key=key, value=value, forward=[None] * (node_level + 1))
        for i in range(node_level + 1):
            new_node.forward[i] = update[i].forward[i]
            update[i].forward[i] = new_node
        self.size += 1

    def search(self, key: K) -> Optional[V]:
        current = self.header
        for i in reversed(range(self.level + 1)):
            while current.forward[i] and current.forward[i].key < key:
                current = current.forward[i]
        current = current.forward[0]
        if current and current.key == key:
            return current.value
        return None

    def range_query(self, start: Optional[K] = None, end: Optional[K] = None) -> List[V]:
        current = self.header
        if start is not None:
            for i in reversed(range(self.level + 1)):
                while current.forward[i] and current.forward[i].key < start:
                    current = current.forward[i]
            current = current.forward[0]
        else:
            current = current.forward[0]

        results: List[V] = []
        while current:
            if start is not None and current.key < start:
                current = current.forward[0]
                continue
            if end is not None and current.key > end:
                break
            results.append(current.value)
            current = current.forward[0]
        return results

    def __len__(self) -> int:  # pragma: no cover - trivial
        return self.size

    def __iter__(self) -> Iterator[Tuple[K, V]]:
        current = self.header.forward[0]
        while current:
            yield current.key, current.value
            current = current.forward[0]

    def items(self) -> Iterable[Tuple[K, V]]:
        return iter(self)
