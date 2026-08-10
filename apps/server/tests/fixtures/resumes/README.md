# Reference resume fixtures

Fully fictional golden reference resumes (Jordan Vega, no real person) used
to validate resume parsing and career lore population — structured the same
way real resumes are (overlapping jobs, employment gaps, projects,
certifications, education) without containing anyone's real identity.

| File | Role target |
|------|-------------|
| `fictional-robotics-2026.pdf` / `.txt` | Robotics & embedded systems |
| `fictional-amazon-fat.txt` | Failure analysis / electronics test |

Text extracts power deterministic heuristic parser tests without calling
OpenAI. The PDF is a minimal hand-built file (no PDF library dependency)
containing the same fictional text, used only to exercise PDF text
extraction.

Do not add real resumes, real names, or real employer names to this
directory — see the founder-privacy check in the root pre-commit hook.
