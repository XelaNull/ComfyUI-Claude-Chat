#!/usr/bin/env python3
"""
Claude Chat Debug Log Viewer

CLI tool for viewing and analyzing conversation debug logs.
Can operate in two modes:
1. Local mode (default): Reads log files directly from disk
2. Remote mode: Fetches logs via HTTP API (useful when testing from iPad)

Usage:
    # List recent sessions
    python debug_viewer.py sessions

    # View specific session
    python debug_viewer.py session 20240115_123456_789

    # View session summary
    python debug_viewer.py summary 20240115_123456_789

    # Search logs
    python debug_viewer.py search "KSampler"

    # Replay conversation (shows prompts and responses in order)
    python debug_viewer.py replay 20240115_123456_789

    # Show tool call timeline
    python debug_viewer.py tools 20240115_123456_789

    # Remote mode (when testing from iPad)
    python debug_viewer.py --remote http://192.168.1.100:8188 sessions

    # Watch live session
    python debug_viewer.py --remote http://192.168.1.100:8188 watch
"""

import argparse
import json
import sys
import os
from pathlib import Path
from datetime import datetime
from typing import Optional, List, Dict

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

try:
    from claude_chat.debug_logging import (
        LOG_DIR, DEBUG_LOGGING,
        list_sessions, get_session_log, get_session_summary, search_logs
    )
    LOCAL_AVAILABLE = True
except ImportError:
    LOCAL_AVAILABLE = False

try:
    import requests
    REQUESTS_AVAILABLE = True
except ImportError:
    REQUESTS_AVAILABLE = False


class DebugViewer:
    """CLI viewer for Claude Chat debug logs."""

    def __init__(self, remote_url: Optional[str] = None):
        self.remote_url = remote_url
        self.is_remote = remote_url is not None

        if self.is_remote and not REQUESTS_AVAILABLE:
            print("Error: 'requests' package required for remote mode")
            print("Install with: pip install requests")
            sys.exit(1)

        if not self.is_remote and not LOCAL_AVAILABLE:
            print("Error: Local imports failed. Run from the correct directory.")
            sys.exit(1)

    def _api_get(self, endpoint: str, params: dict = None) -> dict:
        """Make GET request to remote API."""
        url = f"{self.remote_url}/claude-chat/debug/{endpoint}"
        try:
            resp = requests.get(url, params=params, timeout=10)
            return resp.json()
        except requests.RequestException as e:
            return {'error': str(e)}

    # =========================================================================
    # COMMANDS
    # =========================================================================

    def cmd_sessions(self, limit: int = 20):
        """List recent debug sessions."""
        if self.is_remote:
            data = self._api_get('sessions', {'limit': limit})
            if 'error' in data:
                print(f"Error: {data['error']}")
                return
            sessions = data.get('sessions', [])
        else:
            sessions = list_sessions(limit)

        if not sessions:
            print("No debug sessions found.")
            print(f"\nIs DEBUG_LOGGING enabled? {'Yes' if DEBUG_LOGGING else 'No'}")
            print(f"Log directory: {LOG_DIR}")
            return

        print(f"\n{'='*70}")
        print(f"{'SESSION ID':<25} {'ROUNDS':>6} {'EVENTS':>7} {'SIZE':>8} {'STARTED'}")
        print(f"{'='*70}")

        for s in sessions:
            session_id = s.get('session_id', 'unknown')
            rounds = s.get('rounds', 0)
            events = s.get('event_count', 0)
            size_kb = s.get('size_kb', 0)
            started = s.get('started', '')[:19]  # Trim to datetime

            print(f"{session_id:<25} {rounds:>6} {events:>7} {size_kb:>6.1f}KB {started}")

        print(f"\nTotal: {len(sessions)} sessions")

    def cmd_session(self, session_id: str, event_filter: str = None):
        """View all entries in a session."""
        if self.is_remote:
            data = self._api_get(f'session/{session_id}')
            if 'error' in data:
                print(f"Error: {data['error']}")
                return
            entries = data.get('entries', [])
        else:
            entries = get_session_log(session_id)

        if not entries:
            print(f"Session {session_id} not found.")
            return

        print(f"\n{'='*70}")
        print(f"Session: {session_id}")
        print(f"{'='*70}\n")

        for entry in entries:
            event = entry.get('event', 'UNKNOWN')
            if event_filter and event_filter.lower() not in event.lower():
                continue

            timestamp = entry.get('timestamp', '')[:19]
            round_num = entry.get('round', 0)
            data = entry.get('data', {})

            print(f"[{timestamp}] Round {round_num} - {event}")

            # Show relevant data based on event type
            if event == 'FULL_PROMPT_SENT':
                print(f"    Auth: {data.get('auth_method')}, Tools: {data.get('use_tools')}")
                print(f"    Length: {data.get('prompt_length')} chars")
            elif event == 'RAW_RESPONSE':
                print(f"    Length: {data.get('response_length')} chars")
                if data.get('duration_ms'):
                    print(f"    Duration: {data.get('duration_ms')}ms")
            elif event == 'TOOL_CALL_RESULT':
                tool = data.get('tool_name', 'unknown')
                success = '✓' if data.get('success', True) else '✗'
                print(f"    {success} {tool}")
                if data.get('duration_ms'):
                    print(f"    Duration: {data.get('duration_ms')}ms")
            elif event == 'ERROR' or event == 'API_ERROR':
                print(f"    Type: {data.get('error_type', 'unknown')}")
                print(f"    Message: {data.get('message', '')[:100]}")
            elif event == 'SESSION_END':
                print(f"    Total rounds: {data.get('total_rounds')}")

            print()

    def cmd_summary(self, session_id: str):
        """View session summary."""
        if self.is_remote:
            data = self._api_get(f'session/{session_id}/summary')
            if 'error' in data:
                print(f"Error: {data['error']}")
                return
            summary = data
        else:
            summary = get_session_summary(session_id)
            if 'error' in summary:
                print(f"Error: {summary['error']}")
                return

        print(f"\n{'='*70}")
        print(f"Session Summary: {session_id}")
        print(f"{'='*70}\n")

        print(f"Rounds: {summary.get('rounds', 0)}")
        print(f"Total Rounds: {summary.get('total_rounds', 'N/A')}")

        # Tool calls
        tool_calls = summary.get('tool_calls', [])
        if tool_calls:
            print(f"\nTool Calls ({len(tool_calls)}):")
            for tc in tool_calls:
                status = '✓' if tc.get('success', True) else '✗'
                duration = f" ({tc.get('duration_ms')}ms)" if tc.get('duration_ms') else ''
                print(f"  R{tc.get('round', '?')}: {status} {tc.get('tool')}{duration}")

        # Errors
        errors = summary.get('errors', [])
        if errors:
            print(f"\nErrors ({len(errors)}):")
            for err in errors:
                print(f"  R{err.get('round', '?')}: [{err.get('type')}] {err.get('message')[:60]}")

        # Timeline
        timeline = summary.get('timeline', [])
        if timeline:
            print(f"\nTimeline:")
            for t in timeline:
                print(f"  Round {t.get('round')}: {t.get('type')} ({t.get('auth')}, {t.get('length')} chars)")

    def cmd_replay(self, session_id: str):
        """Replay a conversation showing prompts and responses."""
        if self.is_remote:
            data = self._api_get(f'session/{session_id}')
            entries = data.get('entries', [])
        else:
            entries = get_session_log(session_id)

        if not entries:
            print(f"Session {session_id} not found.")
            return

        print(f"\n{'='*70}")
        print(f"Conversation Replay: {session_id}")
        print(f"{'='*70}\n")

        current_round = 0
        for entry in entries:
            event = entry.get('event', '')
            data = entry.get('data', {})
            round_num = entry.get('round', 0)

            if round_num != current_round:
                current_round = round_num
                print(f"\n{'─'*70}")
                print(f"Round {current_round}")
                print(f"{'─'*70}\n")

            if event == 'USER_MESSAGE':
                print(f"📝 USER:")
                print(f"   {data.get('message', '')[:500]}")
                if data.get('has_image'):
                    print("   [+ Image attached]")
                print()

            elif event == 'FULL_PROMPT_SENT':
                print(f"📤 PROMPT SENT ({data.get('prompt_length')} chars, {data.get('auth_method')})")
                print()

            elif event == 'PARSED_RESPONSE':
                print(f"🤖 CLAUDE:")
                text = data.get('text', '')[:1000]
                print(f"   {text}")
                if len(data.get('text', '')) > 1000:
                    print("   [... truncated ...]")
                print()

            elif event.startswith('TOOL_CALL'):
                if event == 'TOOL_CALL_START':
                    print(f"🔧 TOOL: {data.get('tool_name')}")
                    print(f"   Params: {json.dumps(data.get('params', {}))[:200]}")
                elif event == 'TOOL_CALL_RESULT':
                    success = '✓' if data.get('success', True) else '✗'
                    print(f"   Result: {success}")
                print()

    def cmd_tools(self, session_id: str):
        """Show tool call timeline for a session."""
        if self.is_remote:
            data = self._api_get(f'session/{session_id}')
            entries = data.get('entries', [])
        else:
            entries = get_session_log(session_id)

        if not entries:
            print(f"Session {session_id} not found.")
            return

        print(f"\n{'='*70}")
        print(f"Tool Call Timeline: {session_id}")
        print(f"{'='*70}\n")

        tool_stats = {}
        total_duration = 0

        for entry in entries:
            event = entry.get('event', '')
            data = entry.get('data', {})

            if event == 'TOOL_CALL_RESULT':
                tool = data.get('tool_name', 'unknown')
                success = data.get('success', True)
                duration = data.get('duration_ms', 0)
                round_num = entry.get('round', 0)

                status = '✓' if success else '✗'
                duration_str = f"{duration}ms" if duration else 'N/A'

                print(f"R{round_num:02d} | {status} {tool:<30} | {duration_str:>8}")

                if tool not in tool_stats:
                    tool_stats[tool] = {'count': 0, 'success': 0, 'total_ms': 0}
                tool_stats[tool]['count'] += 1
                if success:
                    tool_stats[tool]['success'] += 1
                tool_stats[tool]['total_ms'] += duration or 0
                total_duration += duration or 0

        # Summary
        if tool_stats:
            print(f"\n{'─'*70}")
            print("Tool Statistics:")
            print(f"{'─'*70}")
            print(f"{'TOOL':<30} {'CALLS':>6} {'SUCCESS':>8} {'AVG MS':>10}")

            for tool, stats in sorted(tool_stats.items(), key=lambda x: x[1]['count'], reverse=True):
                avg_ms = stats['total_ms'] / stats['count'] if stats['count'] > 0 else 0
                success_rate = (stats['success'] / stats['count'] * 100) if stats['count'] > 0 else 0
                print(f"{tool:<30} {stats['count']:>6} {success_rate:>7.0f}% {avg_ms:>9.1f}")

            print(f"\nTotal tool execution time: {total_duration}ms")

    def cmd_search(self, query: str, limit: int = 50):
        """Search through all logs."""
        if self.is_remote:
            data = self._api_get('search', {'q': query, 'limit': limit})
            if 'error' in data:
                print(f"Error: {data['error']}")
                return
            results = data.get('results', [])
        else:
            results = search_logs(query, limit)

        if not results:
            print(f"No results for '{query}'")
            return

        print(f"\n{'='*70}")
        print(f"Search Results for: {query}")
        print(f"{'='*70}\n")

        for r in results:
            print(f"Session: {r.get('session', 'unknown')}")
            print(f"Event: {r.get('event', 'unknown')}")
            print(f"Match: {r.get('match', '')[:200]}...")
            print()

        print(f"Total: {len(results)} results")

    def cmd_watch(self, interval: float = 2.0):
        """Watch the current session (remote mode only)."""
        if not self.is_remote:
            print("Watch mode only available in remote mode.")
            print("Use: python debug_viewer.py --remote http://HOST:PORT watch")
            return

        import time

        print("Watching for debug events... (Ctrl+C to stop)")
        last_round = 0
        last_session = None

        try:
            while True:
                status = self._api_get('status')
                current_session = status.get('current_session')
                current_round = status.get('current_round', 0)

                if current_session != last_session:
                    if current_session:
                        print(f"\n{'='*50}")
                        print(f"New session started: {current_session}")
                        print(f"{'='*50}")
                    last_session = current_session
                    last_round = 0

                if current_round > last_round and current_session:
                    # Fetch and display new entries
                    data = self._api_get(f'session/{current_session}')
                    entries = data.get('entries', [])

                    for entry in entries:
                        if entry.get('round', 0) > last_round:
                            event = entry.get('event', '')
                            print(f"  [{entry.get('timestamp', '')[:19]}] R{entry.get('round')} {event}")

                    last_round = current_round

                time.sleep(interval)

        except KeyboardInterrupt:
            print("\nStopped watching.")

    def cmd_status(self):
        """Show debug logging status."""
        if self.is_remote:
            data = self._api_get('status')
            enabled = data.get('debug_logging_enabled', False)
            session = data.get('current_session')
            round_num = data.get('current_round', 0)

            print(f"\nDebug Logging Status (Remote)")
            print(f"{'='*40}")
            print(f"Enabled: {'Yes' if enabled else 'No'}")
            print(f"Current Session: {session or 'None'}")
            print(f"Current Round: {round_num}")
        else:
            print(f"\nDebug Logging Status (Local)")
            print(f"{'='*40}")
            print(f"Enabled: {'Yes' if DEBUG_LOGGING else 'No'}")
            print(f"Log Directory: {LOG_DIR}")
            print(f"Directory Exists: {LOG_DIR.exists()}")
            if LOG_DIR.exists():
                log_files = list(LOG_DIR.glob("session_*.jsonl"))
                print(f"Log Files: {len(log_files)}")


def main():
    parser = argparse.ArgumentParser(
        description="Claude Chat Debug Log Viewer",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
    python debug_viewer.py sessions
    python debug_viewer.py session 20240115_123456_789
    python debug_viewer.py replay 20240115_123456_789
    python debug_viewer.py tools 20240115_123456_789
    python debug_viewer.py search "KSampler"
    python debug_viewer.py --remote http://192.168.1.100:8188 sessions
        """
    )

    parser.add_argument(
        '--remote', '-r',
        help='Remote ComfyUI URL (e.g., http://192.168.1.100:8188)',
        default=None
    )

    subparsers = parser.add_subparsers(dest='command', help='Command to run')

    # sessions command
    p_sessions = subparsers.add_parser('sessions', help='List recent sessions')
    p_sessions.add_argument('--limit', '-n', type=int, default=20, help='Number of sessions')

    # session command
    p_session = subparsers.add_parser('session', help='View session entries')
    p_session.add_argument('session_id', help='Session ID')
    p_session.add_argument('--filter', '-f', help='Filter by event type')

    # summary command
    p_summary = subparsers.add_parser('summary', help='View session summary')
    p_summary.add_argument('session_id', help='Session ID')

    # replay command
    p_replay = subparsers.add_parser('replay', help='Replay conversation')
    p_replay.add_argument('session_id', help='Session ID')

    # tools command
    p_tools = subparsers.add_parser('tools', help='Show tool call timeline')
    p_tools.add_argument('session_id', help='Session ID')

    # search command
    p_search = subparsers.add_parser('search', help='Search logs')
    p_search.add_argument('query', help='Search query')
    p_search.add_argument('--limit', '-n', type=int, default=50, help='Max results')

    # watch command
    p_watch = subparsers.add_parser('watch', help='Watch live session (remote only)')
    p_watch.add_argument('--interval', '-i', type=float, default=2.0, help='Poll interval')

    # status command
    subparsers.add_parser('status', help='Show debug logging status')

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        return

    viewer = DebugViewer(remote_url=args.remote)

    if args.command == 'sessions':
        viewer.cmd_sessions(args.limit)
    elif args.command == 'session':
        viewer.cmd_session(args.session_id, args.filter)
    elif args.command == 'summary':
        viewer.cmd_summary(args.session_id)
    elif args.command == 'replay':
        viewer.cmd_replay(args.session_id)
    elif args.command == 'tools':
        viewer.cmd_tools(args.session_id)
    elif args.command == 'search':
        viewer.cmd_search(args.query, args.limit)
    elif args.command == 'watch':
        viewer.cmd_watch(args.interval)
    elif args.command == 'status':
        viewer.cmd_status()


if __name__ == '__main__':
    main()
