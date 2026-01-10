"""
Discovery Tools for Claude Chat

Tools for discovering available node types, schemas, and models.
"""

from typing import Any, Dict, List, Optional
from .base import Tool, ToolRegistry


@ToolRegistry.register
class ListNodesTool(Tool):
    """List all nodes currently in the workflow."""

    name = "list_nodes"
    description = """List all nodes in the current workflow.

This shows nodes that exist in the canvas, NOT available node types to add.
- For available node types: use list_available_nodes or search_available_nodes
- For finding specific nodes: use find_nodes

Often unnecessary since auto-context provides workflow state."""

    parameters = {
        "type": "object",
        "properties": {
            "verbose": {
                "type": "boolean",
                "description": "Include position, size, connections per node",
                "default": False
            }
        }
    }

    async def execute(self, verbose: bool = False) -> Dict[str, Any]:
        return {
            "action": "list_nodes",
            "params": {"verbose": verbose},
            "execute_client_side": True
        }


@ToolRegistry.register
class ListAvailableNodesTool(Tool):
    """List available node types that can be added."""

    name = "list_available_nodes"
    description = """List available ComfyUI node types that can be added to a workflow.

Returns node types organized by category. Use this to discover what nodes
are installed and available. For searching by name, use search_available_nodes."""

    parameters = {
        "type": "object",
        "properties": {
            "category": {
                "type": "string",
                "description": "Filter by category (e.g., 'loaders', 'sampling', 'conditioning')"
            }
        }
    }

    async def execute(self, category: str = None) -> Dict[str, Any]:
        return {
            "action": "list_available_nodes",
            "params": {"category": category},
            "execute_client_side": True
        }


@ToolRegistry.register
class GetContextTool(Tool):
    """Request higher context detail level."""

    name = "get_context"
    description = """Request higher context detail level than auto-injected.

Levels:
- Level 1: Node list, groups, flow, issues (~150-250 tokens)
- Level 2: + Connection details with slots (~350-500 tokens)
- Level 3: + Positions, sizes, widget values (~800-2000 tokens)

Use 'nodes' param to get detail for specific nodes only, reducing token cost."""

    parameters = {
        "type": "object",
        "properties": {
            "level": {
                "type": "integer",
                "description": "Detail level (1-3)",
                "minimum": 1,
                "maximum": 3
            },
            "nodes": {
                "type": "array",
                "description": "Specific node IDs to include (optional)",
                "items": {"type": "integer"}
            }
        }
    }

    async def execute(self, level: int = 2, nodes: List[int] = None) -> Dict[str, Any]:
        return {
            "action": "get_context",
            "params": {"level": level, "nodes": nodes},
            "execute_client_side": True
        }


@ToolRegistry.register
class SearchAvailableNodesTool(Tool):
    """Search for available node types by keyword."""

    name = "search_available_nodes"
    description = """Search available ComfyUI node types by keyword.

Use this to find specific node types that can be added to a workflow.
Returns up to 100 results matching the search criteria.

Example categories: loaders, sampling, conditioning, latent, image, mask, advanced"""

    parameters = {
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "Search term to filter nodes by name (e.g., 'sampler', 'lora', 'clip')"
            },
            "category": {
                "type": "string",
                "description": "Filter by category (e.g., 'loaders', 'sampling', 'conditioning')"
            }
        }
    }

    async def execute(self, query: str = None, category: str = None) -> Dict[str, Any]:
        return {
            "action": "search_node_types",
            "params": {"query": query, "category": category},
            "execute_client_side": True
        }


@ToolRegistry.register
class GetNodeSchemaTool(Tool):
    """Get the schema for a specific node type."""

    name = "get_node_schema"
    description = """Get the full schema for a node type, including:
- Input slots (what connections it accepts)
- Output slots (what connections it provides)
- Widget parameters (configurable values)
- Default values

Use this before creating nodes to understand how to configure them."""

    parameters = {
        "type": "object",
        "properties": {
            "type": {
                "type": "string",
                "description": "Node type to get schema for (e.g., 'KSampler', 'CheckpointLoaderSimple')"
            }
        },
        "required": ["type"]
    }

    async def execute(self, type: str) -> Dict[str, Any]:
        return {
            "action": "get_node_schema",
            "params": {"type": type},
            "execute_client_side": True
        }


@ToolRegistry.register
class ListAvailableModelsTool(Tool):
    """List available models by type."""

    name = "list_available_models"
    description = """List available models in ComfyUI.

Only call this when the user asks to add or change models.
Do NOT call just to see what's available - models are listed
in the auto-injected context when relevant.

Types: checkpoints, loras, vae, controlnet, upscale_models, embeddings"""

    parameters = {
        "type": "object",
        "properties": {
            "type": {
                "type": "string",
                "enum": ["checkpoints", "loras", "vae", "controlnet", "upscale_models", "embeddings"],
                "description": "Type of models to list"
            }
        },
        "required": ["type"]
    }

    async def execute(self, type: str) -> Dict[str, Any]:
        return {
            "action": "list_available_models",
            "params": {"type": type},
            "execute_client_side": True
        }


@ToolRegistry.register
class SearchAvailableModelsTool(Tool):
    """Search available models by keyword."""

    name = "search_available_models"
    description = """Search available models in ComfyUI by keyword.

Use this to find specific models by name.

Types: checkpoints, loras, vae, controlnet, upscale_models, embeddings"""

    parameters = {
        "type": "object",
        "properties": {
            "type": {
                "type": "string",
                "enum": ["checkpoints", "loras", "vae", "controlnet", "upscale_models", "embeddings"],
                "description": "Type of models to search"
            },
            "query": {
                "type": "string",
                "description": "Search term to filter models"
            }
        },
        "required": ["type", "query"]
    }

    async def execute(self, type: str, query: str) -> Dict[str, Any]:
        return {
            "action": "search_available_models",
            "params": {"type": type, "query": query},
            "execute_client_side": True
        }
