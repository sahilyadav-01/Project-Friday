"""System status tool — reports OS, CPU, RAM and local time."""

from __future__ import annotations

import datetime
import os
import platform
from typing import Any

from openjarvis.core.registry import ToolRegistry
from openjarvis.core.types import ToolResult
from openjarvis.tools._stubs import BaseTool, ToolSpec


@ToolRegistry.register("system_status")
class SystemStatusTool(BaseTool):
    """System status and diagnostics tool."""

    tool_id = "system_status"

    @property
    def spec(self) -> ToolSpec:
        return ToolSpec(
            name="system_status",
            description=(
                "Get current system status, including OS, CPU count, RAM, "
                "and current local date/time on the host machine."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "include_time": {
                        "type": "boolean",
                        "description": "Whether to include current local date and time.",
                        "default": True,
                    }
                },
            },
            category="system",
        )

    def execute(self, **params: Any) -> ToolResult:
        try:
            import psutil
            cpu_pct = psutil.cpu_percent(interval=0.1)
            mem = psutil.virtual_memory()
            ram_info = f"{mem.used / (1024**3):.1f} GB / {mem.total / (1024**3):.1f} GB ({mem.percent}% used)"
        except Exception:
            cpu_pct = "N/A"
            ram_info = "N/A"

        now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        status_lines = [
            f"OS: {platform.system()} {platform.release()}",
            f"Machine: {platform.machine()}",
            f"CPU Cores: {os.cpu_count()}",
            f"CPU Usage: {cpu_pct}%",
            f"RAM: {ram_info}",
            f"Current Time: {now}",
        ]
        return ToolResult(
            tool_name="system_status",
            content="\n".join(status_lines),
            success=True,
        )


__all__ = ["SystemStatusTool"]

