from datetime import date
from typing import Any

from bottle import Bottle, request

from vnstat_visualizer.api.errors import error_envelope
from vnstat_visualizer.repository.traffic import count_traffic, list_devices, list_traffic


def _query_date(name: str) -> date | None:
    raw = request.query.get(name)
    return date.fromisoformat(raw) if raw else None


def register_traffic_routes(app: Bottle) -> None:
    @app.get("/devices")
    def get_devices() -> dict[str, Any]:
        items = list_devices()
        return {"status": "ok", "items": items, "total": len(items)}

    @app.get("/traffic")
    def get_traffic() -> dict[str, Any] | str:
        try:
            start = _query_date("start")
            end = _query_date("end")
            raw_limit = request.query.get("limit")
            raw_offset = request.query.get("offset")
            limit = int(raw_limit) if raw_limit is not None else None
            offset = int(raw_offset) if raw_offset is not None else 0
        except ValueError:
            return error_envelope(
                422,
                "validation_error",
                "Invalid request",
                "start/end must be YYYY-MM-DD and limit/offset must be integers",
            )
        if (limit is not None and limit < 0) or offset < 0:
            return error_envelope(
                422, "validation_error", "Invalid request", "limit/offset must be >= 0"
            )

        hostname = request.query.get("hostname") or None
        interface = request.query.get("interface") or None

        # Pagination omitted -> return every row.
        rows = list_traffic(hostname, interface, start, end, limit=limit, offset=offset)
        if limit is None and offset == 0:
            return {"status": "ok", "items": rows, "total": len(rows)}
        return {
            "status": "ok",
            "items": rows,
            "total": count_traffic(hostname, interface, start, end),
        }
