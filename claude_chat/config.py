"""
Configuration management for Claude Chat.
"""

import os
import json
from typing import Dict, Any

CONFIG_FILE = os.path.join(os.path.dirname(__file__), '..', 'config.json')

DEFAULT_CONFIG = {
    'model': 'claude-sonnet-4-20250514',
    'max_tokens': 2048,
    'include_workflow': True,
    'panel_width': 400,
    'panel_height': 500,
    'auth_preference': 'auto',  # 'auto', 'api', 'max'
    'api_key': '',  # Anthropic API key (stored for convenience)
}


class Config:
    _config = None

    @classmethod
    def _load(cls) -> Dict[str, Any]:
        if cls._config is None:
            if os.path.exists(CONFIG_FILE):
                try:
                    with open(CONFIG_FILE, 'r') as f:
                        cls._config = {**DEFAULT_CONFIG, **json.load(f)}
                except Exception:
                    cls._config = DEFAULT_CONFIG.copy()
            else:
                cls._config = DEFAULT_CONFIG.copy()
        return cls._config

    @classmethod
    def get(cls, key: str, default: Any = None) -> Any:
        config = cls._load()
        return config.get(key, default)

    @classmethod
    def get_all(cls) -> Dict[str, Any]:
        return cls._load().copy()

    @classmethod
    def update(cls, updates: Dict[str, Any]) -> None:
        config = cls._load()
        config.update(updates)
        try:
            with open(CONFIG_FILE, 'w') as f:
                json.dump(config, f, indent=2)
        except Exception as e:
            print(f"[Claude Chat] Failed to save config: {e}")
        cls._config = config
