from pytest import MonkeyPatch
from webtest import TestApp

from vnstat_visualizer.api.app import create_app
from vnstat_visualizer.api.routes import health


def test_ready_ok(db: None) -> None:
    res = TestApp(create_app()).get("/ready")
    assert res.json == {"status": "ok"}


def test_ready_fails_without_leaking_details(monkeypatch: MonkeyPatch) -> None:
    monkeypatch.setattr(health, "check_database", lambda: (False, "database check failed: X"))
    res = TestApp(create_app()).get("/ready", status=503)
    assert res.json["code"] == "not_ready"
