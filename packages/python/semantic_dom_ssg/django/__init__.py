"""Django integration for SemanticDOM SSG."""

from .middleware import SemanticDOMMiddleware
from .views import SemanticDOMView
from .templatetags import register

__all__ = ["SemanticDOMMiddleware", "SemanticDOMView", "register"]
