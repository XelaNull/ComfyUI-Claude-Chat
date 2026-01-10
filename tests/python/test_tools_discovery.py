"""
Discovery Tools Tests

Tests for discovery operations:
- search_node_types (from discovery module)
- get_node_schema (from discovery module)
- list_available_models (from discovery module)
- search_available_models (from discovery module)
- get_workflow (from context module)
- get_node (from context module)
"""

import pytest
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'claude_chat'))

from tools.discovery import (
    SearchNodeTypesTool,
    GetNodeSchemaTool,
    ListAvailableModelsTool,
    SearchAvailableModelsTool
)
from tools.context import (
    GetWorkflowTool,
    GetNodeTool
)
from conftest import assert_client_side_execution


class TestGetWorkflowTool:
    """Tests for get_workflow tool."""

    @pytest.fixture
    def tool(self):
        return GetWorkflowTool()

    def test_tool_name(self, tool):
        """Should have correct name."""
        assert tool.name == 'get_workflow'

    @pytest.mark.asyncio
    async def test_execute_default(self, tool):
        """Should get workflow with default mode."""
        result = await tool.execute()

        assert_client_side_execution(result)
        assert result['action'] == 'get_workflow'

    @pytest.mark.asyncio
    async def test_execute_summary_mode(self, tool):
        """Should get workflow summary."""
        result = await tool.execute(mode='summary')

        assert_client_side_execution(result)
        assert result['params'].get('mode') == 'summary'

    @pytest.mark.asyncio
    async def test_execute_details_mode(self, tool):
        """Should get workflow details."""
        result = await tool.execute(mode='details')

        assert_client_side_execution(result)
        assert result['params'].get('mode') == 'details'

    @pytest.mark.asyncio
    async def test_execute_full_mode(self, tool):
        """Should get full workflow."""
        result = await tool.execute(mode='full')

        assert_client_side_execution(result)
        assert result['params'].get('mode') == 'full'


class TestGetNodeTool:
    """Tests for get_node tool."""

    @pytest.fixture
    def tool(self):
        return GetNodeTool()

    def test_tool_name(self, tool):
        """Should have correct name."""
        assert tool.name == 'get_node'

    @pytest.mark.asyncio
    async def test_execute_by_ids(self, tool):
        """Should get nodes by IDs."""
        # GetNodeTool uses 'nodes' parameter (array)
        result = await tool.execute(nodes=[5, 6])

        assert_client_side_execution(result)
        assert result['action'] == 'get_node'
        assert result['params']['nodes'] == [5, 6]

    @pytest.mark.asyncio
    async def test_execute_with_refs(self, tool):
        """Should support $refs."""
        result = await tool.execute(nodes=['$sampler', '$decoder'])

        assert_client_side_execution(result)
        assert '$sampler' in result['params']['nodes']


class TestSearchNodeTypesTool:
    """Tests for search_node_types tool."""

    @pytest.fixture
    def tool(self):
        return SearchNodeTypesTool()

    def test_tool_name(self, tool):
        """Should have correct name."""
        assert tool.name == 'search_node_types'

    @pytest.mark.asyncio
    async def test_execute(self, tool):
        """Should search for node types."""
        result = await tool.execute(query='sampler')

        assert_client_side_execution(result)
        assert result['action'] == 'search_node_types'


class TestGetNodeSchemaTool:
    """Tests for get_node_schema tool."""

    @pytest.fixture
    def tool(self):
        return GetNodeSchemaTool()

    def test_tool_name(self, tool):
        """Should have correct name."""
        assert tool.name == 'get_node_schema'

    @pytest.mark.asyncio
    async def test_execute(self, tool):
        """Should get node schema by type."""
        # GetNodeSchemaTool uses 'type' parameter (not 'node_type')
        result = await tool.execute(type='KSampler')

        assert_client_side_execution(result)
        assert result['action'] == 'get_node_schema'


class TestListAvailableModelsTool:
    """Tests for list_available_models tool."""

    @pytest.fixture
    def tool(self):
        return ListAvailableModelsTool()

    def test_tool_name(self, tool):
        """Should have correct name."""
        assert tool.name == 'list_available_models'

    @pytest.mark.asyncio
    async def test_execute(self, tool):
        """Should list available models."""
        # ListAvailableModelsTool uses 'type' parameter (not 'model_type')
        result = await tool.execute(type='checkpoints')

        assert_client_side_execution(result)
        assert result['action'] == 'list_available_models'


class TestSearchAvailableModelsTool:
    """Tests for search_available_models tool."""

    @pytest.fixture
    def tool(self):
        return SearchAvailableModelsTool()

    def test_tool_name(self, tool):
        """Should have correct name."""
        assert tool.name == 'search_available_models'

    @pytest.mark.asyncio
    async def test_execute(self, tool):
        """Should search for models."""
        # SearchAvailableModelsTool requires both 'type' and 'query' parameters
        result = await tool.execute(type='checkpoints', query='dreamshaper')

        assert_client_side_execution(result)
        assert result['action'] == 'search_available_models'


class TestDiscoveryToolNaming:
    """Tests to verify correct naming convention."""

    def test_old_names_not_registered(self):
        """Old discovery tool names should not exist."""
        from tools.base import ToolRegistry

        # These old names should not be registered
        assert ToolRegistry.get('list_types') is None
        assert ToolRegistry.get('search_types') is None
        assert ToolRegistry.get('get_models') is None

    def test_new_names_registered(self):
        """New discovery tool names should be registered."""
        from tools.base import ToolRegistry

        # Context tools
        assert ToolRegistry.get('get_workflow') is not None
        assert ToolRegistry.get('get_node') is not None

        # Discovery tools (actual names)
        assert ToolRegistry.get('search_node_types') is not None
        assert ToolRegistry.get('get_node_schema') is not None
        assert ToolRegistry.get('list_available_models') is not None
        assert ToolRegistry.get('search_available_models') is not None
