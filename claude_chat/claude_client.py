"""
Claude Client - Handles communication with Claude via Max Plan or API.

Priority:
1. Max Plan (via Claude Code SDK - uses OAuth from Claude Code CLI)
2. Anthropic API (requires ANTHROPIC_API_KEY)
"""

import os
import json
import asyncio
import subprocess
import shutil
import re
from typing import Optional, List, Dict, Any
from pathlib import Path
from datetime import datetime

from .prompts import (
    SYSTEM_PROMPT,
    SYSTEM_PROMPT_WITH_TOOLS,
    SYSTEM_PROMPT_WITH_TOOLS_CLI,
    SYSTEM_PROMPT_CONTINUATION_CLI,
    SYSTEM_PROMPT_CONTINUATION_API,
)

# Import centralized debug logging (respects DEBUG_LOGGING flag)
from .debug_logging import debug_logger, DEBUG_LOGGING

# Writable config directory for Claude CLI (credentials mounted read-only)
CLAUDE_CONFIG_DIR = Path('/tmp/.claude-chat')
CLAUDE_CREDENTIALS_MOUNT = Path('/root/.claude/.credentials.json')

# Try to import anthropic API (for fallback)
try:
    import anthropic
    HAS_ANTHROPIC = True
except ImportError:
    HAS_ANTHROPIC = False


def parse_tool_calls_from_text(text: str) -> tuple[str, List[Dict]]:
    """Parse tool calls from text response.

    Extracts [TOOL_CALL]...[/TOOL_CALL] blocks and returns:
    - The text with tool call blocks removed
    - A list of parsed tool calls
    """
    tool_calls = []

    # Pattern to match [TOOL_CALL]...[/TOOL_CALL] blocks
    pattern = r'\[TOOL_CALL\]\s*(.*?)\s*\[/TOOL_CALL\]'
    matches = re.findall(pattern, text, re.DOTALL)

    for i, match in enumerate(matches):
        try:
            # Parse the JSON inside the tool call block
            tool_data = json.loads(match.strip())
            tool_name = tool_data.get('tool', '')

            # Parameters are at the TOP LEVEL of the JSON (not nested in 'params')
            # The prompt format is: {"tool": "name", "param1": "value1", "param2": "value2"}
            # So we extract all keys except 'tool' as the parameters
            params = {k: v for k, v in tool_data.items() if k != 'tool'}

            if tool_name:
                tool_calls.append({
                    'id': f'cli_tool_{i}',
                    'name': tool_name,
                    'action': tool_name,  # For client-side execution
                    'params': params,
                    'input': params  # Compatibility with API format
                })
        except json.JSONDecodeError as e:
            print(f"[Claude Chat] Failed to parse tool call: {e}")
            continue

    # Remove tool call blocks from the text for cleaner display
    clean_text = re.sub(pattern, '', text, flags=re.DOTALL).strip()
    # Clean up extra whitespace
    clean_text = re.sub(r'\n{3,}', '\n\n', clean_text)

    return clean_text, tool_calls


class ClaudeClient:
    """Client for communicating with Claude via Max Plan or API."""

    def __init__(self):
        self._credentials = None
        self._anthropic_client = None
        self._cli_config_ready = False
        self._pending_conversations = {}  # Store pending tool conversations
        self._has_api_key = False
        self._has_max_plan = False

        # Load saved settings from config
        self._load_saved_settings()

        self._has_claude_cli = self._check_claude_cli()
        self.auth_method = self._detect_auth_method()  # This also sets _has_api_key and _has_max_plan
        print(f"[Claude Chat] Auth method: {self.auth_method}")
        print(f"[Claude Chat] Has Claude CLI: {self._has_claude_cli}")
        print(f"[Claude Chat] Has API Key: {self._has_api_key}, Has Max Plan: {self._has_max_plan}")

    def _load_saved_settings(self):
        """Load saved API key and preferences from config file."""
        try:
            from .config import Config
            saved_api_key = Config.get('api_key', '')
            self.auth_preference = Config.get('auth_preference', 'auto')

            # If API key is saved in config but not in environment, use it
            if saved_api_key and not os.environ.get('ANTHROPIC_API_KEY'):
                os.environ['ANTHROPIC_API_KEY'] = saved_api_key
                print("[Claude Chat] Loaded API key from saved config")
        except Exception as e:
            print(f"[Claude Chat] Could not load saved settings: {e}")
            self.auth_preference = 'auto'

    def _prepare_cli_config(self) -> bool:
        """Prepare writable config directory for Claude CLI."""
        if self._cli_config_ready:
            return True

        try:
            # Create writable config directory
            CLAUDE_CONFIG_DIR.mkdir(parents=True, exist_ok=True)

            # Copy credentials from read-only mount to writable directory
            dest_creds = CLAUDE_CONFIG_DIR / '.credentials.json'
            if CLAUDE_CREDENTIALS_MOUNT.exists():
                shutil.copy2(CLAUDE_CREDENTIALS_MOUNT, dest_creds)
                print(f"[Claude Chat] Copied credentials to {dest_creds}")
                self._cli_config_ready = True
                return True
            else:
                print(f"[Claude Chat] No credentials found at {CLAUDE_CREDENTIALS_MOUNT}")
                return False
        except Exception as e:
            print(f"[Claude Chat] Failed to prepare CLI config: {e}")
            return False

    def _check_claude_cli(self) -> bool:
        """Check if Claude CLI is available."""
        try:
            result = subprocess.run(
                ['claude', '--version'],
                capture_output=True,
                timeout=5,
                text=True
            )
            if result.returncode == 0:
                print(f"[Claude Chat] Claude CLI version: {result.stdout.strip()}")
                return True
        except Exception as e:
            print(f"[Claude Chat] Claude CLI check failed: {e}")
        return False

    def _find_credentials_file(self) -> Optional[Path]:
        """Find Claude Code credentials file."""
        locations = [
            Path('/root/.claude/.credentials.json'),  # Docker mount point
            Path.home() / '.claude' / '.credentials.json',
            Path(os.environ.get('USERPROFILE', '')) / '.claude' / '.credentials.json',
        ]

        for loc in locations:
            if loc.exists():
                print(f"[Claude Chat] Found credentials at: {loc}")
                return loc

        return None

    def _load_credentials(self) -> Optional[Dict]:
        """Load OAuth credentials from Claude Code."""
        if self._credentials is not None:
            return self._credentials

        creds_file = self._find_credentials_file()
        if not creds_file:
            print("[Claude Chat] No credentials file found")
            return None

        try:
            with open(creds_file, 'r') as f:
                data = json.load(f)

            if 'claudeAiOauth' in data:
                self._credentials = data['claudeAiOauth']
                print(f"[Claude Chat] Loaded Max Plan credentials (subscription: {self._credentials.get('subscriptionType', 'unknown')})")
                return self._credentials
            elif 'accessToken' in data:
                self._credentials = data
                return self._credentials
            else:
                print(f"[Claude Chat] Credentials format not recognized: {list(data.keys())}")
                return None

        except Exception as e:
            print(f"[Claude Chat] Failed to load credentials: {e}")
            return None

    def _detect_auth_method(self) -> str:
        """Detect which authentication method to use.

        Respects auth_preference setting:
        - 'auto': Max Plan for chat, API for images. Falls back to API if no Max Plan.
        - 'api': Only use Anthropic API (requires key)
        - 'max': Only use Max Plan (requires CLI), no image support
        """
        pref = getattr(self, 'auth_preference', 'auto')
        self._has_api_key = HAS_ANTHROPIC and bool(os.environ.get('ANTHROPIC_API_KEY'))
        creds = self._load_credentials()
        self._has_max_plan = creds and creds.get('subscriptionType') in ['max', 'pro'] and self._has_claude_cli

        # User explicitly wants API only
        if pref == 'api':
            if self._has_api_key:
                print("[Claude Chat] Using Anthropic API (user preference)")
                return 'anthropic_api'
            else:
                print("[Claude Chat] API preference selected but no API key set")
                return 'none'

        # User explicitly wants Max Plan only
        if pref == 'max':
            if self._has_max_plan:
                print("[Claude Chat] Using Max Plan Only (user preference, no image support)")
                return 'max_plan'
            elif creds and creds.get('subscriptionType') in ['max', 'pro']:
                return 'max_plan_no_cli'
            else:
                print("[Claude Chat] Max Plan preference but no credentials found")
                return 'none'

        # Auto mode: Prefer Max Plan for chat, with API available for images
        if self._has_max_plan:
            print("[Claude Chat] Auto mode: Max Plan for chat" +
                  (", API available for images" if self._has_api_key else ""))
            return 'max_plan'

        # No Max Plan - fall back to API if available
        if self._has_api_key:
            print("[Claude Chat] Auto mode: Using Anthropic API (no Max Plan available)")
            return 'anthropic_api'

        if creds and creds.get('subscriptionType') in ['max', 'pro']:
            return 'max_plan_no_cli'

        return 'none'

    def _get_anthropic_client(self):
        """Get or create Anthropic API client."""
        if self._anthropic_client is None:
            self._anthropic_client = anthropic.Anthropic()
        return self._anthropic_client

    async def check_status(self) -> Dict[str, Any]:
        """Check connection status."""
        creds = self._load_credentials()
        has_max_plan = creds and creds.get('subscriptionType') in ['max', 'pro']
        return {
            'connected': self.auth_method != 'none',
            'auth_method': self.auth_method,
            'auth_preference': getattr(self, 'auth_preference', 'auto'),
            'has_credentials': creds is not None,
            'has_max_plan': has_max_plan and self._has_claude_cli,
            'has_claude_cli': self._has_claude_cli,
            'has_anthropic': HAS_ANTHROPIC,
            'has_api_key': bool(os.environ.get('ANTHROPIC_API_KEY')),
            'subscription_type': creds.get('subscriptionType') if creds else None,
        }

    async def chat(
        self,
        message: str,
        workflow: Optional[Dict] = None,
        history: Optional[List[Dict]] = None,
        image: Optional[Dict] = None
    ) -> str:
        """Send a chat message and get a response.

        Args:
            message: The user's message
            workflow: Optional ComfyUI workflow JSON
            history: Optional conversation history
            image: Optional image data {base64: str, mediaType: str}
        """
        # Start debug logging session if:
        # 1. First message (no history), OR
        # 2. No active session (previous session ended but user sent new message with history)
        is_first_message = not history or len(history) == 0
        if is_first_message or not debug_logger.session_id:
            debug_logger.start_session()

        if self.auth_method == 'none':
            return ("⚠️ Claude Chat is not configured.\n\n"
                    "**For Max Plan users:**\n"
                    "1. Install Claude Code CLI in the container\n"
                    "2. Make sure credentials are mounted\n\n"
                    "**For API users:**\n"
                    "Set `ANTHROPIC_API_KEY` environment variable")

        # Build the full prompt with workflow context
        full_message = self._build_message(message, workflow)

        # Determine which method to use
        # In Auto mode with Max Plan: use API for images if available
        pref = getattr(self, 'auth_preference', 'auto')
        use_api_for_image = (
            image and
            pref == 'auto' and
            self.auth_method == 'max_plan' and
            getattr(self, '_has_api_key', False)
        )

        if use_api_for_image:
            # Hybrid mode: Use API for this image request
            print("[Claude Chat] Auto mode: Using API for image analysis")
            return await self._chat_via_api(full_message, history, image=image)
        elif self.auth_method == 'max_plan':
            # CLI doesn't support images
            if image:
                full_message += "\n\n[Note: User attached an image but CLI mode doesn't support vision. Set an API key to enable image analysis.]"
            return await self._chat_via_cli(full_message, history)
        elif self.auth_method == 'max_plan_no_cli':
            return ("⚠️ Max Plan detected but Claude CLI is not installed in the container.\n\n"
                    "The OAuth tokens from Max Plan require the Claude CLI to work.\n\n"
                    "**Options:**\n"
                    "1. Install Claude CLI in the container\n"
                    "2. Use an Anthropic API key instead (set ANTHROPIC_API_KEY)")
        else:
            return await self._chat_via_api(full_message, history, image=image)

    def _build_message(self, message: str, workflow: Optional[Dict]) -> str:
        """Build message with workflow context."""
        if workflow:
            workflow_summary = self._summarize_workflow(workflow)
            return f"""Current ComfyUI Workflow:
```json
{workflow_summary}
```

User Question: {message}"""
        return message

    def _summarize_workflow(self, workflow: Dict) -> str:
        """Create a concise summary of the workflow."""
        try:
            nodes = workflow.get('nodes', [])

            summary = {
                'node_count': len(nodes),
                'nodes': []
            }

            for node in nodes[:20]:
                node_info = {
                    'type': node.get('type', 'Unknown'),
                    'id': node.get('id'),
                }
                if 'widgets_values' in node:
                    node_info['params'] = node['widgets_values']
                summary['nodes'].append(node_info)

            if len(nodes) > 20:
                summary['note'] = f'... and {len(nodes) - 20} more nodes'

            return json.dumps(summary, indent=2)
        except Exception as e:
            return json.dumps({'error': str(e), 'raw': str(workflow)[:1000]})

    async def _chat_via_cli(self, message: str, history: Optional[List[Dict]], use_tools: bool = False):
        """Chat using Claude CLI (Max Plan).

        Args:
            message: The user's message with workflow context
            history: Conversation history
            use_tools: If True, use prompt-based tool calling

        Returns:
            str or dict: String response, or dict with pending_tool_calls for client-side execution
        """
        try:
            # Prepare writable config directory
            if not self._prepare_cli_config():
                return ("⚠️ Failed to prepare Claude CLI configuration.\n\n"
                        "Make sure credentials are mounted at /root/.claude/")

            # Build conversation history into the prompt
            history_text = ""
            if history:
                for msg in history[-10:]:  # Keep last 10 messages for context
                    role = "User" if msg.get('role') == 'user' else "Assistant"
                    content = msg.get('content', '')
                    if content:
                        history_text += f"{role}: {content}\n\n"

            # OPTIMIZATION: Only send full system prompt on FIRST message
            # Subsequent messages have history which already contains the context
            is_first_message = not history_text

            # Start debug logging session if:
            # 1. First message (no history), OR
            # 2. No active session (previous session ended but user sent new message with history)
            if is_first_message or not debug_logger.session_id:
                debug_logger.start_session()

            if is_first_message:
                # First message: send full system prompt
                system_prompt = SYSTEM_PROMPT_WITH_TOOLS_CLI if use_tools else SYSTEM_PROMPT
                full_prompt = f"{system_prompt}\n\nUser: {message}"
            else:
                # Subsequent messages: send condensed prompt + history
                # Claude already knows the context from conversation history
                system_prompt = SYSTEM_PROMPT_CONTINUATION_CLI if use_tools else SYSTEM_PROMPT
                full_prompt = f"{system_prompt}\n\n--- Conversation History ---\n{history_text}--- Current Message ---\nUser: {message}"

            # Set up environment with writable config directory
            env = os.environ.copy()
            env['CLAUDE_CONFIG_DIR'] = str(CLAUDE_CONFIG_DIR)

            print(f"[Claude Chat] Calling CLI with config dir: {CLAUDE_CONFIG_DIR}")
            print(f"[Claude Chat] Prompt length: {len(full_prompt)} chars, tools_enabled: {use_tools}")

            # Comprehensive debug logging (only if DEBUG_LOGGING enabled)
            debug_logger.log_full_prompt(full_prompt, 'cli', use_tools)

            # Debug: Show if Installed Packs context is present
            if 'Installed Packs' in message:
                print(f"[Claude Chat] ✓ Installed Packs context detected in message")
                # Extract and show the Installed Packs section
                packs_match = re.search(r'Installed Packs:\n((?:  - [^\n]+\n?)+)', message)
                if packs_match:
                    print(f"[Claude Chat] Installed Packs content:\n{packs_match.group(0)}")
            elif 'WORKFLOW STATE' in message:
                print(f"[Claude Chat] Workflow context present but NO Installed Packs")
            else:
                print(f"[Claude Chat] ⚠ No workflow context in message")

            # Use Popen for better control over the subprocess
            proc = await asyncio.to_thread(
                subprocess.Popen,
                [
                    'claude',
                    '-p',  # Print mode (non-interactive)
                    '--no-session-persistence',  # Don't persist session
                    full_prompt
                ],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                stdin=subprocess.DEVNULL,  # No stdin to prevent blocking
                text=True,
                env=env
            )

            # Wait for completion with timeout
            print(f"[Claude Chat] Waiting for CLI response...")
            try:
                stdout, stderr = await asyncio.wait_for(
                    asyncio.to_thread(proc.communicate),
                    timeout=180.0  # Increased to 3 minutes for large prompts
                )
            except asyncio.TimeoutError:
                print(f"[Claude Chat] CLI TIMEOUT after 180 seconds")
                proc.kill()
                await asyncio.to_thread(proc.wait)
                raise subprocess.TimeoutExpired(cmd='claude', timeout=180)

            print(f"[Claude Chat] CLI returned: code={proc.returncode}, stdout_len={len(stdout)}, stderr_len={len(stderr)}")
            result = type('Result', (), {'returncode': proc.returncode, 'stdout': stdout, 'stderr': stderr})()

            if result.returncode == 0:
                response = result.stdout.strip()
                if response:
                    # If tools are enabled, parse for tool calls
                    if use_tools:
                        clean_text, tool_calls = parse_tool_calls_from_text(response)

                        # Log the response with parsed tool calls
                        debug_logger.log_raw_response(response, 'cli')
                        debug_logger.log_parsed_response(clean_text, tool_calls)

                        if tool_calls:
                            # Return in same format as API for client-side execution
                            conversation_id = id(message)  # Simple ID
                            self._pending_conversations[conversation_id] = {
                                'original_prompt': message,  # Store for continuation
                                'messages': history or [],
                                'response_text': clean_text
                            }
                            return {
                                'pending_tool_calls': tool_calls,
                                'conversation_id': conversation_id,
                                'response_text': clean_text  # Include explanation text
                            }
                        # No tool calls found, return text as normal
                        debug_logger.end_session(clean_text)
                        return clean_text

                    # Log response (no tools)
                    debug_logger.log_raw_response(response, 'cli')
                    debug_logger.end_session(response)
                    return response
                else:
                    debug_logger.log_error("empty_response", "Claude returned empty response")
                    return "Claude returned an empty response."
            else:
                error_msg = result.stderr.strip() or "Unknown error"
                print(f"[Claude Chat] CLI error: {error_msg}")
                debug_logger.log_error("cli_error", error_msg)

                # Check for common errors
                if 'not authenticated' in error_msg.lower():
                    return ("⚠️ Claude CLI is not authenticated.\n\n"
                            "Please run `claude login` on the host machine and restart the container.")
                elif 'rate limit' in error_msg.lower():
                    return "⚠️ Rate limit reached. Please wait a moment and try again."
                else:
                    return f"Claude CLI error: {error_msg}"

        except subprocess.TimeoutExpired:
            return "⚠️ Request timed out. Please try a shorter question."
        except Exception as e:
            print(f"[Claude Chat] CLI exception: {e}")
            return f"Error calling Claude: {str(e)}"

    async def continue_cli_with_tool_results(self, conversation_id: int, tool_results: List[Dict]):
        """Continue a CLI conversation after client-side tool execution.

        This implements the agentic loop for CLI mode by building a new prompt
        that includes the tool results and calling the CLI again.

        NOTE: Workflow is no longer passed here. Claude should use get_workflow
        tool if it needs current workflow state after modifications.

        Args:
            conversation_id: ID of the pending conversation
            tool_results: Results from client-side tool execution
        """
        if conversation_id not in self._pending_conversations:
            return {"error": "Conversation not found. Please start a new message."}

        conv = self._pending_conversations[conversation_id]
        original_prompt = conv.get('original_prompt', '')
        previous_response = conv.get('response_text', '')

        # Build tool results text
        tool_results_text = ""
        for tr in tool_results:
            tool_id = tr.get('tool_use_id', 'unknown')
            result = tr.get('result', {})
            if isinstance(result, dict):
                result_str = json.dumps(result, indent=2)
            else:
                result_str = str(result)
            tool_results_text += f"\n[TOOL_RESULT: {tool_id}]\n{result_str}\n[/TOOL_RESULT]\n"

        # Build continuation prompt that simulates multi-turn conversation
        # NOTE: No workflow context - Claude should use get_workflow tool if needed
        continuation_prompt = f"""You are continuing a conversation where you called tools. Here are the results:

--- Your Previous Response ---
{previous_response}

--- Tool Results ---
{tool_results_text}
--- End Tool Results ---

Based on these tool results, continue with your task. If you need current workflow state, use the `get_workflow` tool. If you need to call more tools, use the [TOOL_CALL] format. Otherwise, provide your final response to the user.

Remember: You MUST connect any nodes you add. Use the `create_node_link` tool after adding nodes."""

        # Prepare CLI environment
        if not self._prepare_cli_config():
            return {"error": "Failed to prepare CLI configuration"}

        env = os.environ.copy()
        env['CLAUDE_CONFIG_DIR'] = str(CLAUDE_CONFIG_DIR)

        # Use condensed continuation prompt (NOT full system prompt - saves ~10KB per call!)
        full_prompt = f"{SYSTEM_PROMPT_CONTINUATION_CLI}\n\n{continuation_prompt}"

        print(f"[Claude Chat] CLI continuation - prompt length: {len(full_prompt)} chars")

        # Log the continuation prompt with tool results
        debug_logger.log_full_prompt(full_prompt, 'cli_continuation', True)
        debug_logger.log_continuation(conversation_id, tool_results)

        try:
            proc = await asyncio.to_thread(
                subprocess.Popen,
                ['claude', '-p', '--no-session-persistence', full_prompt],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                stdin=subprocess.DEVNULL,
                text=True,
                env=env
            )

            print(f"[Claude Chat] Waiting for CLI continuation response...")
            stdout, stderr = await asyncio.wait_for(
                asyncio.to_thread(proc.communicate),
                timeout=180.0  # 3 minutes for large prompts
            )

            print(f"[Claude Chat] CLI continuation returned: code={proc.returncode}, stdout_len={len(stdout)}")

            if proc.returncode == 0 and stdout.strip():
                response = stdout.strip()
                clean_text, tool_calls = parse_tool_calls_from_text(response)

                # Log the continuation response
                debug_logger.log_raw_response(response, 'cli_continuation')
                debug_logger.log_parsed_response(clean_text, tool_calls)

                if tool_calls:
                    # More tools to execute - update conversation context
                    self._pending_conversations[conversation_id] = {
                        'original_prompt': original_prompt,
                        'response_text': clean_text,
                        'messages': conv.get('messages', [])
                    }
                    return {
                        'pending_tool_calls': tool_calls,
                        'conversation_id': conversation_id,
                        'response_text': clean_text
                    }

                # No more tool calls - clean up and return final response
                self._pending_conversations.pop(conversation_id, None)
                debug_logger.end_session(clean_text)
                return {'response': clean_text}

            # Error case
            self._pending_conversations.pop(conversation_id, None)
            return {'error': stderr.strip() or 'CLI returned empty response'}

        except asyncio.TimeoutError:
            self._pending_conversations.pop(conversation_id, None)
            return {'error': 'Request timed out'}
        except Exception as e:
            self._pending_conversations.pop(conversation_id, None)
            return {'error': str(e)}

    async def _chat_via_api(self, message: str, history: Optional[List[Dict]], use_tools: bool = False, image: Optional[Dict] = None):
        """Chat using Anthropic API.

        Returns:
            str or dict: String response, or dict with pending_tool_calls for client-side execution
        """
        try:
            client = self._get_anthropic_client()
            return await self._make_api_call(client, message, history, use_tools, image)
        except Exception as e:
            print(f"[Claude Chat] API error: {e}")
            return f"Anthropic API error: {str(e)}"

    async def _make_api_call(
        self,
        client,
        message: str,
        history: Optional[List[Dict]],
        use_tools: bool = False,
        image: Optional[Dict] = None
    ) -> str:
        """Make the actual API call, optionally with tool support and vision."""
        messages = []
        if history:
            for msg in history[-10:]:
                messages.append({
                    'role': msg.get('role', 'user'),
                    'content': msg.get('content', '')
                })

        # Build user message content (with optional image)
        if image and image.get('base64'):
            # Extract base64 data (remove data:image/xxx;base64, prefix if present)
            base64_data = image['base64']
            if ',' in base64_data:
                base64_data = base64_data.split(',', 1)[1]

            media_type = image.get('mediaType', 'image/png')
            # Clean up media type if needed
            if media_type.startswith('data:'):
                media_type = media_type.split(';')[0].replace('data:', '')

            user_content = [
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": media_type,
                        "data": base64_data
                    }
                },
                {
                    "type": "text",
                    "text": message
                }
            ]
            messages.append({'role': 'user', 'content': user_content})
            print(f"[Claude Chat] Sending message with image (type: {media_type})")
        else:
            messages.append({'role': 'user', 'content': message})

        # OPTIMIZATION: Only send full system prompt on FIRST message
        # Subsequent messages have history which already contains the context
        is_first_message = not history or len(history) == 0

        # Start debug logging session if:
        # 1. First message (no history), OR
        # 2. No active session (previous session ended but user sent new message with history)
        if is_first_message or not debug_logger.session_id:
            debug_logger.start_session()

        if is_first_message:
            system_prompt = SYSTEM_PROMPT_WITH_TOOLS if use_tools else SYSTEM_PROMPT
        else:
            # Condensed prompt for follow-up messages
            system_prompt = SYSTEM_PROMPT_CONTINUATION_API if use_tools else SYSTEM_PROMPT

        api_kwargs = {
            'model': "claude-sonnet-4-20250514",
            'max_tokens': 2048,
            'system': system_prompt,
            'messages': messages
        }

        # Add tools if enabled
        if use_tools:
            try:
                from .tools import ToolRegistry
                tools = ToolRegistry.for_anthropic_api()
                if tools:
                    api_kwargs['tools'] = tools
            except ImportError:
                print("[Claude Chat] Tools not available")

        # Debug logging - log the full prompt being sent
        debug_logger.log_full_prompt(
            f"System: {system_prompt}\n\nMessages: {json.dumps(messages, default=str)[:5000]}",
            'api', use_tools
        )

        response = await asyncio.to_thread(
            client.messages.create,
            **api_kwargs
        )

        # Debug logging - log the raw response
        response_text = ""
        for block in response.content:
            if hasattr(block, 'text'):
                response_text = block.text
                break
        debug_logger.log_raw_response(response_text or str(response.content), 'api')

        # Handle tool use responses
        if use_tools and response.stop_reason == "tool_use":
            result = await self._handle_tool_use(client, messages, response)
            # Return the dict (may contain pending_tool_calls or response)
            if isinstance(result, dict):
                if 'pending_tool_calls' in result:
                    return result  # Client needs to execute these tools
                return result.get('response', 'Tool execution completed.')
            return result

        # Extract text response
        for block in response.content:
            if hasattr(block, 'text'):
                return block.text

        return "Claude returned an empty response."

    async def _handle_tool_use(self, client, messages: List[Dict], response) -> Dict[str, Any]:
        """Handle tool use in API response.

        Returns either:
        - A dict with 'response' (string) if all tools executed server-side
        - A dict with 'pending_tool_calls' if client-side execution is needed
        """
        from .tools import ToolRegistry

        # Check for client-side tools first
        pending_client_tools = []
        server_tool_results = []

        for block in response.content:
            if block.type == "tool_use":
                print(f"[Claude Chat] Processing tool: {block.name}")
                try:
                    result = await ToolRegistry.execute(block.name, **block.input)

                    # Check if this tool requires client-side execution
                    if isinstance(result, dict) and result.get('execute_client_side'):
                        pending_client_tools.append({
                            'id': block.id,
                            'name': block.name,
                            'action': result.get('action'),
                            'params': result.get('params', {}),
                            'input': block.input
                        })
                    else:
                        server_tool_results.append({
                            "type": "tool_result",
                            "tool_use_id": block.id,
                            "content": json.dumps(result) if not isinstance(result, str) else result
                        })
                except Exception as e:
                    print(f"[Claude Chat] Tool error: {e}")
                    server_tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": f"Error: {str(e)}",
                        "is_error": True
                    })

        # If there are client-side tools, return them for frontend execution
        if pending_client_tools:
            # Store conversation state for continuation
            conversation_id = id(messages)  # Simple ID for this conversation
            self._pending_conversations[conversation_id] = {
                'messages': messages,
                'response': response,
                'client': client
            }
            return {
                'pending_tool_calls': pending_client_tools,
                'conversation_id': conversation_id
            }

        # All tools executed server-side, continue conversation
        if server_tool_results:
            messages.append({"role": "assistant", "content": response.content})
            messages.append({"role": "user", "content": server_tool_results})

            next_response = await asyncio.to_thread(
                client.messages.create,
                model="claude-sonnet-4-20250514",
                max_tokens=2048,
                system=SYSTEM_PROMPT,
                messages=messages,
                tools=ToolRegistry.for_anthropic_api()
            )

            if next_response.stop_reason == "tool_use":
                return await self._handle_tool_use(client, messages, next_response)

            for block in next_response.content:
                if hasattr(block, 'text'):
                    return {'response': block.text}

        return {'response': "Claude completed tool use but returned no text."}

    async def continue_with_tool_results(self, conversation_id: int, tool_results: List[Dict]) -> str:
        """Continue a conversation after client-side tool execution.

        NOTE: Workflow is no longer passed here. Claude should use get_workflow
        tool if it needs current workflow state after modifications.

        Args:
            conversation_id: ID of the pending conversation
            tool_results: Results from client-side tool execution
        """
        from .tools import ToolRegistry

        if conversation_id not in self._pending_conversations:
            return "Error: Conversation not found. Please start a new message."

        conv = self._pending_conversations.pop(conversation_id)
        messages = conv['messages']
        response = conv['response']
        client = conv['client']

        # Build tool result messages
        result_content = []
        for tr in tool_results:
            result_content.append({
                "type": "tool_result",
                "tool_use_id": tr['tool_use_id'],
                "content": json.dumps(tr['result']) if isinstance(tr['result'], dict) else str(tr['result'])
            })

        # NOTE: Workflow context no longer added - Claude uses get_workflow tool when needed

        # Add assistant response and tool results
        messages.append({"role": "assistant", "content": response.content})
        messages.append({"role": "user", "content": result_content})

        # Continue conversation
        next_response = await asyncio.to_thread(
            client.messages.create,
            model="claude-sonnet-4-20250514",
            max_tokens=2048,
            system=SYSTEM_PROMPT,
            messages=messages,
            tools=ToolRegistry.for_anthropic_api()
        )

        # Handle more tool use if needed
        if next_response.stop_reason == "tool_use":
            result = await self._handle_tool_use(client, messages, next_response)
            if 'pending_tool_calls' in result:
                # More client-side tools needed - return them
                return result
            return result.get('response', '')

        for block in next_response.content:
            if hasattr(block, 'text'):
                return block.text

        return "Claude completed the request."
