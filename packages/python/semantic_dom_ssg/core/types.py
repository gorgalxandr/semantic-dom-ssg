"""Core type definitions for SemanticDOM."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Optional


class SemanticId:
    """Strongly-typed semantic identifier for DOM elements."""

    def __init__(self, value: str) -> None:
        if not value or not value.strip():
            raise ValueError("Semantic ID cannot be empty")
        self._value = value

    @property
    def value(self) -> str:
        return self._value

    @classmethod
    def generate(cls, role: str, label: str) -> "SemanticId":
        """Generate a SemanticId from role and label."""
        prefix = cls._role_to_prefix(role)
        descriptor = cls._sanitize_label(label)
        return cls(f"{prefix}-{descriptor}")

    @staticmethod
    def _role_to_prefix(role: str) -> str:
        prefixes = {
            "button": "btn",
            "link": "link",
            "textbox": "input",
            "input": "input",
            "navigation": "nav",
            "main": "main",
            "banner": "header",
            "header": "header",
            "contentinfo": "footer",
            "footer": "footer",
            "complementary": "aside",
            "aside": "aside",
            "form": "form",
            "search": "search",
            "checkbox": "chk",
            "radio": "radio",
            "listbox": "select",
            "combobox": "select",
            "menu": "menu",
            "menuitem": "item",
            "tab": "tab",
            "tabpanel": "panel",
            "dialog": "dialog",
            "alert": "alert",
            "img": "img",
            "image": "img",
            "heading": "h",
            "list": "list",
            "listitem": "li",
            "table": "table",
            "row": "row",
            "cell": "cell",
        }
        return prefixes.get(role.lower(), role.lower()[:4])

    @staticmethod
    def _sanitize_label(label: str) -> str:
        if not label:
            return "unnamed"
        sanitized = re.sub(r"[^a-z0-9]+", "-", label.lower())
        sanitized = sanitized.strip("-")[:32]
        return sanitized or "unnamed"

    def __str__(self) -> str:
        return self._value

    def __repr__(self) -> str:
        return f"SemanticId({self._value!r})"

    def __eq__(self, other: object) -> bool:
        if isinstance(other, SemanticId):
            return self._value == other._value
        if isinstance(other, str):
            return self._value == other
        return False

    def __hash__(self) -> int:
        return hash(self._value)


@dataclass
class A11yInfo:
    """Accessibility information for a semantic node."""

    name: str = ""
    focusable: bool = False
    in_tab_order: bool = False
    level: Optional[int] = None


@dataclass
class SemanticNode:
    """A node in the SemanticDOM tree."""

    id: SemanticId
    role: str
    label: str = ""
    intent: Optional[str] = None
    state: str = "idle"
    selector: str = ""
    xpath: str = ""
    a11y: A11yInfo = field(default_factory=A11yInfo)
    children: list["SemanticNode"] = field(default_factory=list)
    value: Optional[Any] = None
    parent: Optional["SemanticNode"] = field(default=None, repr=False)

    def is_interactive(self) -> bool:
        """Check if this node is interactive."""
        return self.a11y.focusable

    def is_landmark(self) -> bool:
        """Check if this node is a landmark."""
        return self.role.lower() in {
            "main",
            "navigation",
            "banner",
            "contentinfo",
            "complementary",
            "form",
            "search",
            "region",
        }

    def descendants(self) -> list["SemanticNode"]:
        """Get all descendants of this node."""
        result: list[SemanticNode] = []
        self._collect_descendants(result)
        return result

    def _collect_descendants(self, result: list["SemanticNode"]) -> None:
        for child in self.children:
            result.append(child)
            child._collect_descendants(result)


@dataclass
class StateTransition:
    """State transition in the Semantic State Graph."""

    from_state: str
    to_state: str
    trigger: str


@dataclass
class SSGNode:
    """Semantic State Graph node."""

    node_id: SemanticId
    current_state: str
    transitions: list[StateTransition] = field(default_factory=list)

    @classmethod
    def from_semantic_node(cls, node: SemanticNode) -> "SSGNode":
        """Create SSGNode from SemanticNode."""
        transitions = cls._infer_transitions(node)
        return cls(node_id=node.id, current_state=node.state, transitions=transitions)

    @staticmethod
    def _infer_transitions(node: SemanticNode) -> list[StateTransition]:
        transitions: list[StateTransition] = []
        role = node.role.lower()

        if role == "button":
            transitions.extend(
                [
                    StateTransition("idle", "focused", "focus"),
                    StateTransition("focused", "idle", "blur"),
                    StateTransition("focused", "pressed", "mousedown"),
                    StateTransition("pressed", "focused", "mouseup"),
                ]
            )
        elif role in ("textbox", "input"):
            transitions.extend(
                [
                    StateTransition("idle", "focused", "focus"),
                    StateTransition("focused", "idle", "blur"),
                    StateTransition("focused", "editing", "input"),
                ]
            )
        elif role == "checkbox":
            transitions.extend(
                [
                    StateTransition("unchecked", "checked", "click"),
                    StateTransition("checked", "unchecked", "click"),
                ]
            )
        elif role == "link":
            transitions.extend(
                [
                    StateTransition("idle", "focused", "focus"),
                    StateTransition("focused", "visited", "click"),
                ]
            )
        elif node.is_interactive():
            transitions.extend(
                [
                    StateTransition("idle", "focused", "focus"),
                    StateTransition("focused", "idle", "blur"),
                ]
            )

        return transitions

    def available_transitions(self) -> list[StateTransition]:
        """Get transitions available from current state."""
        return [t for t in self.transitions if t.from_state == self.current_state]


class CertificationLevel(Enum):
    """Agent certification levels."""

    NONE = 0
    BASIC = 25
    STANDARD = 50
    ADVANCED = 75
    FULL = 100

    @classmethod
    def from_score(cls, score: int) -> "CertificationLevel":
        if score >= 100:
            return cls.FULL
        if score >= 75:
            return cls.ADVANCED
        if score >= 50:
            return cls.STANDARD
        if score >= 25:
            return cls.BASIC
        return cls.NONE


class Severity(Enum):
    """Severity levels for validation failures."""

    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"


@dataclass
class Check:
    """Passed validation check."""

    id: str
    name: str
    passed: bool


@dataclass
class Failure:
    """Failed validation check."""

    id: str
    name: str
    message: str
    severity: Severity
    affected_nodes: list[SemanticId] = field(default_factory=list)


@dataclass
class AgentCertification:
    """Agent certification status."""

    level: CertificationLevel = CertificationLevel.NONE
    score: int = 0
    checks: list[Check] = field(default_factory=list)
    failures: list[Failure] = field(default_factory=list)

    def is_passing(self) -> bool:
        return self.level != CertificationLevel.NONE

    def has_errors(self) -> bool:
        return any(
            f.severity in (Severity.ERROR, Severity.CRITICAL) for f in self.failures
        )


@dataclass
class SemanticDocument:
    """Complete SemanticDOM document with O(1) lookup."""

    version: str
    standard: str
    url: str
    title: str
    language: str
    generated_at: int
    root: SemanticNode
    agent_ready: AgentCertification
    _index: dict[SemanticId, SemanticNode] = field(default_factory=dict, repr=False)

    def __post_init__(self) -> None:
        """Build indexes after initialization."""
        self._build_index(self.root)

    def _build_index(self, node: SemanticNode) -> None:
        self._index[node.id] = node
        for child in node.children:
            self._build_index(child)

    def query(self, id: str | SemanticId) -> Optional[SemanticNode]:
        """O(1) lookup by semantic ID."""
        if isinstance(id, str):
            id = SemanticId(id)
        return self._index.get(id)

    def navigate(self, landmark: str) -> Optional[SemanticNode]:
        """Navigate to a landmark by role or ID."""
        for l in self.landmarks:
            if l.role.lower() == landmark.lower() or str(l.id).lower() == landmark.lower():
                return l
        return None

    @property
    def landmarks(self) -> list[SemanticNode]:
        """Get all landmark nodes."""
        return [n for n in self._index.values() if n.is_landmark()]

    @property
    def interactables(self) -> list[SemanticNode]:
        """Get all interactive nodes."""
        return [n for n in self._index.values() if n.is_interactive()]

    @property
    def state_graph(self) -> dict[SemanticId, SSGNode]:
        """Get the Semantic State Graph."""
        graph: dict[SemanticId, SSGNode] = {}
        for node in self._index.values():
            if node.is_interactive() or node.state != "idle":
                graph[node.id] = SSGNode.from_semantic_node(node)
        return graph

    @property
    def node_count(self) -> int:
        """Get total node count."""
        return len(self._index)
