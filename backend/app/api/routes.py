from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from ..alerts import AlertDeliveryError, LocalAlertSimulator, Msg91TestProvider, alert_provider_status, audience_catalog
from ..config import settings
from ..database import get_db
from ..models import Alert, ResponseTask, SystemEvent, Ward
from ..recommendations import recommendations_for
from ..risk_engine import calculate_health_risk
from ..schemas import (
    ActionPlanResponse,
    AlertSendRequest,
    AlertSimulationRequest,
    AlertSimulationResponse,
    HealthResponse,
    RiskRequest,
    TaskStatusRequest,
    ThermalStressRequest,
)
from ..seed import seed_demo_data
from ..services.queries import all_wards, dashboard_forecast, ward_detail, ward_feature_collection, ward_forecast
from ..source_catalog import component_statuses, source_statuses
from ..thermal_engine import calculate_thermal_stress


router = APIRouter(prefix="/api")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _ensure_seeded(db: Session) -> None:
    seed_demo_data(db)


def _not_found(ward_id: str) -> HTTPException:
    return HTTPException(status_code=404, detail=f"Ward {ward_id} was not found")


def _forecast_label(day: int) -> str:
    return "today" if day == 0 else "tomorrow" if day == 1 else f"day +{day}"


def _alert_context(db: Session, request: AlertSimulationRequest) -> tuple[dict[str, Any], dict[str, Any]]:
    try:
        detail = ward_detail(db, request.ward_id, request.forecast_day)
    except KeyError:
        raise _not_found(request.ward_id) from None
    forecast_rows = ward_forecast(db, request.ward_id)
    baseline = forecast_rows[0]
    comparison = detail if request.forecast_day > 0 else forecast_rows[min(1, len(forecast_rows) - 1)]
    difference = comparison["htsi"] - baseline["htsi"]
    escalation_trend = "Increasing" if difference > 1 else "Decreasing" if difference < -1 else "Stable"
    plan = recommendations_for(detail["risk_category"], detail["name"], detail["vulnerability_reasons"])
    preview = LocalAlertSimulator().simulate(
        ward_name=detail["name"],
        ward_id=detail["id"],
        risk_category=detail["risk_category"],
        htsi=detail["htsi"],
        health_risk=detail["health_risk"],
        wbgt=detail["wbgt"],
        vulnerability_index=detail["vulnerability_index"],
        audience=request.audience,
        vulnerability_reasons=detail["vulnerability_reasons"],
        forecast_label=_forecast_label(request.forecast_day),
        population_at_risk=detail.get("health_history", {}).get("population_at_risk") if detail.get("health_history") else None,
        escalation_trend=escalation_trend,
        major_vulnerable_group=detail["major_vulnerable_group"],
        recommendations=[item["title"] for item in plan["actions"]],
    )
    return detail, preview


@router.get("/health", response_model=HealthResponse, tags=["system"])
def health(db: Session = Depends(get_db)) -> dict[str, Any]:
    database = "connected"
    ward_count = 0
    try:
        _ensure_seeded(db)
        ward_count = int(db.scalar(select(func.count(Ward.id))) or 0)
    except Exception as exc:
        database = f"unavailable: {type(exc).__name__}"
    imd = next(source for source in source_statuses() if source["id"] == "imd-weather")
    demo_mode = not imd["in_use"]
    return {
        "status": "ok" if database == "connected" else "degraded",
        "service": settings.app_name,
        "database": database,
        "weather_provider": settings.weather_provider,
        "weather_status": imd["status"],
        "demo_mode": demo_mode,
        "ward_count": ward_count,
        "alert_provider": alert_provider_status()["provider"],
    }


@router.get("/system/status", tags=["system"])
def system_status(db: Session = Depends(get_db)) -> dict[str, Any]:
    _ensure_seeded(db)
    return {
        "as_of": _now(),
        "mode": "LOCAL MUNICIPAL OPERATIONS PROTOTYPE",
        "city": "Mumbai",
        "components": component_statuses(),
        "ward_count": int(db.scalar(select(func.count(Ward.id))) or 0),
        "active_fallbacks": [source["name"] for source in source_statuses() if source.get("fallback") and not source.get("in_use")],
    }


@router.get("/sources", tags=["transparency"])
def sources() -> dict[str, Any]:
    entries = source_statuses()
    return {
        "as_of": _now(),
        "sources": entries,
        "connected": sum(source["status"] in {"CONNECTED", "CONFIGURED", "TEST_READY"} for source in entries),
        "attention": sum(source["status"] not in {"CONNECTED", "CONFIGURED", "TEST_READY"} for source in entries),
    }


@router.get("/events", tags=["system"])
def events(limit: int = Query(30, ge=1, le=100), db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    _ensure_seeded(db)
    rows = list(db.scalars(select(SystemEvent).order_by(desc(SystemEvent.timestamp), desc(SystemEvent.id)).limit(limit)))
    return [
        {
            "id": row.id,
            "timestamp": row.timestamp.isoformat() + "Z",
            "severity": row.severity,
            "category": row.category,
            "source": row.source,
            "message": row.message,
            "payload": row.payload,
        }
        for row in rows
    ]


@router.post("/system/refresh", tags=["system"])
def refresh_source_status(db: Session = Depends(get_db)) -> dict[str, Any]:
    _ensure_seeded(db)
    imd = next(source for source in source_statuses() if source["id"] == "imd-weather")
    message = (
        "Provider status refreshed. IMD is configured; restart or run an ingestion job to replace the current persisted forecast."
        if imd["status"] == "CONFIGURED"
        else "Provider status refreshed. IMD remains unavailable; the labelled Mumbai demo-weather scenario was retained."
    )
    event = SystemEvent(
        severity="INFO" if imd["status"] == "CONFIGURED" else "WARNING",
        category="SOURCE_REFRESH",
        source="Operator console",
        message=message,
        payload={"imd_status": imd["status"], "data_mutated": False},
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return {"status": "REFRESHED", "message": message, "event_id": event.id, "data_mutated": False, "as_of": _now()}


@router.get("/map/wards", tags=["wards"])
def ward_boundaries(db: Session = Depends(get_db)) -> dict[str, Any]:
    _ensure_seeded(db)
    return ward_feature_collection(db)


@router.get("/wards", tags=["wards"])
def wards(
    risk_level: str | None = Query(None),
    forecast_day: int = Query(0, ge=0, le=5),
    min_vulnerability: float | None = Query(None, ge=0, le=100),
    db: Session = Depends(get_db),
) -> list[dict[str, Any]]:
    _ensure_seeded(db)
    rows = all_wards(db, forecast_day)
    if risk_level:
        rows = [row for row in rows if row["risk_category"] == risk_level.upper()]
    if min_vulnerability is not None:
        rows = [row for row in rows if row["vulnerability_index"] >= min_vulnerability]
    return rows


@router.get("/wards/{ward_id}", tags=["wards"])
def ward(ward_id: str, forecast_day: int = Query(0, ge=0, le=5), db: Session = Depends(get_db)) -> dict[str, Any]:
    _ensure_seeded(db)
    try:
        return ward_detail(db, ward_id, forecast_day)
    except KeyError:
        raise _not_found(ward_id) from None


@router.get("/wards/{ward_id}/current", tags=["wards"])
def ward_current(ward_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    return ward(ward_id, 0, db)


@router.get("/wards/{ward_id}/forecast", tags=["forecast"])
def ward_forecast_route(ward_id: str, db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    _ensure_seeded(db)
    try:
        return ward_forecast(db, ward_id)
    except KeyError:
        raise _not_found(ward_id) from None


@router.get("/wards/{ward_id}/risk", tags=["risk"])
def ward_risk(ward_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    _ensure_seeded(db)
    try:
        detail = ward_detail(db, ward_id, 0)
        detail["forecast"] = ward_forecast(db, ward_id)
        return detail
    except KeyError:
        raise _not_found(ward_id) from None


@router.get("/dashboard/summary", tags=["dashboard"])
def dashboard_summary(city: str | None = Query(None), db: Session = Depends(get_db)) -> dict[str, Any]:
    _ensure_seeded(db)
    rows = all_wards(db, 0)
    if city:
        rows = [row for row in rows if row["city"].lower() == city.lower()]
    if not rows:
        raise HTTPException(status_code=404, detail="No wards available for this city")
    hottest = max(rows, key=lambda item: item["htsi"])
    forecast = dashboard_forecast(db)
    high_now = sum(row["risk_category"] in {"HIGH", "DANGEROUS", "EXTREME"} for row in rows)
    alerts = [
        {
            "severity": "ACTION" if high_now else "INFO",
            "title": f"{high_now} wards require enhanced review in the current layer",
            "detail": "Open the ward drawer to inspect drivers and assign the first response task.",
        },
        {
            "severity": "WARNING",
            "title": "IMD primary feed not active" if hottest["data_flags"]["weather_demo"] else "IMD city forecast active",
            "detail": "Mumbai heat-event demo weather is retained and labelled." if hottest["data_flags"]["weather_demo"] else "Station-scale values remain estimates at ward level.",
        },
        {
            "severity": "DATA",
            "title": "Validated health outcomes unavailable",
            "detail": "No IHIP/NPCCHH case, admission or mortality feed is loaded; health risk remains a prototype estimate.",
        },
    ]
    return {
        "city": rows[0]["city"],
        "state": rows[0]["state"],
        "as_of": _now(),
        "source": hottest["source"],
        "provider": settings.weather_provider,
        "is_demo": any(row["is_demo"] for row in rows),
        "metrics": {
            "temperature": hottest["temperature"],
            "heat_index": hottest["heat_index"],
            "wbgt": hottest["wbgt"],
            "utci": hottest["utci"],
            "htsi": hottest["htsi"],
            "risk_category": hottest["risk_category"],
            "vulnerability_index": hottest["vulnerability_index"],
            "health_risk": hottest["health_risk"],
            "highest_risk_ward": hottest["name"],
            "highest_risk_ward_id": hottest["id"],
            "high_risk_ward_count": high_now,
        },
        "wards": rows,
        "forecast": forecast,
        "alerts": alerts,
        "provenance": {
            "boundaries": hottest["geometry_source"],
            "weather": hottest["source"],
            "vulnerability": "DEMO FALLBACK — no verified Census administrative-ward crosswalk",
            "health": "No validated IHIP/NPCCHH ward outcome feed",
        },
        "disclaimer": "Actual BMC administrative ward polygons are loaded. Weather and vulnerability are demo fallbacks unless their source cards say connected. Health outputs are prototype risk estimates, not clinical predictions.",
    }


@router.get("/dashboard/hotspots", tags=["dashboard"])
def dashboard_hotspots(forecast_day: int = Query(0, ge=0, le=5), db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    _ensure_seeded(db)
    return sorted(all_wards(db, forecast_day), key=lambda item: (item["htsi"], item["vulnerability_index"]), reverse=True)


@router.get("/forecast", tags=["forecast"])
def forecast(forecast_day: int = Query(0, ge=0, le=5), db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    _ensure_seeded(db)
    return all_wards(db, forecast_day)


@router.get("/data-explorer", tags=["transparency"])
def data_explorer(forecast_day: int = Query(0, ge=0, le=5), db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    _ensure_seeded(db)
    return all_wards(db, forecast_day)


@router.post("/calculate/thermal-stress", tags=["calculations"])
def calculate_thermal(request: ThermalStressRequest) -> dict[str, Any]:
    return calculate_thermal_stress(**request.model_dump())


@router.post("/calculate/risk", tags=["calculations"])
def calculate_risk(request: RiskRequest) -> dict[str, Any]:
    thermal = calculate_thermal_stress(
        **request.model_dump(
            exclude={
                "vulnerability_index",
                "population_density",
                "elderly_pct",
                "outdoor_worker_pct",
                "historical_hospitalization_rate",
                "historical_mortality_rate",
            }
        )
    )
    health = calculate_health_risk(
        temperature=request.temperature,
        humidity=request.humidity,
        heat_index=thermal["heat_index"],
        wbgt=thermal["wbgt"],
        utci=thermal["utci"],
        htsi=thermal["htsi"],
        vulnerability_index=request.vulnerability_index,
        population_density=request.population_density,
        elderly_pct=request.elderly_pct,
        outdoor_worker_pct=request.outdoor_worker_pct,
        historical_hospitalization_rate=request.historical_hospitalization_rate,
        historical_mortality_rate=request.historical_mortality_rate,
    )
    return {"thermal": thermal, "health": health}


def _plan_with_status(db: Session, ward_id: str, forecast_day: int) -> dict[str, Any]:
    try:
        detail = ward_detail(db, ward_id, forecast_day)
    except KeyError:
        raise _not_found(ward_id) from None
    plan = recommendations_for(detail["risk_category"], detail["name"], detail["explanation"])
    statuses = {
        row.task_key: row
        for row in db.scalars(select(ResponseTask).where(ResponseTask.ward_id == ward_id))
    }
    for task in plan["actions"]:
        persisted = statuses.get(task["task_key"])
        if persisted:
            task["status"] = persisted.status
            task["operator"] = persisted.operator
            task["updated_at"] = persisted.updated_at.isoformat() + "Z"
    return plan


@router.get("/action-plan/{ward_id}", response_model=ActionPlanResponse, tags=["decision-support"])
def action_plan(ward_id: str, forecast_day: int = Query(0, ge=0, le=5), db: Session = Depends(get_db)) -> dict[str, Any]:
    _ensure_seeded(db)
    return _plan_with_status(db, ward_id, forecast_day)


@router.patch("/action-plan/{ward_id}/tasks/{task_key}", tags=["decision-support"])
def update_task(
    ward_id: str,
    task_key: str,
    request: TaskStatusRequest,
    forecast_day: int = Query(0, ge=0, le=5),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    _ensure_seeded(db)
    plan = _plan_with_status(db, ward_id, forecast_day)
    task = next((item for item in plan["actions"] if item["task_key"] == task_key), None)
    if task is None:
        raise HTTPException(status_code=404, detail="Task is not active in this ward/forecast action plan")
    record = db.scalar(select(ResponseTask).where(ResponseTask.ward_id == ward_id, ResponseTask.task_key == task_key))
    if record is None:
        record = ResponseTask(ward_id=ward_id, task_key=task_key, status=request.status, operator=request.operator)
        db.add(record)
    else:
        record.status = request.status
        record.operator = request.operator
        record.updated_at = datetime.utcnow()
    db.add(
        SystemEvent(
            severity="INFO",
            category="RESPONSE_TASK",
            source=request.operator,
            message=f"{task['title']} marked {request.status} for {plan['ward']}.",
            payload={"ward_id": ward_id, "task_key": task_key, "status": request.status},
        )
    )
    db.commit()
    return _plan_with_status(db, ward_id, forecast_day)


@router.post("/alerts/simulate", response_model=AlertSimulationResponse, tags=["alerts"])
def simulate_alert(request: AlertSimulationRequest, db: Session = Depends(get_db)) -> dict[str, Any]:
    _ensure_seeded(db)
    detail, previews = _alert_context(db, request)
    record = Alert(
        ward_id=request.ward_id,
        audience=previews["previews"]["SMS Preview"]["audience"],
        channel=request.channel,
        title=f"{detail['risk_category']} Heat Alert",
        message=previews["previews"].get("SMS Preview", {}).get("message", ""),
        status=previews["status"],
        simulated=True,
        payload=previews,
    )
    db.add(record)
    db.add(
        SystemEvent(
            severity="INFO",
            category="ALERT_SIMULATION",
            source="Local alert simulator",
            message=f"Generated a local {request.channel} preview for {detail['name']}; no external message was sent.",
            payload={"ward_id": request.ward_id, "audience": request.audience, "channel": request.channel},
        )
    )
    db.commit()
    db.refresh(record)
    previews["id"] = record.id
    return previews


@router.post("/alerts/preview", response_model=AlertSimulationResponse, tags=["alerts"])
def preview_alert(request: AlertSimulationRequest, db: Session = Depends(get_db)) -> dict[str, Any]:
    _ensure_seeded(db)
    _, preview = _alert_context(db, request)
    return preview


@router.get("/alerts/audiences", tags=["alerts"])
def alert_audiences() -> list[dict[str, str]]:
    return audience_catalog()


@router.get("/alerts/provider", tags=["alerts"])
def alert_provider() -> dict[str, Any]:
    return alert_provider_status()


@router.post("/alerts/send-test", tags=["alerts"])
def send_test_alert(request: AlertSendRequest, db: Session = Depends(get_db)) -> dict[str, Any]:
    _ensure_seeded(db)
    if not request.confirm or request.confirmation_text.strip().upper() != "SEND TEST SMS":
        raise HTTPException(status_code=400, detail="Explicit confirmation text SEND TEST SMS is required")
    if request.channel.upper() != "SMS":
        raise HTTPException(status_code=400, detail="The configured external test adapter supports SMS only")
    detail, previews = _alert_context(db, request)
    message = previews["previews"]["SMS Preview"]["message"]
    provider = Msg91TestProvider()
    recipient = request.recipient or settings.test_phone_number or ""
    try:
        delivery = provider.send_test(
            recipient=recipient,
            ward_name=detail["name"],
            risk_category=detail["risk_category"],
            message=message,
        )
    except AlertDeliveryError as exc:
        failure = Alert(
            ward_id=request.ward_id,
            audience=previews["previews"]["SMS Preview"]["audience"],
            channel="SMS",
            title=f"{detail['risk_category']} Heat Alert — test failed",
            message=message,
            status="FAILED",
            simulated=False,
            payload={"provider": provider.name, "recipient": recipient, "error": str(exc), "previews": previews["previews"]},
        )
        db.add(failure)
        db.add(
            SystemEvent(
                severity="ERROR",
                category="ALERT_PROVIDER",
                source=provider.name,
                message=f"Test SMS request failed for {detail['name']}: {exc}",
                payload={"ward_id": request.ward_id, "provider": provider.name},
            )
        )
        db.commit()
        raise HTTPException(status_code=409 if not provider.configured else 502, detail=str(exc)) from None

    payload = {**previews, **delivery, "simulated": False}
    record = Alert(
        ward_id=request.ward_id,
        audience=previews["previews"]["SMS Preview"]["audience"],
        channel="SMS",
        title=f"{detail['risk_category']} Heat Alert — test",
        message=message,
        status=delivery["status"],
        simulated=False,
        payload=payload,
    )
    db.add(record)
    db.add(
        SystemEvent(
            severity="INFO",
            category="ALERT_PROVIDER",
            source=provider.name,
            message=f"MSG91 accepted a restricted test SMS request for {detail['name']}; delivery is not confirmed.",
            payload={"ward_id": request.ward_id, "message_id": delivery.get("message_id"), "delivery_confirmed": False},
        )
    )
    db.commit()
    db.refresh(record)
    payload["id"] = record.id
    payload["generated_at"] = record.generated_at.isoformat() + "Z"
    return payload


@router.get("/alerts", tags=["alerts"])
def alerts(db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    _ensure_seeded(db)
    rows = list(db.scalars(select(Alert).order_by(desc(Alert.generated_at), desc(Alert.id)).limit(50)))
    return [
        {
            "id": row.id,
            "ward_id": row.ward_id,
            "audience": row.audience,
            "channel": row.channel,
            "title": row.title,
            "message": row.message,
            "generated_at": row.generated_at.isoformat() + "Z",
            "status": row.status,
            "simulated": row.simulated,
            "provider": row.payload.get("provider", "local_simulation"),
            "recipient": row.payload.get("recipient"),
            "message_id": row.payload.get("message_id"),
            "delivery_confirmed": row.payload.get("delivery_confirmed", False),
        }
        for row in rows
    ]
