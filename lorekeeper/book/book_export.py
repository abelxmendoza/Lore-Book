"""Export helpers for the BookEngine."""
from __future__ import annotations

import json
from typing import Any

from . import book_templates


def export_book_md(book: dict[str, Any]) -> str:
    return book_templates.render_full_book(book)


def export_book_json(book: dict[str, Any]) -> str:
    return json.dumps(book, indent=2, ensure_ascii=False)


def export_book_epub(book: dict[str, Any]) -> str:
    # Placeholder for epub generation. Returning markdown representation for now.
    return book_templates.render_full_book(book)


def export_book_pdf(book: dict[str, Any]) -> str:
    # Placeholder for pdf generation. Returning snapshot edition for now.
    return book_templates.render_snapshot_edition(book)
