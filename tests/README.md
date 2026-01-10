# Claude Chat Test Suite

Comprehensive test suite for the ComfyUI Claude Chat extension, targeting 100% code coverage.

## Test Structure

```
tests/
├── python/                      # Python backend tests
│   ├── conftest.py             # Pytest fixtures and helpers
│   ├── test_tool_registry.py   # Tool registration system
│   ├── test_tools_nodes.py     # Node CRUD operations
│   ├── test_tools_links.py     # Link operations (create_node_link, delete_node_link)
│   ├── test_tools_groups.py    # Group operations (move_nodes_to_group, etc.)
│   ├── test_tools_widgets.py   # Widget operations
│   ├── test_tools_execution.py # Execution lifecycle
│   ├── test_tools_analysis.py  # Analysis tools (get_modified_widgets, etc.)
│   ├── test_tools_discovery.py # Discovery operations
│   └── test_prompts.py         # System prompt validation
├── js/                          # JavaScript frontend tests
│   ├── setup.js                # Global mocks (LiteGraph, app, fetch, DOM)
│   ├── tool_hints.test.js      # Error hint system
│   ├── tool_docs.test.js       # Tool documentation
│   ├── ref_resolver.test.js    # $ref system
│   ├── batch_executor.test.js  # Atomic batch operations
│   ├── context_generator.test.js # Workflow context generation
│   └── workflow_api.test.js    # LiteGraph operations
├── package.json                # JS test dependencies
├── vitest.config.js            # Vitest configuration
├── pytest.ini                  # Pytest configuration
└── requirements-test.txt       # Python test dependencies
```

## Running Tests

### JavaScript Tests

```bash
# Install dependencies
cd tests
npm install

# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Watch mode
npm run test:watch

# Interactive UI
npm run test:ui
```

### Python Tests

```bash
# Install dependencies
pip install -r tests/requirements-test.txt

# Run all tests
pytest tests/python

# Run with coverage
pytest tests/python --cov=claude_chat --cov-report=html

# Run specific test file
pytest tests/python/test_tools_nodes.py

# Run tests matching pattern
pytest tests/python -k "test_create"

# Verbose output
pytest tests/python -v
```

## Test Categories

### Python Tests

| Category | File | Coverage |
|----------|------|----------|
| Tool Registry | `test_tool_registry.py` | Tool registration, lookup, naming |
| Node Tools | `test_tools_nodes.py` | create, delete, update, duplicate, bypass |
| Link Tools | `test_tools_links.py` | create_node_link, delete_node_link |
| Group Tools | `test_tools_groups.py` | create, delete, update, move_nodes_to_group, merge |
| Widget Tools | `test_tools_widgets.py` | update_widget, get_widget_options |
| Execution Tools | `test_tools_execution.py` | queue_execution, cancel_execution, execution_status |
| Analysis Tools | `test_tools_analysis.py` | find_nodes, get_modified_widgets, validate, analyze |
| Discovery Tools | `test_tools_discovery.py` | get_workflow, get_node, list/search_available_* |
| Prompts | `test_prompts.py` | Prompt content, tool name consistency |

### JavaScript Tests

| Category | File | Coverage |
|----------|------|----------|
| Tool Hints | `tool_hints.test.js` | enrichError(), getToolUsage(), hint registry |
| Tool Docs | `tool_docs.test.js` | TOOL_CATEGORIES, TOOL_DOCS, searchTools() |
| Ref Resolver | `ref_resolver.test.js` | $ref registration, resolution, validation |
| Batch Executor | `batch_executor.test.js` | Atomic execution, rollback, validation |
| Context Generator | `context_generator.test.js` | Context levels, generation, issue detection |
| Workflow API | `workflow_api.test.js` | Node/link/group operations, undo system |

## Key Test Areas

### Tool Naming Verification

Tests verify that renamed tools use the correct names:

| Old Name | New Name | Tested In |
|----------|----------|-----------|
| `create_link` | `create_node_link` | `test_tools_links.py`, `tool_hints.test.js` |
| `delete_link` | `delete_node_link` | `test_tools_links.py`, `tool_hints.test.js` |
| `move_to_group` | `move_nodes_to_group` | `test_tools_groups.py`, `tool_hints.test.js` |
| `compare_to_defaults` | `get_modified_widgets` | `test_tools_analysis.py`, `tool_hints.test.js` |
| `queue` | `queue_execution` | `test_tools_execution.py` |
| `stop` | `cancel_execution` | `test_tools_execution.py` |
| `get_status` | `execution_status` | `test_tools_execution.py` |

### Mocking Strategy

**JavaScript (Vitest + jsdom):**
- `LiteGraph` - Node types, graph operations
- `app` - ComfyUI application object
- `fetch` - API calls
- `localStorage` - Settings persistence

**Python (pytest + pytest-mock):**
- `ToolRegistry` - Tool lookup
- Tool `execute()` methods return client-side execution markers

## Writing New Tests

### Python Tool Test Template

```python
import pytest
from tools.example import ExampleTool
from conftest import assert_client_side_execution

class TestExampleTool:
    @pytest.fixture
    def tool(self):
        return ExampleTool()

    def test_tool_name(self, tool):
        assert tool.name == 'example_tool'

    @pytest.mark.asyncio
    async def test_execute(self, tool):
        result = await tool.execute(param='value')
        assert_client_side_execution(result)
        assert result['action'] == 'example_tool'
```

### JavaScript Test Template

```javascript
import { describe, it, expect, beforeEach } from 'vitest';
import { resetMocks } from './setup.js';
import { ExampleModule } from '../../web/js/example.js';

describe('ExampleModule', () => {
    beforeEach(() => {
        resetMocks();
    });

    it('should do something', () => {
        const result = ExampleModule.doSomething();
        expect(result).toBe(expected);
    });
});
```

## Coverage Goals

Target: **80%+ coverage** on all modules

Priority areas:
1. Tool execution paths
2. $ref resolution
3. Batch rollback
4. Context generation
5. Error handling

## CI/CD Integration

Tests can be integrated into CI pipelines:

```yaml
# GitHub Actions example
test:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4

    - name: Setup Node
      uses: actions/setup-node@v4
      with:
        node-version: '20'

    - name: Setup Python
      uses: actions/setup-python@v5
      with:
        python-version: '3.11'

    - name: Install JS dependencies
      run: cd tests && npm install

    - name: Install Python dependencies
      run: pip install -r tests/requirements-test.txt

    - name: Run JS tests
      run: cd tests && npm run test:coverage

    - name: Run Python tests
      run: pytest tests/python --cov=claude_chat --cov-report=xml

    - name: Upload coverage
      uses: codecov/codecov-action@v4
```

## Troubleshooting

### Python Import Errors

If you get import errors, ensure the `claude_chat` package is in your Python path:

```bash
# From project root
export PYTHONPATH="${PYTHONPATH}:$(pwd)/claude_chat"
```

### JavaScript Module Errors

Ensure you're running from the `tests/` directory:

```bash
cd tests
npm test
```

### Mock Issues

If tests fail due to missing mocks:

1. Check `tests/js/setup.js` for JavaScript mocks
2. Check `tests/python/conftest.py` for Python fixtures
3. Add missing mocks as needed
