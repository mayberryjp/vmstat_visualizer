from typing import Any

from bottle import Bottle, HTTPError, request

from vnstat_visualizer.api.errors import error_envelope
from vnstat_visualizer.domain.parser import HOSTNAME_RE, INTERFACE_RE
from vnstat_visualizer.repository.favorites import (
    add_favorite,
    list_favorites,
    remove_favorite,
    set_order,
)


def _valid(hostname: object, interface: object) -> bool:
    return (
        isinstance(hostname, str)
        and isinstance(interface, str)
        and bool(HOSTNAME_RE.match(hostname))
        and bool(INTERFACE_RE.match(interface))
    )


def _read_order() -> list[tuple[str, str]] | None:
    try:
        body = request.json
    except (ValueError, HTTPError):
        return None
    items = body.get("items") if isinstance(body, dict) else None
    if not isinstance(items, list):
        return None
    keys: list[tuple[str, str]] = []
    for item in items:
        if not isinstance(item, dict) or not _valid(item.get("hostname"), item.get("interface")):
            return None
        keys.append((item["hostname"], item["interface"]))
    return keys


def _listing() -> dict[str, Any]:
    items = list_favorites()
    return {"status": "ok", "items": items, "total": len(items)}


def register_favorite_routes(app: Bottle) -> None:
    @app.get("/favorites")
    def get_favorites() -> dict[str, Any]:
        return _listing()

    @app.put("/favorites/order")
    def put_order() -> dict[str, Any] | str:
        keys = _read_order()
        if keys is None:
            return error_envelope(
                422,
                "validation_error",
                "Invalid request",
                "body must be {\"items\": [{\"hostname\": ..., \"interface\": ...}]}",
            )
        set_order(keys)
        return _listing()

    @app.put("/favorites/<hostname>/<interface>")
    def put_favorite(hostname: str, interface: str) -> dict[str, Any] | str:
        if not _valid(hostname, interface):
            return error_envelope(422, "validation_error", "Invalid hostname or interface")
        add_favorite(hostname, interface)
        return _listing()

    @app.delete("/favorites/<hostname>/<interface>")
    def delete_favorite(hostname: str, interface: str) -> dict[str, Any] | str:
        if not _valid(hostname, interface):
            return error_envelope(422, "validation_error", "Invalid hostname or interface")
        remove_favorite(hostname, interface)
        return _listing()
