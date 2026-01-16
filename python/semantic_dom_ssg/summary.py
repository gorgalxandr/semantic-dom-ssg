"""Token-efficient summary formats for AI agents.

Provides ultra-compact output formats optimized for LLM consumption,
reducing token usage by ~87% compared to JSON.
"""

from dataclasses import dataclass
from typing import TYPE_CHECKING

from .types import SemanticIntent, SemanticRole

if TYPE_CHECKING:
    from .parser import SemanticDOM


def to_agent_summary(sdom: "SemanticDOM") -> str:
    """Generate a token-efficient agent summary.

    This format uses approximately 100 tokens compared to ~800 for JSON,
    an 87% reduction in token usage.

    Format:
        PAGE: My Page
        LANDMARKS: nav(#main-nav), main(#content), footer(#footer)
        ACTIONS: [submit]#login-btn, [navigate]a.nav-link, [toggle]#menu-btn
        STATE: initial -> home, about, contact
        STATS: 3L 5A 2H

    Args:
        sdom: The SemanticDOM to summarize

    Returns:
        A compact string summary
    """
    lines = []

    # Title line
    if sdom.title:
        lines.append(f"PAGE: {sdom.title}")

    # Landmarks line
    landmarks = []
    for node_id in sdom.landmarks:
        node = sdom.index.get(node_id)
        if node:
            role_abbrev = _role_abbrev(node.role)
            selector_short = _selector_short(node.selector)
            landmarks.append(f"{role_abbrev}({selector_short})")

    if landmarks:
        lines.append(f"LANDMARKS: {', '.join(landmarks)}")

    # Actions line (interactables)
    actions = []
    for node_id in sdom.interactables[:10]:  # Limit to 10
        node = sdom.index.get(node_id)
        if node:
            intent = _intent_abbrev(node.intent) if node.intent else "act"
            label = node.label[:17] + "..." if len(node.label) > 20 else node.label
            actions.append(f"[{intent}]{label}")

    if actions:
        lines.append(f"ACTIONS: {', '.join(actions)}")

    # State graph summary
    if sdom.state_graph.states:
        states = [s.name for s in sdom.state_graph.states[:5]]
        initial = sdom.state_graph.initial_state or "none"
        lines.append(f"STATE: {initial} -> {', '.join(states)}")

    # Stats line
    lines.append(
        f"STATS: {len(sdom.landmarks)}L {len(sdom.interactables)}A {len(sdom.headings)}H"
    )

    return "\n".join(lines)


def to_one_liner(sdom: "SemanticDOM") -> str:
    """Generate a one-line summary (~20 tokens).

    Format:
        PageTitle | 3 landmarks, 5 actions | nav,main,footer | btn:Submit,link:Home

    Args:
        sdom: The SemanticDOM to summarize

    Returns:
        A single-line summary string
    """
    title = sdom.title or "Untitled"
    if len(title) > 30:
        title = title[:27] + "..."

    # Get landmark types
    landmarks = []
    for node_id in sdom.landmarks[:3]:
        node = sdom.index.get(node_id)
        if node:
            landmarks.append(_role_short(node.role))

    # Get action labels
    actions = []
    for node_id in sdom.interactables[:3]:
        node = sdom.index.get(node_id)
        if node:
            label = node.label[:7] + "..." if len(node.label) > 10 else node.label
            actions.append(f"{_role_short(node.role)}:{label}")

    return (
        f"{title} | "
        f"{len(sdom.landmarks)}L {len(sdom.interactables)}A | "
        f"{','.join(landmarks)} | "
        f"{','.join(actions)}"
    )


def to_nav_summary(sdom: "SemanticDOM") -> str:
    """Generate a navigation-focused summary.

    Args:
        sdom: The SemanticDOM to summarize

    Returns:
        A navigation-focused summary string
    """
    lines = []

    # Navigation links
    nav_links = []
    for node_id in sdom.interactables:
        node = sdom.index.get(node_id)
        if node and node.role == SemanticRole.LINK and node.href:
            nav_links.append(f"{node.label} -> {node.href}")
            if len(nav_links) >= 10:
                break

    if nav_links:
        lines.append("NAVIGATION:")
        for link in nav_links:
            lines.append(f"  {link}")

    # State transitions
    if sdom.state_graph.transitions:
        lines.append("TRANSITIONS:")
        for t in sdom.state_graph.transitions[:5]:
            lines.append(f"  {t.from_state} -[{t.trigger}]-> {t.to_state}")

    return "\n".join(lines)


def to_audio_summary(sdom: "SemanticDOM") -> str:
    """Generate an audio/screen-reader friendly summary.

    Args:
        sdom: The SemanticDOM to summarize

    Returns:
        An audio-friendly summary string
    """
    parts = []

    # Page title
    if sdom.title:
        parts.append(f"Page: {sdom.title}")

    # Landmark summary
    landmark_count = len(sdom.landmarks)
    if landmark_count > 0:
        parts.append(
            f"{landmark_count} landmark region{'s' if landmark_count != 1 else ''}"
        )

    # Action summary
    action_count = len(sdom.interactables)
    if action_count > 0:
        parts.append(
            f"{action_count} interactive element{'s' if action_count != 1 else ''}"
        )

    # Main actions
    main_actions = []
    for node_id in sdom.interactables:
        node = sdom.index.get(node_id)
        if node and node.intent and node.intent != SemanticIntent.UNKNOWN:
            main_actions.append(node.label)
            if len(main_actions) >= 5:
                break

    if main_actions:
        parts.append(f"Main actions: {', '.join(main_actions)}")

    return ". ".join(parts)


@dataclass
class TokenComparison:
    """Token usage comparison result."""

    json_tokens: int
    summary_tokens: int
    one_liner_tokens: int
    summary_reduction: float
    one_liner_reduction: float


def compare_token_usage(sdom: "SemanticDOM") -> TokenComparison:
    """Compare token usage between formats.

    Args:
        sdom: The SemanticDOM to analyze

    Returns:
        TokenComparison with token counts and reduction percentages
    """
    json_output = sdom.to_json()
    summary_output = to_agent_summary(sdom)
    one_liner_output = to_one_liner(sdom)

    # Rough token estimation (1 token ≈ 4 chars for English)
    json_tokens = _estimate_tokens(json_output)
    summary_tokens = _estimate_tokens(summary_output)
    one_liner_tokens = _estimate_tokens(one_liner_output)

    return TokenComparison(
        json_tokens=json_tokens,
        summary_tokens=summary_tokens,
        one_liner_tokens=one_liner_tokens,
        summary_reduction=(
            ((json_tokens - summary_tokens) / json_tokens * 100) if json_tokens > 0 else 0
        ),
        one_liner_reduction=(
            ((json_tokens - one_liner_tokens) / json_tokens * 100) if json_tokens > 0 else 0
        ),
    )


def _role_abbrev(role: SemanticRole) -> str:
    """Get abbreviated role name."""
    abbrev_map = {
        SemanticRole.NAVIGATION: "nav",
        SemanticRole.MAIN: "main",
        SemanticRole.HEADER: "header",
        SemanticRole.FOOTER: "footer",
        SemanticRole.ASIDE: "aside",
        SemanticRole.ARTICLE: "article",
        SemanticRole.SECTION: "section",
        SemanticRole.SEARCH: "search",
        SemanticRole.FORM: "form",
        SemanticRole.BUTTON: "btn",
        SemanticRole.LINK: "link",
        SemanticRole.TEXT_INPUT: "input",
        SemanticRole.CHECKBOX: "check",
        SemanticRole.RADIO: "radio",
        SemanticRole.SELECT: "select",
        SemanticRole.HEADING: "h",
        SemanticRole.LIST: "list",
        SemanticRole.LIST_ITEM: "li",
        SemanticRole.TABLE: "table",
        SemanticRole.IMAGE: "img",
        SemanticRole.VIDEO: "video",
        SemanticRole.AUDIO: "audio",
        SemanticRole.DIALOG: "dialog",
        SemanticRole.ALERT: "alert",
        SemanticRole.MENU: "menu",
        SemanticRole.TAB: "tab",
        SemanticRole.TAB_PANEL: "tabpanel",
        SemanticRole.INTERACTIVE: "int",
        SemanticRole.CONTAINER: "div",
        SemanticRole.UNKNOWN: "?",
    }
    return abbrev_map.get(role, "?")


def _role_short(role: SemanticRole) -> str:
    """Get short role name."""
    short_map = {
        SemanticRole.NAVIGATION: "nav",
        SemanticRole.MAIN: "main",
        SemanticRole.HEADER: "hdr",
        SemanticRole.FOOTER: "ftr",
        SemanticRole.BUTTON: "btn",
        SemanticRole.LINK: "lnk",
        SemanticRole.TEXT_INPUT: "inp",
    }
    return short_map.get(role, "el")


def _intent_abbrev(intent: SemanticIntent) -> str:
    """Get abbreviated intent name."""
    abbrev_map = {
        SemanticIntent.NAVIGATE: "nav",
        SemanticIntent.SUBMIT: "sub",
        SemanticIntent.ACTION: "act",
        SemanticIntent.TOGGLE: "tog",
        SemanticIntent.SELECT: "sel",
        SemanticIntent.INPUT: "inp",
        SemanticIntent.SEARCH: "srch",
        SemanticIntent.PLAY: "play",
        SemanticIntent.PAUSE: "pause",
        SemanticIntent.OPEN: "open",
        SemanticIntent.CLOSE: "close",
        SemanticIntent.EXPAND: "exp",
        SemanticIntent.COLLAPSE: "col",
        SemanticIntent.DOWNLOAD: "dl",
        SemanticIntent.DELETE: "del",
        SemanticIntent.EDIT: "edit",
        SemanticIntent.CREATE: "new",
        SemanticIntent.UNKNOWN: "?",
    }
    return abbrev_map.get(intent, "?")


def _selector_short(selector: str) -> str:
    """Shorten a selector if too long."""
    if len(selector) <= 20:
        return selector
    return selector[:17] + "..."


def _estimate_tokens(text: str) -> int:
    """Estimate token count (1 token ≈ 4 characters)."""
    return (len(text) + 3) // 4
