"""State graph construction from navigation links."""

from __future__ import annotations

import re
from typing import TYPE_CHECKING

from .security import is_internal_url
from .types import SemanticRole, State, Transition

if TYPE_CHECKING:
    from .parser import SemanticDOM

INITIAL_STATE_ID = "initial"
_SLUG_UNSAFE_RE = re.compile(r"[^A-Za-z0-9_.~\-]")
_MAX_SLUG_LENGTH = 64


def _slug(href: str) -> str:
    """Readable, output-safe slug for a URL (may collide; callers disambiguate)."""
    text = href.replace("/", "_").replace("#", "h_")
    return _SLUG_UNSAFE_RE.sub("_", text)[:_MAX_SLUG_LENGTH]


def build_state_graph(sdom: SemanticDOM) -> None:
    """Build ``sdom.state_graph``: one state per distinct internal link target.

    Only validated, same-origin hrefs become states. External and
    protocol-relative URLs are skipped, and unsafe schemes never get this far
    because the parser drops them. Two different hrefs never share a state ID:
    when their slugs collide the later one gets a numeric suffix.
    """
    graph = sdom.state_graph
    graph.states.append(
        State(
            id=INITIAL_STATE_ID,
            name="Initial",
            description="Initial page state",
            url_pattern="/",
            is_initial=True,
        )
    )
    graph.initial_state = INITIAL_STATE_ID

    state_by_href: dict[str, str] = {}
    used_ids: set[str] = {INITIAL_STATE_ID}
    next_suffix: dict[str, int] = {}

    for link_id in sdom.interactables:
        node = sdom.index.get(link_id)
        if node is None or node.role != SemanticRole.LINK or not node.href:
            continue
        href = node.href
        if href in state_by_href or not is_internal_url(href):
            continue

        base = f"state_{_slug(href)}"
        state_id = base
        suffix = next_suffix.get(base, 2)
        while state_id in used_ids:
            state_id = f"{base}_{suffix}"
            suffix += 1
        next_suffix[base] = suffix
        used_ids.add(state_id)
        state_by_href[href] = state_id

        graph.states.append(State(id=state_id, name=node.label, url_pattern=href))
        graph.transitions.append(
            Transition(
                from_state=INITIAL_STATE_ID,
                to_state=state_id,
                trigger=link_id,
                action="navigate",
            )
        )
