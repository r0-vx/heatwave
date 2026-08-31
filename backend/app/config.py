from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv


BACKEND_DIR = Path(__file__).resolve().parents[1]
load_dotenv(BACKEND_DIR.parent / ".env")
load_dotenv(BACKEND_DIR / ".env")


def _origins(value: str | None) -> list[str]:
    if not value:
        return ["http://localhost:5173", "http://127.0.0.1:5173"]
    return [item.strip() for item in value.split(",") if item.strip()]


def _bool(value: str | None, default: bool = False) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    app_name: str = os.getenv("APP_NAME", "HeatShield Mumbai Operations API")
    database_url: str = os.getenv("DATABASE_URL", "sqlite:///./heatshield_ops.db")
    weather_provider: str = os.getenv("WEATHER_PROVIDER", "imd").lower()
    cors_origins: tuple[str, ...] = tuple(_origins(os.getenv("CORS_ORIGINS")))
    demo_city: str = os.getenv("DEMO_CITY", "Mumbai")
    demo_state: str = os.getenv("DEMO_STATE", "Maharashtra")
    postgis_enabled: bool = os.getenv("DATABASE_URL", "sqlite:///./heatshield_ops.db").startswith(
        ("postgresql://", "postgresql+psycopg://", "postgresql+asyncpg://")
    )
    imd_api_base: str = os.getenv("IMD_API_BASE", "https://api.imd.gov.in/api/v1")
    imd_api_key: str | None = os.getenv("IMD_API_KEY")
    imd_api_key_header: str = os.getenv("IMD_API_KEY_HEADER", "x-api-key")
    imd_station_id: str | None = os.getenv("IMD_STATION_ID")
    mosdac_token: str | None = os.getenv("MOSDAC_TOKEN")
    request_timeout_seconds: float = float(os.getenv("REQUEST_TIMEOUT_SECONDS", "8"))
    alert_provider: str = os.getenv("ALERT_PROVIDER", "simulation").lower()
    sms_test_mode: bool = _bool(os.getenv("SMS_TEST_MODE"), default=False)
    test_phone_number: str | None = os.getenv("TEST_PHONE_NUMBER")
    msg91_auth_key: str | None = os.getenv("MSG91_AUTH_KEY")
    msg91_template_id: str | None = os.getenv("MSG91_TEMPLATE_ID")
    msg91_sender_id: str | None = os.getenv("MSG91_SENDER_ID")
    msg91_flow_url: str = os.getenv("MSG91_FLOW_URL", "https://api.msg91.com/api/v5/flow/")


settings = Settings()
