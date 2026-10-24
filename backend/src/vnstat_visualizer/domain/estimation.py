from collections.abc import Iterable, Mapping
from statistics import median
from typing import Any


def is_suspicious(rx_bytes: int, tx_bytes: int, total_bytes: int) -> bool:
    return any(
        value >= unit and value % unit == 0
        for value in (rx_bytes, tx_bytes, total_bytes)
        for unit in (4 * 1000**3, 4 * 1024**3)
    )


def estimate_traffic(rows: Iterable[Mapping[str, Any]]) -> dict[str, int] | None:
    donors = [
        row for row in rows
        if not row["is_estimated"]
        and not is_suspicious(row["rx_bytes"], row["tx_bytes"], row["total_bytes"])
    ]
    if not donors:
        return None
    rx_bytes = round(median(row["rx_bytes"] for row in donors))
    tx_bytes = round(median(row["tx_bytes"] for row in donors))
    return {
        "rx_bytes": rx_bytes,
        "tx_bytes": tx_bytes,
        "total_bytes": rx_bytes + tx_bytes,
        "avg_rate_bps": round(median(row["avg_rate_bps"] for row in donors)),
    }