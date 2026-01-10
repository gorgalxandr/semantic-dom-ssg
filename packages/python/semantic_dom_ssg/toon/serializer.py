"""TOON (Token-Oriented Object Notation) serializer."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Optional

from ..core.types import SemanticDocument, SemanticNode


@dataclass
class ToonOptions:
    """TOON serialization options."""

    include_selectors: bool = False
    include_xpath: bool = False
    indent_size: int = 2


@dataclass
class TokenSavings:
    """Token savings comparison."""

    json_tokens: int
    toon_tokens: int
    savings: int
    savings_percent: int


class ToonSerializer:
    """TOON serializer for SemanticDOM."""

    @classmethod
    def serialize(
        cls, doc: SemanticDocument, options: Optional[ToonOptions] = None
    ) -> str:
        """Serialize document to TOON format."""
        options = options or ToonOptions()
        lines: list[str] = []

        # Header
        lines.append(f"v:{doc.version}")
        lines.append(f"std:{doc.standard}")
        lines.append(f"url:{doc.url}")
        lines.append(f"title:{cls._escape(doc.title)}")
        lines.append(f"lang:{doc.language}")
        lines.append(f"ts:{doc.generated_at}")
        lines.append("")

        # Certification
        lines.append("cert:")
        lines.append(f"  level:{doc.agent_ready.level.name.lower()}")
        lines.append(f"  score:{doc.agent_ready.score}")
        lines.append("")

        # Root
        lines.append("root:")
        cls._serialize_node(lines, doc.root, 1, options)
        lines.append("")

        # Landmarks
        if doc.landmarks:
            lines.append("landmarks:")
            for landmark in doc.landmarks:
                lines.append(
                    f"  - {landmark.id} {landmark.role} {cls._escape(landmark.label)}"
                )
            lines.append("")

        # Interactables
        if doc.interactables:
            lines.append("interactables:")
            for inter in doc.interactables:
                intent_part = f" ->{inter.intent}" if inter.intent else ""
                lines.append(
                    f"  - {inter.id} {inter.role} {cls._escape(inter.label)}{intent_part}"
                )

        return "\n".join(lines)

    @classmethod
    def serialize_node(cls, node: SemanticNode) -> str:
        """Serialize a single node to TOON format."""
        lines: list[str] = []
        cls._serialize_node(lines, node, 0, ToonOptions())
        return "\n".join(lines)

    @classmethod
    def _serialize_node(
        cls, lines: list[str], node: SemanticNode, indent: int, options: ToonOptions
    ) -> None:
        indent_str = "  " * indent

        # Compact format
        intent_part = f" ->{node.intent}" if node.intent else ""
        state_part = f" [{node.state}]" if node.state != "idle" else ""
        label_part = f' "{cls._escape(node.label)}"' if node.label else ""

        lines.append(f"{indent_str}{node.id} {node.role}{label_part}{intent_part}{state_part}")

        # A11y info
        if node.a11y.focusable or node.a11y.level is not None:
            a11y_parts = ["a11y:"]
            if node.a11y.focusable:
                a11y_parts.append("focusable")
            if node.a11y.in_tab_order:
                a11y_parts.append("tab")
            if node.a11y.level is not None:
                a11y_parts.append(f"L{node.a11y.level}")
            lines.append(f"{indent_str}  {' '.join(a11y_parts)}")

        # Selectors
        if options.include_selectors and node.selector:
            lines.append(f"{indent_str}  sel:{node.selector}")

        # Children
        for child in node.children:
            cls._serialize_node(lines, child, indent + 1, options)

    @classmethod
    def serialize_json(cls, doc: SemanticDocument) -> str:
        """Serialize document to JSON format."""
        return json.dumps(cls._doc_to_dict(doc), indent=2)

    @classmethod
    def _doc_to_dict(cls, doc: SemanticDocument) -> dict:
        return {
            "version": doc.version,
            "standard": doc.standard,
            "url": doc.url,
            "title": doc.title,
            "language": doc.language,
            "generatedAt": doc.generated_at,
            "agentReady": {
                "level": doc.agent_ready.level.name.lower(),
                "score": doc.agent_ready.score,
                "checks": [
                    {"id": c.id, "name": c.name, "passed": c.passed}
                    for c in doc.agent_ready.checks
                ],
                "failures": [
                    {
                        "id": f.id,
                        "name": f.name,
                        "message": f.message,
                        "severity": f.severity.value,
                    }
                    for f in doc.agent_ready.failures
                ],
            },
            "root": cls._node_to_dict(doc.root),
            "landmarks": [
                {"id": str(l.id), "role": l.role, "label": l.label}
                for l in doc.landmarks
            ],
            "interactables": [
                {"id": str(i.id), "role": i.role, "label": i.label, "intent": i.intent}
                for i in doc.interactables
            ],
        }

    @classmethod
    def _node_to_dict(cls, node: SemanticNode) -> dict:
        return {
            "id": str(node.id),
            "role": node.role,
            "label": node.label,
            "intent": node.intent,
            "state": node.state,
            "selector": node.selector,
            "a11y": {
                "name": node.a11y.name,
                "focusable": node.a11y.focusable,
                "inTabOrder": node.a11y.in_tab_order,
                "level": node.a11y.level,
            },
            "children": [cls._node_to_dict(c) for c in node.children],
        }

    @classmethod
    def estimate_token_savings(cls, doc: SemanticDocument) -> TokenSavings:
        """Estimate token savings from using TOON vs JSON."""
        json_str = cls.serialize_json(doc)
        toon_str = cls.serialize(doc)

        # Rough estimate: ~4 chars per token
        json_tokens = len(json_str) // 4 + 1
        toon_tokens = len(toon_str) // 4 + 1
        savings = json_tokens - toon_tokens
        savings_percent = round((savings / json_tokens) * 100) if json_tokens > 0 else 0

        return TokenSavings(
            json_tokens=json_tokens,
            toon_tokens=toon_tokens,
            savings=savings,
            savings_percent=savings_percent,
        )

    @staticmethod
    def _escape(s: str) -> str:
        return (
            s.replace("\\", "\\\\")
            .replace('"', '\\"')
            .replace("\n", "\\n")
            .replace("\r", "\\r")
            .replace("\t", "\\t")
        )
