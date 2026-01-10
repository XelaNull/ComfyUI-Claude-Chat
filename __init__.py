"""
ComfyUI Claude Chat - A chat panel extension for ComfyUI
Integrates Claude AI for workflow analysis and assistance.

Supports:
- Claude Code Max plan (no API key needed)
- Anthropic API (with API key)
"""

import os
import sys
import json
import traceback
from aiohttp import web

# Add our module to path
sys.path.insert(0, os.path.dirname(__file__))

# Import ComfyUI's server
try:
    from server import PromptServer
    HAS_SERVER = True
except ImportError:
    HAS_SERVER = False
    print("[Claude Chat] Warning: Could not import PromptServer")

from .claude_chat.claude_client import ClaudeClient
from .claude_chat.config import Config
from .claude_chat.debug_logging import (
    debug_logger, DEBUG_LOGGING,
    list_sessions, get_session_log, get_session_summary, search_logs
)

# Global client instance
_claude_client = None

def get_claude_client():
    global _claude_client
    if _claude_client is None:
        _claude_client = ClaudeClient()
    return _claude_client


# =============================================================================
# API Routes - Registered with ComfyUI's PromptServer
# =============================================================================

if HAS_SERVER:
    @PromptServer.instance.routes.post("/claude-chat/message")
    async def claude_chat_handler(request):
        """Handle chat messages from the frontend."""
        try:
            data = await request.json()
            message = data.get('message', '')
            workflow = data.get('workflow', None)
            history = data.get('history', [])
            image = data.get('image', None)  # {base64: str, mediaType: str}

            # Log request immediately (syncs to disk)
            debug_logger.log_request('/claude-chat/message', {
                'message_preview': message[:200] if message else '',
                'has_workflow': workflow is not None,
                'has_image': image is not None,
                'history_length': len(history)
            })

            client = get_claude_client()
            response = await client.chat(message, workflow, history, image)

            return web.json_response({
                'success': True,
                'response': response,
                'auth_method': client.auth_method
            })
        except Exception as e:
            traceback.print_exc()
            return web.json_response({
                'success': False,
                'error': str(e)
            }, status=500)


    @PromptServer.instance.routes.get("/claude-chat/status")
    async def claude_status_handler(request):
        """Check Claude connection status and auth method."""
        try:
            client = get_claude_client()
            status = await client.check_status()
            return web.json_response(status)
        except Exception as e:
            return web.json_response({
                'connected': False,
                'error': str(e)
            }, status=500)


    @PromptServer.instance.routes.get("/claude-chat/config")
    async def claude_config_get_handler(request):
        """Get configuration."""
        return web.json_response(Config.get_all())


    @PromptServer.instance.routes.post("/claude-chat/config")
    async def claude_config_post_handler(request):
        """Update configuration."""
        data = await request.json()
        Config.update(data)
        return web.json_response({'success': True})


    @PromptServer.instance.routes.post("/claude-chat/settings")
    async def claude_settings_handler(request):
        """Update authentication settings (API key and auth preference)."""
        global _claude_client
        try:
            data = await request.json()
            auth_preference = data.get('auth_preference', 'auto')
            api_key = data.get('api_key', '')

            # Save to config
            Config.update({
                'auth_preference': auth_preference,
                'api_key': api_key
            })

            # If API key provided, set in environment
            if api_key:
                os.environ['ANTHROPIC_API_KEY'] = api_key

            # Re-initialize the client to pick up new settings
            _claude_client = ClaudeClient()

            # Get new status
            status = await _claude_client.check_status()

            return web.json_response({
                'success': True,
                'auth_method': _claude_client.auth_method,
                'status': status
            })
        except Exception as e:
            traceback.print_exc()
            return web.json_response({
                'success': False,
                'error': str(e)
            }, status=500)

    @PromptServer.instance.routes.get("/claude-chat/workflow-tools")
    async def claude_workflow_tools_handler(request):
        """Get available workflow modification tools."""
        try:
            from .claude_chat.tools import ToolRegistry
            tools = ToolRegistry.for_anthropic_api()
            # Filter to only workflow tools
            workflow_tools = [t for t in tools if t['name'] in [
                'list_node_types', 'get_node_schema', 'get_workflow_summary',
                'find_nodes', 'get_node_details', 'add_node', 'remove_node',
                'move_node', 'move_nodes_batch', 'connect_nodes', 'disconnect_node',
                'set_widget', 'get_widget_options', 'make_space', 'insert_node_between',
                'undo_workflow'
            ]]
            return web.json_response({
                'success': True,
                'tools': workflow_tools
            })
        except Exception as e:
            traceback.print_exc()
            return web.json_response({
                'success': False,
                'error': str(e)
            }, status=500)


    @PromptServer.instance.routes.post("/claude-chat/message-with-tools")
    async def claude_chat_with_tools_handler(request):
        """Handle chat messages with tool support enabled."""
        try:
            data = await request.json()
            message = data.get('message', '')
            workflow = data.get('workflow', None)
            history = data.get('history', [])
            image = data.get('image', None)
            enable_tools = data.get('enable_tools', True)

            # Log request arrival immediately (helps debug missing conversations)
            # Uses log_request which doesn't require an active session
            debug_logger.log_request('/claude-chat/message-with-tools', {
                'message_preview': message[:200] if message else '',
                'has_workflow': workflow is not None,
                'has_image': image is not None,
                'history_length': len(history)
            })

            client = get_claude_client()
            full_message = client._build_message(message, workflow)

            # Use tools with either API or Max Plan (CLI with prompt-based tools)
            if enable_tools and client.auth_method in ('anthropic_api', 'max_plan'):
                if client.auth_method == 'anthropic_api':
                    response = await client._chat_via_api(full_message, history, use_tools=True, image=image)
                else:
                    # Max Plan uses CLI with prompt-based tool calling
                    if image:
                        full_message += "\n\n[Note: Image attached but CLI mode doesn't support vision.]"
                    response = await client._chat_via_cli(full_message, history, use_tools=True)

                # Check if response is a dict with pending_tool_calls (client-side tools needed)
                if isinstance(response, dict) and 'pending_tool_calls' in response:
                    result = {
                        'success': True,
                        'pending_tool_calls': response['pending_tool_calls'],
                        'conversation_id': response['conversation_id'],
                        'auth_method': client.auth_method
                    }
                    # Include response text if present (CLI mode provides explanation with tools)
                    if response.get('response_text'):
                        result['response_text'] = response['response_text']
                    return web.json_response(result)

                # String response (no tool calls, or API returned text)
                return web.json_response({
                    'success': True,
                    'response': response if isinstance(response, str) else response.get('response', str(response)),
                    'auth_method': client.auth_method
                })
            else:
                # No tools or unsupported auth method - use basic chat
                response = await client.chat(message, workflow, history, image)
                return web.json_response({
                    'success': True,
                    'response': response,
                    'auth_method': client.auth_method
                })
        except Exception as e:
            traceback.print_exc()
            return web.json_response({
                'success': False,
                'error': str(e)
            }, status=500)


    @PromptServer.instance.routes.post("/claude-chat/continue-with-tools")
    async def claude_continue_with_tools_handler(request):
        """Continue a conversation after client-side tool execution."""
        try:
            data = await request.json()
            tool_results = data.get('tool_results', [])
            conversation_id = data.get('conversation_id')
            # NOTE: Workflow is no longer sent with continuations
            # Claude should use get_workflow_summary tool if it needs current state

            # Log continuation request immediately (syncs to disk)
            debug_logger.log_request('/claude-chat/continue-with-tools', {
                'conversation_id': conversation_id,
                'tool_results_count': len(tool_results),
                'tool_names': [tr.get('tool_name', 'unknown') for tr in tool_results[:5]]
            })

            if not conversation_id:
                return web.json_response({
                    'success': False,
                    'error': 'Missing conversation_id'
                }, status=400)

            client = get_claude_client()

            # Use appropriate continuation method based on auth mode
            if client.auth_method == 'max_plan':
                # CLI mode: Use CLI-specific continuation that builds new prompt
                response = await client.continue_cli_with_tool_results(conversation_id, tool_results)
            else:
                # API mode: Use native multi-turn tool calling
                response = await client.continue_with_tool_results(conversation_id, tool_results)

            # Handle error responses
            if isinstance(response, dict) and 'error' in response:
                return web.json_response({
                    'success': False,
                    'error': response['error']
                }, status=400)

            # Check if more client-side tools are needed
            if isinstance(response, dict) and 'pending_tool_calls' in response:
                result = {
                    'success': True,
                    'pending_tool_calls': response['pending_tool_calls'],
                    'conversation_id': response.get('conversation_id', conversation_id),
                    'auth_method': client.auth_method
                }
                # Include response text if present (for UI display during tool execution)
                if response.get('response_text'):
                    result['response_text'] = response['response_text']
                return web.json_response(result)

            # Final response (no more tools needed)
            final_response = response.get('response', response) if isinstance(response, dict) else response
            return web.json_response({
                'success': True,
                'response': final_response,
                'auth_method': client.auth_method
            })
        except Exception as e:
            traceback.print_exc()
            return web.json_response({
                'success': False,
                'error': str(e)
            }, status=500)

    # =========================================================================
    # DEBUG LOGGING ENDPOINTS (only active when DEBUG_LOGGING=True)
    # =========================================================================

    @PromptServer.instance.routes.get("/claude-chat/debug/status")
    async def claude_debug_status_handler(request):
        """Check if debug logging is enabled and get system status."""
        return web.json_response({
            'debug_logging_enabled': DEBUG_LOGGING,
            'session_active': debug_logger.session_id is not None,
            'current_session': debug_logger.session_id,
            'current_round': debug_logger.round_number
        })

    @PromptServer.instance.routes.get("/claude-chat/debug/sessions")
    async def claude_debug_sessions_handler(request):
        """List recent debug sessions."""
        if not DEBUG_LOGGING:
            return web.json_response({
                'error': 'Debug logging is disabled. Set CLAUDE_CHAT_DEBUG=1 to enable.'
            }, status=403)

        limit = int(request.query.get('limit', '20'))
        sessions = list_sessions(limit)
        return web.json_response({
            'success': True,
            'sessions': sessions,
            'count': len(sessions)
        })

    @PromptServer.instance.routes.get("/claude-chat/debug/session/{session_id}")
    async def claude_debug_session_handler(request):
        """Get full log for a specific session."""
        if not DEBUG_LOGGING:
            return web.json_response({
                'error': 'Debug logging is disabled. Set CLAUDE_CHAT_DEBUG=1 to enable.'
            }, status=403)

        session_id = request.match_info['session_id']
        entries = get_session_log(session_id)
        if not entries:
            return web.json_response({
                'success': False,
                'error': f'Session {session_id} not found'
            }, status=404)

        return web.json_response({
            'success': True,
            'session_id': session_id,
            'entries': entries,
            'count': len(entries)
        })

    @PromptServer.instance.routes.get("/claude-chat/debug/session/{session_id}/summary")
    async def claude_debug_session_summary_handler(request):
        """Get summary of a specific session."""
        if not DEBUG_LOGGING:
            return web.json_response({
                'error': 'Debug logging is disabled. Set CLAUDE_CHAT_DEBUG=1 to enable.'
            }, status=403)

        session_id = request.match_info['session_id']
        summary = get_session_summary(session_id)
        if 'error' in summary:
            return web.json_response({
                'success': False,
                **summary
            }, status=404)

        return web.json_response({
            'success': True,
            **summary
        })

    @PromptServer.instance.routes.get("/claude-chat/debug/search")
    async def claude_debug_search_handler(request):
        """Search through all debug logs."""
        if not DEBUG_LOGGING:
            return web.json_response({
                'error': 'Debug logging is disabled. Set CLAUDE_CHAT_DEBUG=1 to enable.'
            }, status=403)

        query = request.query.get('q', '')
        limit = int(request.query.get('limit', '50'))

        if not query:
            return web.json_response({
                'success': False,
                'error': 'Missing search query (use ?q=...)'
            }, status=400)

        results = search_logs(query, limit)
        return web.json_response({
            'success': True,
            'query': query,
            'results': results,
            'count': len(results)
        })

    @PromptServer.instance.routes.post("/claude-chat/debug/log-frontend")
    async def claude_debug_log_frontend_handler(request):
        """Log an event from the frontend (for development debugging)."""
        if not DEBUG_LOGGING:
            # Silently ignore if logging disabled (don't error)
            return web.json_response({'success': True, 'logged': False})

        try:
            data = await request.json()
            event_type = data.get('event', 'UNKNOWN')
            event_data = data.get('data', {})

            debug_logger.log_frontend_event(event_type, event_data)

            return web.json_response({
                'success': True,
                'logged': True,
                'session': debug_logger.session_id
            })
        except Exception as e:
            return web.json_response({
                'success': False,
                'error': str(e)
            }, status=500)

    print("[Claude Chat] API routes registered successfully!")
    if DEBUG_LOGGING:
        print("[Claude Chat] DEBUG MODE: Conversation logging ENABLED")
    else:
        print("[Claude Chat] Production mode: Conversation logging disabled (user privacy honored)")


# =============================================================================
# ComfyUI Extension Registration
# =============================================================================

# No nodes for now - this is a UI-only extension
NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}

# Web extension directory - tells ComfyUI where to find our JS
WEB_DIRECTORY = "./web"

__all__ = ['NODE_CLASS_MAPPINGS', 'NODE_DISPLAY_NAME_MAPPINGS', 'WEB_DIRECTORY']
