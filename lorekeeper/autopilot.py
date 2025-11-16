"""Entry point module for `python -m lorekeeper.autopilot`."""
from .autopilot_cli import run_cli


def main() -> None:  # pragma: no cover - thin wrapper
    run_cli()


if __name__ == "__main__":  # pragma: no cover
    main()
