"""
Link Tools Tests

Tests for link operations:
- create_node_link
- delete_node_link
"""

import pytest
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'claude_chat'))

from tools.links import CreateNodeLinkTool, DeleteNodeLinkTool
from conftest import assert_client_side_execution


class TestCreateNodeLinkTool:
    """Tests for create_node_link tool."""

    @pytest.fixture
    def tool(self):
        return CreateNodeLinkTool()

    def test_tool_name(self, tool):
        """Should have correct renamed name."""
        assert tool.name == 'create_node_link'

    def test_tool_description(self, tool):
        """Should have meaningful description."""
        assert len(tool.description) > 20
        assert 'connect' in tool.description.lower() or 'link' in tool.description.lower()

    def test_parameters_schema(self, tool):
        """Should have valid parameter schema."""
        params = tool.parameters
        assert params['type'] == 'object'
        assert 'properties' in params
        assert 'links' in params['properties']

    @pytest.mark.asyncio
    async def test_execute_single_link(self, tool):
        """Should create a single link."""
        result = await tool.execute(links=[{
            'from': 1,
            'from_slot': 0,
            'to': 2,
            'to_slot': 0
        }])

        assert_client_side_execution(result)
        assert result['action'] == 'create_node_link'
        assert len(result['params']['links']) == 1

    @pytest.mark.asyncio
    async def test_execute_multiple_links(self, tool):
        """Should create multiple links."""
        result = await tool.execute(links=[
            {'from': 1, 'from_slot': 0, 'to': 2, 'to_slot': 0},
            {'from': 1, 'from_slot': 1, 'to': 3, 'to_slot': 0},
            {'from': 2, 'from_slot': 0, 'to': 4, 'to_slot': 1}
        ])

        assert_client_side_execution(result)
        assert len(result['params']['links']) == 3

    @pytest.mark.asyncio
    async def test_execute_with_refs(self, tool):
        """Should accept $refs for nodes."""
        result = await tool.execute(links=[{
            'from': '$ckpt',
            'from_slot': 0,
            'to': '$sampler',
            'to_slot': 0
        }])

        assert_client_side_execution(result)
        assert result['params']['links'][0]['from'] == '$ckpt'
        assert result['params']['links'][0]['to'] == '$sampler'

    @pytest.mark.asyncio
    async def test_link_structure(self, tool):
        """Should preserve all link properties."""
        result = await tool.execute(links=[{
            'from': 10,
            'from_slot': 2,
            'to': 20,
            'to_slot': 3
        }])

        link = result['params']['links'][0]
        assert link['from'] == 10
        assert link['from_slot'] == 2
        assert link['to'] == 20
        assert link['to_slot'] == 3


class TestDeleteNodeLinkTool:
    """Tests for delete_node_link tool."""

    @pytest.fixture
    def tool(self):
        return DeleteNodeLinkTool()

    def test_tool_name(self, tool):
        """Should have correct renamed name."""
        assert tool.name == 'delete_node_link'

    def test_tool_description(self, tool):
        """Should have meaningful description."""
        assert len(tool.description) > 20

    @pytest.mark.asyncio
    async def test_execute_single_link(self, tool):
        """Should delete a single link."""
        result = await tool.execute(links=[{
            'node': 5,
            'input_slot': 0
        }])

        assert_client_side_execution(result)
        assert result['action'] == 'delete_node_link'
        assert len(result['params']['links']) == 1

    @pytest.mark.asyncio
    async def test_execute_multiple_links(self, tool):
        """Should delete multiple links."""
        result = await tool.execute(links=[
            {'node': 5, 'input_slot': 0},
            {'node': 5, 'input_slot': 1},
            {'node': 6, 'input_slot': 0}
        ])

        assert_client_side_execution(result)
        assert len(result['params']['links']) == 3

    @pytest.mark.asyncio
    async def test_execute_with_ref(self, tool):
        """Should accept $ref for node."""
        result = await tool.execute(links=[{
            'node': '$sampler',
            'input_slot': 0
        }])

        assert_client_side_execution(result)
        assert result['params']['links'][0]['node'] == '$sampler'


class TestLinkToolNaming:
    """Tests to verify old names are not used."""

    def test_create_link_not_registered(self):
        """Old create_link name should not exist."""
        from tools.base import ToolRegistry

        tool = ToolRegistry.get('create_link')
        assert tool is None, "Old 'create_link' name should not be registered"

    def test_delete_link_not_registered(self):
        """Old delete_link name should not exist."""
        from tools.base import ToolRegistry

        tool = ToolRegistry.get('delete_link')
        assert tool is None, "Old 'delete_link' name should not be registered"

    def test_new_names_registered(self):
        """New names should be registered."""
        from tools.base import ToolRegistry

        assert ToolRegistry.get('create_node_link') is not None
        assert ToolRegistry.get('delete_node_link') is not None
