"""B+ tree implementation tailored for timeline indexing.

The tree is optimized for ordered inserts and efficient range queries over
ISO-8601 date strings. Leaves hold the full payload allowing iteration without
additional lookups.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Generic, Iterable, List, Optional, Tuple, TypeVar
import bisect

K = TypeVar("K")
V = TypeVar("V")


@dataclass
class _BPlusNode(Generic[K, V]):
    keys: List[K] = field(default_factory=list)
    children: List["_BPlusNode[K, V] | List[V]"] = field(default_factory=list)
    leaf: bool = True
    next: Optional["_BPlusNode[K, V]"] = None

    def split(self) -> Tuple[K, "_BPlusNode[K, V]"]:
        mid_index = len(self.keys) // 2
        if self.leaf:
            split_key = self.keys[mid_index]
            new_node = _BPlusNode(
                keys=self.keys[mid_index:],
                children=self.children[mid_index:],
                leaf=True,
                next=self.next,
            )
            self.keys = self.keys[:mid_index]
            self.children = self.children[:mid_index]
            self.next = new_node
            return split_key, new_node

        split_key = self.keys[mid_index]
        new_node = _BPlusNode(
            keys=self.keys[mid_index + 1 :],
            children=self.children[mid_index + 1 :],
            leaf=False,
            next=self.next,
        )
        self.keys = self.keys[: mid_index + 1]
        self.children = self.children[: mid_index + 1]
        return split_key, new_node


class BPlusTree(Generic[K, V]):
    """Lightweight B+ tree for ordered inserts and slicing."""

    def __init__(self, order: int = 16) -> None:
        if order < 3:
            raise ValueError("B+ tree order must be at least 3")
        self.order = order
        self.root: _BPlusNode[K, V] = _BPlusNode()

    # ------------------------------------------------------------------
    # Insertion helpers
    # ------------------------------------------------------------------
    def _insert_into_leaf(self, node: _BPlusNode[K, V], key: K, value: V) -> None:
        index = bisect.bisect_left(node.keys, key)
        if index < len(node.keys) and node.keys[index] == key:
            # existing key: append to payload bucket
            bucket = node.children[index]  # type: ignore[assignment]
            assert isinstance(bucket, list)
            bucket.append(value)
        else:
            node.keys.insert(index, key)
            node.children.insert(index, [value])

    def _insert(self, node: _BPlusNode[K, V], key: K, value: V) -> Optional[Tuple[K, _BPlusNode[K, V]]]:
        if node.leaf:
            self._insert_into_leaf(node, key, value)
        else:
            child_index = bisect.bisect_right(node.keys, key) - 1
            child_index = max(child_index, 0)
            child = node.children[child_index]
            assert isinstance(child, _BPlusNode)
            result = self._insert(child, key, value)
            if result:
                split_key, new_child = result
                insert_pos = bisect.bisect_right(node.keys, split_key)
                node.keys.insert(insert_pos, split_key)
                node.children.insert(insert_pos + 1, new_child)
        if len(node.keys) >= self.order:
            return node.split()
        return None

    def insert(self, key: K, value: V) -> None:
        """Insert a single key/value pair into the tree."""

        result = self._insert(self.root, key, value)
        if result:
            split_key, new_child = result
            new_root = _BPlusNode[K, V](
                keys=[split_key], children=[self.root, new_child], leaf=False
            )
            self.root = new_root

    # ------------------------------------------------------------------
    # Queries
    # ------------------------------------------------------------------
    def _find_leaf(self, key: K) -> _BPlusNode[K, V]:
        node = self.root
        while not node.leaf:
            index = bisect.bisect_right(node.keys, key) - 1
            index = max(index, 0)
            child = node.children[index]
            assert isinstance(child, _BPlusNode)
            node = child
        return node

    def search(self, key: K) -> List[V]:
        leaf = self._find_leaf(key)
        idx = bisect.bisect_left(leaf.keys, key)
        if idx < len(leaf.keys) and leaf.keys[idx] == key:
            payload = leaf.children[idx]
            assert isinstance(payload, list)
            return list(payload)
        return []

    def range_query(self, start: Optional[K] = None, end: Optional[K] = None) -> List[V]:
        """Return all values with keys between start and end inclusive."""

        if start is None:
            node = self.root
            while not node.leaf:
                child = node.children[0]
                assert isinstance(child, _BPlusNode)
                node = child
        else:
            node = self._find_leaf(start)

        results: List[V] = []
        while node:
            for key, payload in zip(node.keys, node.children):
                if start is not None and key < start:
                    continue
                if end is not None and key > end:
                    return results
                assert isinstance(payload, list)
                results.extend(payload)
            node = node.next
        return results

    def prefix_query(self, prefix: str) -> List[V]:
        """Return all values whose keys start with the given prefix."""

        if not isinstance(prefix, str):
            return []
        start = prefix
        end = prefix + "\uffff"
        return self.range_query(start, end)

    def __iter__(self) -> Iterable[V]:
        node = self.root
        while not node.leaf:
            child = node.children[0]
            assert isinstance(child, _BPlusNode)
            node = child
        while node:
            for payload in node.children:
                assert isinstance(payload, list)
                for value in payload:
                    yield value
            node = node.next
