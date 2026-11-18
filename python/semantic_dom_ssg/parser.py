"""HTML parser for SemanticDOM.

Parses HTML documents and builds a semantic representation with
O(1) lookup via hash-indexed nodes.
"""

from __future__ import annotations

import json
from typing import Any

from bs4 import BeautifulSoup

from ._builder import build_nodes
from ._stategraph import build_state_graph
from .config import Config
from .security import encode_input
from .types import SemanticNode, StateGraph


class SemanticDOM:
    """The main SemanticDOM structure.

    Provides O(1) element lookup via hash-indexed nodes, deterministic
    navigation, and token-efficient serialization.

    Attributes:
        index: Hash-indexed nodes for O(1) lookup (document order)
        landmarks: List of landmark element IDs (document order)
        interactables: List of interactive element IDs (document order)
        headings: List of heading element IDs (document order)
        state_graph: State graph for UI state management
        title: Document title
        lang: Document language
        duplicate_ids: HTML ``id`` values that occur more than once in the source
    """

    def __init__(self, config: Config | None = None):
        """Initialize SemanticDOM.

        Args:
            config: Configuration options (uses defaults if not provided)
        """
        self.config = config or Config.default()
        self.index: dict[str, SemanticNode] = {}
        self.landmarks: list[str] = []
        self.interactables: list[str] = []
        self.headings: list[str] = []
        self.state_graph = StateGraph()
        self.title: str | None = None
        self.lang: str | None = None
        self.duplicate_ids: list[str] = []

    @classmethod
    def parse(cls, html: str | bytes, config: Config | None = None) -> SemanticDOM:
        """Parse an HTML document into a SemanticDOM representation.

        Args:
            html: The HTML to parse. ``bytes`` are decoded as UTF-8 (a BOM is
                skipped, undecodable bytes are replaced).
            config: Configuration options

        Returns:
            The parsed SemanticDOM

        Raises:
            InputTooLargeError: If the input is larger than
                ``config.max_input_size`` bytes (UTF-8 encoded size for ``str``)

        Security:
            - Input size is validated in bytes before any parsing
            - URLs are validated; unsafe link targets are dropped
            - Labels, names and the title are reduced to single-line text
              without control characters and are length-capped
            - Form field values are never read (only the caption of
              button-like inputs is)
            - HTML parsing only: no script execution, no entity expansion,
              no network or file access

        Examples:
            >>> html = '<html><body><nav><a href="/">Home</a></nav></body></html>'
            >>> sdom = SemanticDOM.parse(html)
            >>> len(sdom.landmarks) > 0
            True
        """
        config = config or Config.default()
        raw = encode_input(html, config.max_input_size)
        # Decoding here keeps the result independent of optional charset detectors.
        text = raw.decode("utf-8-sig", "replace")

        sdom = cls(config)
        # Always the HTML parser: no DTD/entity processing, no network access.
        soup = BeautifulSoup(text, "lxml")
        build_nodes(soup, sdom)

        if config.include_state_graph:
            build_state_graph(sdom)

        return sdom

    def get(self, node_id: str) -> SemanticNode | None:
        """Get a node by ID in O(1) time."""
        return self.index.get(node_id)

    def get_landmarks(self) -> list[SemanticNode]:
        """Get all landmark nodes."""
        return [self.index[id] for id in self.landmarks if id in self.index]

    def get_interactables(self) -> list[SemanticNode]:
        """Get all interactable nodes."""
        return [self.index[id] for id in self.interactables if id in self.index]

    def get_headings(self) -> list[SemanticNode]:
        """Get all heading nodes."""
        return [self.index[id] for id in self.headings if id in self.index]

    def to_json(self, indent: int | None = 2, *, ensure_ascii: bool = True) -> str:
        """Convert to JSON string.

        Args:
            indent: Indentation width, or None for compact single-line output
            ensure_ascii: Escape non-ASCII characters as ``\\uXXXX`` (default).
                Pass False for shorter output when the consumer handles UTF-8.
        """
        return json.dumps(self.to_dict(), indent=indent, ensure_ascii=ensure_ascii)

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary representation."""
        return {
            "title": self.title,
            "lang": self.lang,
            "landmarks": self.landmarks,
            "interactables": self.interactables,
            "headings": self.headings,
            "nodes": {k: v.to_dict() for k, v in self.index.items()},
            "stateGraph": self.state_graph.to_dict(),
        }

    def to_agent_summary(self) -> str:
        """Generate token-efficient agent summary."""
        from .summary import to_agent_summary

        return to_agent_summary(self)

    def to_one_liner(self) -> str:
        """Generate one-line summary."""
        from .summary import to_one_liner

        return to_one_liner(self)
