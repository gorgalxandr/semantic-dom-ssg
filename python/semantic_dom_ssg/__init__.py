"""
semantic-dom-ssg - Machine-readable web semantics for AI agents.

This package provides O(1) element lookup, deterministic navigation, and
token-efficient serialization formats optimized for LLM consumption.

Features:
    - O(1) Lookup: Hash-indexed nodes via dict for constant-time access
    - State Graph: Explicit FSM for UI states and transitions
    - Agent Summary: ~100 tokens vs ~800 for JSON (87% reduction)
    - Security: Input validation, URL sanitization, size limits

Quick Start:
    >>> from semantic_dom_ssg import SemanticDOM, Config
    >>> html = '<html><body><nav><a href="/">Home</a></nav></body></html>'
    >>> sdom = SemanticDOM.parse(html)
    >>> print(sdom.to_agent_summary())
    LANDMARKS: nav(nav)
    ACTIONS: [nav]Home
    STATE: initial -> Home
    STATS: 1L 1A 0H
"""

# Single source of truth for the version: pyproject.toml reads it from here.
__version__ = "0.3.0"

from .certification import (
    AgentCertification,
    CertificationLevel,
    CertificationStats,
    CheckCategory,
    ValidationCheck,
)
from .config import Config
from .parser import SemanticDOM
from .security import (
    InputTooLargeError,
    InvalidUrlError,
    InvalidUrlProtocolError,
    SecurityConfig,
    SecurityError,
    UrlTooLongError,
    sanitize_text,
    validate_url,
)
from .summary import (
    TokenComparison,
    compare_token_usage,
    to_agent_summary,
    to_audio_summary,
    to_nav_summary,
    to_one_liner,
)
from .types import (
    SemanticIntent,
    SemanticNode,
    SemanticRole,
    State,
    StateGraph,
    Transition,
)

# Standard reference
STANDARD = "ISO/IEC-SDOM-SSG-DRAFT-2024"

__all__ = [
    "STANDARD",
    "AgentCertification",
    "CertificationLevel",
    "CertificationStats",
    "CheckCategory",
    "Config",
    "InputTooLargeError",
    "InvalidUrlError",
    "InvalidUrlProtocolError",
    "SecurityConfig",
    "SecurityError",
    "SemanticDOM",
    "SemanticIntent",
    "SemanticNode",
    "SemanticRole",
    "State",
    "StateGraph",
    "TokenComparison",
    "Transition",
    "UrlTooLongError",
    "ValidationCheck",
    "__version__",
    "compare_token_usage",
    "sanitize_text",
    "to_agent_summary",
    "to_audio_summary",
    "to_nav_summary",
    "to_one_liner",
    "validate_url",
]
