"""
Node Operation Tools for Claude Chat

Tools for creating, deleting, updating, duplicating, and bypassing nodes.
Follows the create_X, delete_X, update_X naming convention.
"""

from typing import Any, Dict, List, Optional
from .base import Tool, ToolRegistry


@ToolRegistry.register
class CreateNodeTool(Tool):
    """Create one or more nodes in the workflow."""

    name = "create_node"
    description = """Create one or more nodes in the ComfyUI workflow.

Specify the node type and optionally position, widgets, title, and group assignment.
Returns the new node's ID (and $ref if provided) for use in subsequent operations.

Common node types:
- CheckpointLoaderSimple: Load a checkpoint model
- KSampler: The main sampling node
- CLIPTextEncode: Encode text prompts
- VAEDecode: Decode latents to images
- LoraLoader: Load and apply LoRA
- ControlNetLoader: Load ControlNet model
- EmptyLatentImage: Create empty latent for txt2img

For multiple nodes, use the 'nodes' array parameter."""

    parameters = {
        "type": "object",
        "properties": {
            "nodes": {
                "type": "array",
                "description": "Array of nodes to create",
                "items": {
                    "type": "object",
                    "properties": {
                        "type": {
                            "type": "string",
                            "description": "Node type (e.g., 'KSampler', 'LoraLoader')"
                        },
                        "pos": {
                            "type": "array",
                            "items": {"type": "number"},
                            "description": "[x, y] position on canvas"
                        },
                        "ref": {
                            "type": "string",
                            "description": "$reference for use in later tool calls (e.g., '$sampler')"
                        },
                        "widgets": {
                            "type": "object",
                            "description": "Initial widget values as {name: value} pairs"
                        },
                        "title": {
                            "type": "string",
                            "description": "Custom title for the node"
                        },
                        "group": {
                            "description": "Group name (string) or config object {title, color}"
                        }
                    },
                    "required": ["type"]
                }
            },
            # Single-node shorthand (for simple cases)
            "type": {
                "type": "string",
                "description": "Node type for single-node creation"
            },
            "pos": {
                "type": "array",
                "items": {"type": "number"},
                "description": "[x, y] position for single-node creation"
            },
            "ref": {
                "type": "string",
                "description": "$reference for single-node creation"
            },
            "widgets": {
                "type": "object",
                "description": "Widget values for single-node creation"
            },
            "title": {
                "type": "string",
                "description": "Title for single-node creation"
            },
            "group": {
                "description": "Group for single-node creation"
            }
        }
    }

    async def execute(self, nodes: List[Dict] = None, **kwargs) -> Dict[str, Any]:
        # Handle single-node shorthand
        if nodes is None and "type" in kwargs:
            nodes = [{
                "type": kwargs.get("type"),
                "pos": kwargs.get("pos"),
                "ref": kwargs.get("ref"),
                "widgets": kwargs.get("widgets"),
                "title": kwargs.get("title"),
                "group": kwargs.get("group")
            }]

        return {
            "action": "create_node",
            "params": {"nodes": nodes},
            "execute_client_side": True
        }


@ToolRegistry.register
class DeleteNodeTool(Tool):
    """Delete one or more nodes from the workflow."""

    name = "delete_node"
    description = """Delete one or more nodes from the workflow.

Accepts node IDs or $refs. If reconnect=true, will attempt to bridge
connections through the removed node (useful when removing a node
that's in the middle of a chain)."""

    parameters = {
        "type": "object",
        "properties": {
            "nodes": {
                "type": "array",
                "description": "Array of node IDs or $refs to delete",
                "items": {}
            },
            "reconnect": {
                "type": "boolean",
                "description": "If true, try to reconnect nodes that were connected through deleted ones",
                "default": False
            }
        },
        "required": ["nodes"]
    }

    async def execute(self, nodes: List, reconnect: bool = False) -> Dict[str, Any]:
        return {
            "action": "delete_node",
            "params": {"nodes": nodes, "reconnect": reconnect},
            "execute_client_side": True
        }


@ToolRegistry.register
class UpdateNodeTool(Tool):
    """Update one or more nodes (move, rename, or both)."""

    name = "update_node"
    description = """Update one or more nodes - move to new position and/or rename.

Each update specifies a node (ID or $ref) and the changes to apply.
Can update position (pos), title, or both in a single call."""

    parameters = {
        "type": "object",
        "properties": {
            "updates": {
                "type": "array",
                "description": "Array of node updates",
                "items": {
                    "type": "object",
                    "properties": {
                        "node": {
                            "description": "Node ID or $ref to update"
                        },
                        "pos": {
                            "type": "array",
                            "items": {"type": "number"},
                            "description": "New [x, y] position"
                        },
                        "title": {
                            "type": "string",
                            "description": "New title for the node"
                        }
                    },
                    "required": ["node"]
                }
            }
        },
        "required": ["updates"]
    }

    async def execute(self, updates: List[Dict]) -> Dict[str, Any]:
        return {
            "action": "update_node",
            "params": {"updates": updates},
            "execute_client_side": True
        }


@ToolRegistry.register
class DuplicateNodeTool(Tool):
    """Duplicate one or more nodes with all their settings."""

    name = "duplicate_node"
    description = """Clone one or more nodes with all widget values preserved.

Creates copies at an offset from the originals. Connections are NOT copied -
use create_link after duplicating if you need to connect the copies.

Supports $ref assignment for the new nodes."""

    parameters = {
        "type": "object",
        "properties": {
            "nodes": {
                "type": "array",
                "description": "Array of nodes to duplicate",
                "items": {
                    "type": "object",
                    "properties": {
                        "node": {
                            "description": "Node ID or $ref to duplicate"
                        },
                        "ref": {
                            "type": "string",
                            "description": "$reference for the new copy"
                        },
                        "offset": {
                            "type": "array",
                            "items": {"type": "number"},
                            "description": "[x, y] offset from original position",
                            "default": [50, 50]
                        }
                    },
                    "required": ["node"]
                }
            }
        },
        "required": ["nodes"]
    }

    async def execute(self, nodes: List[Dict]) -> Dict[str, Any]:
        return {
            "action": "duplicate_node",
            "params": {"nodes": nodes},
            "execute_client_side": True
        }


@ToolRegistry.register
class BypassNodeTool(Tool):
    """Temporarily disable one or more nodes without deleting them."""

    name = "bypass_node"
    description = """Toggle bypass mode on one or more nodes.

Bypassed nodes pass data through without processing - useful for
temporarily disabling effects, LoRAs, or processing steps without
losing configuration.

Set bypass=true to disable, bypass=false to re-enable."""

    parameters = {
        "type": "object",
        "properties": {
            "nodes": {
                "type": "array",
                "description": "Array of node IDs or $refs to bypass/unbypass",
                "items": {}
            },
            "bypass": {
                "type": "boolean",
                "description": "True to bypass (disable), false to enable",
                "default": True
            }
        },
        "required": ["nodes"]
    }

    async def execute(self, nodes: List, bypass: bool = True) -> Dict[str, Any]:
        return {
            "action": "bypass_node",
            "params": {"nodes": nodes, "bypass": bypass},
            "execute_client_side": True
        }
