import logging
from datetime import date, datetime
from typing import Any

from sqlalchemy import Select, case, delete, func, select, update
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import aliased

from vnstat_visualizer.db import get_engine
from vnstat_visualizer.domain.estimation import estimate_traffic, is_suspicious
from vnstat_visualizer.domain.parser import TrafficSnapshot
from vnstat_visualizer.repository.models import DailyTraffic, Favorite


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
        "is_estimated": False,
    }
    with get_engine().begin() as conn:
        if is_suspicious(snapshot.rx_bytes, snapshot.tx_bytes, snapshot.total_bytes):
            donors = conn.execute(
                select(DailyTraffic).where(
                    DailyTraffic.hostname == snapshot.hostname,
                    DailyTraffic.interface == snapshot.interface,
                    DailyTraffic.day != snapshot.day,
                    DailyTraffic.is_estimated.is_(False),
                )
            ).mappings()
            estimate = estimate_traffic(dict(row) for row in donors)
            if estimate is None:
                logging.getLogger(__name__).warning(
                    "Dropping suspicious traffic without a baseline: %s/%s %s",
                    snapshot.hostname, snapshot.interface, snapshot.day,
                )
                return
            values.update(estimate)
            values["is_estimated"] = True
        stmt = sqlite_insert(DailyTraffic).values(values)
        corrected_fields = {"rx_bytes", "tx_bytes", "total_bytes", "avg_rate_bps", "is_estimated"}
        stmt = stmt.on_conflict_do_update(
            index_elements=["hostname", "interface", "day"],
            set_={
                key: case(
                    (DailyTraffic.is_manual.is_(True), getattr(DailyTraffic, key)),
                    else_=value,
                ) if key in corrected_fields else value
                for key, value in values.items()
                if key not in ("hostname", "interface", "day")
            },
        )
        conn.execute(stmt)


def edit_day(hostname: str, interface: str, day: date, values: dict[str, int]) -> None:
    with get_engine().begin() as conn:
        result = conn.execute(
            update(DailyTraffic).where(
                DailyTraffic.hostname == hostname,
                DailyTraffic.interface == interface,
                DailyTraffic.day == day,
            ).values(
                **values, total_bytes=values["rx_bytes"] + values["tx_bytes"],
                is_estimated=False, is_manual=True,
            )
        )
        if not result.rowcount:
            raise LookupError("No traffic snapshot exists for this day.")


def delete_traffic(hostname: str, interface: str, day: date | None = None) -> int:
    with get_engine().begin() as conn:
        stmt = delete(DailyTraffic).where(
            DailyTraffic.hostname == hostname, DailyTraffic.interface == interface,
        )
        if day is not None:
            stmt = stmt.where(DailyTraffic.day == day)
        result = conn.execute(stmt)
        if day is None:
            conn.execute(delete(Favorite).where(
                Favorite.hostname == hostname, Favorite.interface == interface,
            ))
        return result.rowcount


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
            "last_seen": datetime.fromisoformat(_iso(r.last_seen)).astimezone().isoformat(),
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
            "is_estimated": r.is_estimated,
            "is_manual": r.is_manual,
        }
        for r in rows
    ]


def summarize_traffic(
    hostname: str | None = None,
    interface: str | None = None,
    start: date | None = None,
    end: date | None = None,
) -> list[dict[str, Any]]:
    stmt = (
        _filtered(
            select(
                DailyTraffic.hostname,
                DailyTraffic.interface,
                func.count().label("days"),
                func.sum(DailyTraffic.rx_bytes).label("rx_bytes"),
                func.sum(DailyTraffic.tx_bytes).label("tx_bytes"),
                func.sum(DailyTraffic.total_bytes).label("total_bytes"),
            ),
            hostname,
            interface,
            start,
            end,
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
            "days": r.days,
            "rx_bytes": int(r.rx_bytes),
            "tx_bytes": int(r.tx_bytes),
            "total_bytes": int(r.total_bytes),
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
