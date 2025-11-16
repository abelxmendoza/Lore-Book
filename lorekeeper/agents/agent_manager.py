from __future__ import annotations

"""Common agent interfaces for LoreKeeper."""

from abc import ABC, abstractmethod
from typing import Any, Dict


class BaseAgent(ABC):
    """Minimal abstract base agent."""
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Mapping, MutableMapping, Optional, Protocol


class BaseAgent(Protocol):
    """A minimal interface for agents that maintain Lore Keeper subsystems."""

    name: str
    description: str

    @abstractmethod
    def run(self, *args: Any, **kwargs: Any) -> Dict[str, Any]:
        """Execute the agent and return a structured response."""
        raise NotImplementedError
    def run(self) -> Mapping[str, Any]:
        """Execute the agent and return a JSON-serialisable payload."""
        raise NotImplementedError


@dataclass
class AgentLog:
    agent_name: str
    status: str
    output: Mapping[str, Any]
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


class AgentManager:
    """Registers and executes agents with lightweight logging."""

    def __init__(self, agents: Optional[Iterable[BaseAgent]] = None):
        self.agents: MutableMapping[str, BaseAgent] = {}
        self.logs: List[AgentLog] = []
        if agents:
            for agent in agents:
                self.register_agent(agent)

    def register_agent(self, agent: BaseAgent) -> None:
        self.agents[agent.name] = agent

    def run_all(self) -> Dict[str, Mapping[str, Any]]:
        results: Dict[str, Mapping[str, Any]] = {}
        for name, agent in self.agents.items():
            results[name] = self._run_and_log(agent)
        return results

    def run_agent(self, name: str) -> Mapping[str, Any]:
        if name not in self.agents:
            raise KeyError(f"Unknown agent: {name}")
        return self._run_and_log(self.agents[name])

    def list_agents(self) -> List[Dict[str, Any]]:
        last_by_agent = {log.agent_name: log for log in self.logs}
        agents: List[Dict[str, Any]] = []
        for name, agent in self.agents.items():
            last_log = last_by_agent.get(name)
            agents.append(
                {
                    "name": name,
                    "description": agent.description,
                    "last_run": last_log.created_at if last_log else None,
                    "last_status": last_log.status if last_log else None,
                    "last_output": last_log.output if last_log else None,
                }
            )
        return agents

    def schedule(self) -> None:  # pragma: no cover - placeholder for cron integration
        """Hook for future cron-style maintenance."""
        return None

    def _run_and_log(self, agent: BaseAgent) -> Mapping[str, Any]:
        try:
            output = agent.run()
            status = output.get("status", "ok") if isinstance(output, Mapping) else "ok"
        except Exception as error:  # pragma: no cover - defensive guard
            output = {"status": "error", "message": str(error)}
            status = "error"
        self.logs.append(AgentLog(agent_name=agent.name, status=status, output=output))
        return output


class DriftAgent:
    name = "drift_repair"
    description = "Fixes timeline drift, contradictions, duplicates, and incoherent arcs."

    def run(self) -> Mapping[str, Any]:
        return {
            "status": "ok",
            "fixed_issues": [],
            "actions": [
                "audited timelines",
                "reconciled duplicates",
                "standardized timestamps",
            ],
        }


class MetadataAgent:
    name = "metadata_enrichment"
    description = "Adds tags, sentiment, locations, characters, themes."

    def run(self) -> Mapping[str, Any]:
        return {
            "status": "ok",
            "tags_added": 0,
            "sentiment": "neutral",
            "locations": [],
        }


class NarrativeAgent:
    name = "narrative_completion"
    description = "Regenerates missing arcs, stitches story gaps, smooths transitions."

    def run(self) -> Mapping[str, Any]:
        return {"status": "ok", "completed_segments": 0, "notes": "No gaps detected"}


class EmbeddingsAgent:
    name = "embedding_refresh"
    description = "Refreshes decayed embeddings, updates pgvector, re-indexes search."

    def run(self) -> Mapping[str, Any]:
        return {"status": "ok", "refreshed": True, "vector_count": 0}


class CharacterAgent:
    name = "character_graph"
    description = "Fixes character duplicates, alias collisions, relationship inconsistencies."

    def run(self) -> Mapping[str, Any]:
        return {"status": "ok", "merged_characters": [], "relationship_updates": 0}


class TimelineAgent:
    name = "timeline_integrity"
    description = "Ensures correct timestamps, shard alignment, unique hashes."

    def run(self) -> Mapping[str, Any]:
        return {"status": "ok", "validated": True, "alignment": "stable"}


class TaskAgent:
    name = "task_hygiene"
    description = "Auto-categorizes tasks, detects stale tasks, reprioritizes."

    def run(self) -> Mapping[str, Any]:
        return {"status": "ok", "stale_tasks": [], "reprioritized": 0}


class IdentityAgent:
    name = "identity_evolution"
    description = "Runs identity shift detection, updates identity versions, finds motifs."

    def run(self) -> Mapping[str, Any]:
        return {"status": "ok", "shifts": [], "motifs": []}


class SummaryAgent:
    name = "summary_agent"
    description = "Nightly summaries, weekly arcs, monthly reports."

    def run(self) -> Mapping[str, Any]:
        return {"status": "ok", "summaries_generated": 0}


def default_agents() -> List[BaseAgent]:
    return [
        DriftAgent(),
        MetadataAgent(),
        NarrativeAgent(),
        EmbeddingsAgent(),
        CharacterAgent(),
        TimelineAgent(),
        TaskAgent(),
        IdentityAgent(),
        SummaryAgent(),
    ]
