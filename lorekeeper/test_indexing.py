from __future__ import annotations

from datetime import date, timedelta

from .indexing import BPlusTree, SkipList, TagDictionary, CharacterGraph, SemanticCache


def test_bptree_range_and_prefix():
    tree: BPlusTree[str, str] = BPlusTree(order=4)
    events = {
        "2024-01-01": "new year",
        "2024-02-01": "feb start",
        "2024-02-14": "valentine",
        "2024-03-03": "march",
    }
    for key, value in events.items():
        tree.insert(key, value)

    february = tree.range_query("2024-02-01", "2024-02-28")
    assert february == ["feb start", "valentine"]

    prefix = tree.prefix_query("2024-02")
    assert set(prefix) == {"feb start", "valentine"}


def test_skiplist_recency_queries():
    skip: SkipList[str, int] = SkipList(max_level=6)
    base = date(2024, 5, 1)
    for i in range(10):
        day = (base + timedelta(days=i)).isoformat()
        skip.insert(day, i)

    last_week = skip.range_query("2024-05-04", "2024-05-10")
    assert last_week == list(range(3, 10))


def test_tag_dictionary_cooccurrence():
    tags = TagDictionary()
    tags.add("e1", ["bjj", "training"])
    tags.add("e2", ["bjj", "competition"])

    assert tags.get("bjj") == {"e1", "e2"}
    assert tags.cooccurrence("bjj", limit=2)[0][0] in {"training", "competition"}
    related = tags.related_tags(["bjj"], limit=2)
    assert set(related).issuperset({"training", "competition"})


def test_character_graph_centrality_and_paths():
    graph = CharacterGraph()
    graph.add_relationship("Alice", "Bob", strength=0.8, shared_memories=["mission"])
    graph.add_relationship("Bob", "Cara", strength=0.6)
    graph.add_relationship("Alice", "Dana", strength=0.9)

    traversal = graph.dfs("Alice")
    assert set(traversal) == {"Alice", "Bob", "Cara", "Dana"}

    top = graph.top_characters_for_saga(limit=2)
    assert top[0][0] in {"Alice", "Bob"}


def test_semantic_cache_lru_behavior():
    cache = SemanticCache(capacity=2)
    cache.put("a", 1)
    cache.put("b", 2)
    cache.get("a")
    cache.put("c", 3)

    assert "a" in cache
    assert "b" not in cache
