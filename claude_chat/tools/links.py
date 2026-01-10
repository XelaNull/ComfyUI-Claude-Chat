"""
Link Operation Tools for Claude Chat

Tools for creating and deleting connections between nodes.
Follows the create_X, delete_X naming convention.
"""

from typing import Any, Dict, List
from .base import Tool, ToolRegistry


@ToolRegistry.register
class CreateNodeLinkTool(Tool):
    """Create one or more connections between nodes."""

    name = "create_node_link"
    description = """Connect output slots to input slots between nodes.

Slot types must be compatible (e.g., MODEL to model, CONDITIONING to conditioning).
Supports both node IDs and $refs for the 'from' and 'to' fields.

Common slot types: MODEL, CLIP, VAE, CONDITIONING, LATENT, IMAGE, MASK

Use get_node_schema to see available slots and their types if unsure."""

    parameters = {
        "type": "object",
        "properties": {
            "links": {
                "type": "array",
                "description": "Array of links to create",
                "items": {
                    "type": "object",
                    "properties": {
                        "from": {
                            "description": "Source node ID or $ref"
                        },
                        "from_slot": {
                            "type": "integer",
                            "description": "Output slot index on source node (0-based)"
                        },
                        "to": {
                            "description": "Target node ID or $ref"
                        },
                        "to_slot": {
                            "type": "integer",
                            "description": "Input slot index on target node (0-based)"
                        }
                    },
                    "required": ["from", "from_slot", "to", "to_slot"]
                }
            }
        },
        "required": ["links"]
    }

    async def execute(self, links: List[Dict]) -> Dict[str, Any]:
        return {
            "action": "create_node_link",
            "params": {"links": links},
            "execute_client_side": True
        }


@ToolRegistry.register
class DeleteNodeLinkTool(Tool):
    """Delete one or more connections from node inputs."""

    name = "delete_node_link"
    description = """Disconnect input slots on nodes.

Specify the target node and input slot to disconnect. The connection
from whatever was providing input will be removed.

Supports both node IDs and $refs."""

    parameters = {
        "type": "object",
        "properties": {
            "links": {
                "type": "array",
                "description": "Array of links to delete",
                "items": {
                    "type": "object",
                    "properties": {
                        "node": {
                            "description": "Node ID or $ref to disconnect"
                        },
                        "input_slot": {
                            "type": "integer",
                            "description": "Input slot index to disconnect (0-based)"
                        }
                    },
                    "required": ["node", "input_slot"]
                }
            }
        },
        "required": ["links"]
    }

    async def execute(self, links: List[Dict]) -> Dict[str, Any]:
        return {
            "action": "delete_node_link",
            "params": {"links": links},
            "execute_client_side": True
        }
