"""
Group Operation Tools for Claude Chat

Tools for creating, deleting, updating, and managing node groups.
"""

from typing import Any, Dict, List
from .base import Tool, ToolRegistry


@ToolRegistry.register
class CreateGroupTool(Tool):
    """Create one or more groups around nodes."""

    name = "create_group"
    description = """Create groups automatically sized to contain specified nodes.

Groups visually organize related nodes and are auto-sized based on
the contained nodes' positions and sizes (with padding).

Supports $refs in the nodes array."""

    parameters = {
        "type": "object",
        "properties": {
            "groups": {
                "type": "array",
                "description": "Array of groups to create",
                "items": {
                    "type": "object",
                    "properties": {
                        "title": {
                            "type": "string",
                            "description": "Group title"
                        },
                        "nodes": {
                            "type": "array",
                            "description": "Node IDs or $refs to include in the group",
                            "items": {}
                        },
                        "color": {
                            "type": "string",
                            "description": "Color hex code (e.g., '#2A4858')"
                        },
                        "padding": {
                            "type": "integer",
                            "description": "Padding around nodes in pixels (default: 60)",
                            "default": 60
                        }
                    },
                    "required": ["title", "nodes"]
                }
            }
        },
        "required": ["groups"]
    }

    async def execute(self, groups: List[Dict]) -> Dict[str, Any]:
        return {
            "action": "create_group",
            "params": {"groups": groups},
            "execute_client_side": True
        }


@ToolRegistry.register
class DeleteGroupTool(Tool):
    """Delete one or more groups (nodes are preserved)."""

    name = "delete_group"
    description = """Delete groups by index or title.

Nodes inside the groups are NOT deleted - they just become ungrouped.
Use "all" to delete all groups at once."""

    parameters = {
        "type": "object",
        "properties": {
            "groups": {
                "type": "array",
                "description": "Array of group indices, titles, or 'all' for all groups",
                "items": {}
            }
        },
        "required": ["groups"]
    }

    async def execute(self, groups: List) -> Dict[str, Any]:
        # Handle special case of deleting all groups
        if groups == ["all"] or groups == "all":
            return {
                "action": "delete_all_groups",
                "params": {},
                "execute_client_side": True
            }

        return {
            "action": "delete_group",
            "params": {"groups": groups},
            "execute_client_side": True
        }


@ToolRegistry.register
class UpdateGroupTool(Tool):
    """Update one or more groups (title, color, or contained nodes)."""

    name = "update_group"
    description = """Modify existing groups - change title, color, or replace the contained nodes.

When updating nodes, the group will be resized to fit the new node set.
This is an atomic operation (replaces group in one step)."""

    parameters = {
        "type": "object",
        "properties": {
            "updates": {
                "type": "array",
                "description": "Array of group updates",
                "items": {
                    "type": "object",
                    "properties": {
                        "group": {
                            "description": "Group index or title to update"
                        },
                        "title": {
                            "type": "string",
                            "description": "New title (optional)"
                        },
                        "color": {
                            "type": "string",
                            "description": "New color (optional)"
                        },
                        "nodes": {
                            "type": "array",
                            "description": "New node list (optional - replaces existing)",
                            "items": {}
                        },
                        "padding": {
                            "type": "integer",
                            "description": "New padding (optional)"
                        }
                    },
                    "required": ["group"]
                }
            }
        },
        "required": ["updates"]
    }

    async def execute(self, updates: List[Dict]) -> Dict[str, Any]:
        return {
            "action": "update_group",
            "params": {"updates": updates},
            "execute_client_side": True
        }


@ToolRegistry.register
class MoveNodesToGroupTool(Tool):
    """Move nodes to a different group."""

    name = "move_nodes_to_group"
    description = """Reassign nodes from their current group to a different one.

Removes nodes from their current group (if any) and adds to the target.
Creates the target group if it doesn't exist.

Supports $refs in node arrays."""

    parameters = {
        "type": "object",
        "properties": {
            "moves": {
                "type": "array",
                "description": "Array of move operations",
                "items": {
                    "type": "object",
                    "properties": {
                        "nodes": {
                            "type": "array",
                            "description": "Node IDs or $refs to move",
                            "items": {}
                        },
                        "to_group": {
                            "description": "Target group name (string) or config object {title, color}"
                        }
                    },
                    "required": ["nodes", "to_group"]
                }
            }
        },
        "required": ["moves"]
    }

    async def execute(self, moves: List[Dict]) -> Dict[str, Any]:
        return {
            "action": "move_nodes_to_group",
            "params": {"moves": moves},
            "execute_client_side": True
        }


@ToolRegistry.register
class MergeGroupsTool(Tool):
    """Combine multiple groups into one."""

    name = "merge_groups"
    description = """Merge multiple groups into a single group.

All nodes from the source groups will be combined into the target group.
Source groups are deleted after merging."""

    parameters = {
        "type": "object",
        "properties": {
            "groups": {
                "type": "array",
                "description": "Group indices or titles to merge",
                "items": {}
            },
            "into": {
                "type": "object",
                "description": "Target group configuration",
                "properties": {
                    "title": {"type": "string"},
                    "color": {"type": "string"}
                },
                "required": ["title"]
            }
        },
        "required": ["groups", "into"]
    }

    async def execute(self, groups: List, into: Dict) -> Dict[str, Any]:
        return {
            "action": "merge_groups",
            "params": {"groups": groups, "into": into},
            "execute_client_side": True
        }


@ToolRegistry.register
class DetectGroupIssuesTool(Tool):
    """Find problems with groups (overlaps, duplicates, etc.)."""

    name = "detect_group_issues"
    description = """Analyze groups for common problems:
- Overlapping groups
- Duplicate group names
- Empty groups
- Oversized groups (too many nodes)

Returns actionable suggestions for fixing issues."""

    parameters = {
        "type": "object",
        "properties": {
            "min_gap": {
                "type": "integer",
                "description": "Minimum gap between groups to not count as overlap (default: 50)",
                "default": 50
            }
        }
    }

    async def execute(self, min_gap: int = 50) -> Dict[str, Any]:
        return {
            "action": "detect_group_issues",
            "params": {"min_gap": min_gap},
            "execute_client_side": True
        }
