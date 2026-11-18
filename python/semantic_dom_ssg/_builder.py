"""Single-pass construction of semantic nodes from a parsed document.

The tree is walked once, in document order, with an explicit stack (no Python
recursion, so nesting depth is not limited by the interpreter). Text is logged
once and each element reads only a bounded prefix of its own text, which keeps
the pass linear even for adversarially nested input.
"""

from __future__ import annotations

import re
from collections.abc import Iterator
from dataclasses import dataclass
from typing import TYPE_CHECKING

from bs4 import BeautifulSoup
from bs4.element import CData, NavigableString, PageElement, Tag

from ._classify import (
    FORM_CONTROL_TAGS,
    attr,
    classify,
    determine_intent,
    input_type,
)
from .security import SecurityError, escape_css_identifier, sanitize_text, validate_url
from .types import SemanticIntent, SemanticNode, SemanticRole

if TYPE_CHECKING:
    from .parser import SemanticDOM

# Tags that do not break a run of text ("<b>Hel</b>lo" is one word).
_INLINE_TAGS = frozenset(
    {
        "a",
        "abbr",
        "b",
        "bdi",
        "bdo",
        "cite",
        "code",
        "data",
        "dfn",
        "em",
        "font",
        "i",
        "kbd",
        "mark",
        "q",
        "s",
        "samp",
        "small",
        "span",
        "strong",
        "sub",
        "sup",
        "time",
        "u",
        "var",
    }
)
# Tags whose content is a field value or option list, never descriptive text.
_VALUE_TAGS = frozenset({"textarea", "select", "datalist"})
# Tags that can fall back to their ``name`` attribute for a label.
_NAMED_TAGS = FORM_CONTROL_TAGS | {"button"}
_ID_UNSAFE_RE = re.compile(r"[^\w.:\-]")
_TAG_UNSAFE_RE = re.compile(r"[^a-z0-9]")
_LANG_RE = re.compile(r"[A-Za-z0-9\-]{1,35}")
_MAX_ID_LENGTH = 64
_MAX_SELECTOR_PART = 128


@dataclass(eq=False)
class _Draft:
    """A semantic element seen during the walk, before its node is built."""

    element: Tag
    tag: str
    role: SemanticRole
    html_id: str
    depth: int
    parent: _Draft | None
    text: str = ""
    label_text: str = ""
    node_id: str = ""


@dataclass(eq=False)
class _Frame:
    """An open element on the traversal stack."""

    children: Iterator[PageElement]
    tag: str
    text_start: int
    draft: _Draft | None = None
    is_title: bool = False
    label_for: str | None = None  # not None for an open <label>


class _TextLog:
    """Document text in order; every chunk holds at least one visible character."""

    def __init__(self) -> None:
        self.chunks: list[str] = []
        self.pending_space = False

    def add(self, text: str) -> None:
        if not text or text.isspace():
            self.pending_space = True
            return
        self.chunks.append(" " + text if self.pending_space else text)
        self.pending_space = False

    def read(self, start: int, budget: int) -> str:
        """Return up to ``budget`` characters of the text logged since ``start``."""
        parts: list[str] = []
        size = 0
        for index in range(start, len(self.chunks)):
            piece = self.chunks[index][: budget - size]
            parts.append(piece)
            size += len(piece)
            if size >= budget:
                break
        return "".join(parts)


def build_nodes(soup: BeautifulSoup, sdom: SemanticDOM) -> None:
    """Populate ``sdom`` (index, category lists, title, lang) from ``soup``."""
    config = sdom.config
    exclude = frozenset(tag.lower() for tag in config.exclude_tags)
    name_cap = config.max_accessible_name_length
    budget = 4 * max(name_cap, config.max_label_length) + 16

    log = _TextLog()
    drafts: list[_Draft] = []
    semantic_stack: list[_Draft] = []
    open_labels: list[list[_Draft]] = []
    labels_for: dict[str, str] = {}
    seen_ids: set[str] = set()
    duplicate_ids: dict[str, None] = {}
    title_seen = False

    stack: list[_Frame] = [_Frame(iter(soup.contents), "", 0)]
    while stack:
        frame = stack[-1]
        child = next(frame.children, None)

        if child is None:  # the element on top of the stack is closed
            stack.pop()
            if frame.draft is not None:
                frame.draft.text = log.read(frame.text_start, budget)
                semantic_stack.pop()
            if frame.is_title:
                sdom.title = sanitize_text(log.read(frame.text_start, budget), name_cap) or None
            if frame.label_for is not None:
                label_text = sanitize_text(log.read(frame.text_start, budget), name_cap)
                if frame.label_for and label_text:
                    labels_for.setdefault(frame.label_for, label_text)
                for control in open_labels.pop():
                    control.label_text = control.label_text or label_text
            if frame.tag not in _INLINE_TAGS:
                log.pending_space = True
            continue

        if not isinstance(child, Tag):
            # Exact types only: comments, doctypes and script/style strings are skipped.
            if type(child) is NavigableString or type(child) is CData:
                log.add(child)
            continue

        tag = child.name.lower()
        if tag in exclude:
            continue
        if tag not in _INLINE_TAGS:
            log.pending_space = True

        html_id = attr(child, "id")
        if html_id:
            if html_id in seen_ids:
                duplicate_ids[sanitize_text(html_id, _MAX_ID_LENGTH)] = None
            seen_ids.add(html_id)
        if tag == "html" and sdom.lang is None:
            lang = attr(child, "lang").strip()
            sdom.lang = lang if _LANG_RE.fullmatch(lang) else None

        new_frame = _Frame(iter(child.contents), tag, len(log.chunks))
        role = classify(child)
        if role is not None and len(semantic_stack) < config.max_depth:
            parent = semantic_stack[-1] if semantic_stack else None
            draft = _Draft(child, tag, role, html_id, len(semantic_stack), parent)
            drafts.append(draft)
            if tag in FORM_CONTROL_TAGS and open_labels:
                open_labels[-1].append(draft)
            if tag not in _VALUE_TAGS:
                new_frame.draft = draft
                semantic_stack.append(draft)
        if tag in _VALUE_TAGS:
            continue  # field values and option lists are never read as text
        if tag == "title" and not title_seen:
            title_seen = new_frame.is_title = True
        if tag == "label":
            new_frame.label_for = attr(child, "for")
            open_labels.append([])
        stack.append(new_frame)

    sdom.duplicate_ids = list(duplicate_ids)
    _assign_ids(drafts, config.id_prefix)
    for draft in drafts:
        _add_node(sdom, draft, labels_for)


def _assign_ids(drafts: list[_Draft], prefix: str) -> None:
    """Give every draft a unique, deterministic node ID.

    Elements with an HTML ``id`` are named first so that their IDs do not depend
    on the rest of the page; a repeated or clashing ID gets a numeric suffix
    (``_2``, ``_3``, ...) instead of overwriting the earlier node.
    """
    used: set[str] = set()
    next_suffix: dict[str, int] = {}

    def unique(base: str) -> str:
        candidate = base
        suffix = next_suffix.get(base, 2)
        while candidate in used:
            candidate = f"{base}_{suffix}"
            suffix += 1
        next_suffix[base] = suffix
        used.add(candidate)
        return candidate

    for draft in drafts:
        slug = _ID_UNSAFE_RE.sub("_", draft.html_id)[:_MAX_ID_LENGTH]
        if slug:
            draft.node_id = unique(f"{prefix}_{slug}")
    counter = 0
    for draft in drafts:
        if not draft.node_id:
            counter += 1
            tag_slug = _TAG_UNSAFE_RE.sub("_", draft.tag)[:_MAX_ID_LENGTH]
            draft.node_id = unique(f"{prefix}_{tag_slug}_{counter}")


def _classes(element: Tag) -> list[str]:
    value = element.get("class")
    if value is None:
        return []
    return value.split() if isinstance(value, str) else list(value)


def build_selector(element: Tag) -> str:
    """Build a single-line CSS selector for an element."""
    tag = escape_css_identifier(element.name.lower())
    html_id = attr(element, "id")
    if html_id and len(html_id) <= _MAX_SELECTOR_PART:
        return f"{tag}#{escape_css_identifier(html_id)}"
    usable = [c for c in _classes(element) if c and len(c) <= _MAX_SELECTOR_PART]
    return tag + "".join(f".{escape_css_identifier(c)}" for c in usable[:2])


def _accessible_name(draft: _Draft, labels_for: dict[str, str], cap: int) -> str:
    """Return the first non-empty accessible-name source, sanitised, or ""."""
    element, tag = draft.element, draft.tag
    kind = input_type(element) if tag == "input" else ""
    candidates = [attr(element, "aria-label")]
    if tag in FORM_CONTROL_TAGS:
        candidates += [labels_for.get(draft.html_id, ""), draft.label_text]
    candidates.append(attr(element, "title"))
    if tag == "img" or kind == "image":
        candidates.append(attr(element, "alt"))
    if kind in {"submit", "button", "reset"}:
        # Only button-like inputs expose their value; it is their visible caption.
        candidates.append(attr(element, "value"))
        if kind in {"submit", "reset"}:
            candidates.append(kind.capitalize())
    elif tag in {"input", "textarea"}:
        candidates.append(attr(element, "placeholder"))
    elif tag not in _VALUE_TAGS and tag != "img":
        candidates.append(draft.text)

    for candidate in candidates:
        name = sanitize_text(candidate, cap) if candidate else ""
        if name:
            return name
    return ""


def _fallback_label(draft: _Draft, cap: int) -> str:
    element = draft.element
    if draft.tag in _NAMED_TAGS:
        name = sanitize_text(attr(element, "name"), cap)
        if name:
            return name
    label = draft.tag
    if draft.html_id:
        label = f"{label}#{draft.html_id}"
    else:
        classes = _classes(element)
        if classes and classes[0]:
            label = f"{label}.{classes[0]}"
    return sanitize_text(label, cap) or "element"


def _add_node(sdom: SemanticDOM, draft: _Draft, labels_for: dict[str, str]) -> None:
    config = sdom.config
    name = _accessible_name(draft, labels_for, config.max_accessible_name_length)
    if name:
        label = sanitize_text(name, config.max_label_length)
    else:
        label = _fallback_label(draft, config.max_label_length)

    node = SemanticNode(
        id=draft.node_id,
        label=label,
        role=draft.role,
        selector=build_selector(draft.element),
        accessible_name=name or None,
        depth=draft.depth,
    )
    if draft.role.is_interactable():
        node.intent = determine_intent(draft.element, draft.role, label)
    if draft.role == SemanticRole.LINK:
        try:
            href = validate_url(attr(draft.element, "href"), max_length=config.max_url_length)
            node.href = href or None
        except SecurityError:
            # Unsafe or malformed targets are never emitted, and a link that
            # runs script (javascript:) is an action, not navigation.
            if node.intent == SemanticIntent.NAVIGATE:
                node.intent = SemanticIntent.ACTION
    if draft.parent is not None:
        node.parent = draft.parent.node_id
        sdom.index[draft.parent.node_id].children.append(node.id)

    if draft.role.is_landmark():
        sdom.landmarks.append(node.id)
    if draft.role.is_interactable():
        sdom.interactables.append(node.id)
    if draft.role == SemanticRole.HEADING:
        sdom.headings.append(node.id)
    sdom.index[node.id] = node
