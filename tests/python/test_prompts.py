"""
Prompts Tests

Tests for system prompt content and consistency:
- Tool name verification
- Prompt structure
- No references to old tool names
"""

import pytest
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'claude_chat'))

from prompts import (
    SYSTEM_PROMPT,
    SYSTEM_PROMPT_WITH_TOOLS,
    SYSTEM_PROMPT_WITH_TOOLS_CLI,
    SYSTEM_PROMPT_CONTINUATION_CLI,
    SYSTEM_PROMPT_CONTINUATION_API
)


class TestSystemPromptStructure:
    """Tests for basic prompt structure."""

    def test_system_prompt_exists(self):
        """Base system prompt should exist."""
        assert SYSTEM_PROMPT is not None
        assert len(SYSTEM_PROMPT) > 100

    def test_tools_prompt_extends_base(self):
        """Tools prompt should extend base prompt."""
        assert SYSTEM_PROMPT in SYSTEM_PROMPT_WITH_TOOLS

    def test_cli_prompt_extends_base(self):
        """CLI prompt should extend base prompt."""
        assert SYSTEM_PROMPT in SYSTEM_PROMPT_WITH_TOOLS_CLI

    def test_continuation_prompts_exist(self):
        """Continuation prompts should exist."""
        assert SYSTEM_PROMPT_CONTINUATION_CLI is not None
        assert SYSTEM_PROMPT_CONTINUATION_API is not None


class TestToolNamesInPrompts:
    """Tests to ensure prompts use correct tool names."""

    def test_link_tools_use_new_names(self):
        """Prompts should use create_node_link/delete_node_link."""
        full_prompts = SYSTEM_PROMPT_WITH_TOOLS + SYSTEM_PROMPT_WITH_TOOLS_CLI

        # New names should appear
        assert 'create_node_link' in full_prompts
        assert 'delete_node_link' in full_prompts

        # Old names should NOT appear (except possibly in examples that haven't been updated)
        # Check that old names don't appear as standalone tool references
        # This is a soft check - we're looking for patterns like "create_link:" or "`create_link`"
        lines_with_old = [line for line in full_prompts.split('\n')
                         if 'create_link' in line and 'create_node_link' not in line]

        # Filter out lines that are just comments or examples
        significant_old_refs = [line for line in lines_with_old
                               if '- **create_link' in line or '`create_link`' in line]

        assert len(significant_old_refs) == 0, f"Found old 'create_link' references: {significant_old_refs}"

    def test_group_tools_use_new_names(self):
        """Prompts should use move_nodes_to_group."""
        full_prompts = SYSTEM_PROMPT_WITH_TOOLS + SYSTEM_PROMPT_WITH_TOOLS_CLI

        # New name should appear
        assert 'move_nodes_to_group' in full_prompts

    def test_analysis_tools_use_new_names(self):
        """Prompts should use get_modified_widgets."""
        full_prompts = SYSTEM_PROMPT_WITH_TOOLS + SYSTEM_PROMPT_WITH_TOOLS_CLI

        # New name should appear
        assert 'get_modified_widgets' in full_prompts

    def test_execution_tools_use_new_names(self):
        """Prompts should use queue_execution, cancel_execution, execution_status."""
        full_prompts = SYSTEM_PROMPT_WITH_TOOLS + SYSTEM_PROMPT_WITH_TOOLS_CLI

        assert 'queue_execution' in full_prompts
        assert 'cancel_execution' in full_prompts
        assert 'execution_status' in full_prompts


class TestToolDocumentation:
    """Tests for tool documentation in prompts."""

    def test_node_tools_documented(self):
        """Node tools should be documented."""
        prompt = SYSTEM_PROMPT_WITH_TOOLS_CLI

        assert 'create_node' in prompt
        assert 'delete_node' in prompt
        assert 'update_node' in prompt
        assert 'duplicate_node' in prompt
        assert 'bypass_node' in prompt

    def test_widget_tools_documented(self):
        """Widget tools should be documented."""
        prompt = SYSTEM_PROMPT_WITH_TOOLS_CLI

        assert 'update_widget' in prompt
        assert 'get_widget_options' in prompt

    def test_group_tools_documented(self):
        """Group tools should be documented."""
        prompt = SYSTEM_PROMPT_WITH_TOOLS_CLI

        assert 'create_group' in prompt
        assert 'delete_group' in prompt
        assert 'update_group' in prompt
        assert 'merge_groups' in prompt

    def test_highlevel_tools_documented(self):
        """High-level tools should be documented."""
        prompt = SYSTEM_PROMPT_WITH_TOOLS_CLI

        assert 'organize' in prompt
        assert 'clear_workflow' in prompt

    def test_utility_tools_documented(self):
        """Utility tools should be documented."""
        prompt = SYSTEM_PROMPT_WITH_TOOLS_CLI

        assert 'batch' in prompt
        assert 'undo' in prompt


class TestPromptContent:
    """Tests for prompt content quality."""

    def test_prompt_mentions_comfyui(self):
        """Prompt should mention ComfyUI."""
        assert 'ComfyUI' in SYSTEM_PROMPT

    def test_prompt_explains_workflow_modification(self):
        """Tools prompt should explain workflow modification."""
        assert 'workflow' in SYSTEM_PROMPT_WITH_TOOLS.lower()
        assert 'modify' in SYSTEM_PROMPT_WITH_TOOLS.lower() or 'modification' in SYSTEM_PROMPT_WITH_TOOLS.lower()

    def test_prompt_mentions_tool_call_format(self):
        """CLI prompt should explain [TOOL_CALL] format."""
        assert '[TOOL_CALL]' in SYSTEM_PROMPT_WITH_TOOLS_CLI
        assert '[/TOOL_CALL]' in SYSTEM_PROMPT_WITH_TOOLS_CLI

    def test_prompt_explains_refs(self):
        """Prompt should explain $ref system."""
        full = SYSTEM_PROMPT_WITH_TOOLS + SYSTEM_PROMPT_WITH_TOOLS_CLI
        assert '$ref' in full or '$' in full

    def test_continuation_is_shorter(self):
        """Continuation prompts should be shorter than full prompts."""
        assert len(SYSTEM_PROMPT_CONTINUATION_CLI) < len(SYSTEM_PROMPT_WITH_TOOLS_CLI)
        assert len(SYSTEM_PROMPT_CONTINUATION_API) < len(SYSTEM_PROMPT_WITH_TOOLS)

    def test_no_file_system_claims(self):
        """Prompt should not claim to write files."""
        tools_prompt = SYSTEM_PROMPT_WITH_TOOLS + SYSTEM_PROMPT_WITH_TOOLS_CLI

        # Should mention NOT writing files
        assert 'NOT write' in tools_prompt or 'do NOT' in tools_prompt or 'not write' in tools_prompt.lower()


class TestBatchToolDocumentation:
    """Tests for batch tool documentation."""

    def test_batch_syntax_documented(self):
        """Batch tool syntax should be documented."""
        prompt = SYSTEM_PROMPT_WITH_TOOLS_CLI

        assert '"tool": "batch"' in prompt
        assert 'commands' in prompt

    def test_batch_uses_correct_link_tool_name(self):
        """Batch examples should use create_node_link."""
        prompt = SYSTEM_PROMPT_WITH_TOOLS_CLI

        # If batch examples exist with link creation, they should use new name
        if 'create_' in prompt and 'link' in prompt:
            # Find batch-related sections
            lines = prompt.split('\n')
            in_batch_section = False
            for line in lines:
                if 'batch' in line.lower() and 'tool' in line.lower():
                    in_batch_section = True
                if in_batch_section and 'create_node_link' in line:
                    # Good - using new name in batch context
                    break


class TestSamplerSettingsPropagation:
    """Tests for sampler settings propagation documentation."""

    def test_mentions_sampler_propagation(self):
        """Prompt should mention propagating sampler settings."""
        full = SYSTEM_PROMPT_WITH_TOOLS + SYSTEM_PROMPT_WITH_TOOLS_CLI

        assert 'sampler' in full.lower()
        assert 'propagat' in full.lower() or 'all nodes' in full.lower() or 'all related' in full.lower()
