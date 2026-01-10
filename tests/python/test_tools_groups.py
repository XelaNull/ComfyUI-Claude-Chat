"""
Group Tools Tests

Tests for group operations:
- create_group
- delete_group
- update_group
- move_nodes_to_group
- merge_groups
- detect_group_issues
"""

import pytest
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'claude_chat'))

from tools.groups import (
    CreateGroupTool,
    DeleteGroupTool,
    UpdateGroupTool,
    MoveNodesToGroupTool,
    MergeGroupsTool,
    DetectGroupIssuesTool
)
from conftest import assert_client_side_execution


class TestCreateGroupTool:
    """Tests for create_group tool."""

    @pytest.fixture
    def tool(self):
        return CreateGroupTool()

    def test_tool_name(self, tool):
        """Should have correct name."""
        assert tool.name == 'create_group'

    @pytest.mark.asyncio
    async def test_execute_with_nodes(self, tool):
        """Should create group containing nodes."""
        result = await tool.execute(groups=[{
            'title': 'My Group',
            'nodes': [1, 2, 3]
        }])

        assert_client_side_execution(result)
        assert result['action'] == 'create_group'
        assert result['params']['groups'][0]['title'] == 'My Group'

    @pytest.mark.asyncio
    async def test_execute_with_color(self, tool):
        """Should set group color."""
        result = await tool.execute(groups=[{
            'title': 'Colored Group',
            'nodes': [1],
            'color': '#2A4858'
        }])

        assert_client_side_execution(result)
        assert result['params']['groups'][0]['color'] == '#2A4858'

    @pytest.mark.asyncio
    async def test_execute_multiple_groups(self, tool):
        """Should create multiple groups."""
        result = await tool.execute(groups=[
            {'title': 'Group A', 'nodes': [1, 2]},
            {'title': 'Group B', 'nodes': [3, 4]}
        ])

        assert_client_side_execution(result)
        assert len(result['params']['groups']) == 2


class TestDeleteGroupTool:
    """Tests for delete_group tool."""

    @pytest.fixture
    def tool(self):
        return DeleteGroupTool()

    def test_tool_name(self, tool):
        """Should have correct name."""
        assert tool.name == 'delete_group'

    @pytest.mark.asyncio
    async def test_execute_by_index(self, tool):
        """Should delete group by index."""
        result = await tool.execute(groups=[0])

        assert_client_side_execution(result)
        assert result['action'] == 'delete_group'

    @pytest.mark.asyncio
    async def test_execute_by_name(self, tool):
        """Should delete group by name."""
        result = await tool.execute(groups=['My Group'])

        assert_client_side_execution(result)
        assert 'My Group' in result['params']['groups']

    @pytest.mark.asyncio
    async def test_execute_delete_all(self, tool):
        """Should delete all groups."""
        result = await tool.execute(groups=['all'])

        assert_client_side_execution(result)
        assert result['action'] == 'delete_all_groups'


class TestUpdateGroupTool:
    """Tests for update_group tool."""

    @pytest.fixture
    def tool(self):
        return UpdateGroupTool()

    def test_tool_name(self, tool):
        """Should have correct name."""
        assert tool.name == 'update_group'

    @pytest.mark.asyncio
    async def test_execute_update_title(self, tool):
        """Should update group title."""
        result = await tool.execute(updates=[{
            'group': 0,
            'title': 'New Title'
        }])

        assert_client_side_execution(result)
        assert result['params']['updates'][0]['title'] == 'New Title'

    @pytest.mark.asyncio
    async def test_execute_update_color(self, tool):
        """Should update group color."""
        result = await tool.execute(updates=[{
            'group': 'My Group',
            'color': '#FF0000'
        }])

        assert_client_side_execution(result)
        assert result['params']['updates'][0]['color'] == '#FF0000'

    @pytest.mark.asyncio
    async def test_execute_update_nodes(self, tool):
        """Should update group nodes."""
        result = await tool.execute(updates=[{
            'group': 0,
            'nodes': [1, 2, 3, 4]
        }])

        assert_client_side_execution(result)
        assert result['params']['updates'][0]['nodes'] == [1, 2, 3, 4]


class TestMoveNodesToGroupTool:
    """Tests for move_nodes_to_group tool."""

    @pytest.fixture
    def tool(self):
        return MoveNodesToGroupTool()

    def test_tool_name(self, tool):
        """Should have correct renamed name."""
        assert tool.name == 'move_nodes_to_group'

    def test_tool_description(self, tool):
        """Should have meaningful description."""
        assert len(tool.description) > 20
        assert 'node' in tool.description.lower() or 'group' in tool.description.lower()

    @pytest.mark.asyncio
    async def test_execute_move_to_existing(self, tool):
        """Should move nodes to existing group."""
        result = await tool.execute(moves=[{
            'nodes': [1, 2, 3],
            'to_group': 'Target Group'
        }])

        assert_client_side_execution(result)
        assert result['action'] == 'move_nodes_to_group'
        assert result['params']['moves'][0]['to_group'] == 'Target Group'

    @pytest.mark.asyncio
    async def test_execute_move_with_config(self, tool):
        """Should create new group with config."""
        result = await tool.execute(moves=[{
            'nodes': [1, 2],
            'to_group': {'title': 'New Group', 'color': '#4A3858'}
        }])

        assert_client_side_execution(result)
        assert result['params']['moves'][0]['to_group']['title'] == 'New Group'

    @pytest.mark.asyncio
    async def test_execute_multiple_moves(self, tool):
        """Should handle multiple move operations."""
        result = await tool.execute(moves=[
            {'nodes': [1, 2], 'to_group': 'Group A'},
            {'nodes': [3, 4], 'to_group': 'Group B'}
        ])

        assert_client_side_execution(result)
        assert len(result['params']['moves']) == 2


class TestMergeGroupsTool:
    """Tests for merge_groups tool."""

    @pytest.fixture
    def tool(self):
        return MergeGroupsTool()

    def test_tool_name(self, tool):
        """Should have correct name."""
        assert tool.name == 'merge_groups'

    @pytest.mark.asyncio
    async def test_execute_merge(self, tool):
        """Should merge groups."""
        result = await tool.execute(
            groups=[0, 1],
            into={'title': 'Merged Group'}
        )

        assert_client_side_execution(result)
        assert result['action'] == 'merge_groups'
        assert result['params']['into']['title'] == 'Merged Group'

    @pytest.mark.asyncio
    async def test_execute_merge_with_color(self, tool):
        """Should set color on merged group."""
        result = await tool.execute(
            groups=['Group A', 'Group B'],
            into={'title': 'Combined', 'color': '#888888'}
        )

        assert_client_side_execution(result)
        assert result['params']['into']['color'] == '#888888'


class TestDetectGroupIssuesTool:
    """Tests for detect_group_issues tool."""

    @pytest.fixture
    def tool(self):
        return DetectGroupIssuesTool()

    def test_tool_name(self, tool):
        """Should have correct name."""
        assert tool.name == 'detect_group_issues'

    @pytest.mark.asyncio
    async def test_execute_default(self, tool):
        """Should detect issues with default settings."""
        result = await tool.execute()

        assert_client_side_execution(result)
        assert result['action'] == 'detect_group_issues'

    @pytest.mark.asyncio
    async def test_execute_with_min_gap(self, tool):
        """Should use custom min_gap."""
        result = await tool.execute(min_gap=100)

        assert_client_side_execution(result)
        assert result['params']['min_gap'] == 100


class TestGroupToolNaming:
    """Tests to verify old names are not used."""

    def test_move_to_group_not_registered(self):
        """Old move_to_group name should not exist."""
        from tools.base import ToolRegistry

        tool = ToolRegistry.get('move_to_group')
        assert tool is None, "Old 'move_to_group' name should not be registered"

    def test_new_name_registered(self):
        """New move_nodes_to_group name should be registered."""
        from tools.base import ToolRegistry

        assert ToolRegistry.get('move_nodes_to_group') is not None
