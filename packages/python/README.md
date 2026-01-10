# SemanticDOM SSG - Python

Python implementation of the SemanticDOM & Semantic State Graph (SSG) specification for AI-first web development.

## Installation

```bash
pip install semantic-dom-ssg
```

With Django integration:
```bash
pip install semantic-dom-ssg[django]
```

With MCP server support:
```bash
pip install semantic-dom-ssg[mcp]
```

## Quick Start

```python
from semantic_dom_ssg import SemanticDOMParser, ToonSerializer

# Parse HTML
parser = SemanticDOMParser()
doc = parser.parse(html_content, "https://example.com")

# O(1) element lookup
button = doc.query("submit-btn")

# List landmarks and interactables
for landmark in doc.landmarks:
    print(f"{landmark.role}: {landmark.label}")

# Get agent certification
cert = doc.agent_ready
print(f"Score: {cert.score}/100")

# Serialize to TOON format (40-50% token savings)
toon = ToonSerializer.serialize(doc)
```

## Django Integration

### Middleware
```python
# settings.py
MIDDLEWARE = [
    # ...
    'semantic_dom_ssg.django.SemanticDOMMiddleware',
]
```

### Template Tags
```django
{% load semantic_dom %}

<button {% semantic_id "submit-btn" %} {% semantic_intent "submit" %}>
    Submit
</button>

<nav {% semantic_landmark "navigation" "Main menu" %}>
    ...
</nav>
```

### Views
```python
from semantic_dom_ssg.django import SemanticDOMView

class MyView(SemanticDOMView):
    template_name = 'my_template.html'
```

## CLI

```bash
# Parse HTML to JSON
semantic-dom parse index.html

# Parse to TOON format
semantic-dom parse index.html -f toon

# Validate compliance
semantic-dom validate index.html

# Show statistics
semantic-dom stats index.html

# Run MCP server
semantic-dom mcp-server
```

## MCP Server

The package includes an MCP (Model Context Protocol) server for AI agent integration:

```bash
semantic-dom mcp-server
```

Available tools:
- `parse_html` - Parse HTML into SemanticDOM
- `semantic_query` - O(1) element lookup
- `semantic_navigate` - Navigate to landmarks
- `semantic_list_landmarks` - List all landmarks
- `semantic_list_interactables` - List interactive elements
- `semantic_state_graph` - Get state transitions
- `semantic_certification` - Get agent readiness score

## Specification

Implements ISO/IEC-SDOM-SSG-DRAFT-2024:
- O(1) element lookup via semantic IDs
- Semantic State Graph for UI state modeling
- TOON format for token-efficient serialization
- Agent certification scoring

## License

MIT
