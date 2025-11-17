from lorekeeper.distillers.instagram import InstagramDistiller


def test_instagram_distiller_extracts_tags_and_characters():
    raw = [
        {
            "id": "ig-1",
            "caption": "Beach day with friends",
            "media_type": "STORY",
            "tagged_users": ["alex", "jordan"],
            "location": "Laguna",
            "timestamp": "2024-02-02T12:00:00Z",
        }
    ]

    distilled = InstagramDistiller().distill(raw)

    assert len(distilled) == 1
    memory = distilled[0]
    assert "Beach day" in memory["summary"]
    assert "story" in memory["tags"]
    assert memory["location"] == "Laguna"
    assert set(memory["characters"]) == {"alex", "jordan"}
