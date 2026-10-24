from datetime import date
from typing import Any

from bottle import Bottle, HTTPError, request

from vnstat_visualizer.api.errors import error_envelope
from vnstat_visualizer.domain.parser import HOSTNAME_RE, INTERFACE_RE
from vnstat_visualizer.repository.traffic import (
    count_traffic,
    delete_traffic,
    edit_day,
    list_devices,
    list_traffic,
    summarize_traffic,
)


def _query_date(name: str) -> date | None:
    raw = request.query.get(name)
    return date.fromisoformat(raw) if raw else None


def register_traffic_routes(app: Bottle) -> None:
    @app.put("/traffic/<hostname>/<interface>/<day>")
    def put_day(hostname: str, interface: str, day: str) -> dict[str, Any] | str:
        if not HOSTNAME_RE.fullmatch(hostname) or not INTERFACE_RE.fullmatch(interface):
            return error_envelope(422, "validation_error", "Invalid hostname or interface")
        try:
            target_day = date.fromisoformat(day)
            body = request.json
        except (ValueError, HTTPError):
            return error_envelope(422, "validation_error", "Invalid day or JSON body")
        fields = ("rx_bytes", "tx_bytes", "avg_rate_bps")
        if not isinstance(body, dict) or set(body) != set(fields) or any(
            type(body[field]) is not int or not 0 <= body[field] <= 2**53 - 1
            for field in fields
        ):
            return error_envelope(
                422, "validation_error", "Invalid traffic values",
                "rx_bytes, tx_bytes and avg_rate_bps must be nonnegative safe integers",
            )
        if body["rx_bytes"] + body["tx_bytes"] > 2**53 - 1:
            return error_envelope(422, "validation_error", "Total exceeds safe integer range")
        try:
            edit_day(hostname, interface, target_day, body)
        except LookupError as exc:
            return error_envelope(404, "not_found", str(exc))
        return {"status": "ok"}

    @app.delete("/traffic/<hostname>/<interface>/<day>")
    @app.delete("/traffic/<hostname>/<interface>")
    def delete_records(hostname: str, interface: str, day: str | None = None) -> dict[str, Any] | str:
        if not HOSTNAME_RE.fullmatch(hostname) or not INTERFACE_RE.fullmatch(interface):
            return error_envelope(422, "validation_error", "Invalid hostname or interface")
        try:
            target_day = date.fromisoformat(day) if day is not None else None
        except ValueError:
            return error_envelope(422, "validation_error", "day must be YYYY-MM-DD")
        deleted = delete_traffic(hostname, interface, target_day)
        return {"status": "ok", "deleted": deleted}

    @app.get("/devices")
    def get_devices() -> dict[str, Any]:
        items = list_devices()
        return {"status": "ok", "items": items, "total": len(items)}

    @app.get("/traffic/summary")
    def get_traffic_summary() -> dict[str, Any] | str:
        try:
            start = _query_date("start")
            end = _query_date("end")
        except ValueError:
            return error_envelope(
                422, "validation_error", "Invalid request", "start/end must be YYYY-MM-DD"
            )
        items = summarize_traffic(
            request.query.get("hostname") or None,
            request.query.get("interface") or None,
            start,
            end,
        )
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
