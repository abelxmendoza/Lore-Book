"""Merge strategies for smoothing drift between facts."""
from __future__ import annotations

from collections import Counter
from typing import Iterable, List, Tuple


def merge_numerical_drift(values: Iterable[float]) -> Tuple[float, float, List[str]]:
    values_list = list(values)
    if not values_list:
        return 0.0, 0.0, ["No values provided"]
    average = sum(values_list) / len(values_list)
    spread = max(values_list) - min(values_list) if len(values_list) > 1 else 0
    confidence = max(0.5, 1.0 - (spread / (abs(average) + 1e-6)) * 0.5)
    return average, confidence, [f"Merged {len(values_list)} observations; spread={spread:.2f}"]


def merge_tag_drift(tag_sets: Iterable[List[str]]) -> Tuple[List[str], float, List[str]]:
    merged: List[str] = []
    for tags in tag_sets:
        merged.extend(tags)
    canonical = sorted(set(t.lower() for t in merged))
    return canonical, 0.9, ["Combined tags to preserve coverage"]


def merge_name_drift(names: Iterable[str]) -> Tuple[str, float, List[str]]:
    names_list = [n.strip() for n in names if n.strip()]
    if not names_list:
        return "", 0.0, ["No names provided"]
    normalized = [n.lower() for n in names_list]
    counts = Counter(normalized)
    canonical, freq = counts.most_common(1)[0]
    confidence = 0.7 + (freq / max(1, len(names_list))) * 0.3
    return canonical.title(), confidence, ["Selected most frequent name variant"]


def merge_motif_drift(motifs: Iterable[str]) -> Tuple[List[str], float, List[str]]:
    motif_counts = Counter(motifs)
    canonical = [m for m, count in motif_counts.most_common() if count > 1]
    confidence = 0.85 if canonical else 0.6
    if not canonical:
        canonical = list(motif_counts.keys())[:3]
    return canonical, confidence, ["Motifs merged based on recurrence"]


def merge_relationship_drift(edges: Iterable[Tuple[str, str]]) -> Tuple[List[Tuple[str, str]], float, List[str]]:
    edge_counts = Counter(edges)
    merged_edges = [edge for edge, count in edge_counts.items() if count > 1]
    if not merged_edges:
        merged_edges = list(edge_counts.keys())
    confidence = 0.8 if merged_edges else 0.5
    return merged_edges, confidence, ["Relationship edges reconciled"]


def merge_repeated_fragment(fragments: Iterable[str]) -> Tuple[str, float, List[str]]:
    fragments_list = [f for f in fragments if f]
    if not fragments_list:
        return "", 0.0, ["No fragments provided"]
    richest = max(fragments_list, key=lambda f: len(f))
    confidence = min(1.0, len(richest) / (max(len(f) for f in fragments_list) + 1e-6))
    return richest, confidence, ["Kept most detailed fragment"]


def merge_location_fuzzy_match(locations: Iterable[str]) -> Tuple[str, float, List[str]]:
    locations_list = [loc.strip() for loc in locations if loc.strip()]
    if not locations_list:
        return "", 0.0, ["No locations provided"]
    normalized = [loc.lower() for loc in locations_list]
    counts = Counter(normalized)
    canonical, freq = counts.most_common(1)[0]
    confidence = 0.65 + 0.35 * (freq / len(locations_list))
    return canonical.title(), confidence, ["Resolved fuzzy location via frequency"]
