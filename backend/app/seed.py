from __future__ import annotations

from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .config import settings
from .models import (
    Demographics,
    HealthHistory,
    HeatActionRecommendation,
    RiskPrediction,
    SystemEvent,
    ThermalMetric,
    Ward,
    WeatherForecast,
    WeatherObservation,
)
from .providers import DemoWeatherProvider, IMDWeatherProvider
from .recommendations import recommendations_for
from .risk_engine import calculate_health_risk
from .thermal_engine import calculate_thermal_stress
from .vulnerability import calculate_pvi


def _geometry_for_db(geojson: dict):
    if not settings.postgis_enabled:
        return geojson
    from geoalchemy2.shape import from_shape
    from shapely.geometry import shape

    return from_shape(shape(geojson), srid=4326)


def _selected_provider():
    if settings.weather_provider == "imd":
        return IMDWeatherProvider()
    return DemoWeatherProvider()


def seed_demo_data(db: Session) -> None:
    ward_count = db.scalar(select(func.count(Ward.id))) or 0
    city = db.scalar(select(Ward.city).limit(1))
    if ward_count == 24 and city == "Mumbai":
        return
    if ward_count:
        raise RuntimeError(
            "The selected database contains a different seed schema. Use the default heatshield_ops.db or migrate the database explicitly."
        )

    demo_provider = DemoWeatherProvider()
    requested_provider = _selected_provider()
    specs = demo_provider.ward_specs()
    now = datetime.utcnow().replace(hour=12, minute=0, second=0, microsecond=0)
    fallback_reason: str | None = None

    provider_forecasts: dict[str, list[dict]] = {}
    if requested_provider.name == "imd":
        try:
            for spec in specs:
                provider_forecasts[spec["id"]] = requested_provider.forecast_for(spec, start=now, days=6)
        except Exception as exc:
            provider_forecasts.clear()
            fallback_reason = f"{type(exc).__name__}: {exc}"

    for spec in specs:
        ward = Ward(
            id=spec["id"],
            code=spec["code"],
            name=spec["name"],
            locality=spec["locality"],
            city=settings.demo_city,
            state=settings.demo_state,
            population=spec["population"],
            geometry=_geometry_for_db(spec["geometry"]),
            geometry_source=spec["geometry_source"],
            is_demo=False,
        )
        db.add(ward)
        db.flush()

        db.add(
            Demographics(
                ward_id=ward.id,
                elderly_pct=spec["elderly_pct"],
                children_pct=spec["children_pct"],
                outdoor_worker_pct=spec["outdoor_worker_pct"],
                population_density=spec["population_density"],
                slum_indicator=spec["slum_indicator"],
                green_cover_pct=spec["green_cover_pct"],
                historical_hospitalization_rate=spec["hospitalization_rate"],
                historical_mortality_rate=spec["mortality_rate"],
                source="DEMO FALLBACK — deterministic vulnerability exercise; no Census-to-BMC administrative ward crosswalk loaded",
            )
        )
        db.add(
            HealthHistory(
                ward_id=ward.id,
                period="DEMO EXERCISE BASELINE",
                heat_hospitalizations=spec["hospitalization_rate"],
                heat_mortality=spec["mortality_rate"],
                population_at_risk=spec["population"],
                source="DEMO FALLBACK — no authorized IHIP/NPCCHH outcome feed",
                is_validated=False,
            )
        )

        if provider_forecasts:
            forecast_rows = provider_forecasts[spec["id"]]
        else:
            forecast_rows = demo_provider.forecast_for(spec, start=now, days=6)

        pvi = calculate_pvi(
            spec["elderly_pct"],
            spec["children_pct"],
            spec["outdoor_worker_pct"],
            spec["population_density"],
            spec["slum_indicator"],
            spec["green_cover_pct"],
            spec["hospitalization_rate"],
            spec["mortality_rate"],
        )
        current_category = "CAUTION"
        current_actions = recommendations_for("CAUTION", ward.name)["actions"]
        for row in forecast_rows:
            row_source = row["source"]
            db.add(
                WeatherForecast(
                    ward_id=ward.id,
                    source=row_source,
                    **{
                        key: row[key]
                        for key in (
                            "forecast_time",
                            "day_offset",
                            "temperature",
                            "humidity",
                            "wind_speed",
                            "solar_radiation",
                            "rainfall",
                            "is_estimated",
                        )
                    },
                )
            )
            if row["day_offset"] == 0:
                db.add(
                    WeatherObservation(
                        ward_id=ward.id,
                        timestamp=row["forecast_time"],
                        temperature=row["temperature"],
                        humidity=row["humidity"],
                        wind_speed=row["wind_speed"],
                        solar_radiation=row["solar_radiation"],
                        rainfall=row["rainfall"],
                        source=row_source,
                        is_estimated=row["is_estimated"],
                    )
                )

            thermal = calculate_thermal_stress(
                temperature=row["temperature"],
                humidity=row["humidity"],
                wind_speed=row["wind_speed"],
                solar_radiation=row["solar_radiation"],
                rainfall=row["rainfall"],
            )
            risk = calculate_health_risk(
                temperature=row["temperature"],
                humidity=row["humidity"],
                heat_index=thermal["heat_index"],
                wbgt=thermal["wbgt"],
                utci=thermal["utci"],
                htsi=thermal["htsi"],
                vulnerability_index=pvi["vulnerability_index"],
                population_density=spec["population_density"],
                elderly_pct=spec["elderly_pct"],
                outdoor_worker_pct=spec["outdoor_worker_pct"],
                historical_hospitalization_rate=spec["hospitalization_rate"],
                historical_mortality_rate=spec["mortality_rate"],
            )
            if row["day_offset"] == 0:
                current_category = thermal["risk_category"]
                current_actions = recommendations_for(current_category, ward.name, thermal["contributing_indicators"])["actions"]
            db.add(
                ThermalMetric(
                    ward_id=ward.id,
                    timestamp=row["forecast_time"],
                    heat_index=thermal["heat_index"],
                    wbgt=thermal["wbgt"],
                    utci=thermal["utci"],
                    htsi=thermal["htsi"],
                    risk_category=thermal["risk_category"],
                    source=row_source,
                    is_estimated=True,
                )
            )
            db.add(
                RiskPrediction(
                    ward_id=ward.id,
                    forecast_time=row["forecast_time"],
                    day_offset=row["day_offset"],
                    heat_index=thermal["heat_index"],
                    wbgt=thermal["wbgt"],
                    utci=thermal["utci"],
                    htsi=thermal["htsi"],
                    vulnerability_index=pvi["vulnerability_index"],
                    health_risk=risk["health_risk"],
                    hospitalization_risk=risk["hospitalization_risk"],
                    mortality_risk=risk["mortality_risk"],
                    confidence=risk["confidence"],
                    risk_category=thermal["risk_category"],
                    explanation=thermal["contributing_indicators"] + pvi["reasons"],
                    source="Prototype risk estimate — no validated ward-level health outcome dataset loaded",
                )
            )
        db.add(
            HeatActionRecommendation(
                ward_id=ward.id,
                risk_category=current_category,
                actions=current_actions,
                source="NCDC/MoHFW-aligned deterministic response rules",
            )
        )

    db.add(
        SystemEvent(
            severity="INFO",
            category="GEOSPATIAL_INGEST",
            source="BMC boundary snapshot",
            message="Loaded 24 Mumbai administrative ward MultiPolygons from the bundled DataMeet CC BY 4.0 snapshot.",
            payload={"ward_count": 24, "geometry": "MultiPolygon", "crs": "EPSG:4326"},
        )
    )
    if provider_forecasts:
        db.add(
            SystemEvent(
                severity="INFO",
                category="WEATHER_INGEST",
                source="IMD",
                message="Loaded the configured IMD city forecast; station-scale values are marked as estimated at ward level.",
                payload={"station_id": settings.imd_station_id},
            )
        )
    else:
        db.add(
            SystemEvent(
                severity="WARNING",
                category="WEATHER_FALLBACK",
                source="Provider registry",
                message="IMD weather was unavailable or not configured. Mumbai heat-event demo weather is active and visibly labelled.",
                payload={"reason": fallback_reason or "WEATHER_PROVIDER=demo"},
            )
        )
    db.add(
        SystemEvent(
            severity="WARNING",
            category="DATA_QUALITY",
            source="Health-risk engine",
            message="No validated IHIP/NPCCHH ward-level outcome feed is loaded; health outputs remain prototype estimates.",
            payload={"validated_health_data": False},
        )
    )
    db.commit()
