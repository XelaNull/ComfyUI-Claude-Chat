"""
Widget Operation Tools for Claude Chat

Tools for updating widget values and querying widget options.
"""

from typing import Any, Dict, List
from .base import Tool, ToolRegistry


@ToolRegistry.register
class UpdateWidgetTool(Tool):
    """Set widget values on one or more nodes."""

    name = "update_widget"
    description = """Set widget/parameter values on nodes.

Common widgets:
- KSampler: steps, cfg, sampler_name, scheduler, denoise, seed
- CLIPTextEncode: text
- CheckpointLoaderSimple: ckpt_name
- LoraLoader: lora_name, strength_model, strength_clip
- EmptyLatentImage: width, height, batch_size

Supports both node IDs and $refs."""

    parameters = {
        "type": "object",
        "properties": {
            "updates": {
                "type": "array",
                "description": "Array of widget updates",
                "items": {
                    "type": "object",
                    "properties": {
                        "node": {
                            "description": "Node ID or $ref"
                        },
                        "widget": {
                            "type": "string",
                            "description": "Widget name (e.g., 'steps', 'cfg', 'seed')"
                        },
                        "value": {
                            "description": "New value for the widget"
                        }
                    },
                    "required": ["node", "widget", "value"]
                }
            }
        },
        "required": ["updates"]
    }

    async def execute(self, updates: List[Dict]) -> Dict[str, Any]:
        return {
            "action": "update_widget",
            "params": {"updates": updates},
            "execute_client_side": True
        }


@ToolRegistry.register
class GetWidgetOptionsTool(Tool):
    """Get available options for dropdown widgets."""

    name = "get_widget_options"
    description = """Get valid options/values for dropdown widgets.

Useful for combo boxes (like sampler_name, scheduler, ckpt_name)
to see what choices are available before setting a value.

Returns the options list and current value for each queried widget."""

    parameters = {
        "type": "object",
        "properties": {
            "queries": {
                "type": "array",
                "description": "Array of widget queries",
                "items": {
                    "type": "object",
                    "properties": {
                        "node": {
                            "description": "Node ID or $ref"
                        },
                        "widget": {
                            "type": "string",
                            "description": "Widget name"
                        }
                    },
                    "required": ["node", "widget"]
                }
            }
        },
        "required": ["queries"]
    }

    async def execute(self, queries: List[Dict]) -> Dict[str, Any]:
        return {
            "action": "get_widget_options",
            "params": {"queries": queries},
            "execute_client_side": True
        }
