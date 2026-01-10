"""
Debug Logging System for Claude Chat

IMPORTANT: This controls whether conversations are logged to disk.
- DEBUG_LOGGING = False: No logs written (production default - honors privacy promise)
- DEBUG_LOGGING = True: Full conversation logging for development/troubleshooting

Set via environment variable: CLAUDE_CHAT_DEBUG=1
Or modify DEBUG_LOGGING constant below for persistent dev mode.
"""

import os
import json
from pathlib import Path
from datetime import datetime
from typing import Optional, Dict, Any, List
from functools import wraps

# =============================================================================
# MASTER DEBUG SWITCH
# =============================================================================
# Set to True for development, False for production (user privacy)
# Can be overridden by CLAUDE_CHAT_DEBUG environment variable
DEBUG_LOGGING = os.environ.get('CLAUDE_CHAT_DEBUG', '').lower() in ('1', 'true', 'yes')

# =============================================================================
# CONFIGURATION
# =============================================================================
LOG_DIR = Path(os.environ.get('CONVERSATION_LOG_DIR', '/var/log/claude-chat'))
MAX_LOG_SIZE_MB = 50  # Rotate logs if they exceed this size
MAX_LOG_AGE_DAYS = 7  # Auto-clean logs older than this


class DebugLogger:
    """
    Centralized debug logging for Claude Chat conversations.

    Only writes logs when DEBUG_LOGGING is True.
    Captures: prompts, system prompts, raw responses, tool calls, tool results,
    conversation history, errors, timing, and frontend events.
    """

    def __init__(self):
        self.session_id: Optional[str] = None
        self.round_number: int = 0
        self._session_data: Dict[str, Any] = {}
        self._enabled = DEBUG_LOGGING

        if self._enabled:
            self._ensure_log_dir()
            print(f"[DebugLogger] DEBUG MODE ENABLED - logging to {LOG_DIR}")
        else:
            print("[DebugLogger] Debug logging disabled (production mode)")

    @property
    def enabled(self) -> bool:
        """Check if debug logging is enabled."""
        return self._enabled

    def _ensure_log_dir(self):
        """Create log directory if it doesn't exist."""
        if not self._enabled:
            return
        try:
            LOG_DIR.mkdir(parents=True, exist_ok=True)
        except Exception as e:
            print(f"[DebugLogger] Failed to create log dir: {e}")

    def start_session(self) -> Optional[str]:
        """Start a new conversation session. Returns session ID."""
        if not self._enabled:
            return None

        self.session_id = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
        self.round_number = 0
        self._session_data = {
            'session_id': self.session_id,
            'started_at': datetime.now().isoformat(),
            'rounds': []
        }

        self._log_event('SESSION_START', {
            'timestamp': datetime.now().isoformat()
        })

        print(f"[DebugLogger] Session started: {self.session_id}")
        return self.session_id

    def _log_event(self, event_type: str, data: dict):
        """Write a log entry to the session file with immediate disk sync."""
        if not self._enabled or not self.session_id:
            return

        try:
            log_file = LOG_DIR / f"session_{self.session_id}.jsonl"
            entry = {
                'timestamp': datetime.now().isoformat(),
                'session': self.session_id,
                'round': self.round_number,
                'event': event_type,
                'data': data
            }
            with open(log_file, 'a', encoding='utf-8') as f:
                f.write(json.dumps(entry, ensure_ascii=False) + '\n')
                f.flush()  # Flush Python buffer to OS
                os.fsync(f.fileno())  # Force OS to write to disk immediately
        except Exception as e:
            print(f"[DebugLogger] Log write failed: {e}")

    def _write_readable_file(self, suffix: str, content: str):
        """Write human-readable file for easier debugging with immediate disk sync."""
        if not self._enabled or not self.session_id:
            return

        try:
            filename = f"session_{self.session_id}_round{self.round_number:02d}_{suffix}.txt"
            filepath = LOG_DIR / filename
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(content)
                f.flush()  # Flush Python buffer to OS
                os.fsync(f.fileno())  # Force OS to write to disk immediately
        except Exception as e:
            print(f"[DebugLogger] Readable file write failed: {e}")

    # =========================================================================
    # PROMPT LOGGING
    # =========================================================================

    def log_user_message(self, message: str, has_image: bool = False, has_workflow: bool = False):
        """Log the original user message (before any processing)."""
        if not self._enabled:
            return

        self.round_number += 1
        self._log_event('USER_MESSAGE', {
            'message': message,
            'message_length': len(message),
            'has_image': has_image,
            'has_workflow': has_workflow
        })

    def log_system_prompt(self, system_prompt: str, prompt_type: str = 'full'):
        """Log the system prompt being sent to Claude."""
        if not self._enabled:
            return

        self._log_event('SYSTEM_PROMPT', {
            'prompt_type': prompt_type,  # 'full', 'continuation', 'tools'
            'prompt_length': len(system_prompt),
            'prompt_content': system_prompt
        })

        # Also write readable file
        header = f"=== SYSTEM PROMPT (Round {self.round_number}, Type: {prompt_type}) ===\n"
        header += f"Length: {len(system_prompt)} chars\n"
        header += "=" * 60 + "\n\n"
        self._write_readable_file('system_prompt', header + system_prompt)

    def log_full_prompt(self, full_prompt: str, auth_method: str, use_tools: bool):
        """Log the complete prompt being sent to Claude (system + user + context)."""
        if not self._enabled:
            return

        self._log_event('FULL_PROMPT_SENT', {
            'auth_method': auth_method,
            'use_tools': use_tools,
            'prompt_length': len(full_prompt),
            'prompt_content': full_prompt
        })

        # Also write readable file
        header = f"=== FULL PROMPT (Round {self.round_number}) ===\n"
        header += f"Auth: {auth_method}, Tools: {use_tools}\n"
        header += f"Length: {len(full_prompt)} chars\n"
        header += "=" * 60 + "\n\n"
        self._write_readable_file('prompt', header + full_prompt)

    def log_context_injection(self, context: str, level: str, token_estimate: int):
        """Log the auto-injected workflow context."""
        if not self._enabled:
            return

        self._log_event('CONTEXT_INJECTED', {
            'level': level,
            'token_estimate': token_estimate,
            'context_length': len(context),
            'context_content': context
        })

    # =========================================================================
    # RESPONSE LOGGING
    # =========================================================================

    def log_raw_response(self, raw_response: str, auth_method: str, duration_ms: Optional[int] = None):
        """Log the raw response from Claude before any parsing."""
        if not self._enabled:
            return

        self._log_event('RAW_RESPONSE', {
            'auth_method': auth_method,
            'response_length': len(raw_response),
            'duration_ms': duration_ms,
            'raw_content': raw_response
        })

        # Also write readable file
        header = f"=== RAW RESPONSE (Round {self.round_number}) ===\n"
        header += f"Auth: {auth_method}\n"
        header += f"Length: {len(raw_response)} chars\n"
        if duration_ms:
            header += f"Duration: {duration_ms}ms\n"
        header += "=" * 60 + "\n\n"
        self._write_readable_file('response_raw', header + raw_response)

    def log_parsed_response(self, text: str, tool_calls: Optional[List[Dict]] = None):
        """Log the parsed response (text extracted, tool calls identified)."""
        if not self._enabled:
            return

        self._log_event('PARSED_RESPONSE', {
            'text': text,
            'text_length': len(text),
            'tool_calls_count': len(tool_calls) if tool_calls else 0,
            'tool_calls': tool_calls
        })

        # Write readable file with tool call summary
        header = f"=== PARSED RESPONSE (Round {self.round_number}) ===\n"
        header += f"Text length: {len(text)} chars\n"
        if tool_calls:
            header += f"Tool calls: {len(tool_calls)}\n"
            for tc in tool_calls:
                name = tc.get('name', tc.get('action', 'unknown'))
                header += f"  - {name}: {tc.get('params', tc.get('input', {}))}\n"
        header += "=" * 60 + "\n\n"
        self._write_readable_file('response_parsed', header + text)

    # =========================================================================
    # TOOL CALL LOGGING
    # =========================================================================

    def log_tool_call_start(self, tool_name: str, params: dict, tool_id: str = None):
        """Log when a tool execution starts."""
        if not self._enabled:
            return

        self._log_event('TOOL_CALL_START', {
            'tool_id': tool_id,
            'tool_name': tool_name,
            'params': params
        })

    def log_tool_call_result(self, tool_name: str, params: dict, result: Any,
                             duration_ms: int = None, success: bool = True):
        """Log a tool execution result."""
        if not self._enabled:
            return

        # Serialize result, truncating if too large
        if isinstance(result, dict):
            result_str = json.dumps(result, default=str)
        else:
            result_str = str(result)

        # Truncate very large results
        max_result_len = 10000
        truncated = len(result_str) > max_result_len
        if truncated:
            result_str = result_str[:max_result_len] + f"... [truncated, full length: {len(result_str)}]"

        self._log_event('TOOL_CALL_RESULT', {
            'tool_name': tool_name,
            'params': params,
            'result': result_str,
            'result_truncated': truncated,
            'duration_ms': duration_ms,
            'success': success
        })

    def log_tool_call_error(self, tool_name: str, params: dict, error: str):
        """Log a tool execution error."""
        if not self._enabled:
            return

        self._log_event('TOOL_CALL_ERROR', {
            'tool_name': tool_name,
            'params': params,
            'error': error
        })

    # =========================================================================
    # CONVERSATION HISTORY LOGGING
    # =========================================================================

    def log_conversation_history(self, history: List[Dict]):
        """Log the conversation history being sent with a request."""
        if not self._enabled:
            return

        self._log_event('CONVERSATION_HISTORY', {
            'message_count': len(history),
            'history': history
        })

    def log_continuation(self, conversation_id: int, tool_results: List[Dict]):
        """Log a conversation continuation with tool results."""
        if not self._enabled:
            return

        self._log_event('CONTINUATION', {
            'conversation_id': conversation_id,
            'tool_results_count': len(tool_results),
            'tool_results': tool_results
        })

    # =========================================================================
    # ERROR & EVENT LOGGING
    # =========================================================================

    def log_error(self, error_type: str, message: str, details: dict = None):
        """Log an error with context."""
        if not self._enabled:
            return

        self._log_event('ERROR', {
            'error_type': error_type,
            'message': message,
            'details': details or {}
        })

    def log_api_error(self, auth_method: str, status_code: int, error_body: str):
        """Log an API error response."""
        if not self._enabled:
            return

        self._log_event('API_ERROR', {
            'auth_method': auth_method,
            'status_code': status_code,
            'error_body': error_body[:5000]  # Truncate if huge
        })

    def log_timeout(self, operation: str, timeout_seconds: float):
        """Log a timeout event."""
        if not self._enabled:
            return

        self._log_event('TIMEOUT', {
            'operation': operation,
            'timeout_seconds': timeout_seconds
        })

    # =========================================================================
    # REQUEST LOGGING (doesn't require active session)
    # =========================================================================

    def log_request(self, endpoint: str, data: dict):
        """Log an incoming HTTP request immediately, without requiring a session.

        This writes to a separate requests.jsonl file so we can see ALL requests
        even if they fail before a session starts.
        """
        if not self._enabled:
            return

        try:
            log_file = LOG_DIR / "requests.jsonl"
            entry = {
                'timestamp': datetime.now().isoformat(),
                'endpoint': endpoint,
                'data': data
            }
            with open(log_file, 'a', encoding='utf-8') as f:
                f.write(json.dumps(entry, ensure_ascii=False) + '\n')
                f.flush()
                os.fsync(f.fileno())
        except Exception as e:
            print(f"[DebugLogger] Request log write failed: {e}")

    # =========================================================================
    # FRONTEND EVENT LOGGING
    # =========================================================================

    def log_frontend_event(self, event_type: str, data: dict):
        """Log an event from the JavaScript frontend."""
        if not self._enabled:
            return

        self._log_event(f'FRONTEND_{event_type.upper()}', data)

    def log_frontend_tool_execution(self, tool_name: str, params: dict,
                                     result: Any, duration_ms: int):
        """Log client-side tool execution from frontend."""
        if not self._enabled:
            return

        self._log_event('FRONTEND_TOOL_EXECUTION', {
            'tool_name': tool_name,
            'params': params,
            'result': str(result)[:5000],
            'duration_ms': duration_ms
        })

    # =========================================================================
    # SESSION MANAGEMENT
    # =========================================================================

    def end_session(self, final_response: str = None):
        """End the current session with summary."""
        if not self._enabled:
            return

        self._log_event('SESSION_END', {
            'total_rounds': self.round_number,
            'ended_at': datetime.now().isoformat(),
            'final_response_preview': final_response[:500] if final_response else None
        })

        print(f"[DebugLogger] Session ended: {self.session_id} ({self.round_number} rounds)")
        self.session_id = None
        self._session_data = {}


# =============================================================================
# GLOBAL INSTANCE
# =============================================================================
debug_logger = DebugLogger()


# =============================================================================
# HELPER DECORATORS
# =============================================================================

def log_function_call(func):
    """Decorator to log function entry/exit with timing."""
    @wraps(func)
    async def async_wrapper(*args, **kwargs):
        if not DEBUG_LOGGING:
            return await func(*args, **kwargs)

        start = datetime.now()
        try:
            result = await func(*args, **kwargs)
            duration = (datetime.now() - start).total_seconds() * 1000
            debug_logger._log_event('FUNCTION_CALL', {
                'function': func.__name__,
                'duration_ms': duration,
                'success': True
            })
            return result
        except Exception as e:
            duration = (datetime.now() - start).total_seconds() * 1000
            debug_logger._log_event('FUNCTION_CALL', {
                'function': func.__name__,
                'duration_ms': duration,
                'success': False,
                'error': str(e)
            })
            raise

    @wraps(func)
    def sync_wrapper(*args, **kwargs):
        if not DEBUG_LOGGING:
            return func(*args, **kwargs)

        start = datetime.now()
        try:
            result = func(*args, **kwargs)
            duration = (datetime.now() - start).total_seconds() * 1000
            debug_logger._log_event('FUNCTION_CALL', {
                'function': func.__name__,
                'duration_ms': duration,
                'success': True
            })
            return result
        except Exception as e:
            duration = (datetime.now() - start).total_seconds() * 1000
            debug_logger._log_event('FUNCTION_CALL', {
                'function': func.__name__,
                'duration_ms': duration,
                'success': False,
                'error': str(e)
            })
            raise

    import asyncio
    if asyncio.iscoroutinefunction(func):
        return async_wrapper
    return sync_wrapper


# =============================================================================
# LOG ANALYSIS UTILITIES
# =============================================================================

def list_sessions(limit: int = 20) -> List[Dict]:
    """List recent debug sessions with summary info."""
    if not LOG_DIR.exists():
        return []

    sessions = []
    for log_file in sorted(LOG_DIR.glob("session_*.jsonl"), reverse=True)[:limit]:
        try:
            # Read first and last lines for summary
            lines = log_file.read_text(encoding='utf-8').strip().split('\n')
            if lines:
                first = json.loads(lines[0])
                last = json.loads(lines[-1])
                sessions.append({
                    'session_id': first.get('session'),
                    'file': str(log_file),
                    'started': first.get('timestamp'),
                    'ended': last.get('timestamp') if last.get('event') == 'SESSION_END' else None,
                    'rounds': last.get('round', 0),
                    'event_count': len(lines),
                    'size_kb': log_file.stat().st_size / 1024
                })
        except Exception as e:
            print(f"Error reading {log_file}: {e}")

    return sessions


def get_session_log(session_id: str) -> List[Dict]:
    """Get all log entries for a session."""
    log_file = LOG_DIR / f"session_{session_id}.jsonl"
    if not log_file.exists():
        return []

    entries = []
    for line in log_file.read_text(encoding='utf-8').strip().split('\n'):
        if line:
            try:
                entries.append(json.loads(line))
            except json.JSONDecodeError:
                pass
    return entries


def get_session_summary(session_id: str) -> Dict:
    """Get a summary of a session for quick review."""
    entries = get_session_log(session_id)
    if not entries:
        return {'error': 'Session not found'}

    summary = {
        'session_id': session_id,
        'rounds': 0,
        'tool_calls': [],
        'errors': [],
        'timeline': []
    }

    for entry in entries:
        event = entry.get('event', '')
        data = entry.get('data', {})

        if event == 'FULL_PROMPT_SENT':
            summary['rounds'] = entry.get('round', 0)
            summary['timeline'].append({
                'round': entry.get('round'),
                'type': 'prompt',
                'length': data.get('prompt_length'),
                'auth': data.get('auth_method')
            })

        elif event == 'TOOL_CALL_RESULT':
            summary['tool_calls'].append({
                'round': entry.get('round'),
                'tool': data.get('tool_name'),
                'success': data.get('success', True),
                'duration_ms': data.get('duration_ms')
            })

        elif event == 'ERROR' or event == 'API_ERROR':
            summary['errors'].append({
                'round': entry.get('round'),
                'type': data.get('error_type', event),
                'message': data.get('message', data.get('error_body', ''))[:200]
            })

        elif event == 'SESSION_END':
            summary['total_rounds'] = data.get('total_rounds')

    return summary


def search_logs(query: str, limit: int = 50) -> List[Dict]:
    """Search through all logs for a query string."""
    if not LOG_DIR.exists():
        return []

    results = []
    for log_file in sorted(LOG_DIR.glob("session_*.jsonl"), reverse=True):
        try:
            content = log_file.read_text(encoding='utf-8')
            if query.lower() in content.lower():
                for line_num, line in enumerate(content.split('\n')):
                    if query.lower() in line.lower():
                        try:
                            entry = json.loads(line)
                            results.append({
                                'file': log_file.name,
                                'line': line_num,
                                'session': entry.get('session'),
                                'event': entry.get('event'),
                                'match': line[:500]
                            })
                            if len(results) >= limit:
                                return results
                        except json.JSONDecodeError:
                            pass
        except Exception as e:
            print(f"Error searching {log_file}: {e}")

    return results
