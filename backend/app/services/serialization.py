from __future__ import annotations

from typing import Any


def geometry_to_geojson(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    try:
        from geoalchemy2.shape import to_shape
        from shapely.geometry import mapping

        return mapping(to_shape(value))
    except Exception:
        return {"type": "Polygon", "coordinates": []}
