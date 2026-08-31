from __future__ import annotations

import json
from datetime import datetime, timedelta
from typing import Any

from shapely.geometry import shape

from ..config import BACKEND_DIR


BOUNDARY_PATH = BACKEND_DIR / "data" / "bmc_administrative_wards.geojson"
BOUNDARY_SOURCE = "DataMeet Mumbai BMC administrative wards (CC BY 4.0), digitized from public municipal sources"

WARD_LOCALITIES: dict[str, str] = {
    "A": "Colaba · Fort · Churchgate",
    "B": "Dongri · Masjid Bunder · Bhendi Bazaar",
    "C": "Marine Lines · Girgaon · Kalbadevi",
    "D": "Malabar Hill · Grant Road · Tardeo",
    "E": "Byculla · Nagpada · Mazgaon",
    "F/N": "Matunga · Sion · Wadala",
    "F/S": "Parel · Sewri · Lalbaug",
    "G/N": "Dadar · Mahim · Dharavi",
    "G/S": "Worli · Prabhadevi · Lower Parel",
    "H/E": "Bandra East · Khar East · Santacruz East",
    "H/W": "Bandra West · Khar West · Santacruz West",
    "K/E": "Andheri East · Jogeshwari East · Vile Parle East",
    "K/W": "Andheri West · Jogeshwari West · Vile Parle West",
    "L": "Kurla · Saki Naka",
    "M/E": "Govandi · Mankhurd · Deonar",
    "M/W": "Chembur · Tilak Nagar",
    "N": "Ghatkopar · Vikhroli",
    "P/N": "Malad",
    "P/S": "Goregaon · Aarey",
    "R/C": "Borivali",
    "R/N": "Dahisar",
    "R/S": "Kandivali",
    "S": "Bhandup · Kanjurmarg · Powai",
    "T": "Mulund",
}

# These weights drive a deterministic heat-emergency exercise. They are not
# observations, official ward rankings, or demographic measurements.
SCENARIO_INTENSITY: dict[str, float] = {
    "A": 0.34, "B": 0.64, "C": 0.52, "D": 0.38, "E": 0.70,
    "F/N": 0.46, "F/S": 0.68, "G/N": 0.90, "G/S": 0.65,
    "H/E": 0.62, "H/W": 0.16, "K/E": 0.57, "K/W": 0.32,
    "L": 0.82, "M/E": 1.0, "M/W": 0.67, "N": 0.58,
    "P/N": 0.75, "P/S": 0.20, "R/C": 0.08, "R/N": 0.04,
    "R/S": 0.42, "S": 0.54, "T": 0.10,
}


def _ward_id(code: str) -> str:
    return f"BMC-{code.replace('/', '')}"


def _load_boundaries() -> list[dict[str, Any]]:
    with BOUNDARY_PATH.open("r", encoding="utf-8") as handle:
        collection = json.load(handle)
    features = collection.get("features", [])
    if len(features) != 24:
        raise RuntimeError(f"Expected 24 BMC administrative wards, found {len(features)}")
    return features


class DemoWeatherProvider:
    name = "demo"
    label = "Mumbai heat-event demo scenario — NOT an IMD observation"

    def ward_specs(self) -> list[dict[str, Any]]:
        specs: list[dict[str, Any]] = []
        for index, feature in enumerate(_load_boundaries()):
            code = str(feature["properties"]["name"]).upper()
            geometry = feature["geometry"]
            centroid = shape(geometry).representative_point()
            intensity = SCENARIO_INTENSITY[code]
            specs.append(
                {
                    "id": _ward_id(code),
                    "code": code,
                    "name": f"{code} Ward · {WARD_LOCALITIES[code]}",
                    "locality": WARD_LOCALITIES[code],
                    "lat": round(centroid.y, 6),
                    "lon": round(centroid.x, 6),
                    "population": int(390_000 + ((index * 47_000) % 520_000)),
                    "population_is_estimated": True,
                    "geometry": geometry,
                    "geometry_source": BOUNDARY_SOURCE,
                    "temperature": round(29.5 + 10.5 * intensity, 1),
                    "humidity": round(50 + 22 * intensity, 0),
                    "wind_speed": round(4.5 - 3.2 * intensity, 1),
                    "solar_radiation": round(380 + 500 * intensity, 0),
                    "elderly_pct": round(7 + 10 * intensity, 1),
                    "children_pct": round(13 + 10 * intensity, 1),
                    "outdoor_worker_pct": round(12 + 26 * intensity, 1),
                    "population_density": round(9_000 + 24_000 * intensity, 0),
                    "slum_indicator": round(0.08 + 0.72 * intensity, 2),
                    "green_cover_pct": round(30 - 24 * intensity, 1),
                    "hospitalization_rate": round(18 + 88 * intensity, 1),
                    "mortality_rate": round(1.2 + 12.5 * intensity, 1),
                    "forecast_delta": [0.0, 1.0, 2.1, 1.5, 0.6, -0.2],
                    "humidity_delta": [0, 2, 4, 3, 1, -1],
                }
            )
        return sorted(specs, key=lambda item: item["code"])

    def forecast_for(self, spec: dict[str, Any], start: datetime | None = None, days: int = 6) -> list[dict[str, Any]]:
        anchor = (start or datetime.utcnow()).replace(hour=12, minute=0, second=0, microsecond=0)
        results: list[dict[str, Any]] = []
        for day in range(days):
            temp = spec["temperature"] + spec["forecast_delta"][day]
            humidity = max(35.0, min(95.0, spec["humidity"] + spec["humidity_delta"][day]))
            wind = max(0.35, spec["wind_speed"] + (0.25 if day in {1, 4} else -0.2 if day == 2 else 0.0))
            radiation = max(120.0, min(1_050.0, spec["solar_radiation"] + day * 16 - (55 if day == 5 else 0)))
            results.append(
                {
                    "forecast_time": anchor + timedelta(days=day),
                    "day_offset": day,
                    "temperature": round(temp, 2),
                    "humidity": round(humidity, 2),
                    "wind_speed": round(wind, 2),
                    "solar_radiation": round(radiation, 2),
                    "rainfall": 0.0 if day < 4 else 1.2,
                    "source": self.label,
                    "is_estimated": True,
                }
            )
        return results
