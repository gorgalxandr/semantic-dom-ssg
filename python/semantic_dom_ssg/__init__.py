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
"""

from .types import (
    SemanticRole,
    SemanticIntent,
    SemanticNode,
    State,
    Transition,
    StateGraph,
)
from .parser import SemanticDOM
from .config import Config
from .certification import (
    AgentCertification,
    CertificationLevel,
    CheckCategory,
    ValidationCheck,
)
from .summary import (
    to_agent_summary,
    to_one_liner,
    to_nav_summary,
    to_audio_summary,
    compare_token_usage,
)
from .security import validate_url, SecurityConfig

__version__ = "0.2.0"
__all__ = [
    # Core
    "SemanticDOM",
    "Config",
    # Types
    "SemanticRole",
    "SemanticIntent",
    "SemanticNode",
    "State",
    "Transition",
    "StateGraph",
    # Certification
    "AgentCertification",
    "CertificationLevel",
    "CheckCategory",
    "ValidationCheck",
    # Summary
    "to_agent_summary",
    "to_one_liner",
    "to_nav_summary",
    "to_audio_summary",
    "compare_token_usage",
    # Security
    "validate_url",
    "SecurityConfig",
]

# Standard reference
STANDARD = "ISO/IEC-SDOM-SSG-DRAFT-2024"
