from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .config import BACKEND_DIR, settings


BMC_BOUNDARY_URL = "https://github.com/datameet/Municipal_Spatial_Data/blob/master/Mumbai/BMC_Wards.geojson"
BMC_WARD_MAP_URL = "https://portal.mcgm.gov.in/irj/portal/anonymous/BMC-on-Map-Wards-Offices?guest_user=english"
IMD_API_URL = "https://api.imd.gov.in/public/api_reference.html"
IMD_PORTAL_URL = "https://api.imd.gov.in/public/index.php"
MOSDAC_API_URL = "https://www.mosdac.gov.in/sites/default/files/docs/MOSDAC_Satellite_Data_Download_API.pdf"
CENSUS_URL = "https://censusindia.gov.in/census.website/data/census-tables"
NCDC_HEAT_URL = "https://ncdc.mohfw.gov.in/includes/About/CentresAndDivision/CEOH.php"
NCDC_2026_ADVISORY_URL = "https://ncdc.mohfw.gov.in/uploads/pdf/1.%20Heat%20wave%20advisory%20for%20State%20Health%20department_2026.pdf"
IHIP_URL = "https://ihip.mohfw.gov.in/npcchh"
MSG91_DOCS_URL = "https://docs.msg91.com/sms"


def _iso_mtime(path: Path) -> str | None:
    if not path.exists():
        return None
    return datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc).isoformat()


def _msg91_ready() -> bool:
    return bool(
        settings.alert_provider == "msg91"
        and settings.sms_test_mode
        and settings.test_phone_number
        and settings.msg91_auth_key
        and settings.msg91_template_id
        and settings.msg91_sender_id
    )


def source_statuses() -> list[dict[str, Any]]:
    boundary_path = BACKEND_DIR / "data" / "bmc_administrative_wards.geojson"
    imd_ready = bool(settings.imd_api_key and settings.imd_station_id)
    msg91_ready = _msg91_ready()
    return [
        {
            "id": "bmc-boundaries",
            "name": "BMC administrative ward boundaries",
            "kind": "GEOSPATIAL SNAPSHOT",
            "authority": "Brihanmumbai Municipal Corporation context; DataMeet digitized dataset",
            "status": "CONNECTED" if boundary_path.exists() else "UNAVAILABLE",
            "status_detail": "24 WGS84 administrative ward MultiPolygons loaded locally" if boundary_path.exists() else "Bundled GeoJSON is missing",
            "last_success": _iso_mtime(boundary_path),
            "freshness": "Static licensed snapshot; not a live BMC GIS feed",
            "source_url": BMC_BOUNDARY_URL,
            "reference_url": BMC_WARD_MAP_URL,
            "license": "CC BY 4.0",
            "credentials_required": False,
            "configuration": [],
            "in_use": boundary_path.exists(),
            "fallback": None,
            "quality_note": "Actual administrative ward geometry. DataMeet warns that community-cleaned boundaries may contain imperfections; validate against BMC before statutory use.",
        },
        {
            "id": "imd-weather",
            "name": "India Meteorological Department weather APIs",
            "kind": "PRIMARY WEATHER",
            "authority": "India Meteorological Department, Ministry of Earth Sciences",
            "status": "CONFIGURED" if imd_ready else "MISSING_CREDENTIALS",
            "status_detail": "API key and station configured; live ingestion is eligible" if imd_ready else "IMD portal API key and Mumbai station ID are not configured",
            "last_success": None,
            "freshness": "Official current weather and seven-day city forecast when configured",
            "source_url": IMD_API_URL,
            "reference_url": IMD_PORTAL_URL,
            "license": "Provider terms apply",
            "credentials_required": True,
            "configuration": ["IMD_API_KEY", "IMD_STATION_ID", "IMD_API_KEY_HEADER (if portal-issued header differs)"],
            "in_use": settings.weather_provider == "imd" and imd_ready,
            "fallback": "Mumbai heat-event demo scenario" if not imd_ready else None,
            "quality_note": "IMD city/station observations are not ward-scale measurements. Ward-level thermal outputs remain estimates unless local sensors are added.",
        },
        {
            "id": "mosdac",
            "name": "MOSDAC satellite products",
            "kind": "SATELLITE / RADIATION",
            "authority": "Space Applications Centre, ISRO",
            "status": "CONFIGURED" if settings.mosdac_token else "MISSING_CREDENTIALS",
            "status_detail": "Download token present; product-specific ingest is not enabled in this local build" if settings.mosdac_token else "MOSDAC token not configured; no satellite product is being claimed",
            "last_success": None,
            "freshness": "Product dependent",
            "source_url": MOSDAC_API_URL,
            "reference_url": "https://www.mosdac.gov.in/",
            "license": "Provider/product terms apply",
            "credentials_required": True,
            "configuration": ["MOSDAC_TOKEN", "a selected, validated product pipeline"],
            "in_use": False,
            "fallback": "Solar radiation estimated by the thermal scenario provider",
            "quality_note": "A token alone is not treated as an integrated product. Product calibration and spatial/temporal matching are still required.",
        },
        {
            "id": "census-demographics",
            "name": "Census of India demographics",
            "kind": "VULNERABILITY",
            "authority": "Office of the Registrar General & Census Commissioner, India",
            "status": "NOT_INGESTED",
            "status_detail": "No verified 24-administrative-ward demographic crosswalk is loaded",
            "last_success": None,
            "freshness": "Census tables available; administrative-ward crosswalk required",
            "source_url": CENSUS_URL,
            "reference_url": BMC_WARD_MAP_URL,
            "license": "Government open-data terms apply",
            "credentials_required": False,
            "configuration": ["validated Census geography-to-BMC administrative ward crosswalk"],
            "in_use": False,
            "fallback": "Deterministic demonstration vulnerability profiles, visibly labelled",
            "quality_note": "Census wards, electoral wards and BMC administrative wards are different geographies and must not be silently joined.",
        },
        {
            "id": "ncdc-guidance",
            "name": "NCDC / MoHFW heat-health guidance",
            "kind": "RESPONSE GUIDANCE",
            "authority": "National Centre for Disease Control, Ministry of Health & Family Welfare",
            "status": "CONNECTED",
            "status_detail": "Authoritative guidance references are linked to operational action rules",
            "last_success": None,
            "freshness": "Summer 2026 advisory plus standing heat-illness guidance",
            "source_url": NCDC_2026_ADVISORY_URL,
            "reference_url": NCDC_HEAT_URL,
            "license": "Government publication",
            "credentials_required": False,
            "configuration": [],
            "in_use": True,
            "fallback": None,
            "quality_note": "Rules are decision-support translations of guidance, not an official BMC activation order.",
        },
        {
            "id": "ihip-surveillance",
            "name": "IHIP heat-related illness surveillance",
            "kind": "HEALTH OUTCOMES",
            "authority": "NPCCHH / MoHFW",
            "status": "UNAVAILABLE",
            "status_detail": "No authorized IHIP facility credentials or patient-level data are available to this local prototype",
            "last_success": None,
            "freshness": "Daily reporting is required operationally; this build has no feed access",
            "source_url": IHIP_URL,
            "reference_url": NCDC_2026_ADVISORY_URL,
            "license": "Restricted health surveillance data",
            "credentials_required": True,
            "configuration": ["authorized institutional access", "privacy and data-governance approval"],
            "in_use": False,
            "fallback": "No validated health outcomes; risk output remains a prototype estimate",
            "quality_note": "No case counts, admissions or deaths are fabricated.",
        },
        {
            "id": "msg91-sms",
            "name": "MSG91 test SMS gateway",
            "kind": "ALERT DELIVERY",
            "authority": "MSG91",
            "status": "TEST_READY" if msg91_ready else "SIMULATION_ONLY",
            "status_detail": "Restricted test mode is configured for one allow-listed recipient" if msg91_ready else "External SMS is disabled; previews and logs remain local",
            "last_success": None,
            "freshness": "On demand",
            "source_url": MSG91_DOCS_URL,
            "reference_url": "https://msg91.com/help/template/how-to-create-flow-id-to-send-sms-via-api",
            "license": "Commercial provider terms and Indian DLT requirements apply",
            "credentials_required": True,
            "configuration": ["ALERT_PROVIDER=msg91", "SMS_TEST_MODE=true", "TEST_PHONE_NUMBER", "MSG91_AUTH_KEY", "MSG91_TEMPLATE_ID", "MSG91_SENDER_ID"],
            "in_use": msg91_ready,
            "fallback": "Local simulation provider",
            "quality_note": "Provider acceptance is logged as accepted, never as delivered. Delivery receipts are not implemented.",
        },
    ]


def component_statuses() -> list[dict[str, Any]]:
    sources = {source["id"]: source for source in source_statuses()}
    return [
        {"name": "FastAPI decision engine", "status": "ONLINE", "detail": "Thermal, vulnerability and rule engines available"},
        {"name": "BMC ward geometry", "status": sources["bmc-boundaries"]["status"], "detail": sources["bmc-boundaries"]["status_detail"]},
        {"name": "Primary weather provider", "status": sources["imd-weather"]["status"], "detail": sources["imd-weather"]["status_detail"]},
        {"name": "Health surveillance", "status": sources["ihip-surveillance"]["status"], "detail": sources["ihip-surveillance"]["status_detail"]},
        {"name": "Alert delivery", "status": sources["msg91-sms"]["status"], "detail": sources["msg91-sms"]["status_detail"]},
    ]
