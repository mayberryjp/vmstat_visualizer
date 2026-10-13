from datetime import date

from pytest import LogCaptureFixture

from vnstat_visualizer.repository.traffic import list_traffic
from vnstat_visualizer.workers.udp_listener import handle_datagram

PAYLOAD = b"fw01|1;vtnet0;2026-10-12;33.49 MiB;29.44 MiB;62.93 MiB;5.98 kbit/s;2026-10;1 GiB"


def test_handle_datagram_stores_source_ip_and_is_idempotent(db: None) -> None:
    assert handle_datagram(PAYLOAD, "192.0.2.10") is True
    assert handle_datagram(PAYLOAD, "192.0.2.10") is True
    rows = list_traffic()
    assert len(rows) == 1
    assert rows[0]["source_ip"] == "192.0.2.10"
    assert rows[0]["day"] == date(2026, 10, 12).isoformat()


def test_handle_datagram_rejects_garbage(db: None, caplog: LogCaptureFixture) -> None:
    assert handle_datagram(b"garbage", "192.0.2.10") is False
    assert list_traffic() == []
