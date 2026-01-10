# Debug Logging System

Comprehensive conversation logging for development and troubleshooting.

## Privacy First

**Debug logging is DISABLED by default.** This honors our commitment to user privacy. Logs are only written when explicitly enabled by the server administrator.

When disabled:
- No conversation data is written to disk
- No prompts, responses, or tool calls are stored
- The system operates in "production mode"

---

## Enabling Debug Logging

Set the environment variable before starting ComfyUI:

```bash
# Linux/Mac
export CLAUDE_CHAT_DEBUG=1

# Windows (Command Prompt)
set CLAUDE_CHAT_DEBUG=1

# Windows (PowerShell)
$env:CLAUDE_CHAT_DEBUG = "1"

# Docker Compose
environment:
  - CLAUDE_CHAT_DEBUG=1
```

You'll see this in the console when enabled:
```
[DebugLogger] DEBUG MODE ENABLED - logging to /var/log/claude-chat
[Claude Chat] DEBUG MODE: Conversation logging ENABLED
```

---

## What Gets Logged

When enabled, the system captures the complete conversation lifecycle:

| Event | Description |
|-------|-------------|
| `SESSION_START` | New conversation begins |
| `USER_MESSAGE` | Original user input (before processing) |
| `SYSTEM_PROMPT` | System prompt sent to Claude (full or continuation) |
| `FULL_PROMPT_SENT` | Complete message including workflow context |
| `CONTEXT_INJECTED` | Auto-injected workflow context details |
| `RAW_RESPONSE` | Unparsed response from Claude |
| `PARSED_RESPONSE` | Extracted text and tool calls |
| `TOOL_CALL_START` | Tool execution begins |
| `TOOL_CALL_RESULT` | Tool execution completed (with timing) |
| `TOOL_CALL_ERROR` | Tool execution failed |
| `CONTINUATION` | Multi-round conversation continues |
| `FRONTEND_*` | Events logged from JavaScript frontend |
| `ERROR` | Any error with context |
| `API_ERROR` | API-specific errors with status codes |
| `TIMEOUT` | Timeout events |
| `SESSION_END` | Conversation completed |

---

## Log File Structure

Logs are stored in `/var/log/claude-chat/` (configurable via `CONVERSATION_LOG_DIR`).

```
/var/log/claude-chat/
├── session_20240115_123456_789012.jsonl          # Structured JSON Lines
├── session_20240115_123456_789012_round01_prompt.txt
├── session_20240115_123456_789012_round01_system_prompt.txt
├── session_20240115_123456_789012_round01_response_raw.txt
├── session_20240115_123456_789012_round01_response_parsed.txt
├── session_20240115_123456_789012_round02_prompt.txt
└── ...
```

### JSONL Format (Machine-Readable)

Each line is a complete JSON object:

```json
{"timestamp": "2024-01-15T12:34:56.789", "session": "20240115_123456_789012", "round": 1, "event": "USER_MESSAGE", "data": {"message": "Add a KSampler node", "has_image": false, "has_workflow": true}}
{"timestamp": "2024-01-15T12:34:56.890", "session": "20240115_123456_789012", "round": 1, "event": "FULL_PROMPT_SENT", "data": {"auth_method": "max_plan", "use_tools": true, "prompt_length": 4523, "prompt_content": "..."}}
{"timestamp": "2024-01-15T12:34:58.123", "session": "20240115_123456_789012", "round": 1, "event": "RAW_RESPONSE", "data": {"auth_method": "max_plan", "response_length": 892, "raw_content": "..."}}
```

### Text Files (Human-Readable)

For quick debugging, each round generates readable text files:

```
=== FULL PROMPT (Round 1) ===
Auth: max_plan, Tools: True
Length: 4523 chars
============================================================

You are a ComfyUI workflow assistant...
[Full prompt content]
```

---

## CLI Diagnostic Tool

A command-line tool for viewing and analyzing logs.

### Location

```
claude_chat/cli/debug_viewer.py
```

### Commands

#### List Recent Sessions

```bash
python debug_viewer.py sessions
python debug_viewer.py sessions --limit 50
```

Output:
```
======================================================================
SESSION ID                ROUNDS  EVENTS    SIZE  STARTED
======================================================================
20240115_143256_789012         3      18    12.4KB 2024-01-15T14:32:56
20240115_142001_456789         1       6     4.2KB 2024-01-15T14:20:01
20240115_140530_123456         5      31    28.1KB 2024-01-15T14:05:30

Total: 3 sessions
```

#### View Session Details

```bash
python debug_viewer.py session 20240115_143256_789012
python debug_viewer.py session 20240115_143256_789012 --filter TOOL
```

#### View Session Summary

```bash
python debug_viewer.py summary 20240115_143256_789012
```

Output:
```
======================================================================
Session Summary: 20240115_143256_789012
======================================================================

Rounds: 3
Total Rounds: 3

Tool Calls (7):
  R1: ✓ create_node (45ms)
  R1: ✓ create_node (32ms)
  R1: ✓ create_node_link (28ms)
  R2: ✓ update_widget (15ms)
  R3: ✓ queue_execution (8ms)

Errors (0):

Timeline:
  Round 1: prompt (max_plan, 4523 chars)
  Round 2: prompt (max_plan, 1247 chars)
  Round 3: prompt (max_plan, 983 chars)
```

#### Replay Conversation

Shows the conversation flow with user messages, prompts, and responses:

```bash
python debug_viewer.py replay 20240115_143256_789012
```

Output:
```
======================================================================
Conversation Replay: 20240115_143256_789012
======================================================================

──────────────────────────────────────────────────────────────────────
Round 1
──────────────────────────────────────────────────────────────────────

📝 USER:
   Add a KSampler node to my workflow

📤 PROMPT SENT (4523 chars, max_plan)

🤖 CLAUDE:
   I'll add a KSampler node to your workflow.

🔧 TOOL: create_node
   Params: {"type": "KSampler", "pos": [400, 200]}
   Result: ✓

──────────────────────────────────────────────────────────────────────
Round 2
──────────────────────────────────────────────────────────────────────
...
```

#### Tool Call Timeline

Shows all tool executions with timing:

```bash
python debug_viewer.py tools 20240115_143256_789012
```

Output:
```
======================================================================
Tool Call Timeline: 20240115_143256_789012
======================================================================

R01 | ✓ create_node                      |     45ms
R01 | ✓ create_node                      |     32ms
R01 | ✓ create_node_link                 |     28ms
R02 | ✓ update_widget                    |     15ms
R03 | ✓ queue_execution                  |      8ms

──────────────────────────────────────────────────────────────────────
Tool Statistics:
──────────────────────────────────────────────────────────────────────
TOOL                           CALLS  SUCCESS    AVG MS
create_node                        2     100%      38.5
create_node_link                   1     100%      28.0
update_widget                      1     100%      15.0
queue_execution                    1     100%       8.0

Total tool execution time: 128ms
```

#### Search Logs

```bash
python debug_viewer.py search "KSampler"
python debug_viewer.py search "error" --limit 100
```

#### Check Status

```bash
python debug_viewer.py status
```

---

## Remote Mode (For iPad Testing)

When testing from a device that can't run the CLI (like an iPad), use remote mode to connect to the ComfyUI server:

```bash
# Point to your ComfyUI server
python debug_viewer.py --remote http://192.168.1.100:8188 sessions
python debug_viewer.py --remote http://192.168.1.100:8188 replay 20240115_143256
python debug_viewer.py --remote http://192.168.1.100:8188 tools 20240115_143256
```

### Watch Mode (Live Debugging)

Monitor events in real-time as they happen:

```bash
python debug_viewer.py --remote http://192.168.1.100:8188 watch
```

Output:
```
Watching for debug events... (Ctrl+C to stop)

==================================================
New session started: 20240115_143256_789012
==================================================
  [2024-01-15T14:32:56] R1 USER_MESSAGE
  [2024-01-15T14:32:56] R1 FULL_PROMPT_SENT
  [2024-01-15T14:32:58] R1 RAW_RESPONSE
  [2024-01-15T14:32:58] R1 PARSED_RESPONSE
  [2024-01-15T14:32:58] R1 TOOL_CALL_RESULT
  ...
```

---

## API Endpoints

All endpoints are available at `/claude-chat/debug/...`

### Check Debug Status

```
GET /claude-chat/debug/status
```

Response:
```json
{
  "debug_logging_enabled": true,
  "session_active": true,
  "current_session": "20240115_143256_789012",
  "current_round": 2
}
```

### List Sessions

```
GET /claude-chat/debug/sessions?limit=20
```

Response:
```json
{
  "success": true,
  "sessions": [
    {
      "session_id": "20240115_143256_789012",
      "file": "/var/log/claude-chat/session_20240115_143256_789012.jsonl",
      "started": "2024-01-15T14:32:56",
      "ended": "2024-01-15T14:35:12",
      "rounds": 3,
      "event_count": 18,
      "size_kb": 12.4
    }
  ],
  "count": 1
}
```

### Get Session Log

```
GET /claude-chat/debug/session/{session_id}
```

Response:
```json
{
  "success": true,
  "session_id": "20240115_143256_789012",
  "entries": [
    {"timestamp": "...", "session": "...", "round": 1, "event": "SESSION_START", "data": {}},
    {"timestamp": "...", "session": "...", "round": 1, "event": "USER_MESSAGE", "data": {"message": "..."}}
  ],
  "count": 18
}
```

### Get Session Summary

```
GET /claude-chat/debug/session/{session_id}/summary
```

### Search Logs

```
GET /claude-chat/debug/search?q=KSampler&limit=50
```

### Log Frontend Event

For JavaScript to log client-side events:

```
POST /claude-chat/debug/log-frontend
Content-Type: application/json

{
  "event": "TOOL_EXECUTION",
  "data": {
    "tool_name": "create_node",
    "duration_ms": 45,
    "success": true
  }
}
```

---

## Integration with Claude Code

When debug logging is enabled, you can ask Claude Code to analyze logs:

> "Check the debug logs for the last conversation"

> "What tool calls happened in the most recent session?"

> "Show me the full prompt that was sent to Claude in session 20240115_143256"

> "Search the logs for any errors containing 'timeout'"

Claude Code can use the API endpoints or CLI tool to retrieve and analyze the logs, eliminating the need to copy/paste browser console output.

---

## Troubleshooting

### Logs Not Being Created

1. Verify `CLAUDE_CHAT_DEBUG=1` is set
2. Check console for `[DebugLogger] DEBUG MODE ENABLED`
3. Ensure `/var/log/claude-chat/` is writable
4. Check for errors in console output

### Can't Access Remote Endpoints

1. Ensure debug logging is enabled on the server
2. Check firewall allows access to port 8188
3. Verify the URL is correct (include `http://`)

### Log Directory Full

Logs are not automatically rotated. To clean up:

```bash
# Remove logs older than 7 days
find /var/log/claude-chat -name "session_*.jsonl" -mtime +7 -delete
find /var/log/claude-chat -name "session_*.txt" -mtime +7 -delete
```

---

## Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `CLAUDE_CHAT_DEBUG` | `""` (disabled) | Set to `1`, `true`, or `yes` to enable |
| `CONVERSATION_LOG_DIR` | `/var/log/claude-chat` | Log file directory |

---

## Security Considerations

- Debug logs contain **full conversation content** including prompts and responses
- Logs may contain **sensitive workflow information**
- Always disable debug logging in production
- Restrict access to log files and API endpoints
- Consider log rotation and cleanup policies
