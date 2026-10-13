from datetime import date

import pytest

from vnstat_visualizer.domain.parser import ParseError, parse_datagram, parse_rate, parse_size

SAMPLE = b"fw01|1;vtnet0;2026-10-12;33.49 MiB;29.44 MiB;62.93 MiB;5.98 kbit/s;2026-10;945.2 MiB;1 GiB;2 GiB;9 kbit/s;1 TiB;2 TiB;3 TiB\n"


def test_parse_datagram() -> None:
    snap = parse_datagram(SAMPLE)
    assert snap.hostname == "fw01"
    assert snap.interface == "vtnet0"
    assert snap.day == date(2026, 10, 12)
    assert snap.rx_bytes == round(33.49 * 1024**2)
    assert snap.tx_bytes == round(29.44 * 1024**2)
    assert snap.total_bytes == round(62.93 * 1024**2)
    assert snap.avg_rate_bps == 5980


def test_units() -> None:
    assert parse_size("1 KiB") == 1024
    assert parse_size("1 kB") == 1000
    assert parse_rate("1 Mbit/s") == 1_000_000
    assert parse_rate("1 KiB/s") == 8192


@pytest.mark.parametrize(
    "payload",
    [
        b"no-separator",
        b"bad host!|1;vtnet0;2026-10-12;1 MiB;1 MiB;2 MiB;1 kbit/s",
        b"fw01|2;vtnet0;2026-10-12;1 MiB;1 MiB;2 MiB;1 kbit/s",
        b"fw01|1;vtnet0;not-a-date;1 MiB;1 MiB;2 MiB;1 kbit/s",
        b"fw01|1;vtnet0;2026-10-12;1 XiB;1 MiB;2 MiB;1 kbit/s",
        b"fw01|1;vtnet0",
        b"\xff\xfe",
    ],
)
def test_rejects_malformed(payload: bytes) -> None:
    with pytest.raises(ParseError):
        parse_datagram(payload)
