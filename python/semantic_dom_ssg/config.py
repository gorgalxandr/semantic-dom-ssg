"""Configuration for SemanticDOM parsing."""

from dataclasses import dataclass, field


@dataclass
class Config:
    """Configuration for SemanticDOM parsing."""

    # Maximum input size in bytes (default: 10MB)
    max_input_size: int = 10 * 1024 * 1024

    # ID prefix for generated semantic IDs
    id_prefix: str = "sdom"

    # Maximum tree depth to parse
    max_depth: int = 50

    # Elements to exclude from parsing
    exclude_tags: list[str] = field(
        default_factory=lambda: ["script", "style", "noscript", "template"]
    )

    # Whether to generate state graph
    include_state_graph: bool = True

    # Whether to run certification checks
    validate: bool = True

    @classmethod
    def default(cls) -> "Config":
        """Create default configuration."""
        return cls()

    @classmethod
    def minimal(cls) -> "Config":
        """Create minimal configuration (no state graph, no validation)."""
        return cls(include_state_graph=False, validate=False)
