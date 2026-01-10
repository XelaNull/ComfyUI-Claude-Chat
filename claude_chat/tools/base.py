"""
Base Tool class and ToolRegistry for ComfyUI Claude Chat.

This provides a unified interface for tools that can be used by:
1. Claude CLI via MCP servers
2. Anthropic API via Tool Use
"""

from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional, Type
import json


class Tool(ABC):
    """Base class for all ComfyUI tools.

    Subclasses must define:
    - name: Tool identifier (snake_case)
    - description: What the tool does
    - parameters: JSON Schema for inputs
    - execute(): Async method that performs the action
    """

    name: str = ""
    description: str = ""
    parameters: Dict[str, Any] = {"type": "object", "properties": {}}

    @abstractmethod
    async def execute(self, **kwargs) -> Any:
        """Execute the tool with given parameters.

        Returns:
            Tool-specific result (will be JSON-serialized for responses)
        """
        pass

    def to_anthropic_tool(self) -> Dict[str, Any]:
        """Convert to Anthropic API tool format."""
        return {
            "name": self.name,
            "description": self.description,
            "input_schema": self.parameters
        }

    def to_mcp_tool(self) -> Dict[str, Any]:
        """Convert to MCP tool format."""
        return {
            "name": self.name,
            "description": self.description,
            "inputSchema": self.parameters
        }


class ToolRegistry:
    """Registry for all available tools.

    Provides methods to:
    - Register tools
    - Get tools for API or MCP
    - Execute tools by name
    """

    _tools: Dict[str, Tool] = {}

    @classmethod
    def register(cls, tool_class: Type[Tool]) -> Type[Tool]:
        """Decorator to register a tool class."""
        instance = tool_class()
        cls._tools[instance.name] = instance
        return tool_class

    @classmethod
    def get(cls, name: str) -> Optional[Tool]:
        """Get a tool by name."""
        return cls._tools.get(name)

    @classmethod
    def all(cls) -> List[Tool]:
        """Get all registered tools."""
        return list(cls._tools.values())

    @classmethod
    def for_anthropic_api(cls) -> List[Dict[str, Any]]:
        """Get all tools in Anthropic API format."""
        return [tool.to_anthropic_tool() for tool in cls._tools.values()]

    @classmethod
    def for_mcp(cls) -> List[Dict[str, Any]]:
        """Get all tools in MCP format."""
        return [tool.to_mcp_tool() for tool in cls._tools.values()]

    @classmethod
    async def execute(cls, name: str, **kwargs) -> Any:
        """Execute a tool by name."""
        tool = cls.get(name)
        if not tool:
            raise ValueError(f"Unknown tool: {name}")
        return await tool.execute(**kwargs)

    @classmethod
    def generate_mcp_config(cls, server_script: str) -> Dict[str, Any]:
        """Generate MCP config for Claude CLI.

        Args:
            server_script: Path to the MCP server script

        Returns:
            MCP config dict for --mcp-config flag
        """
        return {
            "mcpServers": {
                "comfyui": {
                    "command": "python",
                    "args": [server_script]
                }
            }
        }
