from __future__ import annotations

from datetime import datetime
from typing import Any, Protocol


class WeatherProvider(Protocol):
    """Provider contract used by the seed/refresh layer."""

    name: str
    label: str

    def forecast_for(self, spec: dict[str, Any], start: datetime | None = None, days: int = 6) -> list[dict[str, Any]]:
        ...
