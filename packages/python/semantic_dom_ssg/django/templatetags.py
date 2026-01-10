"""Django template tags for SemanticDOM."""

from __future__ import annotations

from typing import Any

try:
    from django import template
    from django.utils.safestring import mark_safe

    register = template.Library()

    @register.simple_tag
    def semantic_id(element_id: str) -> str:
        """
        Generate a data-agent-id attribute.

        Usage:
            <button {% semantic_id 'submit-btn' %}>Submit</button>

        Output:
            <button data-agent-id="submit-btn">Submit</button>
        """
        return mark_safe(f'data-agent-id="{element_id}"')

    @register.simple_tag
    def semantic_intent(intent: str) -> str:
        """
        Generate a data-agent-intent attribute.

        Usage:
            <button {% semantic_intent 'submit' %}>Submit</button>

        Output:
            <button data-agent-intent="submit">Submit</button>
        """
        return mark_safe(f'data-agent-intent="{intent}"')

    @register.simple_tag
    def semantic_role(role: str) -> str:
        """
        Generate a data-agent-role attribute.

        Usage:
            <div {% semantic_role 'navigation' %}>...</div>

        Output:
            <div data-agent-role="navigation">...</div>
        """
        return mark_safe(f'data-agent-role="{role}"')

    @register.simple_tag
    def semantic_label(label: str) -> str:
        """
        Generate a data-agent-label attribute.

        Usage:
            <button {% semantic_label 'Submit Form' %}>Submit</button>

        Output:
            <button data-agent-label="Submit Form">Submit</button>
        """
        return mark_safe(f'data-agent-label="{label}"')

    @register.simple_tag
    def semantic_attrs(
        element_id: str | None = None,
        intent: str | None = None,
        role: str | None = None,
        label: str | None = None,
    ) -> str:
        """
        Generate multiple semantic attributes at once.

        Usage:
            <button {% semantic_attrs id='submit-btn' intent='submit' %}>Submit</button>

        Output:
            <button data-agent-id="submit-btn" data-agent-intent="submit">Submit</button>
        """
        attrs = []
        if element_id:
            attrs.append(f'data-agent-id="{element_id}"')
        if intent:
            attrs.append(f'data-agent-intent="{intent}"')
        if role:
            attrs.append(f'data-agent-role="{role}"')
        if label:
            attrs.append(f'data-agent-label="{label}"')
        return mark_safe(" ".join(attrs))

    @register.inclusion_tag("semantic_dom_ssg/meta.html", takes_context=True)
    def semantic_meta(context: dict[str, Any]) -> dict[str, Any]:
        """
        Include SemanticDOM meta information in the page head.

        Usage:
            {% load semantic_dom_ssg %}
            <head>
                {% semantic_meta %}
            </head>

        Creates:
            <meta name="semantic-dom-version" content="0.1.0">
            <meta name="semantic-dom-standard" content="ISO/IEC-SDOM-SSG-DRAFT-2024">
        """
        from .. import __version__, __standard__

        return {
            "version": __version__,
            "standard": __standard__,
        }

except ImportError:
    # Django not installed
    register = None
