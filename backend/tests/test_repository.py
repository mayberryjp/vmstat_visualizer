from datetime import date, datetime

from webtest import TestApp

from vnstat_visualizer.api.app import create_app
from vnstat_visualizer.domain.parser import TrafficSnapshot
from vnstat_visualizer.repository.traffic import (
    count_traffic,
    list_devices,
    list_traffic,
    upsert_snapshot,
)


def _snap(day: date, rx: int = 10, host: str = "fw01", iface: str = "vtnet0") -> TrafficSnapshot:
    return TrafficSnapshot(host, iface, day, rx, 5, rx + 5, 1000)


def test_upsert_is_idempotent_and_updates(db: None) -> None:
    now = datetime(2026, 10, 12, 23, 59)  # noqa: DTZ001
    upsert_snapshot(_snap(date(2026, 10, 12), rx=10), "10.0.0.1", now)
    upsert_snapshot(_snap(date(2026, 10, 12), rx=99), "10.0.0.2", now)
    rows = list_traffic()
    assert len(rows) == 1
    assert rows[0]["rx_bytes"] == 99
    assert rows[0]["source_ip"] == "10.0.0.2"


def test_filters_and_devices(db: None) -> None:
    now = datetime(2026, 10, 12, 23, 59)  # noqa: DTZ001
    for d in (11, 12):
        upsert_snapshot(_snap(date(2026, 10, d)), "10.0.0.1", now)
    upsert_snapshot(_snap(date(2026, 10, 12), host="fw02", iface="em0"), "10.0.0.9", now)

    assert len(list_traffic(hostname="fw01")) == 2
    assert len(list_traffic(start=date(2026, 10, 12))) == 2
    assert count_traffic(interface="em0") == 1
    devices = list_devices()
    assert [(d["hostname"], d["interface"], d["source_ip"], d["days"]) for d in devices] == [
        ("fw01", "vtnet0", "10.0.0.1", 2),
        ("fw02", "em0", "10.0.0.9", 1),
    ]


def test_traffic_endpoint_pagination_is_opt_in(db: None) -> None:
    now = datetime(2026, 10, 12, 23, 59)  # noqa: DTZ001
    for d in range(1, 6):
        upsert_snapshot(_snap(date(2026, 10, d)), "10.0.0.1", now)
    client = TestApp(create_app())

    assert client.get("/traffic").json["total"] == 5
    page = client.get("/traffic?limit=2&offset=1").json
    assert len(page["items"]) == 2 and page["total"] == 5
    assert client.get("/traffic?start=bad", status=422).json["code"] == "validation_error"
    assert client.get("/devices").json["total"] == 1
