from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str
    service: str
    database: str
    weather_provider: str
    weather_status: str
    demo_mode: bool
    ward_count: int
    alert_provider: str


class ThermalStressRequest(BaseModel):
    temperature: float = Field(..., ge=-80, le=70)
    humidity: float = Field(..., ge=0, le=100)
    wind_speed: float = Field(0, ge=0, le=100)
    solar_radiation: float | None = Field(None, ge=0, le=2000)
    rainfall: float | None = Field(None, ge=0)


class RiskRequest(ThermalStressRequest):
    vulnerability_index: float = Field(..., ge=0, le=100)
    population_density: float | None = Field(None, ge=0)
    elderly_pct: float | None = Field(None, ge=0, le=100)
    outdoor_worker_pct: float | None = Field(None, ge=0, le=100)
    historical_hospitalization_rate: float | None = Field(None, ge=0)
    historical_mortality_rate: float | None = Field(None, ge=0)


class AlertSimulationRequest(BaseModel):
    ward_id: str
    audience: str = "Citizen"
    channel: str = "SMS"
    forecast_day: int = Field(1, ge=0, le=5)


class AlertSendRequest(AlertSimulationRequest):
    recipient: str = Field(..., min_length=8, max_length=18)
    confirm: bool = False
    confirmation_text: str = ""


class AlertSimulationResponse(BaseModel):
    id: int | None = None
    ward_id: str
    ward_name: str
    risk_category: str
    generated_at: str
    simulated: bool
    status: str
    provider: str = "local_simulation"
    recipient: str | None = None
    previews: dict[str, Any]
    drivers: list[str]


class ActionPlanResponse(BaseModel):
    ward: str
    risk_category: str
    summary: str
    actions: list[dict[str, Any]]
    audiences: list[str]
    drivers: list[str]
    source: str
    source_url: str
    generated_at: str


class TaskStatusRequest(BaseModel):
    status: str = Field(..., pattern="^(PENDING|ACKNOWLEDGED|IN_PROGRESS|COMPLETE)$")
    operator: str = Field("Local operator", min_length=2, max_length=120)


class CityFilter(BaseModel):
    city: str | None = None
    forecast_day: int = Field(0, ge=0, le=5)
