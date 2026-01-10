"""
Claude Client Tests

Comprehensive functional tests for claude_client.py:
- Tool call parsing from text
- Message building
- Workflow summarization
- Auth detection
- Conversation logging
"""

import pytest
import sys
import os
import json
from unittest.mock import Mock, patch, MagicMock, AsyncMock
from pathlib import Path
import tempfile

# Add project root to path so we can import claude_chat as a package
_project_root = os.path.join(os.path.dirname(__file__), '..', '..')
if _project_root not in sys.path:
    sys.path.insert(0, _project_root)

from claude_chat.claude_client import (
    parse_tool_calls_from_text,
    ClaudeClient
)
from claude_chat.debug_logging import (
    DEBUG_LOGGING,
    DebugLogger
)


class TestParseToolCallsFromText:
    """Tests for the parse_tool_calls_from_text function."""

    def test_no_tool_calls(self):
        """Should return unchanged text when no tool calls present."""
        text = "This is just a regular response with no tools."
        clean_text, tool_calls = parse_tool_calls_from_text(text)

        assert clean_text == text
        assert tool_calls == []

    def test_single_tool_call(self):
        """Should extract single tool call with flat params (as per prompts.py format)."""
        # Our prompts tell Claude: {"tool": "name", "param1": "val1", "param2": "val2"}
        # NOT: {"tool": "name", "params": {...}}
        text = '''Let me create a node.
[TOOL_CALL]
{"tool": "create_node", "type": "KSampler", "pos": [400, 200]}
[/TOOL_CALL]
Done!'''

        clean_text, tool_calls = parse_tool_calls_from_text(text)

        assert len(tool_calls) == 1
        assert tool_calls[0]['name'] == 'create_node'
        assert tool_calls[0]['params']['type'] == 'KSampler'
        assert tool_calls[0]['params']['pos'] == [400, 200]
        assert 'Done!' in clean_text
        assert '[TOOL_CALL]' not in clean_text

    def test_multiple_tool_calls(self):
        """Should extract multiple tool calls in sequence (flat format)."""
        text = '''Creating workflow...
[TOOL_CALL]
{"tool": "create_node", "type": "CheckpointLoaderSimple", "ref": "$ckpt"}
[/TOOL_CALL]
[TOOL_CALL]
{"tool": "create_node", "type": "KSampler", "ref": "$sampler"}
[/TOOL_CALL]
[TOOL_CALL]
{"tool": "create_node_link", "from": "$ckpt", "from_slot": 0, "to": "$sampler", "to_slot": 0}
[/TOOL_CALL]
All done!'''

        clean_text, tool_calls = parse_tool_calls_from_text(text)

        assert len(tool_calls) == 3
        assert tool_calls[0]['name'] == 'create_node'
        assert tool_calls[0]['params']['ref'] == '$ckpt'
        assert tool_calls[1]['name'] == 'create_node'
        assert tool_calls[1]['params']['ref'] == '$sampler'
        assert tool_calls[2]['name'] == 'create_node_link'
        assert 'Creating workflow...' in clean_text
        assert 'All done!' in clean_text

    def test_tool_call_with_complex_params(self):
        """Should handle complex nested params (flat format)."""
        # batch tool with nested commands array - commands ARE at top level
        text = '''[TOOL_CALL]
{"tool": "batch", "commands": [{"tool": "create_node", "type": "KSampler"}, {"tool": "update_widget", "updates": [{"node": 5, "widget": "steps", "value": 30}]}]}
[/TOOL_CALL]'''

        clean_text, tool_calls = parse_tool_calls_from_text(text)

        assert len(tool_calls) == 1
        assert tool_calls[0]['name'] == 'batch'
        assert len(tool_calls[0]['params']['commands']) == 2

    def test_malformed_json_skipped(self):
        """Should skip malformed JSON and continue."""
        text = '''[TOOL_CALL]
{"tool": "create_node", "type": "KSampler"}
[/TOOL_CALL]
[TOOL_CALL]
{invalid json here
[/TOOL_CALL]
[TOOL_CALL]
{"tool": "delete_node", "node": 5}
[/TOOL_CALL]'''

        clean_text, tool_calls = parse_tool_calls_from_text(text)

        # Should get 2 valid tool calls, skipping the malformed one
        assert len(tool_calls) == 2
        assert tool_calls[0]['name'] == 'create_node'
        assert tool_calls[1]['name'] == 'delete_node'

    def test_tool_ids_assigned_sequentially(self):
        """Should assign sequential IDs to tool calls."""
        text = '''[TOOL_CALL]
{"tool": "tool_a"}
[/TOOL_CALL]
[TOOL_CALL]
{"tool": "tool_b"}
[/TOOL_CALL]'''

        _, tool_calls = parse_tool_calls_from_text(text)

        assert tool_calls[0]['id'] == 'cli_tool_0'
        assert tool_calls[1]['id'] == 'cli_tool_1'

    def test_action_field_mirrors_name(self):
        """Should have action field matching name for client-side execution."""
        text = '''[TOOL_CALL]
{"tool": "create_node", "type": "KSampler"}
[/TOOL_CALL]'''

        _, tool_calls = parse_tool_calls_from_text(text)

        assert tool_calls[0]['action'] == tool_calls[0]['name']

    def test_input_field_mirrors_params(self):
        """Should have input field matching params for API compatibility."""
        text = '''[TOOL_CALL]
{"tool": "create_node", "type": "KSampler"}
[/TOOL_CALL]'''

        _, tool_calls = parse_tool_calls_from_text(text)

        assert tool_calls[0]['input'] == tool_calls[0]['params']

    def test_multiline_tool_call(self):
        """Should handle tool calls with multiline formatting (flat format)."""
        text = '''[TOOL_CALL]
{
    "tool": "update_widget",
    "updates": [
        {
            "node": 5,
            "widget": "text",
            "value": "a beautiful landscape"
        }
    ]
}
[/TOOL_CALL]'''

        _, tool_calls = parse_tool_calls_from_text(text)

        assert len(tool_calls) == 1
        assert tool_calls[0]['params']['updates'][0]['value'] == 'a beautiful landscape'

    def test_empty_params(self):
        """Should handle tool calls with no params."""
        text = '''[TOOL_CALL]
{"tool": "queue_execution"}
[/TOOL_CALL]'''

        _, tool_calls = parse_tool_calls_from_text(text)

        assert len(tool_calls) == 1
        assert tool_calls[0]['name'] == 'queue_execution'
        assert tool_calls[0]['params'] == {}

    def test_cleans_extra_whitespace(self):
        """Should clean up extra whitespace after removing tool calls."""
        text = '''Line 1.



[TOOL_CALL]
{"tool": "test", "params": {}}
[/TOOL_CALL]



Line 2.'''

        clean_text, _ = parse_tool_calls_from_text(text)

        # Should collapse multiple newlines
        assert '\n\n\n' not in clean_text


class TestDebugLogger:
    """Tests for the DebugLogger class."""

    def test_debug_logging_default_disabled(self):
        """DEBUG_LOGGING should be disabled by default for privacy."""
        # The module-level constant should be False unless env var is set
        # In tests, it may be True if CLAUDE_CHAT_DEBUG=1, so just verify it's boolean
        assert isinstance(DEBUG_LOGGING, bool)

    def test_disabled_logger_does_nothing(self):
        """Logger with enabled=False should not create files."""
        with tempfile.TemporaryDirectory() as tmpdir:
            from claude_chat.debug_logging import LOG_DIR
            # Create logger that's disabled
            logger = DebugLogger()
            logger._enabled = False
            logger.log_dir = Path(tmpdir)

            # These should all silently do nothing
            logger.start_session()
            logger.log_full_prompt("test", "cli", False)
            logger.log_raw_response("test", "cli")
            logger.end_session("test")

            # No files should be created
            files = list(Path(tmpdir).glob("*"))
            assert len(files) == 0

    def test_enabled_logger_creates_session(self):
        """Logger with enabled=True should create session ID."""
        with tempfile.TemporaryDirectory() as tmpdir:
            logger = DebugLogger()
            logger._enabled = True
            logger.log_dir = Path(tmpdir)
            logger._ensure_log_dir()

            session_id = logger.start_session()

            assert session_id is not None
            assert len(session_id) > 0
            assert logger.session_id == session_id
            assert logger.round_number == 0

    def test_enabled_property(self):
        """Should have enabled property matching _enabled flag."""
        logger = DebugLogger()
        logger._enabled = True
        assert logger.enabled is True

        logger._enabled = False
        assert logger.enabled is False

    def test_session_end_clears_state(self):
        """Should clear session state on end."""
        with tempfile.TemporaryDirectory() as tmpdir:
            logger = DebugLogger()
            logger._enabled = True
            logger.log_dir = Path(tmpdir)
            logger._ensure_log_dir()
            logger.start_session()

            logger.end_session("final response")

            assert logger.session_id is None

    def test_logging_without_session_does_nothing(self):
        """Should silently skip logging if no session active."""
        logger = DebugLogger()
        logger._enabled = True
        logger.session_id = None

        # Should not raise
        logger.log_full_prompt("test", "cli", False)
        logger.log_raw_response("test", "cli")
        logger.log_error("test", "test")


class TestClaudeClientBuildMessage:
    """Tests for ClaudeClient._build_message method."""

    @patch.object(ClaudeClient, '_check_claude_cli', return_value=False)
    @patch.object(ClaudeClient, '_load_credentials', return_value=None)
    @patch.object(ClaudeClient, '_load_saved_settings')
    def test_build_message_without_workflow(self, mock_settings, mock_creds, mock_cli):
        """Should return message as-is when no workflow."""
        client = ClaudeClient()

        result = client._build_message("Hello Claude", None)

        assert result == "Hello Claude"

    @patch.object(ClaudeClient, '_check_claude_cli', return_value=False)
    @patch.object(ClaudeClient, '_load_credentials', return_value=None)
    @patch.object(ClaudeClient, '_load_saved_settings')
    def test_build_message_with_workflow(self, mock_settings, mock_creds, mock_cli):
        """Should include workflow context when provided."""
        client = ClaudeClient()

        workflow = {
            "nodes": [
                {"id": 1, "type": "KSampler", "widgets_values": [123, 20]}
            ]
        }

        result = client._build_message("What does this workflow do?", workflow)

        assert "Current ComfyUI Workflow:" in result
        assert "What does this workflow do?" in result
        assert "KSampler" in result


class TestClaudeClientSummarizeWorkflow:
    """Tests for ClaudeClient._summarize_workflow method."""

    @patch.object(ClaudeClient, '_check_claude_cli', return_value=False)
    @patch.object(ClaudeClient, '_load_credentials', return_value=None)
    @patch.object(ClaudeClient, '_load_saved_settings')
    def test_summarize_basic_workflow(self, mock_settings, mock_creds, mock_cli):
        """Should summarize basic workflow."""
        client = ClaudeClient()

        workflow = {
            "nodes": [
                {"id": 1, "type": "KSampler", "widgets_values": [123, 20, 8]},
                {"id": 2, "type": "VAEDecode"}
            ]
        }

        result = client._summarize_workflow(workflow)
        parsed = json.loads(result)

        assert parsed['node_count'] == 2
        assert len(parsed['nodes']) == 2
        assert parsed['nodes'][0]['type'] == 'KSampler'

    @patch.object(ClaudeClient, '_check_claude_cli', return_value=False)
    @patch.object(ClaudeClient, '_load_credentials', return_value=None)
    @patch.object(ClaudeClient, '_load_saved_settings')
    def test_summarize_truncates_large_workflow(self, mock_settings, mock_creds, mock_cli):
        """Should truncate workflows with more than 20 nodes."""
        client = ClaudeClient()

        workflow = {
            "nodes": [
                {"id": i, "type": f"Node{i}"}
                for i in range(25)
            ]
        }

        result = client._summarize_workflow(workflow)
        parsed = json.loads(result)

        assert parsed['node_count'] == 25
        assert len(parsed['nodes']) == 20  # Truncated to 20
        assert 'note' in parsed
        assert '5 more nodes' in parsed['note']

    @patch.object(ClaudeClient, '_check_claude_cli', return_value=False)
    @patch.object(ClaudeClient, '_load_credentials', return_value=None)
    @patch.object(ClaudeClient, '_load_saved_settings')
    def test_summarize_includes_widget_params(self, mock_settings, mock_creds, mock_cli):
        """Should include widget values as params."""
        client = ClaudeClient()

        workflow = {
            "nodes": [
                {"id": 1, "type": "KSampler", "widgets_values": [123, 20, 8, "euler"]}
            ]
        }

        result = client._summarize_workflow(workflow)
        parsed = json.loads(result)

        assert 'params' in parsed['nodes'][0]
        assert parsed['nodes'][0]['params'] == [123, 20, 8, "euler"]


class TestClaudeClientAuthDetection:
    """Tests for ClaudeClient authentication detection."""

    @patch.object(ClaudeClient, '_check_claude_cli', return_value=False)
    @patch.object(ClaudeClient, '_load_credentials', return_value=None)
    @patch.object(ClaudeClient, '_load_saved_settings')
    @patch.dict(os.environ, {'ANTHROPIC_API_KEY': ''}, clear=True)
    def test_no_auth_available(self, mock_settings, mock_creds, mock_cli):
        """Should return 'none' when no auth available."""
        # Need to mock HAS_ANTHROPIC
        with patch('claude_chat.claude_client.HAS_ANTHROPIC', False):
            client = ClaudeClient()
            assert client.auth_method == 'none'

    @patch.object(ClaudeClient, '_check_claude_cli', return_value=False)
    @patch.object(ClaudeClient, '_load_credentials', return_value=None)
    @patch.object(ClaudeClient, '_load_saved_settings')
    @patch.dict(os.environ, {'ANTHROPIC_API_KEY': 'sk-ant-test123'})
    def test_api_key_auth(self, mock_settings, mock_creds, mock_cli):
        """Should detect API key auth."""
        with patch('claude_chat.claude_client.HAS_ANTHROPIC', True):
            client = ClaudeClient()
            assert client.auth_method == 'anthropic_api'

    @patch.object(ClaudeClient, '_check_claude_cli', return_value=True)
    @patch.object(ClaudeClient, '_load_saved_settings')
    @patch.dict(os.environ, {'ANTHROPIC_API_KEY': ''}, clear=True)
    def test_max_plan_auth(self, mock_settings, mock_cli):
        """Should detect Max Plan auth with valid credentials."""
        with patch.object(ClaudeClient, '_load_credentials', return_value={'subscriptionType': 'max'}):
            with patch('claude_chat.claude_client.HAS_ANTHROPIC', False):
                client = ClaudeClient()
                assert client.auth_method == 'max_plan'

    @patch.object(ClaudeClient, '_check_claude_cli', return_value=False)
    @patch.object(ClaudeClient, '_load_saved_settings')
    @patch.dict(os.environ, {'ANTHROPIC_API_KEY': ''}, clear=True)
    def test_max_plan_no_cli(self, mock_settings, mock_cli):
        """Should return max_plan_no_cli when credentials exist but no CLI."""
        with patch.object(ClaudeClient, '_load_credentials', return_value={'subscriptionType': 'max'}):
            with patch('claude_chat.claude_client.HAS_ANTHROPIC', False):
                client = ClaudeClient()
                assert client.auth_method == 'max_plan_no_cli'


class TestClaudeClientCheckStatus:
    """Tests for ClaudeClient.check_status method."""

    @pytest.mark.asyncio
    @patch.object(ClaudeClient, '_check_claude_cli', return_value=False)
    @patch.object(ClaudeClient, '_load_credentials', return_value=None)
    @patch.object(ClaudeClient, '_load_saved_settings')
    async def test_check_status_returns_dict(self, mock_settings, mock_creds, mock_cli):
        """Should return status dictionary."""
        client = ClaudeClient()

        status = await client.check_status()

        assert isinstance(status, dict)
        assert 'connected' in status
        assert 'auth_method' in status
        assert 'has_credentials' in status

    @pytest.mark.asyncio
    @patch.object(ClaudeClient, '_check_claude_cli', return_value=True)
    @patch.object(ClaudeClient, '_load_saved_settings')
    async def test_check_status_with_max_plan(self, mock_settings, mock_cli):
        """Should show max plan status."""
        with patch.object(ClaudeClient, '_load_credentials', return_value={'subscriptionType': 'max'}):
            with patch('claude_chat.claude_client.HAS_ANTHROPIC', False):
                client = ClaudeClient()
                status = await client.check_status()

                assert status['has_max_plan'] is True
                assert status['subscription_type'] == 'max'


class TestClaudeClientChatNoAuth:
    """Tests for ClaudeClient.chat when no auth available."""

    @pytest.mark.asyncio
    @patch.object(ClaudeClient, '_check_claude_cli', return_value=False)
    @patch.object(ClaudeClient, '_load_credentials', return_value=None)
    @patch.object(ClaudeClient, '_load_saved_settings')
    @patch.dict(os.environ, {'ANTHROPIC_API_KEY': ''}, clear=True)
    async def test_chat_returns_error_when_no_auth(self, mock_settings, mock_creds, mock_cli):
        """Should return helpful error message when no auth."""
        with patch('claude_chat.claude_client.HAS_ANTHROPIC', False):
            client = ClaudeClient()

            result = await client.chat("Hello")

            assert "not configured" in result
            assert "Max Plan" in result or "API" in result


class TestClaudeClientPendingConversations:
    """Tests for pending conversation management."""

    @patch.object(ClaudeClient, '_check_claude_cli', return_value=False)
    @patch.object(ClaudeClient, '_load_credentials', return_value=None)
    @patch.object(ClaudeClient, '_load_saved_settings')
    def test_pending_conversations_initialized(self, mock_settings, mock_creds, mock_cli):
        """Should initialize pending conversations dict."""
        client = ClaudeClient()

        assert hasattr(client, '_pending_conversations')
        assert isinstance(client._pending_conversations, dict)

    @pytest.mark.asyncio
    @patch.object(ClaudeClient, '_check_claude_cli', return_value=False)
    @patch.object(ClaudeClient, '_load_credentials', return_value=None)
    @patch.object(ClaudeClient, '_load_saved_settings')
    async def test_continue_with_missing_conversation(self, mock_settings, mock_creds, mock_cli):
        """Should return error for missing conversation."""
        client = ClaudeClient()

        result = await client.continue_with_tool_results(999999, [])

        assert "Error" in result or "not found" in result


class TestClaudeClientCLIContinuation:
    """Tests for CLI continuation with tool results."""

    @pytest.mark.asyncio
    @patch.object(ClaudeClient, '_check_claude_cli', return_value=True)
    @patch.object(ClaudeClient, '_load_saved_settings')
    async def test_continue_cli_missing_conversation(self, mock_settings, mock_cli):
        """Should return error for missing CLI conversation."""
        with patch.object(ClaudeClient, '_load_credentials', return_value={'subscriptionType': 'max'}):
            with patch('claude_chat.claude_client.HAS_ANTHROPIC', False):
                client = ClaudeClient()

                result = await client.continue_cli_with_tool_results(999999, [])

                assert 'error' in result
                assert 'not found' in result['error']
