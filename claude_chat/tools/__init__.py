"""
ComfyUI Tools for Claude Chat

This module provides a unified tool layer that works with both:
- Max Plan (via Claude CLI + MCP)
- Anthropic API (via Tool Use)

Tools are organized by category following create_X, delete_X, update_X, get_X naming convention.
"""

from .base import Tool, ToolRegistry

# Node operation tools
from .nodes import (
    CreateNodeTool,
    DeleteNodeTool,
    UpdateNodeTool,
    DuplicateNodeTool,
    BypassNodeTool,
)

# Link operation tools (renamed from CreateLinkTool/DeleteLinkTool)
from .links import (
    CreateNodeLinkTool,
    DeleteNodeLinkTool,
)

# Widget operation tools
from .widgets import (
    UpdateWidgetTool,
    GetWidgetOptionsTool,
)

# Context tools
from .context import (
    GetWorkflowTool,
    GetNodeTool,
)

# Group operation tools
from .groups import (
    CreateGroupTool,
    DeleteGroupTool,
    UpdateGroupTool,
    MoveNodesToGroupTool,
    MergeGroupsTool,
    SplitGroupTool,
    DetectGroupIssuesTool,
)

# Discovery tools
from .discovery import (
    ListNodesTool,
    ListAvailableNodesTool,
    GetContextTool,
    SearchAvailableNodesTool,
    GetNodeSchemaTool,
    ListAvailableModelsTool,
    SearchAvailableModelsTool,
)

# Layout tools
from .layout import (
    AlignNodesTool,
    DistributeNodesTool,
    MoveGroupTool,
    FitGroupToNodesTool,
)

# Execution tools
from .execution import (
    QueueExecutionTool,
    CancelExecutionTool,
    ExecutionStatusTool,
)

# High-level tools
from .highlevel import (
    OrganizeTool,
    OrganizeLayoutTool,
    ClearWorkflowTool,
    IntegrateNodeIntoGroupsTool,
)

# Utility tools
from .utility import (
    UndoTool,
    BatchTool,
    HelpTool,
)

# Analysis tools (Phase 4)
from .analysis import (
    FindNodesTool,
    GetModifiedWidgetsTool,
    DetectLayoutIssuesTool,
    ValidateWorkflowTool,
    AnalyzeWorkflowTool,
)

# Low-level debug tools (Phase 4)
from .lowlevel import (
    GetWorkflowJsonTool,
    PatchWorkflowJsonTool,
    SetWorkflowJsonTool,
)

__all__ = [
    # Base
    'Tool',
    'ToolRegistry',

    # Node operations (5)
    'CreateNodeTool',
    'DeleteNodeTool',
    'UpdateNodeTool',
    'DuplicateNodeTool',
    'BypassNodeTool',

    # Link operations (2)
    'CreateNodeLinkTool',
    'DeleteNodeLinkTool',

    # Widget operations (2)
    'UpdateWidgetTool',
    'GetWidgetOptionsTool',

    # Context (2)
    'GetWorkflowTool',
    'GetNodeTool',

    # Group operations (7)
    'CreateGroupTool',
    'DeleteGroupTool',
    'UpdateGroupTool',
    'MoveNodesToGroupTool',
    'MergeGroupsTool',
    'SplitGroupTool',
    'DetectGroupIssuesTool',

    # Discovery (7)
    'ListNodesTool',
    'ListAvailableNodesTool',
    'GetContextTool',
    'SearchAvailableNodesTool',
    'GetNodeSchemaTool',
    'ListAvailableModelsTool',
    'SearchAvailableModelsTool',

    # Layout (4)
    'AlignNodesTool',
    'DistributeNodesTool',
    'MoveGroupTool',
    'FitGroupToNodesTool',

    # Execution (3)
    'QueueExecutionTool',
    'CancelExecutionTool',
    'ExecutionStatusTool',

    # High-level (4)
    'OrganizeTool',
    'OrganizeLayoutTool',
    'ClearWorkflowTool',
    'IntegrateNodeIntoGroupsTool',

    # Utility (3)
    'UndoTool',
    'BatchTool',
    'HelpTool',

    # Analysis (5)
    'FindNodesTool',
    'GetModifiedWidgetsTool',
    'DetectLayoutIssuesTool',
    'ValidateWorkflowTool',
    'AnalyzeWorkflowTool',

    # Low-level (3)
    'GetWorkflowJsonTool',
    'PatchWorkflowJsonTool',
    'SetWorkflowJsonTool',
]

# Tool count: 45 Python backend tools (matches AGENT_TOOLS documentation)
