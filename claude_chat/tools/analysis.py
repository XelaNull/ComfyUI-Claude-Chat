"""
Analysis Tools for Claude Chat

Tools for analyzing and inspecting workflows:
- find_nodes: Query nodes by criteria
- get_modified_widgets: Find widgets with non-default values
- detect_layout_issues: Find visual/layout problems
- validate_workflow: Check if workflow will execute
- analyze_workflow: Comprehensive workflow analysis
"""

from typing import Any, Dict, List, Optional
from .base import Tool, ToolRegistry


@ToolRegistry.register
class FindNodesTool(Tool):
    """Find nodes matching specific criteria."""

    name = "find_nodes"
    description = """Search for nodes matching specific criteria.

Query options:
- type: Match specific node type (e.g., "KSampler")
- has_disconnected_inputs: Find nodes with required inputs not connected
- in_group: Find nodes in a specific group (by title)
- ungrouped: Find nodes not in any group
- bypassed: Find bypassed/enabled nodes
- widget: Match nodes with specific widget value

Returns list of matching node IDs."""

    parameters = {
        "type": "object",
        "properties": {
            "query": {
                "type": "object",
                "description": "Search criteria",
                "properties": {
                    "type": {
                        "type": "string",
                        "description": "Node type to match"
                    },
                    "has_disconnected_inputs": {
                        "type": "boolean",
                        "description": "Find nodes with unconnected required inputs"
                    },
                    "in_group": {
                        "type": "string",
                        "description": "Group title to search in"
                    },
                    "ungrouped": {
                        "type": "boolean",
                        "description": "Only nodes not in any group"
                    },
                    "bypassed": {
                        "type": "boolean",
                        "description": "True for bypassed, false for active"
                    },
                    "widget": {
                        "type": "object",
                        "description": "Match nodes with specific widget value",
                        "properties": {
                            "name": {"type": "string"},
                            "value": {}
                        }
                    }
                }
            }
        },
        "required": ["query"]
    }

    async def execute(self, query: Dict) -> Dict[str, Any]:
        return {
            "action": "find_nodes",
            "params": {"query": query},
            "execute_client_side": True
        }


@ToolRegistry.register
class GetModifiedWidgetsTool(Tool):
    """Find widgets with non-default values."""

    name = "get_modified_widgets"
    description = """Find widgets that have been changed from their default values.

Returns only the widgets with non-standard settings.
If no nodes specified, checks all nodes.

Result-focused: shows what IS different, not a comparison."""

    parameters = {
        "type": "object",
        "properties": {
            "nodes": {
                "type": "array",
                "description": "Node IDs or $refs to compare (empty = all nodes)",
                "items": {}
            }
        }
    }

    async def execute(self, nodes: List = None) -> Dict[str, Any]:
        return {
            "action": "get_modified_widgets",
            "params": {"nodes": nodes or []},
            "execute_client_side": True
        }


@ToolRegistry.register
class DetectLayoutIssuesTool(Tool):
    """Find layout and visual problems in the workflow."""

    name = "detect_layout_issues"
    description = """Analyze the workflow layout for problems:

- Overlapping nodes
- Cramped areas (high density)
- Disconnected regions
- Poor alignment
- Nodes outside visible area

Returns actionable suggestions for fixes."""

    parameters = {
        "type": "object",
        "properties": {
            "min_spacing": {
                "type": "integer",
                "description": "Minimum spacing between nodes (default: 20px)",
                "default": 20
            }
        }
    }

    async def execute(self, min_spacing: int = 20) -> Dict[str, Any]:
        return {
            "action": "detect_layout_issues",
            "params": {"min_spacing": min_spacing},
            "execute_client_side": True
        }


@ToolRegistry.register
class ValidateWorkflowTool(Tool):
    """Check if the workflow is valid and can execute."""

    name = "validate_workflow"
    description = """Validate the workflow for execution readiness:

Checks:
- All required inputs connected
- No type mismatches in connections
- Referenced files exist (checkpoints, LoRAs)
- No circular dependencies

Returns blocking errors, warnings, and execution order."""

    parameters = {
        "type": "object",
        "properties": {}
    }

    async def execute(self) -> Dict[str, Any]:
        return {
            "action": "validate_workflow",
            "params": {},
            "execute_client_side": True
        }


@ToolRegistry.register
class AnalyzeWorkflowTool(Tool):
    """Comprehensive workflow analysis."""

    name = "analyze_workflow"
    description = """Perform comprehensive workflow analysis combining:

- Validation status
- Layout issues
- Optimization suggestions (unused nodes, duplicates)
- Complexity metrics
- Model usage summary

Use this for a complete health check of the workflow."""

    parameters = {
        "type": "object",
        "properties": {
            "include_suggestions": {
                "type": "boolean",
                "description": "Include optimization suggestions (default: true)",
                "default": True
            }
        }
    }

    async def execute(self, include_suggestions: bool = True) -> Dict[str, Any]:
        return {
            "action": "analyze_workflow",
            "params": {"include_suggestions": include_suggestions},
            "execute_client_side": True
        }
