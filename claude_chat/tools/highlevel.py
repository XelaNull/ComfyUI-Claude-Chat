"""
High-Level Operation Tools for Claude Chat

Tools for workflow-wide operations like organizing and clearing.
"""

from typing import Any, Dict
from .base import Tool, ToolRegistry


@ToolRegistry.register
class OrganizeTool(Tool):
    """Auto-organize the entire workflow (JS-based, instant)."""

    name = "organize"
    description = """**USE THIS FOR CLEANUP REQUESTS!** Automatically organizes the ENTIRE workflow in ONE tool call.

This is 10x FASTER than calling multiple tools because it:
1. Analyzes ALL nodes and their actual rendered sizes
2. Categorizes nodes into logical groups (Loaders, Conditioning, Sampling, etc.)
3. Calculates proper spacing based on actual dimensions
4. Repositions ALL nodes with proper layout
5. Creates color-coded groups around each category

ONE call replaces 10-20 separate tool calls. Use this when user asks to:
- "Clean up my workflow"
- "Organize this mess"
- "Make it look nice"
- "Rearrange everything"

For semantic/intelligent organization, use organize_layout instead."""

    parameters = {
        "type": "object",
        "properties": {
            "group_padding": {
                "type": "integer",
                "description": "Padding inside groups (default: 60px)",
                "default": 60
            },
            "group_spacing": {
                "type": "integer",
                "description": "Space between groups (default: 120px)",
                "default": 120
            },
            "node_spacing": {
                "type": "integer",
                "description": "Vertical space between nodes in a group (default: 30px)",
                "default": 30
            }
        }
    }

    async def execute(self, group_padding: int = 60, group_spacing: int = 120,
                      node_spacing: int = 30) -> Dict[str, Any]:
        return {
            "action": "organize",
            "params": {
                "groupPadding": group_padding,
                "groupSpacing": group_spacing,
                "nodeSpacing": node_spacing
            },
            "execute_client_side": True
        }


@ToolRegistry.register
class OrganizeLayoutTool(Tool):
    """LLM-directed semantic organization (you provide the plan)."""

    name = "organize_layout"
    description = """Organize workflow according to YOUR semantic plan.

YOU decide:
- Which nodes belong together (semantic grouping)
- Group names that reflect PURPOSE
- Logical flow order
- Color choices

The FRONTEND handles:
- Calculating actual positions from node sizes
- Sizing groups to fit contained nodes
- Spacing groups apart correctly

Use this for intelligent organization where simple rule-based
grouping (from 'organize') isn't sufficient."""

    parameters = {
        "type": "object",
        "properties": {
            "plan": {
                "type": "object",
                "description": "Organization plan",
                "properties": {
                    "flow": {
                        "type": "string",
                        "enum": ["left_to_right", "top_to_bottom"],
                        "description": "Layout direction (default: left_to_right)",
                        "default": "left_to_right"
                    },
                    "groups": {
                        "type": "array",
                        "description": "Groups to create in order",
                        "items": {
                            "type": "object",
                            "properties": {
                                "title": {"type": "string"},
                                "nodes": {"type": "array", "items": {}},
                                "color": {"type": "string"},
                                "order": {"type": "integer"}
                            },
                            "required": ["title", "nodes"]
                        }
                    },
                    "group_spacing": {
                        "type": "integer",
                        "description": "Pixels between groups (default: 100)",
                        "default": 100
                    },
                    "group_padding": {
                        "type": "integer",
                        "description": "Pixels inside group border (default: 60)",
                        "default": 60
                    }
                },
                "required": ["groups"]
            }
        },
        "required": ["plan"]
    }

    async def execute(self, plan: Dict) -> Dict[str, Any]:
        return {
            "action": "organize_layout",
            "params": {"plan": plan},
            "execute_client_side": True
        }


@ToolRegistry.register
class ClearWorkflowTool(Tool):
    """Delete all nodes and groups from the workflow."""

    name = "clear_workflow"
    description = """Clear the entire workflow - delete all nodes and groups.

Use this before creating a new workflow from scratch.
This action can be undone."""

    parameters = {
        "type": "object",
        "properties": {}
    }

    async def execute(self) -> Dict[str, Any]:
        return {
            "action": "clear_workflow",
            "params": {},
            "execute_client_side": True
        }


@ToolRegistry.register
class IntegrateNodeIntoGroupsTool(Tool):
    """Automatically integrate a node into the existing group structure."""

    name = "integrate_node_into_groups"
    description = """Automatically integrate a newly added node into existing groups.

CRITICAL: Always call this after adding a node to an organized workflow!

The tool automatically:
1. Categorizes the node based on its type (Loaders→Setup, LoRA→LoRAs, etc.)
2. Expands an existing group if one matches the category
3. Creates a new group if no match exists
4. Shifts downstream groups to make room

vs move_nodes_to_group:
- move_nodes_to_group: Manual - you specify which group
- integrate_node_into_groups: Automatic - tool figures out the right group"""

    parameters = {
        "type": "object",
        "properties": {
            "node_id": {
                "description": "ID of the node to integrate (number or $ref)"
            }
        },
        "required": ["node_id"]
    }

    async def execute(self, node_id) -> Dict[str, Any]:
        return {
            "action": "integrate_node_into_groups",
            "params": {"node_id": node_id},
            "execute_client_side": True
        }
