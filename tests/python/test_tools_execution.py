"""
Execution Tools Tests

Tests for execution lifecycle operations:
- queue_execution
- cancel_execution
- execution_status
"""

import pytest
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'claude_chat'))

from tools.execution import (
    QueueExecutionTool,
    CancelExecutionTool,
    ExecutionStatusTool
)
from conftest import assert_client_side_execution


class TestQueueExecutionTool:
    """Tests for queue_execution tool."""

    @pytest.fixture
    def tool(self):
        return QueueExecutionTool()

    def test_tool_name(self, tool):
        """Should have correct name."""
        assert tool.name == 'queue_execution'

    def test_tool_description(self, tool):
        """Should have meaningful description."""
        assert len(tool.description) > 20
        assert 'queue' in tool.description.lower() or 'execution' in tool.description.lower()

    @pytest.mark.asyncio
    async def test_execute_default(self, tool):
        """Should queue with default settings."""
        result = await tool.execute()

        assert_client_side_execution(result)
        assert result['action'] == 'queue_execution'

    @pytest.mark.asyncio
    async def test_execute_with_batch_size(self, tool):
        """Should queue with batch size."""
        result = await tool.execute(batch_size=4)

        assert_client_side_execution(result)
        assert result['params'].get('batch_size') == 4


class TestCancelExecutionTool:
    """Tests for cancel_execution tool."""

    @pytest.fixture
    def tool(self):
        return CancelExecutionTool()

    def test_tool_name(self, tool):
        """Should have correct name."""
        assert tool.name == 'cancel_execution'

    def test_tool_description(self, tool):
        """Should have meaningful description."""
        assert len(tool.description) > 20
        assert 'cancel' in tool.description.lower() or 'interrupt' in tool.description.lower()

    @pytest.mark.asyncio
    async def test_execute(self, tool):
        """Should cancel execution."""
        result = await tool.execute()

        assert_client_side_execution(result)
        assert result['action'] == 'cancel_execution'


class TestExecutionStatusTool:
    """Tests for execution_status tool."""

    @pytest.fixture
    def tool(self):
        return ExecutionStatusTool()

    def test_tool_name(self, tool):
        """Should have correct name."""
        assert tool.name == 'execution_status'

    def test_tool_description(self, tool):
        """Should have meaningful description."""
        assert len(tool.description) > 20
        assert 'status' in tool.description.lower() or 'queue' in tool.description.lower()

    @pytest.mark.asyncio
    async def test_execute_default(self, tool):
        """Should get status with defaults."""
        result = await tool.execute()

        assert_client_side_execution(result)
        assert result['action'] == 'execution_status'

    @pytest.mark.asyncio
    async def test_execute_with_history(self, tool):
        """Should include history when requested."""
        result = await tool.execute(include_history=True, history_limit=10)

        assert_client_side_execution(result)
        assert result['params'].get('include_history') is True
        assert result['params'].get('history_limit') == 10


class TestExecutionToolNaming:
    """Tests to verify old names are not used."""

    def test_old_names_not_registered(self):
        """Old execution tool names should not exist."""
        from tools.base import ToolRegistry

        assert ToolRegistry.get('queue') is None
        assert ToolRegistry.get('stop') is None
        assert ToolRegistry.get('get_status') is None

    def test_new_names_registered(self):
        """New execution tool names should be registered."""
        from tools.base import ToolRegistry

        assert ToolRegistry.get('queue_execution') is not None
        assert ToolRegistry.get('cancel_execution') is not None
        assert ToolRegistry.get('execution_status') is not None

    def test_naming_pattern_consistency(self):
        """All execution tools should end with _execution or execution_."""
        from tools.base import ToolRegistry

        # Get tool names from the list of Tool objects
        tool_names = {tool.name for tool in ToolRegistry.all()}
        execution_tools = ['queue_execution', 'cancel_execution', 'execution_status']

        for tool_name in execution_tools:
            assert tool_name in tool_names, f"Missing execution tool: {tool_name}"
            # Verify suffix pattern
            assert 'execution' in tool_name
