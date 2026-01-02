from lorekeeper.distillers.github import GithubDistiller


def test_github_distiller_builds_summary():
    raw = [
        {
            "id": "1",
            "type": "push",
            "title": "Add integration layer",
            "repo": "demo/repo",
            "summary": "Shipped integration blueprint",
            "created_at": "2024-01-01T00:00:00Z",
        }
    ]

    distilled = GithubDistiller().distill(raw)

    assert len(distilled) == 1
    milestone = distilled[0]
    assert milestone.title == "Add integration layer"
    assert "demo/repo" in milestone.summary
    assert "push" in milestone.summary
    assert "github" in milestone.tags
