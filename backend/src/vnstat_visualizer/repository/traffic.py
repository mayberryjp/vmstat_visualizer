from datetime import date, datetime
from typing import Any

from sqlalchemy import Select, func, select
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import aliased

from vnstat_visualizer.db import get_engine
from vnstat_visualizer.domain.parser import TrafficSnapshot
from vnstat_visualizer.repository.models import DailyTraffic


def upsert_snapshot(snapshot: TrafficSnapshot, source_ip: str, received_at: datetime) -> None:
    values = {
        "hostname": snapshot.hostname,
        "source_ip": source_ip,
        "interface": snapshot.interface,
        "day": snapshot.day,
        "rx_bytes": snapshot.rx_bytes,
        "tx_bytes": snapshot.tx_bytes,
        "total_bytes": snapshot.total_bytes,
        "avg_rate_bps": snapshot.avg_rate_bps,
        "received_at": received_at,
    }
    stmt = sqlite_insert(DailyTraffic).values(values)
    stmt = stmt.on_conflict_do_update(
        index_elements=["hostname", "interface", "day"],
        set_={k: v for k, v in values.items() if k not in ("hostname", "interface", "day")},
    )
    with get_engine().begin() as conn:
        conn.execute(stmt)


def list_devices() -> list[dict[str, Any]]:
    inner = aliased(DailyTraffic)
    latest_ip = (
        select(inner.source_ip)
        .where(
            inner.hostname == DailyTraffic.hostname,
            inner.interface == DailyTraffic.interface,
        )
        .order_by(inner.received_at.desc())
        .limit(1)
        .correlate(DailyTraffic)
        .scalar_subquery()
    )
    stmt = (
        select(
            DailyTraffic.hostname,
            DailyTraffic.interface,
            latest_ip.label("source_ip"),
            func.count().label("days"),
            func.min(DailyTraffic.day).label("first_day"),
            func.max(DailyTraffic.day).label("last_day"),
            func.max(DailyTraffic.received_at).label("last_seen"),
        )
        .group_by(DailyTraffic.hostname, DailyTraffic.interface)
        .order_by(DailyTraffic.hostname, DailyTraffic.interface)
    )
    with get_engine().connect() as conn:
        rows = conn.execute(stmt).all()
    return [
        {
            "hostname": r.hostname,
            "interface": r.interface,
            "source_ip": r.source_ip,
            "days": r.days,
            "first_day": r.first_day.isoformat(),
            "last_day": r.last_day.isoformat(),
            "last_seen": _iso(r.last_seen),
        }
        for r in rows
    ]


def list_traffic(
    hostname: str | None = None,
    interface: str | None = None,
    start: date | None = None,
    end: date | None = None,
    limit: int | None = None,
    offset: int = 0,
) -> list[dict[str, Any]]:
    stmt = _filtered(select(DailyTraffic), hostname, interface, start, end).order_by(
        DailyTraffic.hostname, DailyTraffic.interface, DailyTraffic.day
    )
    if limit is not None:
        stmt = stmt.limit(limit)
    if offset:
        stmt = stmt.offset(offset)
    with get_engine().connect() as conn:
        rows = conn.execute(stmt).all()
    return [
        {
            "hostname": r.hostname,
            "source_ip": r.source_ip,
            "interface": r.interface,
            "day": r.day.isoformat(),
            "rx_bytes": r.rx_bytes,
            "tx_bytes": r.tx_bytes,
            "total_bytes": r.total_bytes,
            "avg_rate_bps": r.avg_rate_bps,
            "received_at": _iso(r.received_at),
        }
        for r in rows
    ]


def count_traffic(
    hostname: str | None = None,
    interface: str | None = None,
    start: date | None = None,
    end: date | None = None,
) -> int:
    stmt = _filtered(select(func.count()).select_from(DailyTraffic), hostname, interface, start, end)
    with get_engine().connect() as conn:
        return int(conn.execute(stmt).scalar_one())


def _filtered(
    stmt: Select[Any],
    hostname: str | None,
    interface: str | None,
    start: date | None,
    end: date | None,
) -> Select[Any]:
    if hostname is not None:
        stmt = stmt.where(DailyTraffic.hostname == hostname)
    if interface is not None:
        stmt = stmt.where(DailyTraffic.interface == interface)
    if start is not None:
        stmt = stmt.where(DailyTraffic.day >= start)
    if end is not None:
        stmt = stmt.where(DailyTraffic.day <= end)
    return stmt


def _iso(value: datetime | str) -> str:
    return value.isoformat() if isinstance(value, datetime) else str(value)
