"""
Execution Tools for Claude Chat

Tools for queuing, cancelling, and monitoring workflow execution.
"""

from typing import Any, Dict
from .base import Tool, ToolRegistry


@ToolRegistry.register
class QueueExecutionTool(Tool):
    """Submit the workflow to the execution queue."""

    name = "queue_execution"
    description = """Submit the current workflow to ComfyUI's execution queue.

This triggers ComfyUI to execute the workflow and produce output.
Use this after setting up or modifying a workflow.

The execution runs asynchronously - the user will see progress in ComfyUI."""

    parameters = {
        "type": "object",
        "properties": {
            "batch_size": {
                "type": "integer",
                "description": "Number of times to execute (default: 1)",
                "default": 1
            }
        }
    }

    async def execute(self, batch_size: int = 1) -> Dict[str, Any]:
        return {
            "action": "queue_execution",
            "params": {"batch_size": batch_size},
            "execute_client_side": True
        }


@ToolRegistry.register
class CancelExecutionTool(Tool):
    """Cancel the current workflow execution."""

    name = "cancel_execution"
    description = """Cancel/interrupt the currently running workflow execution.

Use this if the user wants to stop an ongoing execution.
Does not affect items still queued - only the currently running execution."""

    parameters = {
        "type": "object",
        "properties": {}
    }

    async def execute(self) -> Dict[str, Any]:
        return {
            "action": "cancel_execution",
            "params": {},
            "execute_client_side": True
        }


@ToolRegistry.register
class ExecutionStatusTool(Tool):
    """Get the current execution queue status."""

    name = "execution_status"
    description = """Check execution status and queue state.

Returns:
- Whether execution is currently running
- Number of items in the queue
- Queue position
- Recent execution history (optional)

Use after queue_execution to verify it started, or to check progress."""

    parameters = {
        "type": "object",
        "properties": {
            "include_history": {
                "type": "boolean",
                "description": "Include recent execution history (default: true)",
                "default": True
            },
            "history_limit": {
                "type": "integer",
                "description": "Max history entries to return (default: 5)",
                "default": 5
            }
        }
    }

    async def execute(self, include_history: bool = True, history_limit: int = 5) -> Dict[str, Any]:
        return {
            "action": "execution_status",
            "params": {"include_history": include_history, "history_limit": history_limit},
            "execute_client_side": True
        }
