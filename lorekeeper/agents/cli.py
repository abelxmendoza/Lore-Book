from __future__ import annotations

import argparse
import json
from typing import Iterable

from .agent_manager import AgentManager, BaseAgent, default_agents


def build_manager(extra_agents: Iterable[BaseAgent] | None = None) -> AgentManager:
    manager = AgentManager(default_agents())
    if extra_agents:
        for agent in extra_agents:
            manager.register_agent(agent)
    return manager


def main() -> None:
    parser = argparse.ArgumentParser(description="Omega Agent Network CLI")
    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("run-all", help="Run the entire maintenance cycle")

    run_parser = subparsers.add_parser("run", help="Run a specific agent by name")
    run_parser.add_argument("name", help="Agent name to execute")

    subparsers.add_parser("status", help="List agents and last run metadata")

    args = parser.parse_args()
    manager = build_manager()

    if args.command == "run-all":
        results = manager.run_all()
        print(json.dumps(results, default=str, indent=2))
    elif args.command == "run":
        result = manager.run_agent(args.name)
        print(json.dumps(result, default=str, indent=2))
    elif args.command == "status":
        print(json.dumps(manager.list_agents(), default=str, indent=2))


if __name__ == "__main__":
    main()
