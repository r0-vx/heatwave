from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Demographics, HealthHistory, RiskPrediction, Ward, WeatherForecast, WeatherObservation
from ..recommendations import recommendations_for
from ..risk_engine import calculate_health_risk
from ..services.serialization import geometry_to_geojson
from ..thermal_engine import calculate_thermal_stress
from ..vulnerability import calculate_pvi


def _safe_round(value: float | None, digits: int = 1) -> float | None:
    return None if value is None else round(float(value), digits)


def get_ward_context(db: Session, ward_id: str) -> tuple[Ward, Demographics, HealthHistory | None]:
    ward = db.get(Ward, ward_id)
    if ward is None:
        raise KeyError(ward_id)
    demographics = db.scalar(select(Demographics).where(Demographics.ward_id == ward_id))
    if demographics is None:
        raise KeyError(f"demographics:{ward_id}")
    history = db.scalar(select(HealthHistory).where(HealthHistory.ward_id == ward_id).order_by(HealthHistory.id.desc()))
    return ward, demographics, history


def get_prediction(db: Session, ward_id: str, day_offset: int = 0) -> RiskPrediction:
    prediction = db.scalar(
        select(RiskPrediction).where(RiskPrediction.ward_id == ward_id, RiskPrediction.day_offset == day_offset).order_by(RiskPrediction.id.desc())
    )
    if prediction is None:
        raise KeyError(f"prediction:{ward_id}:{day_offset}")
    return prediction


def get_weather_for_prediction(db: Session, ward_id: str, day_offset: int = 0) -> WeatherForecast:
    forecast = db.scalar(
        select(WeatherForecast).where(WeatherForecast.ward_id == ward_id, WeatherForecast.day_offset == day_offset).order_by(WeatherForecast.id.desc())
    )
    if forecast is None:
        raise KeyError(f"forecast:{ward_id}:{day_offset}")
    return forecast


def pvi_for_demographics(demographics: Demographics) -> dict[str, Any]:
    return calculate_pvi(
        demographics.elderly_pct, demographics.children_pct, demographics.outdoor_worker_pct,
        demographics.population_density, demographics.slum_indicator, demographics.green_cover_pct,
        demographics.historical_hospitalization_rate, demographics.historical_mortality_rate,
    )


def risk_for_prediction(demographics: Demographics, forecast: WeatherForecast, prediction: RiskPrediction) -> dict[str, Any]:
    return calculate_health_risk(
        temperature=forecast.temperature, humidity=forecast.humidity, heat_index=prediction.heat_index,
        wbgt=prediction.wbgt, utci=prediction.utci, htsi=prediction.htsi, vulnerability_index=prediction.vulnerability_index,
        population_density=demographics.population_density, elderly_pct=demographics.elderly_pct,
        outdoor_worker_pct=demographics.outdoor_worker_pct, historical_hospitalization_rate=demographics.historical_hospitalization_rate,
        historical_mortality_rate=demographics.historical_mortality_rate,
    )


def ward_summary(db: Session, ward: Ward, day_offset: int = 0, include_geometry: bool = False) -> dict[str, Any]:
    demographics = db.scalar(select(Demographics).where(Demographics.ward_id == ward.id))
    forecast = get_weather_for_prediction(db, ward.id, day_offset)
    prediction = get_prediction(db, ward.id, day_offset)
    pvi = pvi_for_demographics(demographics)
    recommendation = recommendations_for(prediction.risk_category, ward.name, prediction.explanation)
    weather_demo = forecast.source.startswith("Mumbai heat-event demo")
    demographics_demo = demographics.source.startswith("DEMO FALLBACK")
    result = {
        "id": ward.id, "code": ward.code, "name": ward.name, "locality": ward.locality,
        "city": ward.city, "state": ward.state, "population": ward.population,
        "population_source": "DEMO FALLBACK — deterministic exercise value, not an official ward population",
        "geometry_source": ward.geometry_source, "temperature": _safe_round(forecast.temperature, 1),
        "humidity": _safe_round(forecast.humidity, 0), "wind_speed": _safe_round(forecast.wind_speed, 1),
        "solar_radiation": _safe_round(forecast.solar_radiation, 0), "rainfall": _safe_round(forecast.rainfall, 1),
        "forecast_time": forecast.forecast_time.isoformat(), "day_offset": day_offset,
        "heat_index": _safe_round(prediction.heat_index), "wbgt": _safe_round(prediction.wbgt), "utci": _safe_round(prediction.utci),
        "htsi": _safe_round(prediction.htsi), "risk_category": prediction.risk_category,
        "vulnerability_index": _safe_round(pvi["vulnerability_index"]), "vulnerability_reasons": pvi["reasons"],
        "health_risk": _safe_round(prediction.health_risk), "hospitalization_risk": prediction.hospitalization_risk,
        "mortality_risk": prediction.mortality_risk, "confidence": _safe_round(prediction.confidence),
        "explanation": prediction.explanation, "major_vulnerable_group": _major_group(demographics),
        "intervention": recommendation["actions"][0]["title"], "source": forecast.source,
        "weather_is_estimated": forecast.is_estimated, "is_demo": weather_demo or demographics_demo,
        "data_flags": {
            "geometry_demo": ward.is_demo,
            "weather_demo": weather_demo,
            "demographics_demo": demographics_demo,
            "health_outcomes_validated": False,
        },
    }
    if include_geometry:
        result["geometry"] = geometry_to_geojson(ward.geometry)
    return result


def _major_group(demographics: Demographics) -> str:
    candidates = {
        "Elderly residents": demographics.elderly_pct,
        "Children": demographics.children_pct,
        "Outdoor workers": demographics.outdoor_worker_pct,
        "Dense settlements": demographics.population_density / 1000.0,
    }
    top = sorted(candidates.items(), key=lambda item: item[1], reverse=True)[:2]
    return " + ".join(item[0] for item in top)


def ward_detail(db: Session, ward_id: str, day_offset: int = 0) -> dict[str, Any]:
    ward, demographics, history = get_ward_context(db, ward_id)
    current = ward_summary(db, ward, day_offset, include_geometry=True)
    pvi = pvi_for_demographics(demographics)
    current["demographics"] = {
        "elderly_pct": demographics.elderly_pct, "children_pct": demographics.children_pct,
        "outdoor_worker_pct": demographics.outdoor_worker_pct, "population_density": demographics.population_density,
        "slum_indicator": demographics.slum_indicator, "green_cover_pct": demographics.green_cover_pct,
        "historical_hospitalization_rate": demographics.historical_hospitalization_rate,
        "historical_mortality_rate": demographics.historical_mortality_rate, "source": demographics.source,
    }
    current["pvi_components"] = pvi["components"]
    current["health_history"] = None if history is None else {
        "period": history.period, "heat_hospitalizations": history.heat_hospitalizations,
        "heat_mortality": history.heat_mortality, "population_at_risk": history.population_at_risk,
        "source": history.source, "is_validated": history.is_validated,
    }
    return current


def ward_forecast(db: Session, ward_id: str) -> list[dict[str, Any]]:
    ward, demographics, _ = get_ward_context(db, ward_id)
    return [ward_summary(db, ward, day) for day in range(6)]


def all_wards(db: Session, day_offset: int = 0) -> list[dict[str, Any]]:
    wards = list(db.scalars(select(Ward).order_by(Ward.id)))
    return [ward_summary(db, ward, day_offset) for ward in wards]


def ward_feature_collection(db: Session) -> dict[str, Any]:
    wards = list(db.scalars(select(Ward).order_by(Ward.code)))
    from shapely.geometry import shape

    features = []
    for ward in wards:
        geometry = geometry_to_geojson(ward.geometry)
        label_point = shape(geometry).representative_point()
        features.append(
            {
                "type": "Feature",
                "id": ward.id,
                "properties": {
                    "id": ward.id,
                    "code": ward.code,
                    "name": ward.name,
                    "locality": ward.locality,
                    "label_lon": round(label_point.x, 6),
                    "label_lat": round(label_point.y, 6),
                },
                "geometry": geometry,
            }
        )
    return {
        "type": "FeatureCollection",
        "properties": {
            "name": "Mumbai BMC administrative wards",
            "crs": "EPSG:4326",
            "feature_count": len(wards),
            "source": wards[0].geometry_source if wards else None,
        },
        "features": features,
    }


def dashboard_forecast(db: Session) -> list[dict[str, Any]]:
    wards = list(db.scalars(select(Ward).order_by(Ward.id)))
    days = []
    for day in range(6):
        summaries = [ward_summary(db, ward, day) for ward in wards]
        hottest = max(summaries, key=lambda item: item["htsi"])
        avg = sum(item["htsi"] for item in summaries) / max(1, len(summaries))
        high_count = sum(item["risk_category"] in {"HIGH", "DANGEROUS", "EXTREME"} for item in summaries)
        days.append({
            "day_offset": day, "label": "TODAY" if day == 0 else f"DAY +{day}",
            "date": hottest["forecast_time"], "max_temperature": max(item["temperature"] for item in summaries),
            "average_htsi": round(avg, 1), "max_htsi": hottest["htsi"], "risk_category": hottest["risk_category"],
            "highest_risk_ward": hottest["name"], "high_risk_ward_count": high_count,
        })
    return days
