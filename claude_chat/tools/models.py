"""
Model-related tools for ComfyUI.

Provides tools to list and inspect checkpoints, LoRAs, VAEs, etc.
"""

import os
from pathlib import Path
from typing import Any, Dict, List, Optional
from .base import Tool, ToolRegistry


def get_comfyui_models_path() -> Path:
    """Get the ComfyUI models directory."""
    # Standard ComfyUI paths
    comfyui_path = os.environ.get('COMFYUI_PATH', '/ComfyUI-Mount/ComfyUI')
    return Path(comfyui_path) / 'models'


def scan_model_directory(base_path: Path, model_type: str) -> List[Dict[str, Any]]:
    """Scan a model directory and return file info."""
    type_paths = {
        'checkpoint': ['checkpoints'],
        'lora': ['loras'],
        'vae': ['vae'],
        'embedding': ['embeddings'],
        'controlnet': ['controlnet'],
        'upscale': ['upscale_models'],
    }

    dirs = type_paths.get(model_type, [model_type])
    models = []

    for dir_name in dirs:
        dir_path = base_path / dir_name
        if not dir_path.exists():
            continue

        for file_path in dir_path.rglob('*'):
            if file_path.is_file() and file_path.suffix.lower() in ['.safetensors', '.ckpt', '.pt', '.pth', '.bin']:
                rel_path = file_path.relative_to(dir_path)
                models.append({
                    'name': file_path.stem,
                    'path': str(rel_path),
                    'full_path': str(file_path),
                    'type': model_type,
                    'size_mb': round(file_path.stat().st_size / (1024 * 1024), 1),
                    'extension': file_path.suffix
                })

    return models


@ToolRegistry.register
class ListModelsTool(Tool):
    """List available models in ComfyUI."""

    name = "list_models"
    description = "List available models (checkpoints, LoRAs, VAEs, embeddings, etc.) in ComfyUI"
    parameters = {
        "type": "object",
        "properties": {
            "model_type": {
                "type": "string",
                "enum": ["checkpoint", "lora", "vae", "embedding", "controlnet", "upscale", "all"],
                "description": "Type of models to list. Use 'all' to list all types."
            },
            "search": {
                "type": "string",
                "description": "Optional search term to filter models by name"
            }
        },
        "required": []
    }

    async def execute(self, model_type: str = "all", search: Optional[str] = None) -> Dict[str, Any]:
        """List models of the specified type."""
        base_path = get_comfyui_models_path()

        if not base_path.exists():
            return {
                "error": f"Models directory not found: {base_path}",
                "models": []
            }

        types_to_scan = ['checkpoint', 'lora', 'vae', 'embedding', 'controlnet', 'upscale'] if model_type == 'all' else [model_type]

        all_models = []
        for mtype in types_to_scan:
            models = scan_model_directory(base_path, mtype)
            all_models.extend(models)

        # Apply search filter
        if search:
            search_lower = search.lower()
            all_models = [m for m in all_models if search_lower in m['name'].lower()]

        # Sort by type, then name
        all_models.sort(key=lambda m: (m['type'], m['name'].lower()))

        return {
            "count": len(all_models),
            "models": all_models[:50],  # Limit to 50 to avoid huge responses
            "truncated": len(all_models) > 50
        }


@ToolRegistry.register
class GetModelInfoTool(Tool):
    """Get detailed information about a specific model."""

    name = "get_model_info"
    description = "Get detailed information about a specific model file"
    parameters = {
        "type": "object",
        "properties": {
            "model_path": {
                "type": "string",
                "description": "Path to the model file (relative or absolute)"
            }
        },
        "required": ["model_path"]
    }

    async def execute(self, model_path: str) -> Dict[str, Any]:
        """Get info about a specific model."""
        # Try as absolute path first
        path = Path(model_path)
        if not path.exists():
            # Try relative to models dir
            base_path = get_comfyui_models_path()
            path = base_path / model_path

        if not path.exists():
            return {"error": f"Model not found: {model_path}"}

        stat = path.stat()
        return {
            "name": path.stem,
            "path": str(path),
            "size_mb": round(stat.st_size / (1024 * 1024), 1),
            "extension": path.suffix,
            "modified": stat.st_mtime,
        }
