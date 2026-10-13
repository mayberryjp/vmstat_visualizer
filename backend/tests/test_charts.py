import json
from pathlib import Path

from pytest import MonkeyPatch
from webtest import TestApp

from vnstat_visualizer.api.app import create_app
from vnstat_visualizer.config import settings


def test_charts_unconfigured(tmp_path: Path, monkeypatch: MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "charts_config_path", str(tmp_path / "missing.json"))
    res = TestApp(create_app()).get("/charts")
    assert res.json == {"status": "ok", "configured": False, "items": [], "total": 0}


def test_charts_configured_keeps_order(tmp_path: Path, monkeypatch: MonkeyPatch) -> None:
    cfg = tmp_path / "charts.json"
    cfg.write_text(
        json.dumps(
            {
                "charts": [
                    {"hostname": "fw02", "interface": "em0", "title": "Lab WAN"},
                    {"hostname": "fw01"},
                ]
            }
        )
    )
    monkeypatch.setattr(settings, "charts_config_path", str(cfg))
    res = TestApp(create_app()).get("/charts").json
    assert res["configured"] is True
    assert res["items"] == [
        {"hostname": "fw02", "interface": "em0", "title": "Lab WAN"},
        {"hostname": "fw01"},
    ]


def test_charts_invalid_config(tmp_path: Path, monkeypatch: MonkeyPatch) -> None:
    cfg = tmp_path / "charts.json"
    cfg.write_text('{"charts": [{"interface": "em0"}]}')
    monkeypatch.setattr(settings, "charts_config_path", str(cfg))
    res = TestApp(create_app()).get("/charts", status=500)
    assert res.json["code"] == "invalid_charts_config"
    assert "charts[0]" in res.json["detail"]
