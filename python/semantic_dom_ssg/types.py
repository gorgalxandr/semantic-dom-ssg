"""Core type definitions for SemanticDOM."""

from dataclasses import dataclass, field
from enum import Enum
from typing import Optional


class SemanticRole(Enum):
    """Semantic role for an element based on ARIA and HTML5 semantics."""

    # Landmarks
    NAVIGATION = "navigation"
    MAIN = "main"
    HEADER = "header"
    FOOTER = "footer"
    ASIDE = "aside"
    ARTICLE = "article"
    SECTION = "section"
    SEARCH = "search"
    FORM = "form"

    # Interactive elements
    BUTTON = "button"
    LINK = "link"
    TEXT_INPUT = "textInput"
    CHECKBOX = "checkbox"
    RADIO = "radio"
    SELECT = "select"

    # Structure
    HEADING = "heading"
    LIST = "list"
    LIST_ITEM = "listItem"
    TABLE = "table"

    # Media
    IMAGE = "image"
    VIDEO = "video"
    AUDIO = "audio"

    # Dialogs
    DIALOG = "dialog"
    ALERT = "alert"
    MENU = "menu"
    TAB = "tab"
    TAB_PANEL = "tabPanel"

    # Generic
    INTERACTIVE = "interactive"
    CONTAINER = "container"
    UNKNOWN = "unknown"

    def is_landmark(self) -> bool:
        """Check if this role represents a landmark region."""
        return self in {
            SemanticRole.NAVIGATION,
            SemanticRole.MAIN,
            SemanticRole.HEADER,
            SemanticRole.FOOTER,
            SemanticRole.ASIDE,
            SemanticRole.SEARCH,
        }

    def is_interactable(self) -> bool:
        """Check if this role represents an interactive element."""
        return self in {
            SemanticRole.BUTTON,
            SemanticRole.LINK,
            SemanticRole.TEXT_INPUT,
            SemanticRole.CHECKBOX,
            SemanticRole.RADIO,
            SemanticRole.SELECT,
            SemanticRole.INTERACTIVE,
        }


class SemanticIntent(Enum):
    """User intent classification for an element."""

    NAVIGATE = "navigate"
    SUBMIT = "submit"
    ACTION = "action"
    TOGGLE = "toggle"
    SELECT = "select"
    INPUT = "input"
    SEARCH = "search"
    PLAY = "play"
    PAUSE = "pause"
    OPEN = "open"
    CLOSE = "close"
    EXPAND = "expand"
    COLLAPSE = "collapse"
    DOWNLOAD = "download"
    DELETE = "delete"
    EDIT = "edit"
    CREATE = "create"
    UNKNOWN = "unknown"


@dataclass
class SemanticNode:
    """A semantic node in the DOM tree."""

    id: str
    label: str
    role: SemanticRole
    selector: str
    intent: Optional[SemanticIntent] = None
    accessible_name: Optional[str] = None
    href: Optional[str] = None
    children: list[str] = field(default_factory=list)
    parent: Optional[str] = None
    metadata: Optional[dict[str, str]] = None
    depth: int = 0

    def to_dict(self) -> dict:
        """Convert to dictionary representation."""
        result: dict = {
            "id": self.id,
            "label": self.label,
            "role": self.role.value,
            "selector": self.selector,
            "depth": self.depth,
        }
        if self.intent:
            result["intent"] = self.intent.value
        if self.accessible_name:
            result["accessibleName"] = self.accessible_name
        if self.href:
            result["href"] = self.href
        if self.children:
            result["children"] = self.children
        if self.parent:
            result["parent"] = self.parent
        if self.metadata:
            result["metadata"] = self.metadata
        return result


@dataclass
class State:
    """A state in the Semantic State Graph."""

    id: str
    name: str
    description: Optional[str] = None
    url_pattern: Optional[str] = None
    is_initial: bool = False
    is_terminal: bool = False

    def to_dict(self) -> dict:
        """Convert to dictionary representation."""
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "urlPattern": self.url_pattern,
            "isInitial": self.is_initial,
            "isTerminal": self.is_terminal,
        }


@dataclass
class Transition:
    """A transition between states in the SSG."""

    from_state: str
    to_state: str
    trigger: str
    action: Optional[str] = None
    guard: Optional[str] = None

    def to_dict(self) -> dict:
        """Convert to dictionary representation."""
        result: dict = {
            "from": self.from_state,
            "to": self.to_state,
            "trigger": self.trigger,
        }
        if self.action:
            result["action"] = self.action
        if self.guard:
            result["guard"] = self.guard
        return result


@dataclass
class StateGraph:
    """The Semantic State Graph."""

    states: list[State] = field(default_factory=list)
    transitions: list[Transition] = field(default_factory=list)
    initial_state: Optional[str] = None

    def is_deterministic(self) -> bool:
        """Check if the graph is deterministic (no ambiguous transitions)."""
        seen: set[tuple[str, str]] = set()
        for t in self.transitions:
            key = (t.from_state, t.trigger)
            if key in seen:
                return False
            seen.add(key)
        return True

    def reachable_states(self) -> list[State]:
        """Find all states reachable from the initial state."""
        if not self.initial_state:
            return []

        visited: set[str] = set()
        queue = [self.initial_state]

        while queue:
            state_id = queue.pop()
            if state_id in visited:
                continue
            visited.add(state_id)

            for t in self.transitions:
                if t.from_state == state_id and t.to_state not in visited:
                    queue.append(t.to_state)

        return [s for s in self.states if s.id in visited]

    def to_dict(self) -> dict:
        """Convert to dictionary representation."""
        return {
            "states": [s.to_dict() for s in self.states],
            "transitions": [t.to_dict() for t in self.transitions],
            "initialState": self.initial_state,
        }
