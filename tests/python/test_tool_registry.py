"""
Tool Registry Tests

Tests for the tool registration and lookup system.
"""

import pytest
import sys
import os

# Add claude_chat to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'claude_chat'))

from tools.base import Tool, ToolRegistry


class TestToolRegistry:
    """Tests for the ToolRegistry class."""

    def test_registry_exists(self):
        """Registry should be accessible."""
        assert ToolRegistry is not None

    def test_get_all_tools(self):
        """Should return all registered tools."""
        # ToolRegistry.all() returns a list of Tool instances
        tools = ToolRegistry.all()

        assert isinstance(tools, list)
        assert len(tools) > 0

    def test_registered_tools_have_required_attributes(self):
        """All tools should have name, description, and parameters."""
        tools = ToolRegistry.all()

        for tool in tools:
            assert hasattr(tool, 'name'), f"Tool missing name"
            assert hasattr(tool, 'description'), f"{tool.name} missing description"
            assert hasattr(tool, 'parameters'), f"{tool.name} missing parameters"

    def test_tool_names_are_strings(self):
        """Tool names should be non-empty strings."""
        tools = ToolRegistry.all()

        for tool in tools:
            assert isinstance(tool.name, str)
            assert len(tool.name) > 0

    def test_tool_descriptions_are_strings(self):
        """Tool descriptions should be non-empty strings."""
        tools = ToolRegistry.all()

        for tool in tools:
            assert isinstance(tool.description, str)
            assert len(tool.description) > 0

    def test_tool_parameters_are_dicts(self):
        """Tool parameters should be valid JSON schema objects."""
        tools = ToolRegistry.all()

        for tool in tools:
            assert isinstance(tool.parameters, dict)
            assert 'type' in tool.parameters
            assert tool.parameters['type'] == 'object'

    def test_get_tool_by_name(self):
        """Should retrieve tool by name."""
        # ToolRegistry.get() is the correct method
        tool = ToolRegistry.get('create_node')

        assert tool is not None
        assert tool.name == 'create_node'

    def test_get_nonexistent_tool(self):
        """Should return None for unknown tool."""
        tool = ToolRegistry.get('nonexistent_tool_xyz')

        assert tool is None


class TestToolBase:
    """Tests for the Tool base class."""

    def test_tool_base_attributes(self):
        """Tool base class should have required attributes."""
        assert hasattr(Tool, 'name')
        assert hasattr(Tool, 'description')
        assert hasattr(Tool, 'parameters')

    def test_tool_is_subclassable(self):
        """Should be able to create custom tools."""
        class CustomTool(Tool):
            name = "custom_test_tool"
            description = "A test tool"
            parameters = {"type": "object", "properties": {}}

            async def execute(self):
                return {"success": True}

        tool = CustomTool()
        assert tool.name == "custom_test_tool"


class TestRegisteredTools:
    """Tests for specific registered tools."""

    def _get_tool_names(self):
        """Helper to get set of all tool names."""
        return {tool.name for tool in ToolRegistry.all()}

    def test_node_tools_registered(self):
        """Node tools should be registered."""
        names = self._get_tool_names()

        assert 'create_node' in names
        assert 'delete_node' in names
        assert 'update_node' in names
        assert 'duplicate_node' in names
        assert 'bypass_node' in names

    def test_link_tools_registered_with_correct_names(self):
        """Link tools should use the new naming convention."""
        names = self._get_tool_names()

        # New names should exist
        assert 'create_node_link' in names
        assert 'delete_node_link' in names

        # Old names should NOT exist
        assert 'create_link' not in names
        assert 'delete_link' not in names

    def test_widget_tools_registered(self):
        """Widget tools should be registered."""
        names = self._get_tool_names()

        assert 'update_widget' in names
        assert 'get_widget_options' in names

    def test_group_tools_registered(self):
        """Group tools should be registered with correct names."""
        names = self._get_tool_names()

        assert 'create_group' in names
        assert 'delete_group' in names
        assert 'update_group' in names
        assert 'move_nodes_to_group' in names  # Renamed from move_to_group
        assert 'merge_groups' in names
        assert 'detect_group_issues' in names

        # Old name should NOT exist
        assert 'move_to_group' not in names

    def test_execution_tools_registered(self):
        """Execution tools should be registered with correct names."""
        names = self._get_tool_names()

        assert 'queue_execution' in names
        assert 'cancel_execution' in names
        assert 'execution_status' in names

        # Old names should NOT exist
        assert 'queue' not in names
        assert 'stop' not in names
        assert 'get_status' not in names

    def test_analysis_tools_registered(self):
        """Analysis tools should be registered with correct names."""
        names = self._get_tool_names()

        assert 'find_nodes' in names
        assert 'get_modified_widgets' in names  # Renamed from compare_to_defaults
        assert 'validate_workflow' in names
        assert 'detect_layout_issues' in names
        assert 'analyze_workflow' in names

        # Old name should NOT exist
        assert 'compare_to_defaults' not in names

    def test_discovery_tools_registered(self):
        """Discovery tools should be registered."""
        names = self._get_tool_names()

        # Context tools
        assert 'get_workflow' in names
        assert 'get_node' in names

        # Discovery tools (actual names)
        assert 'search_node_types' in names
        assert 'get_node_schema' in names
        assert 'list_available_models' in names
        assert 'search_available_models' in names

    def test_highlevel_tools_registered(self):
        """High-level tools should be registered."""
        names = self._get_tool_names()

        assert 'organize' in names
        assert 'organize_layout' in names
        assert 'clear_workflow' in names

    def test_utility_tools_registered(self):
        """Utility tools should be registered."""
        names = self._get_tool_names()

        assert 'batch' in names
        assert 'undo' in names

    def test_lowlevel_tools_registered(self):
        """Low-level tools should be registered."""
        names = self._get_tool_names()

        assert 'get_workflow_json' in names
        assert 'patch_workflow_json' in names
        assert 'set_workflow_json' in names


class TestToolCount:
    """Tests to ensure expected number of tools."""

    def test_minimum_tool_count(self):
        """Should have at least 36 tools registered."""
        tools = ToolRegistry.all()

        assert len(tools) >= 36, f"Expected at least 36 tools, got {len(tools)}"

    def test_no_duplicate_names(self):
        """Tool names should be unique."""
        tools = ToolRegistry.all()
        names = [t.name for t in tools]

        assert len(names) == len(set(names)), "Duplicate tool names found"
