from __future__ import annotations

from lorekeeper.agents.agent_manager import AgentManager, DriftAgent, MetadataAgent, NarrativeAgent, default_agents


def test_agent_registration_and_listing():
    manager = AgentManager(default_agents())
    listed = manager.list_agents()

    assert len(listed) == len(default_agents())
    assert any(agent["name"] == DriftAgent.name for agent in listed)
    assert all(item["last_run"] is None for item in listed)


def test_agent_execution_and_logging():
    manager = AgentManager([DriftAgent(), MetadataAgent()])

    drift_result = manager.run_agent("drift_repair")
    assert drift_result["status"] == "ok"
    assert "fixed_issues" in drift_result

    all_results = manager.run_all()
    assert set(all_results.keys()) == {"drift_repair", "metadata_enrichment"}
    assert len(manager.logs) == 3  # individual run + run_all for both agents

    listed = manager.list_agents()
    for agent in listed:
        assert agent["last_run"] is not None
        assert agent["last_status"] == "ok"
        assert isinstance(agent["last_output"], dict)


def test_specific_agent_outputs():
    manager = AgentManager([NarrativeAgent()])
    result = manager.run_agent("narrative_completion")

    assert result["status"] == "ok"
    assert "completed_segments" in result
    assert "notes" in result
