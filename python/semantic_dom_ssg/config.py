"""Configuration for SemanticDOM parsing."""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from .security import DEFAULT_MAX_INPUT_SIZE, DEFAULT_MAX_URL_LENGTH

_ID_PREFIX_RE = re.compile(r"[A-Za-z0-9_\-]+")


@dataclass
class Config:
    """Configuration for SemanticDOM parsing.

    Raises:
        ValueError: If a limit is not positive or ``id_prefix`` is not made of
            ASCII letters, digits, ``_`` or ``-``.
    """

    # Maximum input size in bytes (default: 10MB)
    max_input_size: int = DEFAULT_MAX_INPUT_SIZE

    # ID prefix for generated semantic IDs
    id_prefix: str = "sdom"

    # Maximum nesting depth of semantic nodes (a node's depth is the number of
    # semantic ancestors it has). Elements nested deeper are not indexed.
    max_depth: int = 50

    # Elements whose whole subtree is ignored
    exclude_tags: list[str] = field(
        default_factory=lambda: ["script", "style", "noscript", "template"]
    )

    # Whether to generate state graph
    include_state_graph: bool = True

    # Reserved: whether callers should run certification checks
    validate: bool = True

    # Maximum length of a node label (longer labels end in "...")
    max_label_length: int = 50

    # Maximum length of an accessible name and of the document title
    max_accessible_name_length: int = 200

    # Maximum length of a link URL; longer hrefs are dropped
    max_url_length: int = DEFAULT_MAX_URL_LENGTH

    def __post_init__(self) -> None:
        for name in ("max_input_size", "max_depth", "max_url_length"):
            if getattr(self, name) < 1:
                raise ValueError(f"{name} must be a positive integer")
        for name in ("max_label_length", "max_accessible_name_length"):
            if getattr(self, name) < 4:
                raise ValueError(f"{name} must be at least 4")
        if not _ID_PREFIX_RE.fullmatch(self.id_prefix):
            raise ValueError("id_prefix must contain only ASCII letters, digits, '_' or '-'")

    @classmethod
    def default(cls) -> Config:
        """Create default configuration."""
        return cls()

    @classmethod
    def minimal(cls) -> Config:
        """Create minimal configuration (no state graph, no validation)."""
        return cls(include_state_graph=False, validate=False)
