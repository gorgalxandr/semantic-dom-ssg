"""Django views for SemanticDOM."""

from __future__ import annotations

from typing import Any, Optional

from ..core.parser import SemanticDOMParser
from ..toon.serializer import ToonSerializer


class SemanticDOMView:
    """
    Mixin for Django views that provides SemanticDOM parsing.

    Usage:
        from django.views.generic import TemplateView
        from semantic_dom_ssg.django import SemanticDOMView

        class MyView(SemanticDOMView, TemplateView):
            template_name = 'my_template.html'
    """

    _semantic_parser: Optional[SemanticDOMParser] = None

    @property
    def semantic_parser(self) -> SemanticDOMParser:
        if self._semantic_parser is None:
            self._semantic_parser = SemanticDOMParser()
        return self._semantic_parser

    def render_semantic_dom(
        self, request: Any, html: str, format: str = "json"
    ) -> dict[str, Any]:
        """
        Parse HTML and return SemanticDOM structure.

        Args:
            request: Django request object
            html: HTML string to parse
            format: Output format ('json' or 'toon')

        Returns:
            Dictionary with SemanticDOM structure
        """
        url = request.build_absolute_uri()
        doc = self.semantic_parser.parse(html, url)

        if format == "toon":
            return {
                "format": "toon",
                "content": ToonSerializer.serialize(doc),
                "token_savings": ToonSerializer.estimate_token_savings(doc).__dict__,
            }

        return {
            "format": "json",
            "content": ToonSerializer._doc_to_dict(doc),
        }

    def get_semantic_context(self, request: Any, html: str) -> dict[str, Any]:
        """
        Get context variables for SemanticDOM in templates.

        Args:
            request: Django request object
            html: HTML string to parse

        Returns:
            Context dictionary with semantic data
        """
        url = request.build_absolute_uri()
        doc = self.semantic_parser.parse(html, url)

        return {
            "semantic_dom": {
                "version": doc.version,
                "standard": doc.standard,
                "certification": {
                    "level": doc.agent_ready.level.name.lower(),
                    "score": doc.agent_ready.score,
                },
                "landmarks": [
                    {"id": str(l.id), "role": l.role, "label": l.label}
                    for l in doc.landmarks
                ],
                "interactables": [
                    {"id": str(i.id), "role": i.role, "label": i.label, "intent": i.intent}
                    for i in doc.interactables
                ],
            }
        }


def parse_html_view(request: Any) -> Any:
    """
    Function-based view for parsing HTML.

    URL: POST /_semantic-dom/parse

    Request body: HTML string
    Query params:
        - url: URL of the page (optional)
        - format: Output format ('json' or 'toon')

    Returns: SemanticDOM structure as JSON or TOON
    """
    from django.http import HttpResponse, JsonResponse
    from django.views.decorators.csrf import csrf_exempt
    from django.views.decorators.http import require_POST

    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    try:
        html = request.body.decode("utf-8")
        url = request.GET.get("url", request.build_absolute_uri())
        format_type = request.GET.get("format", "json")

        parser = SemanticDOMParser()
        doc = parser.parse(html, url)

        if format_type == "toon":
            return HttpResponse(
                ToonSerializer.serialize(doc),
                content_type="application/toon",
            )

        return JsonResponse(
            ToonSerializer._doc_to_dict(doc),
            content_type="application/semantic-dom+json",
        )

    except Exception as e:
        return JsonResponse({"error": str(e)}, status=400)
