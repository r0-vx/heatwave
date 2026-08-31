from __future__ import annotations

from datetime import datetime, timedelta
from functools import lru_cache
from typing import Any

import requests

from ..config import settings


class ProviderUnavailable(RuntimeError):
    pass


def _number(value: Any, fallback: float) -> float:
    try:
        if value in {None, "", "NA", "N/A", "--"}:
            return fallback
        return float(value)
    except (TypeError, ValueError):
        return fallback


class IMDWeatherProvider:
    name = "imd"
    label = "India Meteorological Department city forecast"

    @property
    def configured(self) -> bool:
        return bool(settings.imd_api_key and settings.imd_station_id)

    @lru_cache(maxsize=1)
    def _city_payload(self) -> dict[str, Any]:
        if not self.configured:
            raise ProviderUnavailable("IMD_API_KEY and IMD_STATION_ID are required")
        headers = {settings.imd_api_key_header: settings.imd_api_key or ""}
        response = requests.get(
            f"{settings.imd_api_base.rstrip('/')}/cityforecastloc",
            params={"id": settings.imd_station_id},
            headers=headers,
            timeout=settings.request_timeout_seconds,
        )
        response.raise_for_status()
        payload = response.json()
        if isinstance(payload, list):
            payload = payload[0] if payload else {}
        if isinstance(payload, dict) and isinstance(payload.get("data"), list):
            payload = payload["data"][0] if payload["data"] else {}
        if not isinstance(payload, dict) or not payload:
            raise ProviderUnavailable("IMD returned no city forecast payload")
        if payload.get("error"):
            raise ProviderUnavailable(str(payload["error"]))
        return payload

    def forecast_for(self, spec: dict[str, Any], start: datetime | None = None, days: int = 6) -> list[dict[str, Any]]:
        payload = self._city_payload()
        anchor = (start or datetime.utcnow()).replace(hour=12, minute=0, second=0, microsecond=0)
        humidity = _number(payload.get("Relative_Humidity_at_0830"), spec["humidity"])
        current_wind = _number(payload.get("Wind_Speed"), spec["wind_speed"])
        rainfall = _number(payload.get("Past_24_hrs_Rainfall"), 0.0)
        results: list[dict[str, Any]] = []
        for day in range(days):
            max_key = "Todays_Forecast_Max_Temp" if day == 0 else f"Day_{day + 1}_Max_Temp"
            temperature = _number(payload.get(max_key), spec["temperature"])
            results.append(
                {
                    "forecast_time": anchor + timedelta(days=day),
                    "day_offset": day,
                    "temperature": temperature,
                    "humidity": humidity,
                    "wind_speed": max(0.1, current_wind),
                    "solar_radiation": None,
                    "rainfall": rainfall if day == 0 else 0.0,
                    "source": f"{self.label} — station {settings.imd_station_id}; humidity/wind held at latest available station context",
                    "is_estimated": True,
                }
            )
        return results
