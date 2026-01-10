"""
Utility Tools for Claude Chat

Tools for undo and batch operations.
"""

from typing import Any, Dict, List
from .base import Tool, ToolRegistry


@ToolRegistry.register
class UndoTool(Tool):
    """Undo the last workflow modification."""

    name = "undo"
    description = """Undo the last workflow modification.

Each modification (create, delete, update, etc.) is saved and can be undone.
Up to 20 undo levels are available.

Use count > 1 to undo multiple steps at once."""

    parameters = {
        "type": "object",
        "properties": {
            "count": {
                "type": "integer",
                "description": "Number of operations to undo (default: 1)",
                "default": 1
            }
        }
    }

    async def execute(self, count: int = 1) -> Dict[str, Any]:
        return {
            "action": "undo",
            "params": {"count": count},
            "execute_client_side": True
        }


@ToolRegistry.register
class BatchTool(Tool):
    """Execute multiple commands atomically."""

    name = "batch"
    description = """Execute multiple commands as a single atomic operation.

Benefits:
- Single tool call (one Claude SDK round-trip)
- $refs from earlier commands resolve in later commands
- All succeed or all fail (with automatic rollback)
- Single undo operation for entire batch

Use for:
- Creating workflows (nodes + links + groups together)
- Complex modifications (delete links, insert node, reconnect)
- Any operation requiring multiple coordinated steps

Commands execute in order. Each command is a tool call object.
Max 50 commands per batch.

Set dry_run: true to validate without executing."""

    parameters = {
        "type": "object",
        "properties": {
            "commands": {
                "type": "array",
                "description": "Array of tool calls to execute in order",
                "items": {
                    "type": "object",
                    "properties": {
                        "tool": {
                            "type": "string",
                            "description": "Tool name to execute"
                        }
                    },
                    "required": ["tool"],
                    "additionalProperties": True
                },
                "minItems": 1,
                "maxItems": 50
            },
            "dry_run": {
                "type": "boolean",
                "description": "If true, validate commands without executing (preview mode)",
                "default": False
            }
        },
        "required": ["commands"]
    }

    async def execute(self, commands: List[Dict], dry_run: bool = False) -> Dict[str, Any]:
        return {
            "action": "batch",
            "params": {"commands": commands, "dry_run": dry_run},
            "execute_client_side": True
        }


@ToolRegistry.register
class HelpTool(Tool):
    """Get on-demand tool documentation."""

    name = "help"
    description = """Get on-demand tool documentation.

Topics:
- (none): List of all tools with one-line descriptions
- Tool name (e.g., 'create_link'): Full documentation for that tool
- Category (e.g., 'discovery', 'nodes', 'links', 'widgets', 'groups'): All tools in category
- 'patterns': $ref system, multi-item syntax, inline groups
- 'batch': Batch wrapper documentation

Use this instead of guessing tool syntax."""

    parameters = {
        "type": "object",
        "properties": {
            "topic": {
                "type": "string",
                "description": "Tool name, category, or special topic (optional)"
            }
        }
    }

    async def execute(self, topic: str = None) -> Dict[str, Any]:
        return {
            "action": "help",
            "params": {"topic": topic},
            "execute_client_side": True
        }
