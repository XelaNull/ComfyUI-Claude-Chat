"""
Pytest Configuration and Fixtures for Claude Chat Tests

Provides:
- Mock tool execution context
- Sample workflow data
- Test helpers
"""

import sys
from pathlib import Path

# Add claude_chat directory to path so imports work properly
_project_root = Path(__file__).parent.parent.parent
_claude_chat_path = _project_root / "claude_chat"
if str(_project_root) not in sys.path:
    sys.path.insert(0, str(_project_root))
if str(_claude_chat_path) not in sys.path:
    sys.path.insert(0, str(_claude_chat_path))

import pytest
import asyncio
from typing import Dict, Any, List
from unittest.mock import Mock, AsyncMock, patch


# ============================================================================
# ASYNCIO CONFIGURATION
# ============================================================================

@pytest.fixture(scope="session")
def event_loop():
    """Create an event loop for async tests."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


# ============================================================================
# TOOL FIXTURES
# ============================================================================

@pytest.fixture
def mock_tool_context():
    """Provides a mock context for tool execution."""
    return {
        "workflow": {
            "nodes": [],
            "groups": [],
            "links": {}
        },
        "refs": {},
        "conversation_id": "test-conv-123"
    }


@pytest.fixture
def sample_workflow():
    """Provides a sample workflow for testing."""
    return {
        "nodes": [
            {
                "id": 1,
                "type": "CheckpointLoaderSimple",
                "pos": [50, 100],
                "size": [315, 98],
                "widgets_values": ["dreamshaper_8.safetensors"]
            },
            {
                "id": 2,
                "type": "CLIPTextEncode",
                "pos": [400, 50],
                "size": [400, 200],
                "widgets_values": ["a beautiful landscape"]
            },
            {
                "id": 3,
                "type": "CLIPTextEncode",
                "pos": [400, 300],
                "size": [400, 200],
                "widgets_values": ["ugly, blurry"]
            },
            {
                "id": 4,
                "type": "KSampler",
                "pos": [850, 150],
                "size": [315, 262],
                "widgets_values": [123456, "randomize", 20, 8, "euler", "normal", 1]
            },
            {
                "id": 5,
                "type": "VAEDecode",
                "pos": [1200, 200],
                "size": [210, 46],
                "widgets_values": []
            },
            {
                "id": 6,
                "type": "SaveImage",
                "pos": [1450, 200],
                "size": [315, 270],
                "widgets_values": ["ComfyUI"]
            }
        ],
        "groups": [
            {
                "title": "Model Loading",
                "bounding": [30, 80, 350, 140],
                "color": "#2A4858"
            }
        ],
        "links": [
            [1, 1, 0, 2, 0, "CLIP"],
            [2, 1, 0, 3, 0, "CLIP"],
            [3, 1, 0, 4, 0, "MODEL"],
            [4, 2, 0, 4, 1, "CONDITIONING"],
            [5, 3, 0, 4, 2, "CONDITIONING"],
            [6, 4, 0, 5, 0, "LATENT"],
            [7, 1, 2, 5, 1, "VAE"],
            [8, 5, 0, 6, 0, "IMAGE"]
        ]
    }


@pytest.fixture
def sample_node_types():
    """Provides sample node type definitions."""
    return {
        "KSampler": {
            "name": "KSampler",
            "display_name": "KSampler",
            "category": "sampling",
            "input": {
                "required": {
                    "model": ["MODEL"],
                    "positive": ["CONDITIONING"],
                    "negative": ["CONDITIONING"],
                    "latent_image": ["LATENT"],
                    "seed": ["INT", {"default": 0, "min": 0, "max": 0xffffffffffffffff}],
                    "steps": ["INT", {"default": 20, "min": 1, "max": 10000}],
                    "cfg": ["FLOAT", {"default": 8.0, "min": 0.0, "max": 100.0}],
                    "sampler_name": [["euler", "dpmpp_2m", "dpmpp_sde"]],
                    "scheduler": [["normal", "karras", "exponential"]],
                    "denoise": ["FLOAT", {"default": 1.0, "min": 0.0, "max": 1.0}]
                }
            },
            "output": ["LATENT"],
            "output_name": ["LATENT"]
        },
        "CheckpointLoaderSimple": {
            "name": "CheckpointLoaderSimple",
            "display_name": "Load Checkpoint",
            "category": "loaders",
            "input": {
                "required": {
                    "ckpt_name": [["model1.safetensors", "model2.safetensors"]]
                }
            },
            "output": ["MODEL", "CLIP", "VAE"],
            "output_name": ["MODEL", "CLIP", "VAE"]
        },
        "CLIPTextEncode": {
            "name": "CLIPTextEncode",
            "display_name": "CLIP Text Encode",
            "category": "conditioning",
            "input": {
                "required": {
                    "clip": ["CLIP"],
                    "text": ["STRING", {"multiline": True}]
                }
            },
            "output": ["CONDITIONING"],
            "output_name": ["CONDITIONING"]
        },
        "VAEDecode": {
            "name": "VAEDecode",
            "display_name": "VAE Decode",
            "category": "latent",
            "input": {
                "required": {
                    "samples": ["LATENT"],
                    "vae": ["VAE"]
                }
            },
            "output": ["IMAGE"],
            "output_name": ["IMAGE"]
        },
        "SaveImage": {
            "name": "SaveImage",
            "display_name": "Save Image",
            "category": "image",
            "input": {
                "required": {
                    "images": ["IMAGE"],
                    "filename_prefix": ["STRING", {"default": "ComfyUI"}]
                }
            },
            "output": [],
            "output_name": []
        }
    }


@pytest.fixture
def sample_models():
    """Provides sample model lists for testing."""
    return {
        "checkpoints": [
            "dreamshaper_8.safetensors",
            "sd_xl_base_1.0.safetensors",
            "flux_dev.safetensors"
        ],
        "loras": [
            "add_detail.safetensors",
            "epi_noiseoffset2.safetensors"
        ],
        "vae": [
            "vae-ft-mse-840000-ema-pruned.safetensors"
        ],
        "controlnet": [
            "control_v11p_sd15_canny.pth"
        ]
    }


# ============================================================================
# MOCK HELPERS
# ============================================================================

@pytest.fixture
def mock_anthropic_client():
    """Mocks the Anthropic API client."""
    with patch("anthropic.Anthropic") as mock:
        client = Mock()
        client.messages.create = AsyncMock(return_value=Mock(
            content=[Mock(type="text", text="Test response")],
            stop_reason="end_turn"
        ))
        mock.return_value = client
        yield mock


@pytest.fixture
def mock_subprocess():
    """Mocks subprocess for CLI mode testing."""
    with patch("subprocess.run") as mock:
        mock.return_value = Mock(
            returncode=0,
            stdout="Test output",
            stderr=""
        )
        yield mock


# ============================================================================
# TOOL TESTING HELPERS
# ============================================================================

class ToolTestHelper:
    """Helper class for testing tools."""

    @staticmethod
    def create_node_params(
        type: str = "KSampler",
        pos: List[int] = None,
        widgets: Dict[str, Any] = None,
        ref: str = None
    ) -> Dict[str, Any]:
        """Create standard node creation parameters."""
        params = {"type": type}
        if pos:
            params["pos"] = pos
        if widgets:
            params["widgets"] = widgets
        if ref:
            params["ref"] = ref
        return params

    @staticmethod
    def create_link_params(
        from_node: int,
        from_slot: int,
        to_node: int,
        to_slot: int
    ) -> Dict[str, Any]:
        """Create standard link parameters."""
        return {
            "from": from_node,
            "from_slot": from_slot,
            "to": to_node,
            "to_slot": to_slot
        }

    @staticmethod
    def create_widget_update(
        node: int,
        widget: str,
        value: Any
    ) -> Dict[str, Any]:
        """Create widget update parameters."""
        return {
            "node": node,
            "widget": widget,
            "value": value
        }

    @staticmethod
    def create_group_params(
        title: str,
        nodes: List[int] = None,
        color: str = None
    ) -> Dict[str, Any]:
        """Create group parameters."""
        params = {"title": title}
        if nodes:
            params["nodes"] = nodes
        if color:
            params["color"] = color
        return params


@pytest.fixture
def tool_helper():
    """Provides tool testing helper."""
    return ToolTestHelper()


# ============================================================================
# ASSERTION HELPERS
# ============================================================================

def assert_tool_success(result: Dict[str, Any]):
    """Assert that a tool execution was successful."""
    assert result.get("success") is True or result.get("execute_client_side") is True, \
        f"Tool failed: {result.get('error', 'Unknown error')}"


def assert_tool_failure(result: Dict[str, Any], expected_error: str = None):
    """Assert that a tool execution failed."""
    assert result.get("success") is False, "Expected tool to fail"
    if expected_error:
        assert expected_error.lower() in result.get("error", "").lower(), \
            f"Expected error containing '{expected_error}', got: {result.get('error')}"


def assert_client_side_execution(result: Dict[str, Any]):
    """Assert that result indicates client-side execution."""
    assert result.get("execute_client_side") is True, \
        "Expected client-side execution"
    assert "action" in result, "Missing action in client-side result"


# Export assertion helpers
__all__ = [
    "assert_tool_success",
    "assert_tool_failure",
    "assert_client_side_execution",
    "ToolTestHelper"
]
