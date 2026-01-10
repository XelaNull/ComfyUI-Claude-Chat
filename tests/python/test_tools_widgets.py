"""
Widget Tools Tests

Tests for widget operations:
- update_widget
- get_widget_options
"""

import pytest
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'claude_chat'))

from tools.widgets import UpdateWidgetTool, GetWidgetOptionsTool
from conftest import assert_client_side_execution


class TestUpdateWidgetTool:
    """Tests for update_widget tool."""

    @pytest.fixture
    def tool(self):
        return UpdateWidgetTool()

    def test_tool_name(self, tool):
        """Should have correct name."""
        assert tool.name == 'update_widget'

    def test_tool_description(self, tool):
        """Should have meaningful description."""
        assert len(tool.description) > 20
        assert 'widget' in tool.description.lower() or 'value' in tool.description.lower()

    @pytest.mark.asyncio
    async def test_execute_single_update(self, tool):
        """Should update single widget."""
        result = await tool.execute(updates=[{
            'node': 5,
            'widget': 'steps',
            'value': 30
        }])

        assert_client_side_execution(result)
        assert result['action'] == 'update_widget'
        assert result['params']['updates'][0]['value'] == 30

    @pytest.mark.asyncio
    async def test_execute_multiple_updates(self, tool):
        """Should update multiple widgets."""
        result = await tool.execute(updates=[
            {'node': 5, 'widget': 'steps', 'value': 30},
            {'node': 5, 'widget': 'cfg', 'value': 7.5},
            {'node': 5, 'widget': 'sampler_name', 'value': 'dpmpp_2m'}
        ])

        assert_client_side_execution(result)
        assert len(result['params']['updates']) == 3

    @pytest.mark.asyncio
    async def test_execute_with_ref(self, tool):
        """Should accept $ref for node."""
        result = await tool.execute(updates=[{
            'node': '$sampler',
            'widget': 'steps',
            'value': 25
        }])

        assert_client_side_execution(result)
        assert result['params']['updates'][0]['node'] == '$sampler'

    @pytest.mark.asyncio
    async def test_execute_string_value(self, tool):
        """Should handle string widget values."""
        result = await tool.execute(updates=[{
            'node': 1,
            'widget': 'text',
            'value': 'a beautiful landscape'
        }])

        assert_client_side_execution(result)
        assert result['params']['updates'][0]['value'] == 'a beautiful landscape'

    @pytest.mark.asyncio
    async def test_execute_boolean_value(self, tool):
        """Should handle boolean widget values."""
        result = await tool.execute(updates=[{
            'node': 1,
            'widget': 'enabled',
            'value': True
        }])

        assert_client_side_execution(result)
        assert result['params']['updates'][0]['value'] is True


class TestGetWidgetOptionsTool:
    """Tests for get_widget_options tool."""

    @pytest.fixture
    def tool(self):
        return GetWidgetOptionsTool()

    def test_tool_name(self, tool):
        """Should have correct name."""
        assert tool.name == 'get_widget_options'

    def test_tool_description(self, tool):
        """Should have meaningful description."""
        assert len(tool.description) > 20

    @pytest.mark.asyncio
    async def test_execute(self, tool):
        """Should get widget options."""
        # GetWidgetOptionsTool uses 'queries' parameter (array of {node, widget} objects)
        result = await tool.execute(queries=[{'node': 5, 'widget': 'sampler_name'}])

        assert_client_side_execution(result)
        assert result['action'] == 'get_widget_options'
        assert result['params']['queries'][0]['node'] == 5
        assert result['params']['queries'][0]['widget'] == 'sampler_name'

    @pytest.mark.asyncio
    async def test_execute_with_ref(self, tool):
        """Should accept $ref for node."""
        result = await tool.execute(queries=[{'node': '$sampler', 'widget': 'scheduler'}])

        assert_client_side_execution(result)
        assert result['params']['queries'][0]['node'] == '$sampler'
