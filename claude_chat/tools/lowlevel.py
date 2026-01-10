"""
Low-Level Debug Tools for Claude Chat

Tools for direct workflow JSON manipulation:
- get_workflow_json: Dump raw workflow JSON
- patch_workflow_json: Apply JSON Patch operations
- set_workflow_json: Replace entire workflow

WARNING: These are escape-hatch tools for advanced debugging.
Use with caution - can break workflows if misused.
"""

from typing import Any, Dict, List
from .base import Tool, ToolRegistry


@ToolRegistry.register
class GetWorkflowJsonTool(Tool):
    """Dump the raw workflow JSON."""

    name = "get_workflow_json"
    description = """Get the complete raw workflow JSON.

Returns the full LiteGraph serialization including:
- All node data (type, position, size, widgets, connections)
- All group data
- Graph metadata

WARNING: Can be very large (15-60KB). Use get_workflow for
summarized info instead unless you need raw JSON."""

    parameters = {
        "type": "object",
        "properties": {}
    }

    async def execute(self) -> Dict[str, Any]:
        return {
            "action": "get_workflow_json",
            "params": {},
            "execute_client_side": True
        }


@ToolRegistry.register
class PatchWorkflowJsonTool(Tool):
    """Apply JSON Patch operations to the workflow."""

    name = "patch_workflow_json"
    description = """Apply RFC 6902 JSON Patch operations to the workflow.

Supported operations:
- replace: Replace value at path
- add: Add value at path
- remove: Remove value at path
- copy: Copy value from one path to another
- move: Move value from one path to another

All patches are validated before application.
Single undo for all operations.

WARNING: Can break workflow if paths are invalid.
Use structured tools (update_node, update_widget) when possible."""

    parameters = {
        "type": "object",
        "properties": {
            "patches": {
                "type": "array",
                "description": "RFC 6902 JSON Patch operations",
                "items": {
                    "type": "object",
                    "properties": {
                        "op": {
                            "type": "string",
                            "enum": ["replace", "add", "remove", "copy", "move"],
                            "description": "Operation type"
                        },
                        "path": {
                            "type": "string",
                            "description": "JSON Pointer path (e.g., '/nodes/0/widgets_values/0')"
                        },
                        "value": {
                            "description": "New value (for replace, add)"
                        },
                        "from": {
                            "type": "string",
                            "description": "Source path (for copy, move)"
                        }
                    },
                    "required": ["op", "path"]
                }
            }
        },
        "required": ["patches"]
    }

    async def execute(self, patches: List[Dict]) -> Dict[str, Any]:
        return {
            "action": "patch_workflow_json",
            "params": {"patches": patches},
            "execute_client_side": True
        }


@ToolRegistry.register
class SetWorkflowJsonTool(Tool):
    """Replace the entire workflow with new JSON."""

    name = "set_workflow_json"
    description = """Replace the entire workflow with the provided JSON.

WARNING: This REPLACES everything - all nodes, groups, connections.
Only use for:
- Loading a saved workflow
- Restoring from backup
- Complete workflow replacement

The JSON must be valid LiteGraph format.
Can be undone, but be careful."""

    parameters = {
        "type": "object",
        "properties": {
            "workflow": {
                "type": "object",
                "description": "Complete workflow JSON in LiteGraph format"
            }
        },
        "required": ["workflow"]
    }

    async def execute(self, workflow: Dict) -> Dict[str, Any]:
        return {
            "action": "set_workflow_json",
            "params": {"workflow": workflow},
            "execute_client_side": True
        }
