from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .config import settings
from .database import Base


if settings.postgis_enabled:
    from geoalchemy2 import Geometry

    GEOMETRY_TYPE = Geometry("MULTIPOLYGON", srid=4326, spatial_index=True)
else:
    GEOMETRY_TYPE = JSON


class Ward(Base):
    __tablename__ = "wards"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    code: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    locality: Mapped[str] = mapped_column(String(180), nullable=False)
    city: Mapped[str] = mapped_column(String(120), nullable=False)
    state: Mapped[str] = mapped_column(String(120), nullable=False)
    population: Mapped[int] = mapped_column(Integer, nullable=False)
    geometry: Mapped[object] = mapped_column(GEOMETRY_TYPE, nullable=False)
    geometry_source: Mapped[str] = mapped_column(String(240), nullable=False)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class Demographics(Base):
    __tablename__ = "demographics"
    __table_args__ = (UniqueConstraint("ward_id", name="uq_demographics_ward"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ward_id: Mapped[str] = mapped_column(ForeignKey("wards.id", ondelete="CASCADE"), index=True)
    elderly_pct: Mapped[float] = mapped_column(Float, nullable=False)
    children_pct: Mapped[float] = mapped_column(Float, nullable=False)
    outdoor_worker_pct: Mapped[float] = mapped_column(Float, nullable=False)
    population_density: Mapped[float] = mapped_column(Float, nullable=False)
    slum_indicator: Mapped[float] = mapped_column(Float, nullable=False)
    green_cover_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    historical_hospitalization_rate: Mapped[float] = mapped_column(Float, nullable=False)
    historical_mortality_rate: Mapped[float] = mapped_column(Float, nullable=False)
    source: Mapped[str] = mapped_column(String(120), default="Synthetic demonstration profile", nullable=False)


class HealthHistory(Base):
    __tablename__ = "health_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ward_id: Mapped[str] = mapped_column(ForeignKey("wards.id", ondelete="CASCADE"), index=True)
    period: Mapped[str] = mapped_column(String(40), nullable=False)
    heat_hospitalizations: Mapped[float] = mapped_column(Float, nullable=False)
    heat_mortality: Mapped[float] = mapped_column(Float, nullable=False)
    population_at_risk: Mapped[int] = mapped_column(Integer, nullable=False)
    source: Mapped[str] = mapped_column(String(120), default="Synthetic demonstration profile", nullable=False)
    is_validated: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class WeatherObservation(Base):
    __tablename__ = "weather_observations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ward_id: Mapped[str] = mapped_column(ForeignKey("wards.id", ondelete="CASCADE"), index=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    temperature: Mapped[float] = mapped_column(Float, nullable=False)
    humidity: Mapped[float] = mapped_column(Float, nullable=False)
    wind_speed: Mapped[float] = mapped_column(Float, nullable=False)
    solar_radiation: Mapped[float | None] = mapped_column(Float, nullable=True)
    rainfall: Mapped[float | None] = mapped_column(Float, nullable=True)
    source: Mapped[str] = mapped_column(String(80), nullable=False)
    is_estimated: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class WeatherForecast(Base):
    __tablename__ = "weather_forecasts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ward_id: Mapped[str] = mapped_column(ForeignKey("wards.id", ondelete="CASCADE"), index=True)
    forecast_time: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    day_offset: Mapped[int] = mapped_column(Integer, nullable=False)
    temperature: Mapped[float] = mapped_column(Float, nullable=False)
    humidity: Mapped[float] = mapped_column(Float, nullable=False)
    wind_speed: Mapped[float] = mapped_column(Float, nullable=False)
    solar_radiation: Mapped[float | None] = mapped_column(Float, nullable=True)
    rainfall: Mapped[float | None] = mapped_column(Float, nullable=True)
    source: Mapped[str] = mapped_column(String(80), nullable=False)
    is_estimated: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class ThermalMetric(Base):
    __tablename__ = "thermal_metrics"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ward_id: Mapped[str] = mapped_column(ForeignKey("wards.id", ondelete="CASCADE"), index=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    heat_index: Mapped[float] = mapped_column(Float, nullable=False)
    wbgt: Mapped[float] = mapped_column(Float, nullable=False)
    utci: Mapped[float] = mapped_column(Float, nullable=False)
    htsi: Mapped[float] = mapped_column(Float, nullable=False)
    risk_category: Mapped[str] = mapped_column(String(24), nullable=False)
    source: Mapped[str] = mapped_column(String(80), nullable=False)
    is_estimated: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class RiskPrediction(Base):
    __tablename__ = "risk_predictions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ward_id: Mapped[str] = mapped_column(ForeignKey("wards.id", ondelete="CASCADE"), index=True)
    forecast_time: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    day_offset: Mapped[int] = mapped_column(Integer, nullable=False)
    heat_index: Mapped[float] = mapped_column(Float, nullable=False)
    wbgt: Mapped[float] = mapped_column(Float, nullable=False)
    utci: Mapped[float] = mapped_column(Float, nullable=False)
    htsi: Mapped[float] = mapped_column(Float, nullable=False)
    vulnerability_index: Mapped[float] = mapped_column(Float, nullable=False)
    health_risk: Mapped[float] = mapped_column(Float, nullable=False)
    hospitalization_risk: Mapped[str] = mapped_column(String(24), nullable=False)
    mortality_risk: Mapped[str] = mapped_column(String(24), nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    risk_category: Mapped[str] = mapped_column(String(24), nullable=False)
    explanation: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    source: Mapped[str] = mapped_column(String(100), nullable=False)


class Alert(Base):
    __tablename__ = "alerts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ward_id: Mapped[str | None] = mapped_column(ForeignKey("wards.id", ondelete="SET NULL"), nullable=True, index=True)
    audience: Mapped[str] = mapped_column(String(40), nullable=False)
    channel: Mapped[str] = mapped_column(String(40), nullable=False)
    title: Mapped[str] = mapped_column(String(180), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    generated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    status: Mapped[str] = mapped_column(String(40), default="SIMULATED", nullable=False)
    simulated: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    payload: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)


class HeatActionRecommendation(Base):
    __tablename__ = "heat_action_recommendations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ward_id: Mapped[str] = mapped_column(ForeignKey("wards.id", ondelete="CASCADE"), index=True)
    risk_category: Mapped[str] = mapped_column(String(24), nullable=False)
    actions: Mapped[list] = mapped_column(JSON, nullable=False)
    generated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    source: Mapped[str] = mapped_column(String(100), nullable=False)


class ResponseTask(Base):
    __tablename__ = "response_tasks"
    __table_args__ = (UniqueConstraint("ward_id", "task_key", name="uq_response_task_ward_key"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ward_id: Mapped[str] = mapped_column(ForeignKey("wards.id", ondelete="CASCADE"), index=True)
    task_key: Mapped[str] = mapped_column(String(80), nullable=False)
    status: Mapped[str] = mapped_column(String(24), default="PENDING", nullable=False)
    operator: Mapped[str] = mapped_column(String(120), default="Local operator", nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class SystemEvent(Base):
    __tablename__ = "system_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    severity: Mapped[str] = mapped_column(String(24), default="INFO", nullable=False)
    category: Mapped[str] = mapped_column(String(48), nullable=False)
    source: Mapped[str] = mapped_column(String(120), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    payload: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
