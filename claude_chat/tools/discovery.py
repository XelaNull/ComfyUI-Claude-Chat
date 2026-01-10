"""
Discovery Tools for Claude Chat

Tools for discovering available node types, schemas, and models.
"""

from typing import Any, Dict, Optional
from .base import Tool, ToolRegistry


@ToolRegistry.register
class SearchNodeTypesTool(Tool):
    """Search for available node types."""

    name = "search_node_types"
    description = """Search available ComfyUI node types.

Use this to discover what nodes can be added to a workflow.
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
