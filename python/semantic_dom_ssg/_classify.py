"""Element classification: semantic role and user intent."""

from __future__ import annotations

import re

from bs4 import Tag

from .types import SemanticIntent, SemanticRole

_TAG_ROLES: dict[str, SemanticRole] = {
    "nav": SemanticRole.NAVIGATION,
    "main": SemanticRole.MAIN,
    "header": SemanticRole.HEADER,
    "footer": SemanticRole.FOOTER,
    "aside": SemanticRole.ASIDE,
    "article": SemanticRole.ARTICLE,
    "section": SemanticRole.SECTION,
    "button": SemanticRole.BUTTON,
    "textarea": SemanticRole.TEXT_INPUT,
    "select": SemanticRole.SELECT,
    "h1": SemanticRole.HEADING,
    "h2": SemanticRole.HEADING,
    "h3": SemanticRole.HEADING,
    "h4": SemanticRole.HEADING,
    "h5": SemanticRole.HEADING,
    "h6": SemanticRole.HEADING,
    "img": SemanticRole.IMAGE,
    "video": SemanticRole.VIDEO,
    "audio": SemanticRole.AUDIO,
    "form": SemanticRole.FORM,
    "dialog": SemanticRole.DIALOG,
}

# Explicit ARIA roles take precedence over the tag name.
_ARIA_ROLES: dict[str, SemanticRole] = {
    "navigation": SemanticRole.NAVIGATION,
    "main": SemanticRole.MAIN,
    "banner": SemanticRole.HEADER,
    "contentinfo": SemanticRole.FOOTER,
    "complementary": SemanticRole.ASIDE,
    "search": SemanticRole.SEARCH,
    "dialog": SemanticRole.DIALOG,
    "alertdialog": SemanticRole.DIALOG,
    "alert": SemanticRole.ALERT,
    "button": SemanticRole.BUTTON,
    "link": SemanticRole.LINK,
    "checkbox": SemanticRole.CHECKBOX,
    "switch": SemanticRole.CHECKBOX,
    "radio": SemanticRole.RADIO,
    "textbox": SemanticRole.TEXT_INPUT,
    "searchbox": SemanticRole.TEXT_INPUT,
    "combobox": SemanticRole.SELECT,
    "listbox": SemanticRole.SELECT,
}

#: ``<input type>`` values rendered as buttons; their ``value`` is a visible label.
BUTTON_INPUT_TYPES = frozenset({"submit", "button", "reset", "image"})
_INTERACTIVE_INPUT_TYPES = frozenset({"file", "range", "color"})

#: Form controls: named by ``<label>``/``placeholder``, never by their content or value.
FORM_CONTROL_TAGS = frozenset({"input", "textarea", "select"})

_INTENTS_BY_NAME = {intent.value: intent for intent in SemanticIntent}
_WORD_RE = re.compile(r"[a-z]+")
_BUTTON_KEYWORDS: tuple[tuple[frozenset[str], SemanticIntent], ...] = (
    (frozenset({"submit", "send", "save"}), SemanticIntent.SUBMIT),
    (frozenset({"delete", "remove"}), SemanticIntent.DELETE),
    (frozenset({"edit", "modify"}), SemanticIntent.EDIT),
    (frozenset({"create", "add", "new"}), SemanticIntent.CREATE),
    (frozenset({"toggle"}), SemanticIntent.TOGGLE),
    (frozenset({"open"}), SemanticIntent.OPEN),
    (frozenset({"close", "cancel"}), SemanticIntent.CLOSE),
    (frozenset({"expand"}), SemanticIntent.EXPAND),
    (frozenset({"collapse"}), SemanticIntent.COLLAPSE),
    (frozenset({"play"}), SemanticIntent.PLAY),
    (frozenset({"pause"}), SemanticIntent.PAUSE),
    (frozenset({"search"}), SemanticIntent.SEARCH),
)
_DOWNLOAD_EXTENSIONS = (".pdf", ".zip")


def attr(element: Tag, name: str) -> str:
    """Return an attribute as a plain string ("" if absent)."""
    value = element.get(name)
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    return " ".join(value)


def input_type(element: Tag) -> str:
    """Return the lower-cased ``type`` of an ``<input>`` (default ``text``)."""
    return attr(element, "type").strip().lower() or "text"


def classify(element: Tag) -> SemanticRole | None:
    """Return the semantic role of an element, or None if it is not semantic."""
    aria = attr(element, "role").split()
    if aria:
        role = _ARIA_ROLES.get(aria[0].lower())
        if role is not None:
            return role

    tag = element.name.lower()
    if tag == "a":
        return SemanticRole.LINK if element.has_attr("href") else None
    if tag == "input":
        kind = input_type(element)
        if kind == "hidden":
            return None
        if kind in BUTTON_INPUT_TYPES:
            return SemanticRole.BUTTON
        if kind == "checkbox":
            return SemanticRole.CHECKBOX
        if kind == "radio":
            return SemanticRole.RADIO
        if kind in _INTERACTIVE_INPUT_TYPES:
            return SemanticRole.INTERACTIVE
        return SemanticRole.TEXT_INPUT
    return _TAG_ROLES.get(tag)


def _is_download(element: Tag) -> bool:
    if element.has_attr("download"):
        return True
    path = attr(element, "href").split("#", 1)[0].split("?", 1)[0].strip().lower()
    return path.endswith(_DOWNLOAD_EXTENSIONS)


def determine_intent(element: Tag, role: SemanticRole, label: str) -> SemanticIntent:
    """Determine the user intent for an interactive element.

    ``label`` is the element's resolved label; button keywords are matched as
    whole words, so "News" is not mistaken for "new".
    """
    data_intent = attr(element, "data-intent").strip().lower()
    if data_intent:
        return _INTENTS_BY_NAME.get(data_intent, SemanticIntent.UNKNOWN)

    if role == SemanticRole.LINK:
        return SemanticIntent.DOWNLOAD if _is_download(element) else SemanticIntent.NAVIGATE

    if role == SemanticRole.BUTTON:
        if attr(element, "type").strip().lower() == "submit":
            return SemanticIntent.SUBMIT
        words = set(_WORD_RE.findall(label.lower()))
        for keywords, intent in _BUTTON_KEYWORDS:
            if words & keywords:
                return intent
        return SemanticIntent.ACTION

    if role in {SemanticRole.CHECKBOX, SemanticRole.RADIO}:
        return SemanticIntent.TOGGLE
    if role == SemanticRole.SELECT:
        return SemanticIntent.SELECT
    if role == SemanticRole.TEXT_INPUT:
        is_search = attr(element, "type").strip().lower() == "search"
        is_search = is_search or attr(element, "role").strip().lower() == "searchbox"
        return SemanticIntent.SEARCH if is_search else SemanticIntent.INPUT
    if role == SemanticRole.INTERACTIVE:
        return SemanticIntent.INPUT
    return SemanticIntent.UNKNOWN
