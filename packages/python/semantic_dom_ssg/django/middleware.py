"""Django middleware for SemanticDOM parsing."""

from __future__ import annotations

from typing import Callable, Any

from ..core.parser import SemanticDOMParser
from ..toon.serializer import ToonSerializer


class SemanticDOMMiddleware:
    """
    Django middleware that parses rendered HTML responses into SemanticDOM.

    Adds semantic DOM structure to responses when requested via Accept header
    or query parameter.

    Usage:
        MIDDLEWARE = [
            ...
            'semantic_dom_ssg.django.SemanticDOMMiddleware',
        ]

    Request with:
        GET /page/?format=semantic-dom
        or
        Accept: application/semantic-dom+json
        Accept: application/toon
    """

    def __init__(self, get_response: Callable[[Any], Any]) -> None:
        self.get_response = get_response
        self.parser = SemanticDOMParser()

    def __call__(self, request: Any) -> Any:
        response = self.get_response(request)

        # Check if semantic DOM output is requested
        accept = request.headers.get("Accept", "")
        format_param = request.GET.get("format", "")

        wants_semantic = any([
            "application/semantic-dom" in accept,
            "application/toon" in accept,
            format_param in ("semantic-dom", "toon"),
        ])

        if not wants_semantic:
            return response

        # Only process HTML responses
        content_type = response.get("Content-Type", "")
        if "text/html" not in content_type:
            return response

        # Parse the HTML response
        try:
            html = response.content.decode("utf-8")
            url = request.build_absolute_uri()
            doc = self.parser.parse(html, url)

            # Determine output format
            if "application/toon" in accept or format_param == "toon":
                output = ToonSerializer.serialize(doc)
                response["Content-Type"] = "application/toon"
            else:
                output = ToonSerializer.serialize_json(doc)
                response["Content-Type"] = "application/semantic-dom+json"

            response.content = output.encode("utf-8")

        except Exception as e:
            # On error, add header but return original response
            response["X-SemanticDOM-Error"] = str(e)

        return response


class SemanticDOMAPIMiddleware:
    """
    Middleware that exposes SemanticDOM parsing as an API endpoint.

    Handles POST requests to /_semantic-dom/parse with HTML body.
    """

    def __init__(self, get_response: Callable[[Any], Any]) -> None:
        self.get_response = get_response
        self.parser = SemanticDOMParser()
        self.endpoint = "/_semantic-dom/parse"

    def __call__(self, request: Any) -> Any:
        if request.path == self.endpoint and request.method == "POST":
            return self._handle_parse(request)
        return self.get_response(request)

    def _handle_parse(self, request: Any) -> Any:
        from django.http import JsonResponse

        try:
            html = request.body.decode("utf-8")
            url = request.GET.get("url", request.build_absolute_uri())
            format_type = request.GET.get("format", "json")

            doc = self.parser.parse(html, url)

            if format_type == "toon":
                return JsonResponse(
                    {"toon": ToonSerializer.serialize(doc)},
                    content_type="application/toon",
                )
            else:
                return JsonResponse(
                    ToonSerializer._doc_to_dict(doc),
                    content_type="application/semantic-dom+json",
                )

        except Exception as e:
            return JsonResponse({"error": str(e)}, status=400)
