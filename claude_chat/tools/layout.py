"""
Layout Tools for Claude Chat

Tools for aligning, distributing, and positioning nodes and groups.
"""

from typing import Any, Dict, List
from .base import Tool, ToolRegistry


@ToolRegistry.register
class AlignNodesTool(Tool):
    """Align multiple nodes to a common edge or center."""

    name = "align_nodes"
    description = """Align multiple nodes to a common edge or center.

Uses the first node in the array as the reference point.
Supports $refs from create_node."""

    parameters = {
        "type": "object",
        "properties": {
            "nodes": {
                "type": "array",
                "description": "Node IDs or $refs to align",
                "items": {}
            },
            "alignment": {
                "type": "string",
                "enum": ["left", "right", "top", "bottom", "center_h", "center_v"],
                "description": "Alignment type (default: left)",
                "default": "left"
            }
        },
        "required": ["nodes"]
    }

    async def execute(self, nodes: List, alignment: str = "left") -> Dict[str, Any]:
        return {
            "action": "align_nodes",
            "params": {"nodes": nodes, "alignment": alignment},
            "execute_client_side": True
        }


@ToolRegistry.register
class DistributeNodesTool(Tool):
    """Evenly distribute nodes along an axis."""

    name = "distribute_nodes"
    description = """Evenly distribute nodes along an axis.

Spaces nodes evenly between the first and last node positions.
Supports $refs from create_node."""

    parameters = {
        "type": "object",
        "properties": {
            "nodes": {
                "type": "array",
                "description": "Node IDs or $refs to distribute",
                "items": {}
            },
            "direction": {
                "type": "string",
                "enum": ["horizontal", "vertical"],
                "description": "Distribution direction (default: horizontal)",
                "default": "horizontal"
            },
            "spacing": {
                "type": "integer",
                "description": "Fixed spacing in pixels (optional - if not set, distributes evenly)"
            }
        },
        "required": ["nodes"]
    }

    async def execute(self, nodes: List, direction: str = "horizontal",
                      spacing: int = None) -> Dict[str, Any]:
        return {
            "action": "distribute_nodes",
            "params": {"nodes": nodes, "direction": direction, "spacing": spacing},
            "execute_client_side": True
        }


@ToolRegistry.register
class MoveGroupTool(Tool):
    """Move a group and all its contained nodes."""

    name = "move_group"
    description = """Move a group and all nodes inside it to a new position.

Can specify absolute position or relative offset.
All nodes maintain their relative positions within the group."""

    parameters = {
        "type": "object",
        "properties": {
            "group": {
                "description": "Group index or title to move"
            },
            "pos": {
                "type": "array",
                "description": "Absolute position [x, y] (optional)",
                "items": {"type": "number"},
                "minItems": 2,
                "maxItems": 2
            },
            "offset": {
                "type": "array",
                "description": "Relative offset [dx, dy] (optional)",
                "items": {"type": "number"},
                "minItems": 2,
                "maxItems": 2
            }
        },
        "required": ["group"]
    }

    async def execute(self, group, pos: List[float] = None,
                      offset: List[float] = None) -> Dict[str, Any]:
        return {
            "action": "move_group",
            "params": {"group": group, "pos": pos, "offset": offset},
            "execute_client_side": True
        }


@ToolRegistry.register
class FitGroupToNodesTool(Tool):
    """Resize group to fit its contained nodes."""

    name = "fit_group_to_nodes"
    description = """Resize a group to exactly fit around its contained nodes.

Useful after adding or removing nodes from a group, or after
moving nodes within a group."""

    parameters = {
        "type": "object",
        "properties": {
            "group": {
                "description": "Group index or title to resize"
            },
            "padding": {
                "type": "integer",
                "description": "Padding around nodes in pixels (default: 60)",
                "default": 60
            }
        },
        "required": ["group"]
    }

    async def execute(self, group, padding: int = 60) -> Dict[str, Any]:
        return {
            "action": "fit_group_to_nodes",
            "params": {"group": group, "padding": padding},
            "execute_client_side": True
        }
