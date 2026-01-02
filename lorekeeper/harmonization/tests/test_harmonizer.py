from lorekeeper.harmonization.harmonizer import Harmonizer


def test_highlights_selects_high_impact():
    timeline = [
        {"title": "Low", "summary": "", "impact": "low", "timestamp": "2023-01-01"},
        {"title": "High", "summary": "", "impact": "high", "timestamp": "2023-01-02"},
    ]
    harmonizer = Harmonizer()

    highlights = harmonizer.highlights(timeline)

    assert len(highlights) == 1
    assert highlights[0].title == "High"


def test_cluster_groups_by_tags_and_fills_missing():
    timeline = [
        {"title": "A", "tags": ["work"]},
        {"title": "B", "tags": []},
        {"title": "C"},
    ]
    harmonizer = Harmonizer()

    clusters = harmonizer.cluster(timeline)

    assert set(clusters.keys()) == {"work", "untagged"}
    assert len(clusters["untagged"]) == 2


def test_identity_hints_prefers_motifs_then_energy():
    harmonizer = Harmonizer()

    motifs_first = harmonizer.identity_hints({"active_motifs": ["focus"]})
    from_energy = harmonizer.identity_hints({"energy": [0.1, 0.2]})
    empty = harmonizer.identity_hints({})

    assert motifs_first == ["focus"]
    assert from_energy == [0.1, 0.2]
    assert empty == []


def test_run_returns_full_payload():
    harmonizer = Harmonizer()
    timeline = [{"title": "Story", "summary": "", "impact": "high", "timestamp": "2023"}]

    payload = harmonizer.run(timeline, {"active_motifs": ["courage"]}, arcs=[], continuity={"stability": 0.5})

    assert set(payload.keys()) == {"highlights", "clusters", "identityHints", "stability"}
    assert payload["identityHints"] == ["courage"]
    assert payload["stability"] == 0.5
