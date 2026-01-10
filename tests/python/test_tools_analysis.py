"""
Analysis Tools Tests

Tests for workflow analysis operations:
- find_nodes
- get_modified_widgets
- validate_workflow
- detect_layout_issues
- analyze_workflow
"""

import pytest
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'claude_chat'))

from tools.analysis import (
    FindNodesTool,
    GetModifiedWidgetsTool,
    DetectLayoutIssuesTool,
    ValidateWorkflowTool,
    AnalyzeWorkflowTool
)
from conftest import assert_client_side_execution


class TestFindNodesTool:
    """Tests for find_nodes tool."""

    @pytest.fixture
    def tool(self):
        return FindNodesTool()

    def test_tool_name(self, tool):
        """Should have correct name."""
        assert tool.name == 'find_nodes'

    @pytest.mark.asyncio
    async def test_execute_by_type(self, tool):
        """Should find nodes by type."""
        result = await tool.execute(query={'type': 'KSampler'})

        assert_client_side_execution(result)
        assert result['action'] == 'find_nodes'
        assert result['params']['query']['type'] == 'KSampler'

    @pytest.mark.asyncio
    async def test_execute_by_bypassed(self, tool):
        """Should find bypassed nodes."""
        result = await tool.execute(query={'bypassed': True})

        assert_client_side_execution(result)
        assert result['params']['query']['bypassed'] is True

    @pytest.mark.asyncio
    async def test_execute_by_group(self, tool):
        """Should find nodes in group."""
        result = await tool.execute(query={'in_group': 'Sampling'})

        assert_client_side_execution(result)
        assert result['params']['query']['in_group'] == 'Sampling'

    @pytest.mark.asyncio
    async def test_execute_ungrouped(self, tool):
        """Should find ungrouped nodes."""
        result = await tool.execute(query={'ungrouped': True})

        assert_client_side_execution(result)
        assert result['params']['query']['ungrouped'] is True

    @pytest.mark.asyncio
    async def test_execute_by_widget(self, tool):
        """Should find nodes by widget value."""
        result = await tool.execute(query={
            'widget': {'name': 'sampler_name', 'value': 'euler'}
        })

        assert_client_side_execution(result)
        assert result['params']['query']['widget']['name'] == 'sampler_name'


class TestGetModifiedWidgetsTool:
    """Tests for get_modified_widgets tool."""

    @pytest.fixture
    def tool(self):
        return GetModifiedWidgetsTool()

    def test_tool_name(self, tool):
        """Should have correct renamed name."""
        assert tool.name == 'get_modified_widgets'

    def test_tool_description(self, tool):
        """Should describe what it returns, not what it compares."""
        desc = tool.description.lower()
        assert 'default' in desc or 'modified' in desc or 'changed' in desc

    @pytest.mark.asyncio
    async def test_execute_all_nodes(self, tool):
        """Should check all nodes when none specified."""
        result = await tool.execute()

        assert_client_side_execution(result)
        assert result['action'] == 'get_modified_widgets'
        assert result['params']['nodes'] == []

    @pytest.mark.asyncio
    async def test_execute_specific_nodes(self, tool):
        """Should check specific nodes."""
        result = await tool.execute(nodes=[1, 2, 3])

        assert_client_side_execution(result)
        assert result['params']['nodes'] == [1, 2, 3]


class TestDetectLayoutIssuesTool:
    """Tests for detect_layout_issues tool."""

    @pytest.fixture
    def tool(self):
        return DetectLayoutIssuesTool()

    def test_tool_name(self, tool):
        """Should have correct name."""
        assert tool.name == 'detect_layout_issues'

    @pytest.mark.asyncio
    async def test_execute_default(self, tool):
        """Should detect issues with defaults."""
        result = await tool.execute()

        assert_client_side_execution(result)
        assert result['action'] == 'detect_layout_issues'

    @pytest.mark.asyncio
    async def test_execute_with_min_spacing(self, tool):
        """Should use custom min_spacing."""
        result = await tool.execute(min_spacing=50)

        assert_client_side_execution(result)
        assert result['params']['min_spacing'] == 50


class TestValidateWorkflowTool:
    """Tests for validate_workflow tool."""

    @pytest.fixture
    def tool(self):
        return ValidateWorkflowTool()

    def test_tool_name(self, tool):
        """Should have correct name."""
        assert tool.name == 'validate_workflow'

    @pytest.mark.asyncio
    async def test_execute(self, tool):
        """Should validate workflow."""
        result = await tool.execute()

        assert_client_side_execution(result)
        assert result['action'] == 'validate_workflow'


class TestAnalyzeWorkflowTool:
    """Tests for analyze_workflow tool."""

    @pytest.fixture
    def tool(self):
        return AnalyzeWorkflowTool()

    def test_tool_name(self, tool):
        """Should have correct name."""
        assert tool.name == 'analyze_workflow'

    @pytest.mark.asyncio
    async def test_execute_default(self, tool):
        """Should analyze with defaults."""
        result = await tool.execute()

        assert_client_side_execution(result)
        assert result['action'] == 'analyze_workflow'

    @pytest.mark.asyncio
    async def test_execute_with_suggestions(self, tool):
        """Should include suggestions."""
        result = await tool.execute(include_suggestions=True)

        assert_client_side_execution(result)
        assert result['params']['include_suggestions'] is True

    @pytest.mark.asyncio
    async def test_execute_without_suggestions(self, tool):
        """Should exclude suggestions."""
        result = await tool.execute(include_suggestions=False)

        assert_client_side_execution(result)
        assert result['params']['include_suggestions'] is False


class TestAnalysisToolNaming:
    """Tests to verify old names are not used."""

    def test_compare_to_defaults_not_registered(self):
        """Old compare_to_defaults name should not exist."""
        from tools.base import ToolRegistry

        tool = ToolRegistry.get('compare_to_defaults')
        assert tool is None, "Old 'compare_to_defaults' name should not be registered"

    def test_get_modified_widgets_registered(self):
        """New get_modified_widgets name should be registered."""
        from tools.base import ToolRegistry

        assert ToolRegistry.get('get_modified_widgets') is not None
