"""Core SemanticDOM types and parser."""

from .types import (
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
from .parser import SemanticDOMParser

__all__ = [
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
    "SemanticDOMParser",
]
