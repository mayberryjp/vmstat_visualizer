import re
from dataclasses import dataclass
from datetime import date

# Fields of `vnstat --oneline`: version;iface;day;rx;tx;total;avg rate;month;...
ONELINE_VERSION = "1"
MIN_FIELDS = 7

HOSTNAME_RE = re.compile(r"^[A-Za-z0-9._-]{1,253}$")
INTERFACE_RE = re.compile(r"^[A-Za-z0-9._:@-]{1,64}$")
# vnstat prints "alias (name)" when an interface has an alias, e.g. "LAN (igc1)".
_ALIASED_INTERFACE_RE = re.compile(r"^.+ \(([^()\s]+)\)$")

_BYTE_UNITS: dict[str, int] = {
    "B": 1,
    "KiB": 1024,
    "MiB": 1024**2,
    "GiB": 1024**3,
    "TiB": 1024**4,
    "PiB": 1024**5,
    "EiB": 1024**6,
    "kB": 1000,
    "KB": 1000,
    "MB": 1000**2,
    "GB": 1000**3,
    "TB": 1000**4,
    "PB": 1000**5,
    "EB": 1000**6,
}
# "KiB" -> "Kibit", "MB" -> "Mbit"; vnstat prints rates in bits unless told otherwise.
_BIT_UNITS: dict[str, int] = {u.replace("B", "bit"): f for u, f in _BYTE_UNITS.items()}


class ParseError(ValueError):
    pass


@dataclass(frozen=True)
class TrafficSnapshot:
    hostname: str
    interface: str
    day: date
    rx_bytes: int
    tx_bytes: int
    total_bytes: int
    avg_rate_bps: int


def parse_size(text: str) -> int:
    value, unit = _split_quantity(text)
    factor = _BYTE_UNITS.get(unit)
    if factor is None:
        raise ParseError(f"unknown size unit {unit!r}")
    return round(value * factor)


def parse_rate(text: str) -> int:
    value, unit = _split_quantity(text)
    if not unit.endswith("/s"):
        raise ParseError(f"unknown rate unit {unit!r}")
    base = unit[: -len("/s")]
    if base in _BIT_UNITS:
        return round(value * _BIT_UNITS[base])
    if base in _BYTE_UNITS:
        return round(value * _BYTE_UNITS[base] * 8)
    raise ParseError(f"unknown rate unit {unit!r}")


def parse_datagram(payload: bytes) -> TrafficSnapshot:
    try:
        text = payload.decode("utf-8").strip()
    except UnicodeDecodeError as exc:
        raise ParseError("payload is not valid UTF-8") from exc

    hostname, sep, data = text.partition("|")
    if not sep:
        raise ParseError("missing '|' between hostname and vnstat data")
    hostname = hostname.strip()
    if not HOSTNAME_RE.match(hostname):
        raise ParseError(f"invalid hostname {hostname[:64]!r}")

    fields = data.strip().split(";")
    if len(fields) < MIN_FIELDS or fields[0] != ONELINE_VERSION:
        raise ParseError("not a vnstat --oneline record")

    interface = fields[1]
    aliased = _ALIASED_INTERFACE_RE.match(interface)
    if aliased:
        interface = aliased.group(1)
    if not INTERFACE_RE.match(interface):
        raise ParseError(f"invalid interface {interface[:64]!r}")
    try:
        day = date.fromisoformat(fields[2])
    except ValueError as exc:
        raise ParseError("invalid day") from exc

    return TrafficSnapshot(
        hostname=hostname,
        interface=interface,
        day=day,
        rx_bytes=parse_size(fields[3]),
        tx_bytes=parse_size(fields[4]),
        total_bytes=parse_size(fields[5]),
        avg_rate_bps=parse_rate(fields[6]),
    )


def _split_quantity(text: str) -> tuple[float, str]:
    parts = text.split()
    if len(parts) != 2:
        raise ParseError(f"invalid quantity {text!r}")
    try:
        value = float(parts[0])
    except ValueError as exc:
        raise ParseError(f"invalid number {parts[0]!r}") from exc
    if value < 0:
        raise ParseError("negative quantity")
    return value, parts[1]
