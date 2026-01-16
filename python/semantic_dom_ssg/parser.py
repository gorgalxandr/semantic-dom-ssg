"""HTML parser for SemanticDOM.

Parses HTML documents and builds a semantic representation with
O(1) lookup via hash-indexed nodes.
"""

import json
from typing import Optional

from bs4 import BeautifulSoup, Tag

from .config import Config
from .security import InputTooLargeError, escape_css_identifier, validate_url
from .types import (
    SemanticIntent,
    SemanticNode,
    SemanticRole,
    State,
    StateGraph,
    Transition,
)


class SemanticDOM:
    """The main SemanticDOM structure.

    Provides O(1) element lookup via hash-indexed nodes, deterministic
    navigation, and token-efficient serialization.

    Attributes:
        index: Hash-indexed nodes for O(1) lookup
        landmarks: List of landmark element IDs
        interactables: List of interactive element IDs
        headings: List of heading element IDs
        state_graph: State graph for UI state management
        title: Document title
        lang: Document language
    """

    def __init__(self, config: Optional[Config] = None):
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
        self.title: Optional[str] = None
        self.lang: Optional[str] = None
        self._id_counter = 0

    @classmethod
    def parse(cls, html: str, config: Optional[Config] = None) -> "SemanticDOM":
        """Parse an HTML document into a SemanticDOM representation.

        Args:
            html: The HTML string to parse
            config: Configuration options

        Returns:
            The parsed SemanticDOM

        Raises:
            InputTooLargeError: If input exceeds max_input_size

        Security:
            - Input size is validated against config.max_input_size
            - URLs are validated against allowed protocols
            - No script execution (HTML parsing only)

        Examples:
            >>> html = '<html><body><nav><a href="/">Home</a></nav></body></html>'
            >>> sdom = SemanticDOM.parse(html)
            >>> len(sdom.landmarks) > 0
            True
        """
        config = config or Config.default()

        # Security: validate input size
        if len(html) > config.max_input_size:
            raise InputTooLargeError(config.max_input_size, len(html))

        sdom = cls(config)
        soup = BeautifulSoup(html, "lxml")

        # Extract document metadata
        sdom._extract_metadata(soup)

        # Parse semantic elements
        sdom._parse_semantic_elements(soup)

        # Build state graph if enabled
        if config.include_state_graph:
            sdom._build_state_graph()

        return sdom

    def _extract_metadata(self, soup: BeautifulSoup) -> None:
        """Extract document-level metadata."""
        # Extract title
        title_tag = soup.find("title")
        if title_tag:
            self.title = title_tag.get_text(strip=True)

        # Extract language
        html_tag = soup.find("html")
        if html_tag and isinstance(html_tag, Tag):
            self.lang = html_tag.get("lang")

    def _parse_semantic_elements(self, soup: BeautifulSoup) -> None:
        """Parse semantic elements from the document."""
        # Define selectors and their roles
        semantic_selectors = [
            # Landmarks
            ("nav", SemanticRole.NAVIGATION),
            ("main", SemanticRole.MAIN),
            ("header", SemanticRole.HEADER),
            ("footer", SemanticRole.FOOTER),
            ("aside", SemanticRole.ASIDE),
            ("article", SemanticRole.ARTICLE),
            ("section", SemanticRole.SECTION),
            ("[role=navigation]", SemanticRole.NAVIGATION),
            ("[role=main]", SemanticRole.MAIN),
            ("[role=banner]", SemanticRole.HEADER),
            ("[role=contentinfo]", SemanticRole.FOOTER),
            ("[role=complementary]", SemanticRole.ASIDE),
            ("[role=search]", SemanticRole.SEARCH),
            # Interactables
            ("a[href]", SemanticRole.LINK),
            ("button", SemanticRole.BUTTON),
            ("input[type=submit]", SemanticRole.BUTTON),
            ("input[type=button]", SemanticRole.BUTTON),
            ("input[type=text]", SemanticRole.TEXT_INPUT),
            ("input[type=email]", SemanticRole.TEXT_INPUT),
            ("input[type=password]", SemanticRole.TEXT_INPUT),
            ("input[type=search]", SemanticRole.TEXT_INPUT),
            ("input[type=checkbox]", SemanticRole.CHECKBOX),
            ("input[type=radio]", SemanticRole.RADIO),
            ("textarea", SemanticRole.TEXT_INPUT),
            ("select", SemanticRole.SELECT),
            # Headings
            ("h1", SemanticRole.HEADING),
            ("h2", SemanticRole.HEADING),
            ("h3", SemanticRole.HEADING),
            ("h4", SemanticRole.HEADING),
            ("h5", SemanticRole.HEADING),
            ("h6", SemanticRole.HEADING),
            # Media
            ("img", SemanticRole.IMAGE),
            ("video", SemanticRole.VIDEO),
            ("audio", SemanticRole.AUDIO),
            # Other semantic
            ("form", SemanticRole.FORM),
            ("dialog", SemanticRole.DIALOG),
            ("[role=dialog]", SemanticRole.DIALOG),
            ("[role=alert]", SemanticRole.ALERT),
        ]

        for selector, role in semantic_selectors:
            for element in soup.select(selector):
                if isinstance(element, Tag):
                    self._process_element(element, role)

    def _process_element(self, element: Tag, role: SemanticRole) -> None:
        """Process a single element and add it to the index."""
        tag_name = element.name.lower()

        # Skip excluded tags
        if tag_name in self.config.exclude_tags:
            return

        # Generate unique ID
        node_id = self._generate_id(tag_name, element)

        # Check if already processed
        if node_id in self.index:
            return

        # Extract label
        label = self._extract_label(element)

        # Build CSS selector
        selector = self._build_selector(element)

        # Create node
        node = SemanticNode(
            id=node_id,
            label=label,
            role=role,
            selector=selector,
        )

        # Extract intent for interactables
        if role.is_interactable():
            node.intent = self._determine_intent(element, role)

        # Extract href for links
        if role == SemanticRole.LINK:
            href = element.get("href")
            if href and isinstance(href, str):
                try:
                    node.href = validate_url(href)
                except Exception:
                    pass  # Skip invalid URLs

        # Extract accessible name
        node.accessible_name = self._extract_accessible_name(element)

        # Track by category
        if role.is_landmark():
            self.landmarks.append(node_id)
        if role.is_interactable():
            self.interactables.append(node_id)
        if role == SemanticRole.HEADING:
            self.headings.append(node_id)

        # Insert into index (O(1) lookup)
        self.index[node_id] = node

    def _generate_id(self, tag: str, element: Tag) -> str:
        """Generate a unique ID for an element."""
        # Use existing ID if present
        elem_id = element.get("id")
        if elem_id:
            return f"{self.config.id_prefix}_{elem_id}"

        # Generate based on tag and counter
        self._id_counter += 1
        return f"{self.config.id_prefix}_{tag}_{self._id_counter}"

    def _extract_label(self, element: Tag) -> str:
        """Extract a human-readable label from an element."""
        # Priority: aria-label > title > text content
        aria_label = element.get("aria-label")
        if aria_label:
            return str(aria_label)

        title = element.get("title")
        if title:
            return str(title)

        # For inputs, use placeholder or name
        if element.name == "input":
            placeholder = element.get("placeholder")
            if placeholder:
                return str(placeholder)
            name = element.get("name")
            if name:
                return str(name)

        # Get text content
        text = element.get_text(strip=True)
        if text:
            # Truncate if too long
            if len(text) > 50:
                return text[:47] + "..."
            return text

        # Fallback to tag name with id/class hint
        label = element.name
        elem_id = element.get("id")
        if elem_id:
            label = f"{label}#{elem_id}"
        else:
            classes = element.get("class", [])
            if classes and isinstance(classes, list) and classes[0]:
                label = f"{label}.{classes[0]}"

        return label

    def _build_selector(self, element: Tag) -> str:
        """Build a CSS selector for an element."""
        tag = element.name

        # Use ID if available (most specific)
        elem_id = element.get("id")
        if elem_id:
            escaped = escape_css_identifier(str(elem_id))
            return f"{tag}#{escaped}"

        # Build tag + classes
        selector = tag
        classes = element.get("class", [])
        if classes and isinstance(classes, list):
            for cls in classes[:2]:  # Limit to 2 classes
                escaped = escape_css_identifier(str(cls))
                selector += f".{escaped}"

        return selector

    def _extract_accessible_name(self, element: Tag) -> Optional[str]:
        """Extract accessible name from element."""
        # aria-label takes precedence
        aria_label = element.get("aria-label")
        if aria_label:
            return str(aria_label)

        # title attribute
        title = element.get("title")
        if title:
            return str(title)

        # alt for images
        if element.name == "img":
            alt = element.get("alt")
            if alt:
                return str(alt)

        # Text content as fallback
        text = element.get_text(strip=True)
        if text:
            return text

        return None

    def _determine_intent(self, element: Tag, role: SemanticRole) -> SemanticIntent:
        """Determine the user intent for an interactive element."""
        # Check for explicit intent attribute
        data_intent = element.get("data-intent")
        if data_intent:
            intent_map = {
                "navigate": SemanticIntent.NAVIGATE,
                "submit": SemanticIntent.SUBMIT,
                "action": SemanticIntent.ACTION,
                "toggle": SemanticIntent.TOGGLE,
                "select": SemanticIntent.SELECT,
                "search": SemanticIntent.SEARCH,
                "play": SemanticIntent.PLAY,
                "pause": SemanticIntent.PAUSE,
                "open": SemanticIntent.OPEN,
                "close": SemanticIntent.CLOSE,
                "expand": SemanticIntent.EXPAND,
                "collapse": SemanticIntent.COLLAPSE,
                "download": SemanticIntent.DOWNLOAD,
                "delete": SemanticIntent.DELETE,
                "edit": SemanticIntent.EDIT,
                "create": SemanticIntent.CREATE,
            }
            return intent_map.get(str(data_intent).lower(), SemanticIntent.UNKNOWN)

        # Infer from element type
        if role == SemanticRole.LINK:
            href = element.get("href", "")
            if isinstance(href, str) and (
                href.endswith(".pdf")
                or href.endswith(".zip")
                or element.get("download")
            ):
                return SemanticIntent.DOWNLOAD
            return SemanticIntent.NAVIGATE

        if role == SemanticRole.BUTTON:
            text = self._extract_label(element).lower()
            btn_type = element.get("type", "")

            if btn_type == "submit":
                return SemanticIntent.SUBMIT

            if any(word in text for word in ["submit", "send", "save"]):
                return SemanticIntent.SUBMIT
            if any(word in text for word in ["delete", "remove"]):
                return SemanticIntent.DELETE
            if any(word in text for word in ["edit", "modify"]):
                return SemanticIntent.EDIT
            if any(word in text for word in ["create", "add", "new"]):
                return SemanticIntent.CREATE
            if "toggle" in text:
                return SemanticIntent.TOGGLE
            if "open" in text:
                return SemanticIntent.OPEN
            if any(word in text for word in ["close", "cancel"]):
                return SemanticIntent.CLOSE
            if "expand" in text:
                return SemanticIntent.EXPAND
            if "collapse" in text:
                return SemanticIntent.COLLAPSE
            if "play" in text:
                return SemanticIntent.PLAY
            if "pause" in text:
                return SemanticIntent.PAUSE
            if "search" in text:
                return SemanticIntent.SEARCH

            return SemanticIntent.ACTION

        if role in {SemanticRole.CHECKBOX, SemanticRole.RADIO}:
            return SemanticIntent.TOGGLE

        if role == SemanticRole.SELECT:
            return SemanticIntent.SELECT

        if role == SemanticRole.TEXT_INPUT:
            input_type = element.get("type", "")
            if input_type == "search":
                return SemanticIntent.SEARCH
            return SemanticIntent.INPUT

        return SemanticIntent.UNKNOWN

    def _build_state_graph(self) -> None:
        """Build the state graph from navigation elements."""
        # Create initial state
        initial = State(
            id="initial",
            name="Initial",
            description="Initial page state",
            url_pattern="/",
            is_initial=True,
        )
        self.state_graph.states.append(initial)
        self.state_graph.initial_state = "initial"

        # Create states from links
        seen_states: set[str] = set()
        for link_id in self.interactables:
            node = self.index.get(link_id)
            if node and node.href:
                # Create a state for internal links
                if node.href.startswith("/") or node.href.startswith("#"):
                    state_id = f"state_{node.href.replace('/', '_').replace('#', 'h_')}"

                    if state_id not in seen_states:
                        seen_states.add(state_id)
                        state = State(
                            id=state_id,
                            name=node.label,
                            url_pattern=node.href,
                        )
                        self.state_graph.states.append(state)

                        # Create transition from initial
                        transition = Transition(
                            from_state="initial",
                            to_state=state_id,
                            trigger=link_id,
                            action="navigate",
                        )
                        self.state_graph.transitions.append(transition)

    def get(self, node_id: str) -> Optional[SemanticNode]:
        """Get a node by ID in O(1) time."""
        return self.index.get(node_id)

    def get_landmarks(self) -> list[SemanticNode]:
        """Get all landmark nodes."""
        return [self.index[id] for id in self.landmarks if id in self.index]

    def get_interactables(self) -> list[SemanticNode]:
        """Get all interactable nodes."""
        return [self.index[id] for id in self.interactables if id in self.index]

    def to_json(self, indent: int = 2) -> str:
        """Convert to JSON string."""
        return json.dumps(self.to_dict(), indent=indent)

    def to_dict(self) -> dict:
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
