"""MCP Server implementation for SemanticDOM over stdio."""

from __future__ import annotations

import json
import sys
from typing import Any, Optional

from ..core.parser import SemanticDOMParser
from ..core.types import SemanticDocument, SemanticId
from ..toon.serializer import ToonSerializer

SERVER_NAME = "semantic-dom-ssg"
SERVER_VERSION = "0.1.0"
PROTOCOL_VERSION = "2024-11-05"


class MCPTools:
    """MCP Tools implementation for SemanticDOM."""

    def __init__(self) -> None:
        self.parser = SemanticDOMParser()
        self.document: Optional[SemanticDocument] = None

    def set_document(self, doc: SemanticDocument) -> None:
        self.document = doc

    def query(self, element_id: str) -> str:
        """Query element by semantic ID with O(1) lookup."""
        if not self.document:
            return self._error("No document loaded")

        node = self.document.query(element_id)
        if not node:
            return self._error(f"Element not found: {element_id}")

        return ToonSerializer.serialize_node(node)

    def navigate(self, landmark: str) -> str:
        """Navigate to a landmark region."""
        if not self.document:
            return self._error("No document loaded")

        node = self.document.navigate(landmark)
        if not node:
            return self._error(f"Landmark not found: {landmark}")

        return ToonSerializer.serialize_node(node)

    def list_landmarks(self) -> str:
        """List all landmark regions."""
        if not self.document:
            return self._error("No document loaded")

        landmarks = [
            {"id": str(l.id), "role": l.role, "label": l.label}
            for l in self.document.landmarks
        ]
        return json.dumps({"landmarks": landmarks}, indent=2)

    def list_interactables(self, filter_role: Optional[str] = None) -> str:
        """List all interactive elements."""
        if not self.document:
            return self._error("No document loaded")

        interactables = self.document.interactables
        if filter_role:
            interactables = [i for i in interactables if i.role.lower() == filter_role.lower()]

        result = [
            {
                "id": str(i.id),
                "role": i.role,
                "label": i.label,
                "intent": i.intent,
                "state": i.state,
            }
            for i in interactables
        ]
        return json.dumps({"interactables": result}, indent=2)

    def get_state_graph(self, element_id: Optional[str] = None) -> str:
        """Get the Semantic State Graph."""
        if not self.document:
            return self._error("No document loaded")

        graph = self.document.state_graph

        if element_id:
            ssg = graph.get(SemanticId(element_id))
            if not ssg:
                return self._error(f"State node not found: {element_id}")
            return json.dumps(
                {
                    "id": str(ssg.node_id),
                    "currentState": ssg.current_state,
                    "transitions": [
                        {"from": t.from_state, "to": t.to_state, "trigger": t.trigger}
                        for t in ssg.transitions
                    ],
                },
                indent=2,
            )

        nodes = [
            {
                "id": str(ssg.node_id),
                "currentState": ssg.current_state,
                "transitions": len(ssg.transitions),
            }
            for ssg in graph.values()
        ]
        return json.dumps({"stateGraph": nodes}, indent=2)

    def get_certification(self) -> str:
        """Get agent certification status."""
        if not self.document:
            return self._error("No document loaded")

        cert = self.document.agent_ready
        return json.dumps(
            {
                "level": cert.level.name.lower(),
                "score": cert.score,
                "passed": [c.name for c in cert.checks if c.passed],
                "failed": [
                    {"name": f.name, "severity": f.severity.value, "message": f.message}
                    for f in cert.failures
                ],
            },
            indent=2,
        )

    def get_tool_definitions(self) -> list[dict[str, Any]]:
        """Get MCP tool definitions."""
        return [
            {
                "name": "parse_html",
                "description": "Parse HTML into SemanticDOM structure",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "html": {"type": "string", "description": "HTML content to parse"},
                        "url": {"type": "string", "description": "URL of the page (optional)"},
                    },
                    "required": ["html"],
                },
            },
            {
                "name": "semantic_query",
                "description": "Query element by semantic ID with O(1) lookup",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "id": {"type": "string", "description": "Semantic ID of the element"},
                    },
                    "required": ["id"],
                },
            },
            {
                "name": "semantic_navigate",
                "description": "Navigate to a landmark region",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "landmark": {"type": "string", "description": "Landmark role or ID"},
                    },
                    "required": ["landmark"],
                },
            },
            {
                "name": "semantic_list_landmarks",
                "description": "List all landmark regions",
                "inputSchema": {"type": "object", "properties": {}},
            },
            {
                "name": "semantic_list_interactables",
                "description": "List all interactive elements",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "filter": {"type": "string", "description": "Optional filter by role"},
                    },
                },
            },
            {
                "name": "semantic_state_graph",
                "description": "Get the Semantic State Graph",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "id": {"type": "string", "description": "Optional: filter to specific element"},
                    },
                },
            },
            {
                "name": "semantic_certification",
                "description": "Get agent certification status",
                "inputSchema": {"type": "object", "properties": {}},
            },
        ]

    def execute_tool(self, name: str, args: dict[str, Any]) -> str:
        """Execute an MCP tool by name."""
        if name == "parse_html":
            html = args.get("html", "")
            url = args.get("url", "file://local")
            if not html:
                return self._error("Missing html parameter")
            doc = self.parser.parse(html, url)
            self.document = doc
            return f"Document parsed: {doc.node_count} nodes, certification: {doc.agent_ready.level.name.lower()}"

        if name == "semantic_query":
            return self.query(args.get("id", ""))

        if name == "semantic_navigate":
            return self.navigate(args.get("landmark", ""))

        if name == "semantic_list_landmarks":
            return self.list_landmarks()

        if name == "semantic_list_interactables":
            return self.list_interactables(args.get("filter"))

        if name == "semantic_state_graph":
            return self.get_state_graph(args.get("id"))

        if name == "semantic_certification":
            return self.get_certification()

        return self._error(f"Unknown tool: {name}")

    @staticmethod
    def _error(message: str) -> str:
        return json.dumps({"error": message})


class SemanticDOMMCPServer:
    """MCP Server for SemanticDOM over stdio."""

    def __init__(self) -> None:
        self.tools = MCPTools()

    def run(self) -> None:
        """Run the MCP server on stdio."""
        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue

            try:
                request = json.loads(line)
                response = self._handle_request(request)
                if response:
                    print(json.dumps(response), flush=True)
            except json.JSONDecodeError as e:
                print(
                    json.dumps(
                        {
                            "jsonrpc": "2.0",
                            "id": None,
                            "error": {"code": -32700, "message": f"Parse error: {e}"},
                        }
                    ),
                    flush=True,
                )

    def _handle_request(self, request: dict[str, Any]) -> Optional[dict[str, Any]]:
        jsonrpc = request.get("jsonrpc")
        if jsonrpc != "2.0":
            return self._error(request.get("id"), -32600, "Invalid Request")

        method = request.get("method", "")
        params = request.get("params", {})
        request_id = request.get("id")

        # Notifications don't get responses
        if request_id is None and method == "initialized":
            return None

        try:
            result = self._dispatch(method, params)
            return {"jsonrpc": "2.0", "id": request_id, "result": result}
        except MCPError as e:
            return self._error(request_id, e.code, e.message)
        except Exception as e:
            return self._error(request_id, -32603, f"Internal error: {e}")

    def _dispatch(self, method: str, params: dict[str, Any]) -> Any:
        if method == "initialize":
            return {
                "protocolVersion": PROTOCOL_VERSION,
                "serverInfo": {"name": SERVER_NAME, "version": SERVER_VERSION},
                "capabilities": {
                    "tools": {},
                    "resources": {"subscribe": False, "listChanged": True},
                    "prompts": {"listChanged": False},
                },
            }

        if method == "tools/list":
            return {"tools": self.tools.get_tool_definitions()}

        if method == "tools/call":
            name = params.get("name", "")
            args = params.get("arguments", {})
            result = self.tools.execute_tool(name, args)
            return {"content": [{"type": "text", "text": result}]}

        if method == "resources/list":
            if not self.tools.document:
                return {"resources": []}
            doc = self.tools.document
            return {
                "resources": [
                    {
                        "uri": f"semantic-dom://{doc.url}",
                        "mimeType": "application/toon",
                        "name": doc.title or "SemanticDOM Document",
                        "description": f"{len(doc.landmarks)} landmarks, {len(doc.interactables)} interactables",
                    }
                ]
            }

        if method == "resources/read":
            if not self.tools.document:
                raise MCPError(-32602, "No document loaded")
            uri = params.get("uri", "")
            return {
                "contents": [
                    {
                        "uri": uri,
                        "mimeType": "application/toon",
                        "text": ToonSerializer.serialize(self.tools.document),
                    }
                ]
            }

        if method == "prompts/list":
            return {
                "prompts": [
                    {
                        "name": "analyze_page",
                        "description": "Analyze page structure",
                        "arguments": [{"name": "goal", "description": "What to accomplish", "required": True}],
                    },
                    {
                        "name": "find_element",
                        "description": "Find the best element for a task",
                        "arguments": [{"name": "task", "description": "What you want to do", "required": True}],
                    },
                ]
            }

        if method == "shutdown":
            return {}

        raise MCPError(-32601, f"Method not found: {method}")

    @staticmethod
    def _error(request_id: Any, code: int, message: str) -> dict[str, Any]:
        return {
            "jsonrpc": "2.0",
            "id": request_id,
            "error": {"code": code, "message": message},
        }


class MCPError(Exception):
    """MCP protocol error."""

    def __init__(self, code: int, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


def main() -> None:
    """Entry point for MCP server."""
    server = SemanticDOMMCPServer()
    server.run()


if __name__ == "__main__":
    main()
