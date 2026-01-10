"""
Context Tools for Claude Chat

Tools for getting workflow and node information.
Consolidated from previous get_workflow_summary/details/full tools.
"""

from typing import Any, Dict, List
from .base import Tool, ToolRegistry


@ToolRegistry.register
class GetWorkflowTool(Tool):
    """Get workflow state at different detail levels."""

    name = "get_workflow"
    description = """Get the current workflow state.

Three modes available:
- "summary" (default): Compact overview (~1-3KB) with node counts, groups, ungrouped nodes, canvas bounds
- "details": Medium detail (~5-10KB) with positions, sizes, connectivity
- "full": Complete JSON (~15-60KB) with all widget values

NOTE: With automatic context injection, you rarely need to call this tool.
The workflow state is provided with each user message. Only use this when
you need specific details not in the auto-injected context."""

    parameters = {
        "type": "object",
        "properties": {
            "mode": {
                "type": "string",
                "enum": ["summary", "details", "full"],
                "description": "Detail level: summary (default), details, or full",
                "default": "summary"
            }
        }
    }

    async def execute(self, mode: str = "summary") -> Dict[str, Any]:
        return {
            "action": "get_workflow",
            "params": {"mode": mode},
            "execute_client_side": True
        }


@ToolRegistry.register
class GetNodeTool(Tool):
    """Get detailed information about specific nodes."""

    name = "get_node"
    description = """Get complete details about one or more specific nodes including:
- Current widget values
- Input connections (what's connected to it)
- Output connections (what it connects to)
- Position and size

Supports both node IDs and $refs."""

    parameters = {
        "type": "object",
        "properties": {
            "nodes": {
                "type": "array",
                "description": "Array of node IDs or $refs to get details for",
                "items": {}
            }
        },
        "required": ["nodes"]
    }

    async def execute(self, nodes: List) -> Dict[str, Any]:
        return {
            "action": "get_node",
            "params": {"nodes": nodes},
            "execute_client_side": True
        }
