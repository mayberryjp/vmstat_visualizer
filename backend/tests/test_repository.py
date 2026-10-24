from datetime import date, datetime

import pytest
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
    assert datetime.fromisoformat(devices[0]["last_seen"]) == now.astimezone()


def test_device_last_seen_uses_latest_receipt_across_all_days(db: None) -> None:
    older = datetime(2026, 10, 12, 10)  # noqa: DTZ001
    newer = datetime(2026, 10, 13, 12)  # noqa: DTZ001
    upsert_snapshot(_snap(date(2026, 10, 12)), "10.0.0.1", older)
    upsert_snapshot(_snap(date(2026, 10, 11)), "10.0.0.2", newer)

    item = TestApp(create_app()).get("/devices").json["items"][0]
    assert datetime.fromisoformat(item["last_seen"]) == newer.astimezone()
    assert item["last_day"] == "2026-10-12"
    assert item["source_ip"] == "10.0.0.2"


def test_traffic_summary_sums_days_in_range(db: None) -> None:
    now = datetime(2026, 10, 12, 23, 59)  # noqa: DTZ001
    for d in (10, 11, 12):
        upsert_snapshot(_snap(date(2026, 10, d), rx=10), "10.0.0.1", now)
    upsert_snapshot(_snap(date(2026, 10, 12), rx=50, host="fw02", iface="em0"), "10.0.0.9", now)
    client = TestApp(create_app())

    items = client.get("/traffic/summary?start=2026-10-11").json["items"]
    assert items == [
        {
            "hostname": "fw01",
            "interface": "vtnet0",
            "days": 2,
            "rx_bytes": 20,
            "tx_bytes": 10,
            "total_bytes": 30,
        },
        {
            "hostname": "fw02",
            "interface": "em0",
            "days": 1,
            "rx_bytes": 50,
            "tx_bytes": 5,
            "total_bytes": 55,
        },
    ]
    assert len(client.get("/traffic/summary?hostname=fw02").json["items"]) == 1
    assert client.get("/traffic/summary?end=bad", status=422).json["code"] == "validation_error"


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


@pytest.mark.parametrize("unit", [1000**3, 1024**3])
@pytest.mark.parametrize("field", ["rx_bytes", "tx_bytes", "total_bytes"])
@pytest.mark.parametrize("multiple", [4, 8, 12])
def test_suspicious_reports_use_device_medians(
    db: None, unit: int, field: str, multiple: int,
) -> None:
    now = datetime(2026, 10, 12, 23, 59)  # noqa: DTZ001
    for day, rx in [(1, 10), (2, 30), (3, 90), (4, 110)]:
        upsert_snapshot(_snap(date(2026, 10, day), rx=rx), "10.0.0.1", now)
    upsert_snapshot(_snap(date(2026, 10, 1), rx=999, host="other"), "10.0.0.2", now)
    upsert_snapshot(_snap(date(2026, 10, 1), rx=999, iface="other"), "10.0.0.2", now)
    values = {"rx_bytes": 20, "tx_bytes": 5, "total_bytes": 25, "avg_rate_bps": 9999}
    values[field] = multiple * unit
    snapshot = TrafficSnapshot("fw01", "vtnet0", date(2026, 10, 5), **values)
    upsert_snapshot(snapshot, "10.0.0.1", now)
    item = TestApp(create_app()).get("/traffic?start=2026-10-05").json["items"][0]
    assert (item["rx_bytes"], item["tx_bytes"], item["total_bytes"]) == (60, 5, 65)
    assert item["avg_rate_bps"] == 1000
    assert item["is_estimated"] is True
    upsert_snapshot(_snap(date(2026, 10, 5), rx=42), "10.0.0.1", now)
    item = list_traffic(start=date(2026, 10, 5))[0]
    assert item["rx_bytes"] == 42
    assert item["is_estimated"] is False


def test_suspicious_reports_without_history_are_dropped(db: None) -> None:
    now = datetime(2026, 10, 12, 23, 59)  # noqa: DTZ001
    upsert_snapshot(_snap(date(2026, 10, 1), rx=4 * 1024**3), "10.0.0.1", now)
    assert list_traffic() == []


def test_estimated_and_same_day_values_are_not_donors(db: None) -> None:
    now = datetime(2026, 10, 12, 23, 59)  # noqa: DTZ001
    upsert_snapshot(_snap(date(2026, 10, 1), rx=10), "10.0.0.1", now)
    upsert_snapshot(_snap(date(2026, 10, 2), rx=4 * 1024**3), "10.0.0.1", now)
    upsert_snapshot(_snap(date(2026, 10, 3), rx=90), "10.0.0.1", now)
    upsert_snapshot(_snap(date(2026, 10, 4), rx=999), "10.0.0.1", now)
    upsert_snapshot(_snap(date(2026, 10, 4), rx=8 * 1024**3), "10.0.0.1", now)
    assert list_traffic()[-1]["rx_bytes"] == 50


@pytest.mark.parametrize("rx", [0, 3 * 1000**3, 4 * 1024**3 + 1, 8 * 1000**3 - 1])
def test_non_multiples_are_preserved(db: None, rx: int) -> None:
    now = datetime(2026, 10, 12, 23, 59)  # noqa: DTZ001
    upsert_snapshot(_snap(date(2026, 10, 1), rx=rx), "10.0.0.1", now)
    assert list_traffic()[0]["rx_bytes"] == rx
    assert list_traffic()[0]["is_estimated"] is False


def test_manual_edit_survives_reports(db: None) -> None:
    now = datetime(2026, 10, 12, 23, 59)  # noqa: DTZ001
    for day, rx in [(1, 10), (2, 30), (3, 90), (4, 110), (5, 3_780_000_000)]:
        upsert_snapshot(_snap(date(2026, 10, day), rx=rx), "10.0.0.1", now)
    upsert_snapshot(_snap(date(2026, 10, 1), rx=999, host="other"), "10.0.0.1", now)
    client = TestApp(create_app())
    values = {"rx_bytes": 60, "tx_bytes": 5, "avg_rate_bps": 1000}
    client.put_json("/traffic/fw01/vtnet0/2026-10-05", values)
    upsert_snapshot(_snap(date(2026, 10, 5), rx=3_780_000_000), "10.0.0.2", now)
    row = list_traffic(start=date(2026, 10, 5))[0]
    assert row["rx_bytes"] == 60
    assert row["total_bytes"] == 65
    assert row["is_estimated"] is False
    assert row["is_manual"] is True
    assert row["source_ip"] == "10.0.0.2"
    assert client.get("/traffic/summary?start=2026-10-05").json["items"][0]["rx_bytes"] == 60


def test_manual_edit_validates_values_and_missing_day(db: None) -> None:
    client = TestApp(create_app())
    values = {"rx_bytes": 60, "tx_bytes": 5, "avg_rate_bps": 1000}
    client.put_json("/traffic/fw01/vtnet0/bad", values, status=422)
    client.put_json("/traffic/fw01/vtnet0/2026-10-05", values, status=404)
    for bad in [-1, True, 1.5, "10", 2**53]:
        client.put_json(
            "/traffic/fw01/vtnet0/2026-10-05", {**values, "rx_bytes": bad}, status=422,
        )
    client.put_json("/traffic/fw01/vtnet0/2026-10-05", {}, status=422)


def test_delete_day_and_entire_interface_are_scoped(db: None) -> None:
    from vnstat_visualizer.repository.favorites import add_favorite, list_favorites

    now = datetime.now().astimezone()
    for day in (1, 2):
        upsert_snapshot(_snap(date(2026, 10, day)), "10.0.0.1", now)
    upsert_snapshot(_snap(date(2026, 10, 1), host="other"), "10.0.0.1", now)
    upsert_snapshot(_snap(date(2026, 10, 1), iface="other"), "10.0.0.1", now)
    add_favorite("fw01", "vtnet0")
    add_favorite("other", "vtnet0")
    client = TestApp(create_app())
    assert client.delete("/traffic/fw01/vtnet0/2026-10-01").json["deleted"] == 1
    assert count_traffic(hostname="fw01", interface="vtnet0") == 1
    assert len(list_favorites()) == 2
    assert client.delete("/traffic/fw01/vtnet0").json["deleted"] == 1
    assert count_traffic() == 2
    assert list_favorites() == [{"hostname": "other", "interface": "vtnet0"}]
