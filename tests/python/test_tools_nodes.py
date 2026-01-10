"""
Node Tools Tests

Tests for node CRUD operations:
- create_node
- delete_node
- update_node
- duplicate_node
- bypass_node
"""

import pytest
import sys
import os
import asyncio

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'claude_chat'))

from tools.nodes import (
    CreateNodeTool,
    DeleteNodeTool,
    UpdateNodeTool,
    DuplicateNodeTool,
    BypassNodeTool
)
from conftest import assert_client_side_execution


class TestCreateNodeTool:
    """Tests for create_node tool."""

    @pytest.fixture
    def tool(self):
        return CreateNodeTool()

    def test_tool_name(self, tool):
        """Should have correct name."""
        assert tool.name == 'create_node'

    def test_tool_description(self, tool):
        """Should have meaningful description."""
        assert len(tool.description) > 20
        assert 'node' in tool.description.lower()

    def test_parameters_schema(self, tool):
        """Should have valid parameter schema."""
        params = tool.parameters
        assert params['type'] == 'object'
        assert 'properties' in params

    @pytest.mark.asyncio
    async def test_execute_single_node(self, tool):
        """Should create a single node."""
        result = await tool.execute(nodes=[{
            'type': 'KSampler',
            'pos': [100, 200]
        }])

        assert_client_side_execution(result)
        assert result['action'] == 'create_node'
        assert 'nodes' in result['params']

    @pytest.mark.asyncio
    async def test_execute_multiple_nodes(self, tool):
        """Should create multiple nodes."""
        result = await tool.execute(nodes=[
            {'type': 'KSampler', 'ref': '$a'},
            {'type': 'VAEDecode', 'ref': '$b'},
            {'type': 'SaveImage', 'ref': '$c'}
        ])

        assert_client_side_execution(result)
        assert len(result['params']['nodes']) == 3

    @pytest.mark.asyncio
    async def test_execute_with_widgets(self, tool):
        """Should pass widget values."""
        result = await tool.execute(nodes=[{
            'type': 'KSampler',
            'widgets': {'steps': 30, 'cfg': 7.5}
        }])

        assert_client_side_execution(result)
        assert result['params']['nodes'][0]['widgets'] == {'steps': 30, 'cfg': 7.5}

    @pytest.mark.asyncio
    async def test_execute_with_ref(self, tool):
        """Should include ref for cross-referencing."""
        result = await tool.execute(nodes=[{
            'type': 'KSampler',
            'ref': '$sampler'
        }])

        assert_client_side_execution(result)
        assert result['params']['nodes'][0]['ref'] == '$sampler'

    @pytest.mark.asyncio
    async def test_execute_with_group(self, tool):
        """Should include group assignment."""
        result = await tool.execute(nodes=[{
            'type': 'KSampler',
            'group': 'Sampling'
        }])

        assert_client_side_execution(result)
        assert result['params']['nodes'][0]['group'] == 'Sampling'


class TestDeleteNodeTool:
    """Tests for delete_node tool."""

    @pytest.fixture
    def tool(self):
        return DeleteNodeTool()

    def test_tool_name(self, tool):
        """Should have correct name."""
        assert tool.name == 'delete_node'

    @pytest.mark.asyncio
    async def test_execute_single_node(self, tool):
        """Should delete a single node."""
        result = await tool.execute(nodes=[5])

        assert_client_side_execution(result)
        assert result['action'] == 'delete_node'
        assert 5 in result['params']['nodes']

    @pytest.mark.asyncio
    async def test_execute_multiple_nodes(self, tool):
        """Should delete multiple nodes."""
        result = await tool.execute(nodes=[1, 2, 3])

        assert_client_side_execution(result)
        assert len(result['params']['nodes']) == 3

    @pytest.mark.asyncio
    async def test_execute_with_reconnect(self, tool):
        """Should pass reconnect option."""
        result = await tool.execute(nodes=[5], reconnect=True)

        assert_client_side_execution(result)
        assert result['params'].get('reconnect') is True

    @pytest.mark.asyncio
    async def test_execute_with_refs(self, tool):
        """Should accept $refs."""
        result = await tool.execute(nodes=['$sampler', '$decoder'])

        assert_client_side_execution(result)
        assert '$sampler' in result['params']['nodes']


class TestUpdateNodeTool:
    """Tests for update_node tool."""

    @pytest.fixture
    def tool(self):
        return UpdateNodeTool()

    def test_tool_name(self, tool):
        """Should have correct name."""
        assert tool.name == 'update_node'

    @pytest.mark.asyncio
    async def test_execute_update_position(self, tool):
        """Should update node position."""
        result = await tool.execute(updates=[{
            'node': 5,
            'pos': [300, 400]
        }])

        assert_client_side_execution(result)
        assert result['action'] == 'update_node'
        assert result['params']['updates'][0]['pos'] == [300, 400]

    @pytest.mark.asyncio
    async def test_execute_update_title(self, tool):
        """Should update node title."""
        result = await tool.execute(updates=[{
            'node': 5,
            'title': 'My Custom Node'
        }])

        assert_client_side_execution(result)
        assert result['params']['updates'][0]['title'] == 'My Custom Node'

    @pytest.mark.asyncio
    async def test_execute_multiple_updates(self, tool):
        """Should update multiple nodes."""
        result = await tool.execute(updates=[
            {'node': 1, 'pos': [100, 100]},
            {'node': 2, 'pos': [200, 200]},
            {'node': 3, 'title': 'New Title'}
        ])

        assert_client_side_execution(result)
        assert len(result['params']['updates']) == 3


class TestDuplicateNodeTool:
    """Tests for duplicate_node tool."""

    @pytest.fixture
    def tool(self):
        return DuplicateNodeTool()

    def test_tool_name(self, tool):
        """Should have correct name."""
        assert tool.name == 'duplicate_node'

    @pytest.mark.asyncio
    async def test_execute_duplicate(self, tool):
        """Should duplicate a node."""
        result = await tool.execute(nodes=[{
            'node': 5,
            'offset': [50, 50]
        }])

        assert_client_side_execution(result)
        assert result['action'] == 'duplicate_node'

    @pytest.mark.asyncio
    async def test_execute_with_ref(self, tool):
        """Should assign ref to duplicate."""
        result = await tool.execute(nodes=[{
            'node': 5,
            'ref': '$copy'
        }])

        assert_client_side_execution(result)
        assert result['params']['nodes'][0]['ref'] == '$copy'


class TestBypassNodeTool:
    """Tests for bypass_node tool."""

    @pytest.fixture
    def tool(self):
        return BypassNodeTool()

    def test_tool_name(self, tool):
        """Should have correct name."""
        assert tool.name == 'bypass_node'

    @pytest.mark.asyncio
    async def test_execute_bypass_on(self, tool):
        """Should set bypass to true."""
        result = await tool.execute(nodes=[5], bypass=True)

        assert_client_side_execution(result)
        assert result['action'] == 'bypass_node'
        assert result['params']['bypass'] is True

    @pytest.mark.asyncio
    async def test_execute_bypass_off(self, tool):
        """Should set bypass to false."""
        result = await tool.execute(nodes=[5], bypass=False)

        assert_client_side_execution(result)
        assert result['params']['bypass'] is False

    @pytest.mark.asyncio
    async def test_execute_multiple_nodes(self, tool):
        """Should bypass multiple nodes."""
        result = await tool.execute(nodes=[1, 2, 3], bypass=True)

        assert_client_side_execution(result)
        assert len(result['params']['nodes']) == 3
