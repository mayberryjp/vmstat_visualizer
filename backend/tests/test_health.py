from webtest import TestApp

from vnstat_visualizer.api.app import create_app


def test_health() -> None:
    res = TestApp(create_app()).get("/health")
    assert res.json == {"status": "ok", "service": "vnstat-visualizer-api"}


def test_cors_headers_and_preflight() -> None:
    client = TestApp(create_app())
    assert client.get("/health").headers["Access-Control-Allow-Origin"] == "*"
    assert client.options("/traffic").headers["Access-Control-Allow-Origin"] == "*"


def test_unknown_route_returns_json_envelope() -> None:
    res = TestApp(create_app()).get("/nope", status=404)
    assert res.json == {"status": "error", "code": "not_found", "error": "not found"}
