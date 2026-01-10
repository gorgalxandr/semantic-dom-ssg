"""
SemanticDOM SSG - Python Implementation

ISO/IEC draft standard for SemanticDOM and Semantic State Graph.
O(1) element lookup, deterministic navigation, agent-ready web interoperability.
MCP and Django compatible.

Example:
    >>> from semantic_dom_ssg import SemanticDOMParser
    >>> parser = SemanticDOMParser()
    >>> doc = parser.parse(html, "https://example.com")
    >>> button = doc.query("submit-btn")
"""

from .core.parser import SemanticDOMParser
from .core.types import (
    SemanticId,
    SemanticNode,
    SemanticDocument,
    A11yInfo,
    SSGNode,
    StateTransition,
    AgentCertification,
    CertificationLevel,
    Severity,
    Check,
    Failure,
)
from .toon.serializer import ToonSerializer, ToonOptions, TokenSavings

__version__ = "0.1.0"
__standard__ = "ISO/IEC-SDOM-SSG-DRAFT-2024"

__all__ = [
    # Parser
    "SemanticDOMParser",
    # Types
    "SemanticId",
    "SemanticNode",
    "SemanticDocument",
    "A11yInfo",
    "SSGNode",
    "StateTransition",
    "AgentCertification",
    "CertificationLevel",
    "Severity",
    "Check",
    "Failure",
    # TOON
    "ToonSerializer",
    "ToonOptions",
    "TokenSavings",
    # Version
    "__version__",
    "__standard__",
]
