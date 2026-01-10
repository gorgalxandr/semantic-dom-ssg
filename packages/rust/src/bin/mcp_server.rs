//! MCP Server binary for SemanticDOM over stdio

use semantic_dom_ssg::{SemanticDOMParser, SemanticDocument, ToonSerializer};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{self, BufRead, Write};

const SERVER_NAME: &str = "semantic-dom-ssg";
const SERVER_VERSION: &str = env!("CARGO_PKG_VERSION");
const PROTOCOL_VERSION: &str = "2024-11-05";

#[derive(Debug, Serialize, Deserialize)]
struct JsonRpcRequest {
    jsonrpc: String,
    id: Option<Value>,
    method: String,
    params: Option<Value>,
}

#[derive(Debug, Serialize)]
struct JsonRpcResponse {
    jsonrpc: String,
    id: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<JsonRpcError>,
}

#[derive(Debug, Serialize)]
struct JsonRpcError {
    code: i32,
    message: String,
}

struct MCPServer {
    parser: SemanticDOMParser,
    document: Option<SemanticDocument>,
}

impl MCPServer {
    fn new() -> Self {
        Self {
            parser: SemanticDOMParser::new(),
            document: None,
        }
    }

    fn handle_request(&mut self, request: JsonRpcRequest) -> Option<JsonRpcResponse> {
        let result = match request.method.as_str() {
            "initialize" => self.handle_initialize(),
            "initialized" => return None, // Notification, no response
            "tools/list" => self.handle_tools_list(),
            "tools/call" => self.handle_tools_call(request.params),
            "resources/list" => self.handle_resources_list(),
            "resources/read" => self.handle_resources_read(request.params),
            "prompts/list" => self.handle_prompts_list(),
            "shutdown" => Ok(json!({})),
            _ => Err((-32601, format!("Method not found: {}", request.method))),
        };

        Some(match result {
            Ok(value) => JsonRpcResponse {
                jsonrpc: "2.0".to_string(),
                id: request.id,
                result: Some(value),
                error: None,
            },
            Err((code, message)) => JsonRpcResponse {
                jsonrpc: "2.0".to_string(),
                id: request.id,
                result: None,
                error: Some(JsonRpcError { code, message }),
            },
        })
    }

    fn handle_initialize(&self) -> Result<Value, (i32, String)> {
        Ok(json!({
            "protocolVersion": PROTOCOL_VERSION,
            "serverInfo": {
                "name": SERVER_NAME,
                "version": SERVER_VERSION
            },
            "capabilities": {
                "tools": {},
                "resources": { "subscribe": false, "listChanged": true },
                "prompts": { "listChanged": false }
            }
        }))
    }

    fn handle_tools_list(&self) -> Result<Value, (i32, String)> {
        Ok(json!({
            "tools": [
                {
                    "name": "parse_html",
                    "description": "Parse HTML into SemanticDOM structure",
                    "inputSchema": {
                        "type": "object",
                        "properties": {
                            "html": { "type": "string", "description": "HTML content to parse" },
                            "url": { "type": "string", "description": "URL of the page (optional)" }
                        },
                        "required": ["html"]
                    }
                },
                {
                    "name": "semantic_query",
                    "description": "Query element by semantic ID with O(1) lookup",
                    "inputSchema": {
                        "type": "object",
                        "properties": {
                            "id": { "type": "string", "description": "Semantic ID of the element" }
                        },
                        "required": ["id"]
                    }
                },
                {
                    "name": "semantic_navigate",
                    "description": "Navigate to a landmark region",
                    "inputSchema": {
                        "type": "object",
                        "properties": {
                            "landmark": { "type": "string", "description": "Landmark role or ID" }
                        },
                        "required": ["landmark"]
                    }
                },
                {
                    "name": "semantic_list_landmarks",
                    "description": "List all landmark regions",
                    "inputSchema": { "type": "object", "properties": {} }
                },
                {
                    "name": "semantic_list_interactables",
                    "description": "List all interactive elements",
                    "inputSchema": {
                        "type": "object",
                        "properties": {
                            "filter": { "type": "string", "description": "Optional filter by role" }
                        }
                    }
                },
                {
                    "name": "semantic_state_graph",
                    "description": "Get the Semantic State Graph",
                    "inputSchema": {
                        "type": "object",
                        "properties": {
                            "id": { "type": "string", "description": "Optional: filter to specific element" }
                        }
                    }
                },
                {
                    "name": "semantic_certification",
                    "description": "Get agent certification status",
                    "inputSchema": { "type": "object", "properties": {} }
                }
            ]
        }))
    }

    fn handle_tools_call(&mut self, params: Option<Value>) -> Result<Value, (i32, String)> {
        let params = params.ok_or((-32602, "Missing params".to_string()))?;
        let name = params["name"].as_str().ok_or((-32602, "Missing tool name".to_string()))?;
        let args = params.get("arguments").cloned().unwrap_or(json!({}));

        let result = match name {
            "parse_html" => {
                let html = args["html"].as_str().ok_or((-32602, "Missing html".to_string()))?;
                let url = args["url"].as_str().unwrap_or("file://local");

                match self.parser.parse(html, url) {
                    Ok(doc) => {
                        let msg = format!(
                            "Document parsed: {} nodes, certification: {:?}",
                            doc.node_count(),
                            doc.agent_ready.level
                        );
                        self.document = Some(doc);
                        msg
                    }
                    Err(e) => return Err((-32603, format!("Parse error: {}", e))),
                }
            }
            "semantic_query" => {
                let doc = self.document.as_ref().ok_or((-32602, "No document loaded".to_string()))?;
                let id = args["id"].as_str().ok_or((-32602, "Missing id".to_string()))?;

                match doc.query(id) {
                    Some(node) => ToonSerializer::serialize_node_string(node),
                    None => format!("Element not found: {}", id),
                }
            }
            "semantic_navigate" => {
                let doc = self.document.as_ref().ok_or((-32602, "No document loaded".to_string()))?;
                let landmark = args["landmark"].as_str().ok_or((-32602, "Missing landmark".to_string()))?;

                match doc.navigate(landmark) {
                    Some(node) => ToonSerializer::serialize_node_string(node),
                    None => format!("Landmark not found: {}", landmark),
                }
            }
            "semantic_list_landmarks" => {
                let doc = self.document.as_ref().ok_or((-32602, "No document loaded".to_string()))?;
                let landmarks: Vec<_> = doc.landmarks().iter().map(|l| {
                    json!({ "id": l.id.as_str(), "role": &l.role, "label": &l.label })
                }).collect();
                serde_json::to_string_pretty(&json!({ "landmarks": landmarks })).unwrap()
            }
            "semantic_list_interactables" => {
                let doc = self.document.as_ref().ok_or((-32602, "No document loaded".to_string()))?;
                let filter = args["filter"].as_str();
                let interactables: Vec<_> = doc.interactables().iter()
                    .filter(|i| filter.map_or(true, |f| i.role.eq_ignore_ascii_case(f)))
                    .map(|i| {
                        json!({
                            "id": i.id.as_str(),
                            "role": &i.role,
                            "label": &i.label,
                            "intent": &i.intent
                        })
                    }).collect();
                serde_json::to_string_pretty(&json!({ "interactables": interactables })).unwrap()
            }
            "semantic_state_graph" => {
                let doc = self.document.as_ref().ok_or((-32602, "No document loaded".to_string()))?;
                let graph = doc.state_graph();

                if let Some(id) = args["id"].as_str() {
                    match graph.get(&id.into()) {
                        Some(ssg) => serde_json::to_string_pretty(&json!({
                            "id": ssg.node_id.as_str(),
                            "currentState": &ssg.current_state,
                            "transitions": ssg.transitions.iter().map(|t| {
                                json!({ "from": &t.from, "to": &t.to, "trigger": &t.trigger })
                            }).collect::<Vec<_>>()
                        })).unwrap(),
                        None => format!("State node not found: {}", id),
                    }
                } else {
                    let nodes: Vec<_> = graph.values().map(|ssg| {
                        json!({
                            "id": ssg.node_id.as_str(),
                            "currentState": &ssg.current_state,
                            "transitions": ssg.transitions.len()
                        })
                    }).collect();
                    serde_json::to_string_pretty(&json!({ "stateGraph": nodes })).unwrap()
                }
            }
            "semantic_certification" => {
                let doc = self.document.as_ref().ok_or((-32602, "No document loaded".to_string()))?;
                serde_json::to_string_pretty(&json!({
                    "level": format!("{:?}", doc.agent_ready.level).to_lowercase(),
                    "score": doc.agent_ready.score,
                    "passed": doc.agent_ready.checks.iter().filter(|c| c.passed).map(|c| &c.name).collect::<Vec<_>>(),
                    "failed": doc.agent_ready.failures.iter().map(|f| {
                        json!({ "name": &f.name, "severity": format!("{:?}", f.severity).to_lowercase(), "message": &f.message })
                    }).collect::<Vec<_>>()
                })).unwrap()
            }
            _ => return Err((-32601, format!("Unknown tool: {}", name))),
        };

        Ok(json!({
            "content": [{ "type": "text", "text": result }]
        }))
    }

    fn handle_resources_list(&self) -> Result<Value, (i32, String)> {
        match &self.document {
            Some(doc) => Ok(json!({
                "resources": [{
                    "uri": format!("semantic-dom://{}", doc.url),
                    "mimeType": "application/toon",
                    "name": if doc.title.is_empty() { "SemanticDOM Document" } else { &doc.title },
                    "description": format!("{} landmarks, {} interactables", doc.landmarks().len(), doc.interactables().len())
                }]
            })),
            None => Ok(json!({ "resources": [] })),
        }
    }

    fn handle_resources_read(&self, params: Option<Value>) -> Result<Value, (i32, String)> {
        let doc = self.document.as_ref().ok_or((-32602, "No document loaded".to_string()))?;
        let params = params.ok_or((-32602, "Missing params".to_string()))?;
        let uri = params["uri"].as_str().ok_or((-32602, "Missing uri".to_string()))?;

        Ok(json!({
            "contents": [{
                "uri": uri,
                "mimeType": "application/toon",
                "text": ToonSerializer::serialize(doc)
            }]
        }))
    }

    fn handle_prompts_list(&self) -> Result<Value, (i32, String)> {
        Ok(json!({
            "prompts": [
                {
                    "name": "analyze_page",
                    "description": "Analyze page structure and provide navigation guidance",
                    "arguments": [{ "name": "goal", "description": "What to accomplish", "required": true }]
                },
                {
                    "name": "find_element",
                    "description": "Find the best element for a task",
                    "arguments": [{ "name": "task", "description": "What you want to do", "required": true }]
                },
                {
                    "name": "automation_plan",
                    "description": "Generate automation plan using semantic IDs",
                    "arguments": [{ "name": "workflow", "description": "Workflow to automate", "required": true }]
                }
            ]
        }))
    }

    fn run(&mut self) {
        let stdin = io::stdin();
        let mut stdout = io::stdout();

        for line in stdin.lock().lines() {
            let line = match line {
                Ok(l) => l,
                Err(_) => break,
            };

            if line.trim().is_empty() {
                continue;
            }

            let request: JsonRpcRequest = match serde_json::from_str(&line) {
                Ok(r) => r,
                Err(e) => {
                    let error_response = JsonRpcResponse {
                        jsonrpc: "2.0".to_string(),
                        id: None,
                        result: None,
                        error: Some(JsonRpcError {
                            code: -32700,
                            message: format!("Parse error: {}", e),
                        }),
                    };
                    let _ = writeln!(stdout, "{}", serde_json::to_string(&error_response).unwrap());
                    continue;
                }
            };

            if let Some(response) = self.handle_request(request) {
                let _ = writeln!(stdout, "{}", serde_json::to_string(&response).unwrap());
            }
        }
    }
}

fn main() {
    let mut server = MCPServer::new();
    server.run();
}
